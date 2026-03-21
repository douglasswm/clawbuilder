import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCliExecutor, parseNdjson } from '../../src/lib/server/clawmacdo';
import { normalizeStatus, buildCliBaseEnv, checkTailscaleAvailable } from '../../src/lib/server/deployments';
import {
  validateDeploymentName,
  validateRegion,
  validateSize,
  validateModel,
} from '../../src/lib/validation';

beforeEach(() => setCliExecutor(null));
afterEach(() => {
  setCliExecutor(null);
  vi.restoreAllMocks();
});

describe('validation integration', () => {
  it('valid deployment name passes validation', () => {
    const result = validateDeploymentName('my-agent');
    expect(result.valid).toBe(true);
  });

  it('name with uppercase and spaces fails validation', () => {
    const result = validateDeploymentName('My Agent!');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('invalid region is rejected', () => {
    expect(validateRegion('us-west-9')).toBe(false);
  });

  it('valid region passes', () => {
    expect(validateRegion('nyc1')).toBe(true);
  });

  it('invalid size is rejected', () => {
    expect(validateSize('s-999vcpu-999gb')).toBe(false);
  });

  it('valid size passes', () => {
    expect(validateSize('s-1vcpu-1gb')).toBe(true);
  });

  it('invalid model is rejected', () => {
    expect(validateModel('llama')).toBe(false);
  });

  it('valid model passes', () => {
    expect(validateModel('anthropic')).toBe(true);
  });
});

describe('normalizeStatus', () => {
  it('maps "running" to "running"', () => {
    expect(normalizeStatus('running', 'provisioning')).toBe('running');
  });

  it('maps "failed" to "failed"', () => {
    expect(normalizeStatus('failed', 'provisioning')).toBe('failed');
  });

  it('maps "error" to "failed"', () => {
    expect(normalizeStatus('error', 'provisioning')).toBe('failed');
  });

  it('maps "provisioning" to "provisioning"', () => {
    expect(normalizeStatus('provisioning', 'pending')).toBe('provisioning');
  });

  it('maps "pending" to "provisioning"', () => {
    expect(normalizeStatus('pending', 'pending')).toBe('provisioning');
  });

  it('maps "destroyed" to "destroyed"', () => {
    expect(normalizeStatus('destroyed', 'destroying')).toBe('destroyed');
  });

  it('maps "destroying" to "destroying"', () => {
    expect(normalizeStatus('destroying', 'running')).toBe('destroying');
  });

  it('falls back to currentStatus for unknown status', () => {
    expect(normalizeStatus('some-unknown', 'provisioning')).toBe('provisioning');
  });

  it('is case-insensitive', () => {
    expect(normalizeStatus('RUNNING', 'provisioning')).toBe('running');
    expect(normalizeStatus('Failed', 'provisioning')).toBe('failed');
    expect(normalizeStatus('Error', 'running')).toBe('failed');
  });

  it('falls back to currentStatus when rawStatus is null or undefined', () => {
    expect(normalizeStatus(null as unknown as string, 'running')).toBe('running');
    expect(normalizeStatus(undefined as unknown as string, 'provisioning')).toBe('provisioning');
    expect(normalizeStatus(undefined as unknown as string, 'failed')).toBe('failed');
  });

  it('handles mixed case variants correctly', () => {
    expect(normalizeStatus('Running', 'pending')).toBe('running');
    expect(normalizeStatus('FAILED', 'provisioning')).toBe('failed');
    expect(normalizeStatus('ERROR', 'running')).toBe('failed');
    expect(normalizeStatus('Provisioning', 'pending')).toBe('provisioning');
    expect(normalizeStatus('Destroying', 'running')).toBe('destroying');
    expect(normalizeStatus('DESTROYED', 'destroying')).toBe('destroyed');
    expect(normalizeStatus('Pending', 'pending')).toBe('provisioning');
  });
});

describe('buildCliBaseEnv', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns DO_TOKEN when env var is set', () => {
    process.env = { ...originalEnv, DO_TOKEN: 'dop_v1_test123' };
    delete process.env.BYTEPLUS_ARKMODEL_API_KEY;
    const result = buildCliBaseEnv();
    expect(result).toEqual({ DO_TOKEN: 'dop_v1_test123' });
  });

  it('returns empty object when no env vars are set', () => {
    process.env = { ...originalEnv };
    delete process.env.DO_TOKEN;
    delete process.env.BYTEPLUS_ARKMODEL_API_KEY;
    const result = buildCliBaseEnv();
    expect(result).toEqual({});
  });

  it('returns empty object when DO_TOKEN is an empty string', () => {
    process.env = { ...originalEnv, DO_TOKEN: '' };
    delete process.env.BYTEPLUS_ARKMODEL_API_KEY;
    const result = buildCliBaseEnv();
    expect(result).toEqual({});
  });

  it('returns BYTEPLUS_ARKMODEL_API_KEY when env var is set', () => {
    process.env = { ...originalEnv, BYTEPLUS_ARKMODEL_API_KEY: 'bp-test-key-123' };
    delete process.env.DO_TOKEN;
    const result = buildCliBaseEnv();
    expect(result).toEqual({ BYTEPLUS_ARKMODEL_API_KEY: 'bp-test-key-123' });
  });

  it('omits BYTEPLUS_ARKMODEL_API_KEY when empty', () => {
    process.env = { ...originalEnv, BYTEPLUS_ARKMODEL_API_KEY: '' };
    delete process.env.DO_TOKEN;
    const result = buildCliBaseEnv();
    expect(result).toEqual({});
  });

  it('returns both DO_TOKEN and BYTEPLUS_ARKMODEL_API_KEY together', () => {
    process.env = { ...originalEnv, DO_TOKEN: 'dop_v1_test123', BYTEPLUS_ARKMODEL_API_KEY: 'bp-test-key-123' };
    delete process.env.TAILSCALE_AUTH_KEY;
    const result = buildCliBaseEnv();
    expect(result).toEqual({ DO_TOKEN: 'dop_v1_test123', BYTEPLUS_ARKMODEL_API_KEY: 'bp-test-key-123' });
  });

  it('returns TAILSCALE_AUTH_KEY when env var is set', () => {
    process.env = { ...originalEnv, TAILSCALE_AUTH_KEY: 'tskey-auth-test123' };
    delete process.env.DO_TOKEN;
    delete process.env.BYTEPLUS_ARKMODEL_API_KEY;
    const result = buildCliBaseEnv();
    expect(result).toEqual({ TAILSCALE_AUTH_KEY: 'tskey-auth-test123' });
  });

  it('omits TAILSCALE_AUTH_KEY when empty', () => {
    process.env = { ...originalEnv, TAILSCALE_AUTH_KEY: '' };
    delete process.env.DO_TOKEN;
    delete process.env.BYTEPLUS_ARKMODEL_API_KEY;
    const result = buildCliBaseEnv();
    expect(result).toEqual({});
  });

  it('returns all three env vars together', () => {
    process.env = {
      ...originalEnv,
      DO_TOKEN: 'dop_v1_test123',
      BYTEPLUS_ARKMODEL_API_KEY: 'bp-test-key-123',
      TAILSCALE_AUTH_KEY: 'tskey-auth-test123',
    };
    const result = buildCliBaseEnv();
    expect(result).toEqual({
      DO_TOKEN: 'dop_v1_test123',
      BYTEPLUS_ARKMODEL_API_KEY: 'bp-test-key-123',
      TAILSCALE_AUTH_KEY: 'tskey-auth-test123',
    });
  });
});

describe('CLI executor injection', () => {
  it('mock executor is called when set', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: '{"deploy_id":"abc-123"}',
      stderr: '',
      code: 0,
      sandboxDir: '/tmp/test',
    });
    setCliExecutor(mockExecutor);

    const { execClawmacdo } = await import('../../src/lib/server/clawmacdo');
    await execClawmacdo(['deploy', '--json']);
    expect(mockExecutor).toHaveBeenCalledOnce();
  });

  it('mock executor receives args correctly', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: '',
      code: 0,
      sandboxDir: '/tmp/test',
    });
    setCliExecutor(mockExecutor);

    const { execClawmacdo } = await import('../../src/lib/server/clawmacdo');
    const args = ['track', 'deploy-id-xyz', '--json'];
    await execClawmacdo(args);
    expect(mockExecutor).toHaveBeenCalledWith(args, expect.anything());
  });
});

describe('parseNdjson handles deploy output', () => {
  it('parses single deploy_id event', () => {
    const output = '{"deploy_id":"abc-123"}';
    const result = parseNdjson(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ deploy_id: 'abc-123' });
  });

  it('parses multi-event NDJSON track stream', () => {
    const output = [
      '{"status":"provisioning","step":1,"step_label":"Creating droplet"}',
      '{"status":"provisioning","step":2,"step_label":"Configuring DNS"}',
      '{"status":"running","step":3,"step_label":"Done","ip_address":"1.2.3.4"}',
    ].join('\n');

    const result = parseNdjson(output) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ status: 'provisioning', step: 1 });
    expect(result[2]).toMatchObject({ status: 'running', ip_address: '1.2.3.4' });
  });

  it('skips malformed lines in track output', () => {
    const output = [
      '{"status":"provisioning"}',
      'not-valid-json',
      '{"status":"running"}',
    ].join('\n');

    const result = parseNdjson(output);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty stdout', () => {
    expect(parseNdjson('')).toEqual([]);
  });

  it('parses a realistic deployment lifecycle stream', () => {
    const output = [
      '{"status":"pending","step":0,"step_label":"Initializing deployment"}',
      '{"status":"provisioning","step":1,"step_label":"Creating droplet"}',
      '{"status":"provisioning","step":2,"step_label":"Configuring DNS"}',
      '{"status":"provisioning","step":3,"step_label":"Installing dependencies"}',
      '{"status":"provisioning","step":4,"step_label":"Starting services"}',
      '{"status":"running","step":5,"step_label":"Deployment complete","ip_address":"203.0.113.42"}',
    ].join('\n');

    const result = parseNdjson(output) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(6);

    // First event: pending initialization
    expect(result[0]).toMatchObject({ status: 'pending', step: 0, step_label: 'Initializing deployment' });

    // Intermediate events: provisioning with step progression
    expect(result[1]).toMatchObject({ status: 'provisioning', step: 1 });
    expect(result[2]).toMatchObject({ status: 'provisioning', step: 2 });
    expect(result[3]).toMatchObject({ status: 'provisioning', step: 3 });
    expect(result[4]).toMatchObject({ status: 'provisioning', step: 4 });

    // Final event: running with ip_address
    const last = result[result.length - 1];
    expect(last).toMatchObject({
      status: 'running',
      step: 5,
      step_label: 'Deployment complete',
      ip_address: '203.0.113.42',
    });

    // Steps should be monotonically increasing
    for (let i = 1; i < result.length; i++) {
      expect(result[i].step).toBeGreaterThan(result[i - 1].step as number);
    }
  });
});

describe('checkTailscaleAvailable', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns available: true when TAILSCALE_AUTH_KEY is set', () => {
    process.env = { ...originalEnv, TAILSCALE_AUTH_KEY: 'tskey-auth-test123' };
    const result = checkTailscaleAvailable();
    expect(result).toEqual({ available: true });
  });

  it('returns available: false when TAILSCALE_AUTH_KEY is missing', () => {
    process.env = { ...originalEnv };
    delete process.env.TAILSCALE_AUTH_KEY;
    const result = checkTailscaleAvailable();
    expect(result).toEqual({ available: false });
  });
});
