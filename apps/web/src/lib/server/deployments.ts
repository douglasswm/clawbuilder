import { createServerFn } from '@tanstack/react-start';
import { getAuthenticatedClient } from './auth-helpers';
import { validateDeploymentName, validateRegion, validateSize, validateModel } from '../validation';

export const TERMINAL_STATUSES = new Set<Deployment['status']>(['running', 'failed', 'destroyed']);

export function buildDoTokenEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const doToken = process.env.DO_TOKEN;
  if (doToken) env['DO_TOKEN'] = doToken;
  return env;
}

export interface CreateDeploymentInput {
  name: string;
  region: string;
  size: string;
  primaryModel: string;
  personaSlug?: string;
  personaName?: string;
}

export interface Deployment {
  id: string;
  user_id: string;
  name: string;
  status: 'pending' | 'provisioning' | 'running' | 'destroying' | 'destroyed' | 'failed';
  provider: string;
  region: string;
  size: string;
  primary_model: string;
  cli_deploy_id?: string;
  ip_address?: string;
  persona_slug?: string;
  persona_name?: string;
  persona_pushed: boolean;
  persona_error?: string;
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

/** Create a new deployment - runs clawmacdo deploy --detach --json */
export const createDeployment = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateDeploymentInput) => data)
  .handler(async (ctx) => {
    const { supabase, user } = await getAuthenticatedClient();
    const { name, region, size, primaryModel, personaSlug, personaName } = ctx.data;

    // Server-side validation
    const nameValidation = validateDeploymentName(name);
    if (!nameValidation.valid) throw new Error(nameValidation.error);
    if (!validateRegion(region)) throw new Error(`Invalid region: ${region}`);
    if (!validateSize(size)) throw new Error(`Invalid size: ${size}`);
    if (!validateModel(primaryModel)) throw new Error(`Invalid model: ${primaryModel}`);

    const { execClawmacdo } = await import('./clawmacdo');
    const { getDecryptedUserApiKeys, hasAnyApiKey } = await import('./settings');

    // Pre-flight: require DO_TOKEN before inserting the row so we don't consume a name slot
    if (!process.env.DO_TOKEN) {
      throw new Error('DigitalOcean token is not configured. Contact your administrator.');
    }

    // Check user has API keys (cheap existence check, no decryption)
    if (!await hasAnyApiKey(user.id, supabase)) {
      throw new Error('Please configure your AI API keys in Settings before deploying.');
    }

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
        primary_model: primaryModel,
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

    // Build CLI args
    const cliArgs = [
      'deploy',
      '--provider', 'digitalocean',
      '--region', region,
      '--size', size,
      '--hostname', name,
      '--primary-model', primaryModel,
      '--detach',
      '--json',
    ];

    // Decrypt keys for CLI (after insert succeeds, so we only decrypt when needed)
    const userKeys = await getDecryptedUserApiKeys(user.id, supabase);
    const cliEnv = buildDoTokenEnv();
    if (userKeys.anthropicKey) cliEnv['ANTHROPIC_API_KEY'] = userKeys.anthropicKey;
    if (userKeys.openaiKey) cliEnv['OPENAI_API_KEY'] = userKeys.openaiKey;
    if (userKeys.geminiKey) cliEnv['GEMINI_API_KEY'] = userKeys.geminiKey;

    // Run deploy CLI
    let result;
    try {
      result = await execClawmacdo(cliArgs, { env: cliEnv });
    } catch (err) {
      await supabase.from('deployments').update({
        status: 'failed',
        error_message: String(err),
      }).eq('id', deployment.id);
      if (result?.sandboxDir || deployment.sandbox_dir) {
        try {
          const { rmSync } = await import('node:fs');
          rmSync((result?.sandboxDir || deployment.sandbox_dir)!, { recursive: true, force: true });
        } catch {
          // Non-critical
        }
      }
      throw new Error(`CLI error: ${String(err)}`);
    }

    // Parse deploy_id from JSON output
    let cliDeployId: string | undefined;
    try {
      const parsed = JSON.parse(result.stdout.trim());
      cliDeployId = parsed.deploy_id ?? parsed.id ?? undefined;
    } catch {
      // stdout wasn't JSON — that's okay for some CLI versions
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

    // Update row with cli_deploy_id and sandbox_dir
    await supabase.from('deployments').update({
      status: 'provisioning',
      cli_deploy_id: cliDeployId ?? null,
      sandbox_dir: result.sandboxDir,
    }).eq('id', deployment.id);

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
    const cliEnv = buildDoTokenEnv();

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

    const cliEnv = buildDoTokenEnv();

    const result = await execClawmacdo(
      ['destroy', '--provider', 'digitalocean', '--name', dep.name, '--yes'],
      { sandboxDir: dep.sandbox_dir ?? undefined, env: cliEnv }
    );

    if (result.code !== 0) {
      await supabase.from('deployments').update({
        status: dep.status,
        error_message: result.stderr || 'Destroy failed',
      }).eq('id', dep.id);
      throw new Error(result.stderr || 'Destroy failed');
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

    await supabase.from('deployments').update({ status: 'destroyed' }).eq('id', dep.id);
    return { success: true };
  });
