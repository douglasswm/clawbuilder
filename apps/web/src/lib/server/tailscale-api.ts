/**
 * Tailscale REST API client for platform-managed Tailscale.
 *
 * This module wraps api.tailscale.com/api/v2 for auth key generation
 * and device lifecycle management. All instance-level Tailscale operations
 * (install, connect, funnel) are handled by clawmacdo via SSH.
 */

const BASE_URL = 'https://api.tailscale.com/api/v2';
const API_TIMEOUT_MS = 30_000;

function getApiToken(): string {
  const token = process.env.TAILSCALE_API_TOKEN;
  if (!token) throw new Error('TAILSCALE_API_TOKEN is not configured');
  return token;
}

function getTailnet(): string {
  const tailnet = process.env.TAILSCALE_TAILNET;
  if (!tailnet) throw new Error('TAILSCALE_TAILNET is not configured');
  return tailnet;
}

function authHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getApiToken()}`,
    'Content-Type': 'application/json',
  };
}

/** Returns true if both TAILSCALE_API_TOKEN and TAILSCALE_TAILNET env vars are set. */
export function isPlatformTailscaleEnabled(): boolean {
  return !!(process.env.TAILSCALE_API_TOKEN && process.env.TAILSCALE_TAILNET);
}

export interface TailscaleDevice {
  id: string;
  hostname: string;
  addresses: string[];
  online: boolean;
  lastSeen: string;
}

/**
 * Generate a single-use, tagged, pre-authorized auth key for a deployment.
 * The key expires in 10 minutes if unused.
 */
export async function createTenantAuthKey(deploymentId: string): Promise<string> {
  const tailnet = getTailnet();
  const res = await fetch(`${BASE_URL}/tailnet/${encodeURIComponent(tailnet)}/keys`, {
    method: 'POST',
    headers: authHeaders(),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    body: JSON.stringify({
      capabilities: {
        devices: {
          create: {
            reusable: false,
            ephemeral: false,
            preauthorized: true,
            tags: ['tag:tenant'],
          },
        },
      },
      expirySeconds: 600,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Tailscale API: failed to create auth key for deployment ${deploymentId} ` +
      `(${res.status}): ${body}`
    );
  }

  const data = (await res.json()) as { key: string };
  return data.key;
}

/** Delete a device from the platform tailnet. No-op if already deleted (404). */
export async function deleteDevice(deviceId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/device/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getApiToken()}` },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (res.status === 404) return; // Already removed
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Tailscale API: failed to delete device ${deviceId} (${res.status}): ${body}`
    );
  }
}

/** Find a device on the platform tailnet by hostname. Returns null if not found. */
export async function findDeviceByHostname(hostname: string): Promise<TailscaleDevice | null> {
  const tailnet = getTailnet();
  const res = await fetch(`${BASE_URL}/tailnet/${encodeURIComponent(tailnet)}/devices`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.warn(`[tailscale-api] Failed to list devices (${res.status})`);
    return null;
  }

  const data = (await res.json()) as { devices: Array<{
    id: string;
    hostname: string;
    addresses: string[];
    online: boolean;
    lastSeen: string;
  }> };

  const match = data.devices.find((d) => d.hostname === hostname);
  if (!match) return null;

  return {
    id: match.id,
    hostname: match.hostname,
    addresses: match.addresses,
    online: match.online,
    lastSeen: match.lastSeen,
  };
}
