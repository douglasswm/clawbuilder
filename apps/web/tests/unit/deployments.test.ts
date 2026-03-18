import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCliExecutor, parseNdjson } from '../../src/lib/server/clawmacdo';
import { normalizeStatus, buildDoTokenEnv } from '../../src/lib/server/deployments';
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
});

describe('buildDoTokenEnv', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns DO_TOKEN when env var is set', () => {
    process.env = { ...originalEnv, DO_TOKEN: 'dop_v1_test123' };
    const result = buildDoTokenEnv();
    expect(result).toEqual({ DO_TOKEN: 'dop_v1_test123' });
  });

  it('returns empty object when env var is not set', () => {
    process.env = { ...originalEnv };
    delete process.env.DO_TOKEN;
    const result = buildDoTokenEnv();
    expect(result).toEqual({});
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
});
