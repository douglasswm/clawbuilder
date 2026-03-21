import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execClawmacdo, parseNdjson, setCliExecutor } from '../../src/lib/server/clawmacdo';

beforeEach(() => setCliExecutor(null));
afterEach(() => setCliExecutor(null));

describe('execClawmacdo with mock executor', () => {
  it('returns result from mock executor', async () => {
    const mockResult = { stdout: '{"deploy_id":"abc"}', stderr: '', code: 0, sandboxDir: '/tmp/test' };
    setCliExecutor(vi.fn().mockResolvedValue(mockResult));

    const result = await execClawmacdo(['deploy', '--json']);
    expect(result).toEqual(mockResult);
  });

  it('passes env through to mock executor', async () => {
    let capturedOptions: unknown;
    setCliExecutor(vi.fn().mockImplementation((_args, options) => {
      capturedOptions = options;
      return Promise.resolve({ stdout: '', stderr: '', code: 0, sandboxDir: '/tmp/test' });
    }));

    const env = { MY_KEY: 'my-value' };
    await execClawmacdo(['deploy'], { env });

    expect(capturedOptions).toMatchObject({ env });
  });

  it('returns code 1 and stderr when mock returns failure', async () => {
    const mockResult = { stdout: '', stderr: 'error msg', code: 1, sandboxDir: '/tmp/test' };
    setCliExecutor(vi.fn().mockResolvedValue(mockResult));

    const result = await execClawmacdo(['deploy']);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('error msg');
  });

  it('preserves sandboxDir from mock result', async () => {
    const sandboxDir = '/tmp/specific-sandbox-dir';
    setCliExecutor(vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0, sandboxDir }));

    const result = await execClawmacdo(['track', 'some-id']);
    expect(result.sandboxDir).toBe(sandboxDir);
  });
});

describe('parseNdjson', () => {
  it('returns empty array for empty string', () => {
    expect(parseNdjson('')).toEqual([]);
  });

  it('returns one object for single valid JSON line', () => {
    expect(parseNdjson('{"status":"ok"}')).toEqual([{ status: 'ok' }]);
  });

  it('returns array of objects for multiple JSON lines', () => {
    const input = '{"a":1}\n{"b":2}\n{"c":3}';
    expect(parseNdjson(input)).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('skips malformed lines and returns valid ones', () => {
    const input = '{"ok":1}\nbad json\n{"ok":2}';
    const result = parseNdjson(input);
    expect(result).toHaveLength(2);
    expect(result).toEqual([{ ok: 1 }, { ok: 2 }]);
  });

  it('ignores lines with only whitespace', () => {
    const input = '{"a":1}\n   \n\t\n{"b":2}';
    const result = parseNdjson(input);
    expect(result).toHaveLength(2);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('handles trailing newline without producing extra entries', () => {
    const input = '{"a":1}\n';
    expect(parseNdjson(input)).toEqual([{ a: 1 }]);
  });
});
