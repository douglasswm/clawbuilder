import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock fetch and env vars before importing the module
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('isPlatformTailscaleEnabled', () => {
  it('returns true when both env vars are set', async () => {
    process.env.TAILSCALE_API_TOKEN = 'tskey-api-test';
    process.env.TAILSCALE_TAILNET = 'test.tail1234.ts.net';
    const { isPlatformTailscaleEnabled } = await import('../../src/lib/server/tailscale-api');
    expect(isPlatformTailscaleEnabled()).toBe(true);
  });

  it('returns false when only TAILSCALE_API_TOKEN is set', async () => {
    process.env.TAILSCALE_API_TOKEN = 'tskey-api-test';
    delete process.env.TAILSCALE_TAILNET;
    const { isPlatformTailscaleEnabled } = await import('../../src/lib/server/tailscale-api');
    expect(isPlatformTailscaleEnabled()).toBe(false);
  });

  it('returns false when neither env var is set', async () => {
    delete process.env.TAILSCALE_API_TOKEN;
    delete process.env.TAILSCALE_TAILNET;
    const { isPlatformTailscaleEnabled } = await import('../../src/lib/server/tailscale-api');
    expect(isPlatformTailscaleEnabled()).toBe(false);
  });
});

describe('createTenantAuthKey', () => {
  beforeEach(() => {
    process.env.TAILSCALE_API_TOKEN = 'tskey-api-test';
    process.env.TAILSCALE_TAILNET = 'test.tail1234.ts.net';
  });

  it('returns auth key on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: 'tskey-auth-generated-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { createTenantAuthKey } = await import('../../src/lib/server/tailscale-api');
    const key = await createTenantAuthKey('deploy-abc');

    expect(key).toBe('tskey-auth-generated-123');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/tailnet/test.tail1234.ts.net/keys');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body.capabilities.devices.create.tags).toEqual(['tag:tenant']);
    expect(body.capabilities.devices.create.reusable).toBe(false);
    expect(body.capabilities.devices.create.preauthorized).toBe(true);
    expect(body.expirySeconds).toBe(600);
  });

  it('throws on 401 (bad token)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }));

    const { createTenantAuthKey } = await import('../../src/lib/server/tailscale-api');
    await expect(createTenantAuthKey('deploy-abc')).rejects.toThrow('401');
  });

  it('throws on 500 (server error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }));

    const { createTenantAuthKey } = await import('../../src/lib/server/tailscale-api');
    await expect(createTenantAuthKey('deploy-abc')).rejects.toThrow('500');
  });

  it('throws when TAILSCALE_API_TOKEN is not set', async () => {
    delete process.env.TAILSCALE_API_TOKEN;
    const { createTenantAuthKey } = await import('../../src/lib/server/tailscale-api');
    await expect(createTenantAuthKey('deploy-abc')).rejects.toThrow('TAILSCALE_API_TOKEN');
  });
});

describe('deleteDevice', () => {
  beforeEach(() => {
    process.env.TAILSCALE_API_TOKEN = 'tskey-api-test';
    process.env.TAILSCALE_TAILNET = 'test.tail1234.ts.net';
  });

  it('succeeds on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { deleteDevice } = await import('../../src/lib/server/tailscale-api');
    await expect(deleteDevice('device-123')).resolves.toBeUndefined();
  });

  it('treats 404 as no-op (already deleted)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { deleteDevice } = await import('../../src/lib/server/tailscale-api');
    await expect(deleteDevice('device-123')).resolves.toBeUndefined();
  });

  it('throws on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server Error'),
    }));

    const { deleteDevice } = await import('../../src/lib/server/tailscale-api');
    await expect(deleteDevice('device-123')).rejects.toThrow('500');
  });
});

describe('findDeviceByHostname', () => {
  beforeEach(() => {
    process.env.TAILSCALE_API_TOKEN = 'tskey-api-test';
    process.env.TAILSCALE_TAILNET = 'test.tail1234.ts.net';
  });

  it('returns device when hostname matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        devices: [
          { id: 'dev-1', hostname: 'openclaw-abc', addresses: ['100.64.0.1'], online: true, lastSeen: '2026-03-22T10:00:00Z' },
          { id: 'dev-2', hostname: 'openclaw-def', addresses: ['100.64.0.2'], online: false, lastSeen: '2026-03-21T10:00:00Z' },
        ],
      }),
    }));

    const { findDeviceByHostname } = await import('../../src/lib/server/tailscale-api');
    const device = await findDeviceByHostname('openclaw-abc');

    expect(device).not.toBeNull();
    expect(device!.id).toBe('dev-1');
    expect(device!.hostname).toBe('openclaw-abc');
    expect(device!.online).toBe(true);
  });

  it('returns null when no hostname matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        devices: [
          { id: 'dev-1', hostname: 'openclaw-xyz', addresses: [], online: true, lastSeen: '' },
        ],
      }),
    }));

    const { findDeviceByHostname } = await import('../../src/lib/server/tailscale-api');
    const device = await findDeviceByHostname('openclaw-nonexistent');
    expect(device).toBeNull();
  });

  it('returns null on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    const { findDeviceByHostname } = await import('../../src/lib/server/tailscale-api');
    const device = await findDeviceByHostname('openclaw-abc');
    expect(device).toBeNull();
  });
});
