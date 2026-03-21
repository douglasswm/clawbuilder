import { createServerFn } from '@tanstack/react-start';
import { getAuthenticatedClient } from './auth-helpers';
import { validateDeploymentName, validateRegion, validateSize } from '../validation';

export const TERMINAL_STATUSES = new Set<Deployment['status']>(['running', 'failed', 'destroyed']);

export function buildCliBaseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const doToken = process.env.DO_TOKEN;
  if (doToken) env['DO_TOKEN'] = doToken;
  const byteplusKey = process.env.BYTEPLUS_ARKMODEL_API_KEY;
  if (byteplusKey) env['BYTEPLUS_ARKMODEL_API_KEY'] = byteplusKey;
  return env;
}

export interface CreateDeploymentInput {
  name: string;
  region: string;
  size: string;
  personaSlug?: string;
  personaName?: string;
  snapshotName?: string;
}

export interface Deployment {
  id: string;
  user_id: string;
  name: string;
  status: 'pending' | 'provisioning' | 'running' | 'destroying' | 'destroyed' | 'failed';
  provider: string;
  region: string;
  size: string;
  primary_model: string | null;
  cli_deploy_id?: string;
  ip_address?: string;
  droplet_hostname?: string;
  persona_slug?: string;
  persona_name?: string;
  persona_pushed: boolean;
  persona_error?: string;
  funnel_url?: string;
  gateway_token?: string;
  tailscale_configured: boolean;
  current_step: number;
  total_steps: number;
  step_label?: string;
  error_message?: string;
  sandbox_dir?: string;
  created_at: string;
  updated_at: string;
}

/** List all deployments for the authenticated user */
export const getDeployments = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabase, user } = await getAuthenticatedClient();
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Deployment[];
});

/** Get a single deployment (verifies ownership) */
export const getDeploymentDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: { deploymentId: string }) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { data, error } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', ctx.data.deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Response('Not found', { status: 404 });
    return data as Deployment;
  });

/** Create a new deployment via clawmacdo REST API (snapshot restore) or CLI (fresh deploy) */
export const createDeployment = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateDeploymentInput) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { name, region, size, personaSlug, personaName, snapshotName } = ctx.data;

    // Server-side validation
    const nameValidation = validateDeploymentName(name);
    if (!nameValidation.valid) throw new Error(nameValidation.error);
    if (!validateRegion(region)) throw new Error(`Invalid region: ${region}`);
    if (!validateSize(size)) throw new Error(`Invalid size: ${size}`);

    if (!process.env.DO_TOKEN) {
      throw new Error('DigitalOcean token is not configured. Contact your administrator.');
    }

    if (!user.email) {
      throw new Error('Your account has no email address. Please sign in with Google.');
    }

    const platformModel = process.env.PLATFORM_DEFAULT_MODEL || null;

    // Insert deployment row (unique constraint prevents double-submit)
    const { data: deployment, error: insertError } = await supabase
      .from('deployments')
      .insert({
        user_id: user.id,
        name,
        status: 'pending',
        provider: 'digitalocean',
        region,
        size,
        primary_model: platformModel,
        persona_slug: personaSlug ?? null,
        persona_name: personaName ?? null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error(`A deployment named "${name}" already exists.`);
      }
      throw new Error(insertError.message);
    }

    if (snapshotName) {
      // Snapshot restore via clawmacdo CLI
      const { execClawmacdo } = await import('./clawmacdo');
      const cliEnv = buildCliBaseEnv();

      const cliArgs = [
        'do-restore',
        '--do-token', process.env.DO_TOKEN!,
        '--snapshot-name', snapshotName,
        '--region', region,
        '--size', size,
      ];

      let result;
      try {
        result = await execClawmacdo(cliArgs, { env: cliEnv, timeoutMs: 10 * 60_000 });
      } catch (err) {
        await supabase.from('deployments').update({
          status: 'failed',
          error_message: String(err),
        }).eq('id', deployment.id);
        throw new Error(`CLI error: ${String(err)}`);
      }

      if (result.code !== 0) {
        await supabase.from('deployments').update({
          status: 'failed',
          error_message: result.stderr || 'Restore command failed',
        }).eq('id', deployment.id);
        throw new Error(result.stderr || 'Restore command failed');
      }

      // Parse structured output from do-restore stdout:
      //   Deploy ID:   9ba625bb-...
      //   Hostname:    openclaw-9ba625bb
      //   IP Address:  167.99.73.79
      const ipMatch = result.stdout.match(/IP Address:\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      const hostnameMatch = result.stdout.match(/Hostname:\s+(\S+)/);
      const deployIdMatch = result.stdout.match(/Deploy ID:\s+(\S+)/);

      await supabase.from('deployments').update({
        status: 'running',
        ip_address: ipMatch?.[1] ?? null,
        droplet_hostname: hostnameMatch?.[1] ?? null,
        cli_deploy_id: deployIdMatch?.[1] ?? null,
        sandbox_dir: result.sandboxDir,
      }).eq('id', deployment.id);
    } else {
      // Fresh deploy via clawmacdo CLI
      const { execClawmacdo } = await import('./clawmacdo');
      const { getDecryptedUserApiKeys } = await import('./settings');

      const cliArgs = [
        'deploy',
        '--provider', 'digitalocean',
        '--customer-email', user.email,
        '--region', region,
        '--size', size,
        '--hostname', name,
        '--detach',
        '--json',
      ];
      if (platformModel) {
        cliArgs.push('--primary-model', platformModel);
      }

      const userKeys = await getDecryptedUserApiKeys(user.id, supabase);
      const cliEnv = buildCliBaseEnv();
      if (userKeys.anthropicKey) cliEnv['ANTHROPIC_API_KEY'] = userKeys.anthropicKey;
      if (userKeys.openaiKey) cliEnv['OPENAI_API_KEY'] = userKeys.openaiKey;
      if (userKeys.geminiKey) cliEnv['GEMINI_API_KEY'] = userKeys.geminiKey;

      let result;
      try {
        result = await execClawmacdo(cliArgs, { env: cliEnv });
      } catch (err) {
        await supabase.from('deployments').update({
          status: 'failed',
          error_message: String(err),
        }).eq('id', deployment.id);
        throw new Error(`CLI error: ${String(err)}`);
      }

      let cliDeployId: string | undefined;
      try {
        const parsed = JSON.parse(result.stdout.trim());
        cliDeployId = parsed.deploy_id ?? parsed.id ?? undefined;
      } catch {
        // stdout wasn't JSON
      }

      if (result.code !== 0) {
        await supabase.from('deployments').update({
          status: 'failed',
          error_message: result.stderr || 'Deploy command failed',
        }).eq('id', deployment.id);
        if (result.sandboxDir) {
          try {
            const { rmSync } = await import('node:fs');
            rmSync(result.sandboxDir, { recursive: true, force: true });
          } catch {
            // Non-critical
          }
        }
        throw new Error(result.stderr || 'Deploy command failed');
      }

      await supabase.from('deployments').update({
        status: 'provisioning',
        cli_deploy_id: cliDeployId ?? null,
        sandbox_dir: result.sandboxDir,
      }).eq('id', deployment.id);
    }

    return { deploymentId: deployment.id };
  });

/** Poll deployment status via clawmacdo track */
export const pollDeploymentStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string }) => data)
  .handler(async (ctx) => {
    const { execClawmacdo, parseNdjson } = await import('./clawmacdo');
    const { supabase, user } = await getAuthenticatedClient();

    const { data: deployment, error: fetchError } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', ctx.data.deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!deployment) throw new Response('Not found', { status: 404 });

    const dep = deployment as Deployment;

    // If already terminal, return as-is
    if (TERMINAL_STATUSES.has(dep.status)) {
      return dep;
    }

    // Stuck detection: if provisioning for more than 45 minutes
    const updatedAt = new Date(dep.updated_at).getTime();
    if (dep.status === 'provisioning' && Date.now() - updatedAt > 45 * 60 * 1_000) {
      const updates = { status: 'failed' as const, error_message: 'Deployment timed out after 45 minutes' };
      await supabase.from('deployments').update(updates).eq('id', dep.id);
      if (dep.sandbox_dir) {
        try {
          const { rmSync } = await import('node:fs');
          rmSync(dep.sandbox_dir, { recursive: true, force: true });
        } catch {
          // Non-critical
        }
      }
      return { ...dep, ...updates };
    }

    // No cli_deploy_id yet — can't track
    if (!dep.cli_deploy_id) {
      return dep;
    }

    // Run clawmacdo track
    const cliEnv = buildCliBaseEnv();

    const trackResult = await execClawmacdo(
      ['track', dep.cli_deploy_id, '--json'],
      { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv }
    );

    const events = parseNdjson(trackResult.stdout);
    const latest = events.length > 0 ? events[events.length - 1] as Record<string, unknown> : null;

    if (!latest) return dep;

    // Extract status info from the latest event
    const newStatus = (latest.status as string) ?? dep.status;
    const ipAddress = (latest.ip_address as string) ?? (latest.ip as string) ?? dep.ip_address;
    const currentStep = (latest.step as number) ?? (latest.current_step as number) ?? dep.current_step;
    const stepLabel = (latest.step_label as string) ?? (latest.label as string) ?? dep.step_label;

    // Normalize status to our state machine
    const normalizedStatus = normalizeStatus(newStatus, dep.status);

    const updates: Partial<Deployment> = {
      status: normalizedStatus as Deployment['status'],
      ip_address: ipAddress ?? undefined,
      current_step: currentStep,
      step_label: stepLabel ?? undefined,
    };

    // If newly running and has persona: claim the push atomically before spawning CLI
    // to prevent duplicate pushes from concurrent poll calls
    if (normalizedStatus === 'running' && dep.persona_slug && !dep.persona_pushed && !dep.persona_error) {
      const { count } = await supabase
        .from('deployments')
        .update({ persona_pushed: true }, { count: 'exact' })
        .eq('id', dep.id)
        .eq('persona_pushed', false);

      if (count && count > 0) {
        const pushResult = await execClawmacdo(
          ['skill', 'push', '--slug', dep.persona_slug, '--name', dep.name],
          { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv }
        );
        if (pushResult.code !== 0) {
          // Push failed — roll back the claim and record the error
          updates.persona_pushed = false;
          updates.persona_error = pushResult.stderr || 'Failed to push persona';
        }
      }
      // count === 0 means another poll already claimed it — skip
    }

    await supabase.from('deployments').update(updates).eq('id', dep.id);
    return { ...dep, ...updates };
  });

export function normalizeStatus(rawStatus: string, currentStatus: string): string {
  const statusMap: Record<string, string> = {
    'running': 'running',
    'failed': 'failed',
    'error': 'failed',
    'provisioning': 'provisioning',
    'pending': 'provisioning',
    'destroyed': 'destroyed',
    'destroying': 'destroying',
  };
  return statusMap[rawStatus?.toLowerCase()] ?? currentStatus;
}

async function resolveDropletIp(name: string): Promise<string | null> {
  const doToken = process.env.DO_TOKEN;
  if (!doToken) return null;

  // Search by name — don't filter by tag since restored snapshots may not be tagged
  const listRes = await fetch(
    `https://api.digitalocean.com/v2/droplets?per_page=200`,
    { headers: { Authorization: `Bearer ${doToken}` } }
  );
  if (!listRes.ok) return null;
  const { droplets } = (await listRes.json()) as {
    droplets: Array<{ name: string; networks: { v4: Array<{ ip_address: string; type: string }> } }>;
  };

  const match = droplets.find((d) => d.name === name || d.name === `openclaw-${name}`);
  if (!match) return null;

  const publicNet = match.networks.v4.find((n) => n.type === 'public');
  return publicNet?.ip_address ?? null;
}

async function destroyDropletViaApi(dep: { name: string; ip_address?: string; droplet_hostname?: string }): Promise<void> {
  const doToken = process.env.DO_TOKEN;
  if (!doToken) throw new Error('DO_TOKEN is not configured');

  const listRes = await fetch(
    `https://api.digitalocean.com/v2/droplets?per_page=200`,
    { headers: { Authorization: `Bearer ${doToken}` } }
  );
  if (!listRes.ok) throw new Error(`DO API error: ${listRes.status} ${await listRes.text()}`);
  const { droplets } = (await listRes.json()) as {
    droplets: Array<{ id: number; name: string; networks: { v4: Array<{ ip_address: string; type: string }> } }>;
  };

  // Match by droplet hostname, deployment name, or IP address
  const match = droplets.find((d) => {
    if (dep.droplet_hostname && d.name === dep.droplet_hostname) return true;
    if (d.name === dep.name || d.name === `openclaw-${dep.name}`) return true;
    if (dep.ip_address) {
      return d.networks.v4.some((n) => n.ip_address === dep.ip_address);
    }
    return false;
  });

  if (!match) {
    // Droplet truly doesn't exist on DO — nothing to destroy
    return;
  }

  const deleteRes = await fetch(
    `https://api.digitalocean.com/v2/droplets/${match.id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${doToken}` } }
  );
  if (!deleteRes.ok && deleteRes.status !== 404) {
    throw new Error(`DO API destroy failed: ${deleteRes.status} ${await deleteRes.text()}`);
  }
}

/** Destroy a deployment */
export const destroyDeployment = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string }) => data)
  .handler(async (ctx) => {
    const { execClawmacdo } = await import('./clawmacdo');
    const { supabase, user } = await getAuthenticatedClient();

    const { data: deployment } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', ctx.data.deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!deployment) throw new Response('Not found', { status: 404 });

    const dep = deployment as Deployment;

    // Atomic status transition: only claim 'destroying' if not already destroying/destroyed
    const { count } = await supabase
      .from('deployments')
      .update({ status: 'destroying' }, { count: 'exact' })
      .eq('id', dep.id)
      .not('status', 'in', '("destroying","destroyed")');

    if (!count || count === 0) {
      throw new Error('Deployment is already being destroyed or has been destroyed.');
    }

    const cliEnv = buildCliBaseEnv();

    const result = await execClawmacdo(
      ['destroy', '--provider', 'digitalocean', '--name', dep.name, '--yes'],
      { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv }
    );

    if (result.code !== 0) {
      // CLI destroy failed — fall back to DO API using name + IP
      try {
        await destroyDropletViaApi(dep);
      } catch (apiErr) {
        await supabase.from('deployments').update({
          status: dep.status,
          error_message: result.stderr || String(apiErr),
        }).eq('id', dep.id);
        throw new Error(result.stderr || String(apiErr));
      }
    }

    // Clean up sandbox dir
    if (dep.sandbox_dir) {
      try {
        const { rmSync } = await import('node:fs');
        rmSync(dep.sandbox_dir, { recursive: true, force: true });
      } catch {
        // Non-critical: sandbox cleanup failure doesn't block status update
      }
    }

    await supabase.from('deployments').update({ status: 'destroyed', error_message: null }).eq('id', dep.id);
    return { success: true };
  });

/** Toggle Tailscale Funnel on or off for a running deployment */
export const toggleFunnel = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string; action: 'on' | 'off'; authKey?: string }) => data)
  .handler(async (ctx) => {
    const { execClawmacdo } = await import('./clawmacdo');
    const { supabase, user } = await getAuthenticatedClient();

    const { data: deployment } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', ctx.data.deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!deployment) throw new Response('Not found', { status: 404 });

    const dep = deployment as Deployment;

    if (dep.status !== 'running') {
      throw new Error('Tailscale Funnel can only be toggled on a running deployment.');
    }

    let ipAddress = dep.ip_address;
    if (!ipAddress) {
      const resolved = await resolveDropletIp(dep.droplet_hostname ?? dep.name);
      if (!resolved) {
        throw new Error('Could not resolve droplet IP. Ensure the instance is running on DigitalOcean.');
      }
      ipAddress = resolved;
      await supabase.from('deployments').update({ ip_address: resolved }).eq('id', dep.id);
    }

    const cliEnv = buildCliBaseEnv();

    if (ctx.data.action === 'on') {
      // First time: run tailscale-funnel to install + connect + enable
      if (!dep.tailscale_configured) {
        if (!ctx.data.authKey) {
          throw new Error('Tailscale auth key is required for first-time setup.');
        }

        const setupResult = await execClawmacdo(
          ['tailscale-funnel', '--instance', ipAddress, '--auth-key', ctx.data.authKey],
          { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv, timeoutMs: 5 * 60_000 },
        );

        if (setupResult.code !== 0) {
          throw new Error(setupResult.stderr || 'Tailscale Funnel setup failed');
        }

        // Parse URL and gateway token from tailscale-funnel output
        let funnelUrl: string | undefined;
        let gatewayToken: string | undefined;

        const urlMatch = setupResult.stdout.match(/Public URL:\s+(https:\/\/\S+)/);
        if (urlMatch) funnelUrl = urlMatch[1];
        if (!funnelUrl) {
          const tsMatch = setupResult.stdout.match(/(https:\/\/\S+\.ts\.net)/);
          if (tsMatch) funnelUrl = tsMatch[1];
        }

        const tokenMatch = setupResult.stdout.match(/Gateway Token:\s+(\S+)/);
        if (tokenMatch) gatewayToken = tokenMatch[1];

        await supabase.from('deployments').update({
          tailscale_configured: true,
          funnel_url: funnelUrl ?? null,
          gateway_token: gatewayToken ?? null,
        }).eq('id', dep.id);

        return { funnelUrl, gatewayToken };
      }

      // Already configured: just turn funnel on
      const result = await execClawmacdo(
        ['funnel-on', '--instance', ipAddress],
        { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv, timeoutMs: 2 * 60_000 },
      );

      if (result.code !== 0) {
        throw new Error(result.stderr || 'Failed to enable Tailscale Funnel');
      }

      let funnelUrl: string | undefined;
      const urlMatch = result.stdout.match(/(https:\/\/\S+\.ts\.net)/);
      if (urlMatch) funnelUrl = urlMatch[1];

      let gatewayToken: string | undefined;
      const tokenMatch = result.stdout.match(/Gateway Token:\s+(\S+)/);
      if (tokenMatch) gatewayToken = tokenMatch[1];

      await supabase.from('deployments').update({
        funnel_url: funnelUrl ?? dep.funnel_url ?? null,
        gateway_token: gatewayToken ?? dep.gateway_token ?? null,
      }).eq('id', dep.id);

      return { funnelUrl: funnelUrl ?? dep.funnel_url, gatewayToken: gatewayToken ?? dep.gateway_token };
    } else {
      // Turn funnel off
      const result = await execClawmacdo(
        ['funnel-off', '--instance', ipAddress],
        { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv, timeoutMs: 2 * 60_000 },
      );

      if (result.code !== 0) {
        throw new Error(result.stderr || 'Failed to disable Tailscale Funnel');
      }

      await supabase.from('deployments').update({
        funnel_url: null,
      }).eq('id', dep.id);

      return { funnelUrl: null, gatewayToken: null };
    }
  });
