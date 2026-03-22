import { defineEventHandler, getRouterParam, createError, setResponseHeader, getRequestHeader, type H3Event } from 'h3';
import { createClient } from '@supabase/supabase-js';
import { ensureSidecar } from '../../../../src/lib/server/clawmacdo-serve';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map((c: string) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
}

function extractAccessToken(event: H3Event): string {
  const authHeader = getRequestHeader(event, 'authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = getRequestHeader(event, 'cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const authCookieKey = Object.keys(cookies).find((k) => k.includes('auth-token'));
  if (authCookieKey) {
    try {
      const decoded = decodeURIComponent(cookies[authCookieKey]);
      const parsed = JSON.parse(decoded);
      return parsed.access_token || parsed[0] || '';
    } catch {
      return decodeURIComponent(cookies[authCookieKey]);
    }
  }
  return '';
}

export default defineEventHandler(async (event: H3Event) => {
  const operationId = getRouterParam(event, 'operationId');
  if (!operationId || !UUID_REGEX.test(operationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid operation ID' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase not configured' });
  }

  const accessToken = extractAccessToken(event);
  if (!accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { data: deployment } = await supabase
    .from('deployments')
    .select('id')
    .eq('user_id', user.id)
    .eq('active_operation_id', operationId)
    .maybeSingle();

  if (!deployment) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized for this operation' });
  }

  let port: number;
  try {
    const sidecar = await ensureSidecar();
    port = sidecar.port;
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service starting up — try again' });
  }

  const sidecarUrl = `http://127.0.0.1:${port}/api/deploy/${operationId}/events`;
  let sidecarRes: Response;
  try {
    sidecarRes = await fetch(sidecarUrl, {
      signal: AbortSignal.timeout(11 * 60_000),
    });
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Sidecar unavailable' });
  }

  if (!sidecarRes.ok) {
    throw createError({ statusCode: sidecarRes.status, statusMessage: `Sidecar returned ${sidecarRes.status}` });
  }

  if (!sidecarRes.body) {
    throw createError({ statusCode: 502, statusMessage: 'No stream from sidecar' });
  }

  setResponseHeader(event, 'Content-Type', 'text/event-stream');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  setResponseHeader(event, 'Connection', 'keep-alive');

  const reader = sidecarRes.body.getReader();
  const res = event.node?.res;
  if (!res) {
    throw createError({ statusCode: 500, statusMessage: 'No response stream available' });
  }

  let streamCompletedNormally = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      (res as unknown as NodeJS.WritableStream).write(value);
    }
    streamCompletedNormally = true;
  } catch {
    // Stream closed (client disconnected or sidecar stopped)
  } finally {
    (res as unknown as NodeJS.WritableStream).end();
    // Only clear the operation lock if the sidecar stream completed normally (not on client disconnect).
    // On client disconnect the sidecar job may still be running — the frontend's clearActiveOperation
    // call handles cleanup after it observes a completed/error status via polling.
    if (streamCompletedNormally) {
      await supabase.from('deployments').update({ active_operation_id: null })
        .eq('id', deployment.id)
        .eq('active_operation_id', operationId);
    }
  }
});
