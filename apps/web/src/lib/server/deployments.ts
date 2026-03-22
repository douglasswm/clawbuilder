import { createServerFn } from '@tanstack/react-start';
import { getAuthenticatedClient } from './auth-helpers';
import { validateDeploymentName, validateRegion, validateSize, validateProvider, PROVIDER_LABELS } from '../validation';

export const TERMINAL_STATUSES = new Set<Deployment['status']>(['running', 'failed', 'destroyed']);

export function buildCliBaseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const doToken = process.env.DO_TOKEN;
  if (doToken) env['DO_TOKEN'] = doToken;
  const byteplusKey = process.env.BYTEPLUS_ARKMODEL_API_KEY;
  if (byteplusKey) env['BYTEPLUS_ARKMODEL_API_KEY'] = byteplusKey;
  // Tailscale auth key is intentionally NOT included here.
  // Each user must provide their own key for network isolation — see toggleFunnel().
  return env;
}

export interface CreateDeploymentInput {
  name: string;
  region: string;
  size: string;
  personaSlug?: string;
  personaName?: string;
  snapshotName?: string;
  templateId?: string;
  provider?: string;
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
  tailscale_device_id?: string;
  tailscale_hostname?: string;
  tailscale_managed: boolean;
  tailscale_setup_status: 'pending' | 'in_progress' | 'configured' | 'failed';
  current_step: number;
  total_steps: number;
  step_label?: string;
  error_message?: string;
  sandbox_dir?: string;
  active_operation_id?: string;
  last_operation_id?: string;
  template_id?: string;
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
    const { name, region, size, personaSlug, personaName, snapshotName, templateId, provider: rawProvider } = ctx.data;
    const provider = rawProvider ?? 'digitalocean';

    // Server-side validation
    const nameValidation = validateDeploymentName(name);
    if (!nameValidation.valid) throw new Error(nameValidation.error);
    if (!validateRegion(region)) throw new Error(`Invalid region: ${region}`);
    if (!validateSize(size)) throw new Error(`Invalid size: ${size}`);
    if (rawProvider && !validateProvider(rawProvider)) throw new Error(`Invalid provider: ${rawProvider}`);

    if (!process.env.DO_TOKEN) {
      throw new Error('DigitalOcean token is not configured. Contact your administrator.');
    }

    if (!user.email) {
      throw new Error('Your account has no email address. Please sign in with Google.');
    }

    // Resolve snapshot from template if templateId is provided
    let resolvedSnapshotName = snapshotName;
    let resolvedTemplateId: string | undefined = templateId;
    if (templateId) {
      const { data: template, error: templateError } = await supabase
        .from('agent_templates')
        .select('id, provider_snapshots')
        .eq('id', templateId)
        .eq('is_active', true)
        .maybeSingle();

      if (templateError) throw new Error(templateError.message);
      if (!template) throw new Error('Template not found or is not active.');

      const providerSnapshots = (template.provider_snapshots ?? {}) as Record<string, string>;
      const templateSnapshot = providerSnapshots[provider];

      if (!templateSnapshot) {
        const availableProviders = Object.keys(providerSnapshots)
          .map((p) => PROVIDER_LABELS[p] ?? p)
          .join(', ');
        throw new Error(
          `Template is not available for ${PROVIDER_LABELS[provider] ?? provider}. Available providers: ${availableProviders}`
        );
      }

      resolvedSnapshotName = templateSnapshot;
    }

    const platformModel = process.env.PLATFORM_DEFAULT_MODEL || null;
    const { isPlatformTailscaleEnabled } = await import('./tailscale-api');
    const platformTailscale = isPlatformTailscaleEnabled();

    // Insert deployment row (unique constraint prevents double-submit)
    const { data: deployment, error: insertError } = await supabase
      .from('deployments')
      .insert({
        user_id: user.id,
        name,
        status: 'pending',
        provider,
        region,
        size,
        primary_model: platformModel,
        tailscale_managed: platformTailscale,
        persona_slug: personaSlug ?? null,
        persona_name: personaName ?? null,
        template_id: resolvedTemplateId ?? null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error(`A deployment named "${name}" already exists.`);
      }
      throw new Error(insertError.message);
    }

    if (resolvedSnapshotName) {
      // When using snapshotName directly (no templateId), validate against approved templates
      if (!templateId) {
        const { data: matchingTemplates } = await supabase
          .from('agent_templates')
          .select('id, provider_snapshots', { count: 'exact', head: false })
          .eq('is_active', true);
        const found = (matchingTemplates ?? []).some((t: { provider_snapshots: Record<string, string> | null }) =>
          t.provider_snapshots && Object.values(t.provider_snapshots).includes(resolvedSnapshotName)
        );
        if (!found) {
          throw new Error(`Invalid snapshot: "${resolvedSnapshotName}" is not an approved agent template.`);
        }
      }

      // Snapshot restore via clawmacdo CLI
      const { execClawmacdo } = await import('./clawmacdo');
      const cliEnv = buildCliBaseEnv();

      const cliArgs = [
        'do-restore',
        '--snapshot-name', resolvedSnapshotName,
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

      const restoreHostname = hostnameMatch?.[1] ?? null;
      await supabase.from('deployments').update({
        status: 'running',
        ip_address: ipMatch?.[1] ?? null,
        droplet_hostname: restoreHostname,
        cli_deploy_id: deployIdMatch?.[1] ?? null,
        sandbox_dir: result.sandboxDir,
        ...(platformTailscale && restoreHostname ? { tailscale_hostname: restoreHostname } : {}),
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

      // Platform-managed Tailscale: auto-generate auth key and add --tailscale flags
      if (platformTailscale) {
        const { createTenantAuthKey } = await import('./tailscale-api');
        const tsAuthKey = await createTenantAuthKey(deployment.id);
        cliArgs.push('--tailscale', '--tailscale-auth-key', tsAuthKey);
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

    if (trackResult.code !== 0) {
      console.warn(`[pollDeploymentStatus] track exited ${trackResult.code}: ${trackResult.stderr}`);
      // If track exits non-zero with no stdout, treat as a failure
      if (!trackResult.stdout.trim()) {
        const failMsg = trackResult.stderr?.trim() || `Track command failed (exit code ${trackResult.code})`;
        const updates = { status: 'failed' as const, error_message: failMsg };
        await supabase.from('deployments').update(updates).eq('id', dep.id);
        return { ...dep, ...updates };
      }
    }

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
        } else {
          // Push succeeded — reflect in the response so the UI updates immediately
          updates.persona_pushed = true;
        }
      }
      // count === 0 means another poll already claimed it — skip
    }

    // Auto-enable Funnel for platform-managed deployments reaching running state
    if (normalizedStatus === 'running' && dep.tailscale_managed && dep.tailscale_setup_status === 'pending') {
      const { count: funnelClaim } = await supabase
        .from('deployments')
        .update({ tailscale_setup_status: 'in_progress' }, { count: 'exact' })
        .eq('id', dep.id)
        .eq('tailscale_setup_status', 'pending');

      if (funnelClaim && funnelClaim > 0) {
        try {
          const targetIp = ipAddress ?? dep.ip_address;
          if (targetIp) {
            const funnelResult = await executeFunnelSetup({
              ipAddress: targetIp,
              sandboxDir: dep.sandbox_dir ?? undefined,
              cliEnv,
              tailscaleHostname: dep.tailscale_hostname ?? dep.droplet_hostname ?? undefined,
            });
            updates.tailscale_setup_status = 'configured';
            updates.tailscale_configured = true;
            if (funnelResult.funnelUrl) updates.funnel_url = funnelResult.funnelUrl;
            if (funnelResult.gatewayToken) updates.gateway_token = funnelResult.gatewayToken;
            if (funnelResult.deviceId) updates.tailscale_device_id = funnelResult.deviceId;
          }
        } catch (err) {
          console.error('[pollDeploymentStatus] Auto-funnel failed:', err);
          updates.tailscale_setup_status = 'failed';
        }
      }
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

    // Remove device from platform tailnet
    if (dep.tailscale_managed && dep.tailscale_device_id) {
      try {
        const { deleteDevice } = await import('./tailscale-api');
        await deleteDevice(dep.tailscale_device_id);
      } catch (err) {
        console.warn('[destroyDeployment] Failed to remove Tailscale device:', err);
        // Non-critical: device will become orphaned but won't cause issues
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

/** Shared helper: run tailscale-funnel CLI and parse output. Used by toggleFunnel and auto-funnel triggers. */
async function executeFunnelSetup(opts: {
  ipAddress: string;
  sandboxDir?: string;
  cliEnv: Record<string, string>;
  tailscaleHostname?: string;
}): Promise<{ funnelUrl?: string; gatewayToken?: string; deviceId?: string }> {
  const { execClawmacdo } = await import('./clawmacdo');
  const { createTenantAuthKey, findDeviceByHostname } = await import('./tailscale-api');

  // Generate a fresh auth key (safe even if device is already connected — clawmacdo skips connect step)
  const tsKey = await createTenantAuthKey('platform-funnel-setup');
  const env = { ...opts.cliEnv, TAILSCALE_AUTH_KEY: tsKey };

  const result = await execClawmacdo(
    ['tailscale-funnel', '--instance', opts.ipAddress],
    { sandboxDir: opts.sandboxDir, env, timeoutMs: 5 * 60_000 },
  );

  if (result.code !== 0) {
    throw new Error(result.stderr || 'Tailscale Funnel setup failed');
  }

  // Parse Funnel URL
  let funnelUrl: string | undefined;
  const urlMatch = result.stdout.match(/Public URL:\s+(https:\/\/\S+)/);
  if (urlMatch) funnelUrl = urlMatch[1];
  if (!funnelUrl) {
    const tsMatch = result.stdout.match(/(https:\/\/\S+\.ts\.net)/);
    if (tsMatch) funnelUrl = tsMatch[1];
  }

  // Parse gateway token
  let gatewayToken: string | undefined;
  const tokenMatch = result.stdout.match(/Gateway Token:\s+(\S+)/);
  if (tokenMatch) gatewayToken = tokenMatch[1];

  // Discover device ID for lifecycle management
  let deviceId: string | undefined;
  if (opts.tailscaleHostname) {
    try {
      const device = await findDeviceByHostname(opts.tailscaleHostname);
      if (device) deviceId = device.id;
    } catch {
      // Non-critical: device ID discovery failure doesn't block funnel setup
    }
  }

  return { funnelUrl, gatewayToken, deviceId };
}

/** Toggle Tailscale Funnel on or off for a running deployment */
export const toggleFunnel = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string; action: 'on' | 'off' }) => data)
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
      if (dep.tailscale_managed) {
        // Platform-managed: use executeFunnelSetup helper (generates its own key)
      } else {
        // User-managed: require user's own auth key
        const { getDecryptedUserApiKeys } = await import('./settings');
        const userKeys = await getDecryptedUserApiKeys(user.id, supabase);
        if (!userKeys.tailscaleKey) {
          throw new Error('No Tailscale auth key found. Add one in Settings before enabling Funnel.');
        }
        cliEnv['TAILSCALE_AUTH_KEY'] = userKeys.tailscaleKey;
      }
    }

    if (ctx.data.action === 'on') {
      // Platform-managed first-time setup or retry from failed
      if (dep.tailscale_managed && (!dep.tailscale_configured || dep.tailscale_setup_status === 'failed')) {
        await supabase.from('deployments').update({ tailscale_setup_status: 'in_progress' }).eq('id', dep.id);
        try {
          const funnelResult = await executeFunnelSetup({
            ipAddress,
            sandboxDir: dep.sandbox_dir ?? undefined,
            cliEnv,
            tailscaleHostname: dep.tailscale_hostname ?? dep.droplet_hostname ?? undefined,
          });
          const funnelUpdates: Record<string, unknown> = {
            tailscale_configured: true,
            tailscale_setup_status: 'configured',
            funnel_url: funnelResult.funnelUrl ?? null,
            gateway_token: funnelResult.gatewayToken ?? null,
          };
          if (funnelResult.deviceId) funnelUpdates.tailscale_device_id = funnelResult.deviceId;
          await supabase.from('deployments').update(funnelUpdates).eq('id', dep.id);
          return { funnelUrl: funnelResult.funnelUrl, gatewayToken: funnelResult.gatewayToken };
        } catch (err) {
          await supabase.from('deployments').update({ tailscale_setup_status: 'failed' }).eq('id', dep.id);
          throw err;
        }
      }

      // User-managed first-time setup
      if (!dep.tailscale_configured) {

        const setupResult = await execClawmacdo(
          ['tailscale-funnel', '--instance', ipAddress],
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

        if (!funnelUrl) {
          console.warn('[toggleFunnel] CLI exited 0 but no Funnel URL found in stdout');
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

/** Check if Tailscale Funnel is available — platform mode or user key. */
export const isTailscaleAvailable = createServerFn({ method: 'GET' }).handler(async () => {
  const { isPlatformTailscaleEnabled } = await import('./tailscale-api');
  if (isPlatformTailscaleEnabled()) {
    return { available: true, mode: 'platform' as const };
  }

  try {
    const { supabase, user } = await getAuthenticatedClient();
    const { data } = await supabase
      .from('user_api_keys')
      .select('tailscale_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();
    return { available: !!data?.tailscale_key_encrypted, mode: 'user' as const };
  } catch {
    return { available: false, mode: 'user' as const };
  }
});

/** Resolve a DigitalOcean droplet by hostname/name — returns both ID and IP. */
async function resolveDroplet(name: string): Promise<{ id: number; ip: string } | null> {
  const doToken = process.env.DO_TOKEN;
  if (!doToken) return null;

  const listRes = await fetch(
    `https://api.digitalocean.com/v2/droplets?per_page=200`,
    { headers: { Authorization: `Bearer ${doToken}` } }
  );
  if (!listRes.ok) return null;
  const { droplets } = (await listRes.json()) as {
    droplets: Array<{ id: number; name: string; networks: { v4: Array<{ ip_address: string; type: string }> } }>;
  };

  const match = droplets.find((d) => d.name === name || d.name === `openclaw-${name}`);
  if (!match) return null;

  const publicNet = match.networks.v4.find((n) => n.type === 'public');
  return publicNet ? { id: match.id, ip: publicNet.ip_address } : null;
}

/** Create a snapshot of a running deployment via clawmacdo serve sidecar. */
export const createSnapshot = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string; snapshotName: string }) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { deploymentId, snapshotName } = ctx.data;

    // Fetch deployment and verify ownership + status
    const { data: deployment, error: fetchError } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!deployment) throw new Response('Not found', { status: 404 });

    const dep = deployment as Deployment;
    if (dep.status !== 'running') {
      throw new Error('Snapshots can only be created from running deployments.');
    }

    // Atomic guard: only proceed if no operation is already active
    // Prevents race condition from concurrent snapshot requests
    const { count: claimed } = await supabase
      .from('deployments')
      .update({ active_operation_id: 'claiming' }, { count: 'exact' })
      .eq('id', dep.id)
      .is('active_operation_id', null);

    if (!claimed || claimed === 0) {
      throw new Error('An operation is already in progress for this deployment.');
    }

    // Resolve droplet ID via DO API
    const droplet = await resolveDroplet(dep.droplet_hostname ?? dep.name);
    if (!droplet) {
      // Release the claim
      await supabase.from('deployments').update({ active_operation_id: null }).eq('id', dep.id);
      throw new Error('Could not find droplet on DigitalOcean. Ensure the instance is running.');
    }

    // Start sidecar and proxy the snapshot request
    const { proxySidecar } = await import('./clawmacdo-serve');
    let result: { ok: boolean; message: string; operation_id?: string };
    try {
      const sidecarRes = await proxySidecar(`/api/deployments/${dep.cli_deploy_id || dep.id}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot_name: snapshotName,
          do_token: process.env.DO_TOKEN,
          droplet_id: droplet.id,
        }),
      });
      result = (await sidecarRes.json()) as { ok: boolean; message: string; operation_id?: string };
    } catch (err) {
      // Release the claim on sidecar failure
      await supabase.from('deployments').update({ active_operation_id: null }).eq('id', dep.id);
      throw new Error(`Sidecar error: ${String(err)}`);
    }

    if (result.ok && result.operation_id) {
      // Store real operation ID, replacing the 'claiming' placeholder
      await supabase.from('deployments').update({
        active_operation_id: result.operation_id,
        last_operation_id: result.operation_id,
      }).eq('id', dep.id);
    } else {
      // Sidecar returned failure — release the claim
      await supabase.from('deployments').update({ active_operation_id: null }).eq('id', dep.id);
    }

    return result;
  });

/** Start a restore-from-snapshot operation via clawmacdo serve sidecar. */
export const startRestoreFromSnapshot = createServerFn({ method: 'POST' })
  .inputValidator((data: { snapshotName: string; region: string; size: string; name: string }) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { snapshotName, region, size, name } = ctx.data;

    // Validate inputs
    const nameValidation = validateDeploymentName(name);
    if (!nameValidation.valid) throw new Error(nameValidation.error);
    if (!validateRegion(region)) throw new Error(`Invalid region: ${region}`);
    if (!validateSize(size)) throw new Error(`Invalid size: ${size}`);

    // Validate snapshot name against agent_templates using provider_snapshots JSONB
    const { data: templates } = await supabase
      .from('agent_templates')
      .select('id, name, provider_snapshots')
      .eq('is_active', true);

    // Validate specifically against the digitalocean provider (not any provider)
    const matchingTemplate = (templates ?? []).find((t: { provider_snapshots: Record<string, string> | null }) =>
      t.provider_snapshots && t.provider_snapshots['digitalocean'] === snapshotName
    );
    if (!matchingTemplate) {
      throw new Error(`Invalid snapshot: "${snapshotName}" is not an approved agent template.`);
    }

    if (!process.env.DO_TOKEN) {
      throw new Error('DigitalOcean token is not configured. Contact your administrator.');
    }

    // Create deployment row BEFORE proxying to sidecar
    const { data: deployment, error: insertError } = await supabase
      .from('deployments')
      .insert({
        user_id: user.id,
        name,
        status: 'provisioning',
        provider: 'digitalocean',
        region,
        size,
        primary_model: process.env.PLATFORM_DEFAULT_MODEL || null,
        template_id: matchingTemplate.id,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error(`A deployment named "${name}" already exists.`);
      }
      throw new Error(insertError.message);
    }

    // Start sidecar and proxy the restore request
    const { proxySidecar } = await import('./clawmacdo-serve');
    let result: { ok: boolean; message: string; operation_id?: string };
    try {
      const sidecarRes = await proxySidecar('/api/snapshots/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'digitalocean',
          snapshot_name: snapshotName,
          do_token: process.env.DO_TOKEN,
          region,
          size,
        }),
      });
      result = (await sidecarRes.json()) as { ok: boolean; message: string; operation_id?: string };
    } catch (err) {
      // Sidecar failed — mark deployment as failed
      await supabase.from('deployments').update({
        status: 'failed',
        error_message: String(err),
      }).eq('id', deployment.id);
      throw new Error(`Sidecar error: ${String(err)}`);
    }

    if (result.ok && result.operation_id) {
      await supabase.from('deployments').update({
        active_operation_id: result.operation_id,
        last_operation_id: result.operation_id,
        cli_deploy_id: result.operation_id,
      }).eq('id', deployment.id);
    } else {
      await supabase.from('deployments').update({
        status: 'failed',
        error_message: result.message || 'Restore failed to start',
      }).eq('id', deployment.id);
    }

    return { ...result, deploymentId: deployment.id };
  });

/** Get operation steps for the last operation on a deployment (for history card). */
export const getOperationSteps = createServerFn({ method: 'GET' })
  .inputValidator((data: { deploymentId: string }) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();

    const { data: deployment } = await supabase
      .from('deployments')
      .select('last_operation_id')
      .eq('id', ctx.data.deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!deployment?.last_operation_id) return [];

    // Proxy to sidecar to get steps
    const { proxySidecar } = await import('./clawmacdo-serve');
    try {
      const sidecarRes = await proxySidecar(
        `/api/deploy/steps/${deployment.last_operation_id}`
      );
      if (!sidecarRes.ok) return [];
      return await sidecarRes.json();
    } catch {
      return [];
    }
  });

/** Update a deployment after a restore operation completes (called from client after SSE terminal message). */
export const updateDeploymentAfterRestore = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string; hostname?: string; ip?: string; deployId?: string }) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { deploymentId, hostname, ip, deployId } = ctx.data;

    const updates: Record<string, unknown> = {
      status: 'running',
      active_operation_id: null,
    };
    if (hostname) updates.droplet_hostname = hostname;
    if (ip) updates.ip_address = ip;
    if (deployId) updates.cli_deploy_id = deployId;

    // Store tailscale_hostname for platform-managed restores
    const { data: dep } = await supabase
      .from('deployments')
      .select('tailscale_managed, tailscale_setup_status, sandbox_dir')
      .eq('id', deploymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (dep?.tailscale_managed && hostname) {
      updates.tailscale_hostname = hostname;
    }

    await supabase.from('deployments').update(updates)
      .eq('id', deploymentId)
      .eq('user_id', user.id);

    // Auto-enable Funnel for platform-managed snapshot restores
    if (dep?.tailscale_managed && dep.tailscale_setup_status === 'pending' && ip) {
      const { count: funnelClaim } = await supabase
        .from('deployments')
        .update({ tailscale_setup_status: 'in_progress' }, { count: 'exact' })
        .eq('id', deploymentId)
        .eq('tailscale_setup_status', 'pending');

      if (funnelClaim && funnelClaim > 0) {
        try {
          const cliEnv = buildCliBaseEnv();
          const funnelResult = await executeFunnelSetup({
            ipAddress: ip,
            sandboxDir: dep.sandbox_dir ?? undefined,
            cliEnv,
            tailscaleHostname: hostname ?? undefined,
          });
          const funnelUpdates: Record<string, unknown> = {
            tailscale_setup_status: 'configured',
            tailscale_configured: true,
          };
          if (funnelResult.funnelUrl) funnelUpdates.funnel_url = funnelResult.funnelUrl;
          if (funnelResult.gatewayToken) funnelUpdates.gateway_token = funnelResult.gatewayToken;
          if (funnelResult.deviceId) funnelUpdates.tailscale_device_id = funnelResult.deviceId;
          await supabase.from('deployments').update(funnelUpdates).eq('id', deploymentId);
        } catch (err) {
          console.error('[updateDeploymentAfterRestore] Auto-funnel failed:', err);
          await supabase.from('deployments').update({ tailscale_setup_status: 'failed' }).eq('id', deploymentId);
        }
      }
    }

    return { success: true };
  });

/** Clear the active_operation_id lock after a snapshot completes or fails. */
export const clearActiveOperation = createServerFn({ method: 'POST' })
  .inputValidator((data: { deploymentId: string }) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { deploymentId } = ctx.data;

    await supabase.from('deployments').update({ active_operation_id: null })
      .eq('id', deploymentId)
      .eq('user_id', user.id);

    return { success: true };
  });
