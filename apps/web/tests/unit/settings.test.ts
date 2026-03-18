import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encrypt, decrypt } from '../../src/lib/server/credentials';
import { getDecryptedUserApiKeys } from '../../src/lib/server/settings';

const TEST_KEY = 'a'.repeat(64);

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  vi.restoreAllMocks();
});

function buildMockSupabase(data: Record<string, string | null | undefined> | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data, error }),
        }),
      }),
    }),
  };
}

describe('getDecryptedUserApiKeys', () => {
  it('returns decrypted keys when row exists with anthropic key', async () => {
    const plaintext = 'sk-ant-test-key-123';
    const encrypted = encrypt(plaintext);
    const mockSupabase = buildMockSupabase({
      anthropic_key_encrypted: encrypted,
      openai_key_encrypted: null,
      gemini_key_encrypted: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getDecryptedUserApiKeys('user-1', mockSupabase as any);
    expect(result.anthropicKey).toBe(plaintext);
    expect(result.openaiKey).toBeUndefined();
    expect(result.geminiKey).toBeUndefined();
  });

  it('returns empty object when no row found', async () => {
    const mockSupabase = buildMockSupabase(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getDecryptedUserApiKeys('user-1', mockSupabase as any);
    expect(result).toEqual({});
  });

  it('returns all three decrypted keys when all are set', async () => {
    const anthropicPlain = 'sk-ant-api-key';
    const openaiPlain = 'sk-openai-key';
    const geminiPlain = 'gemini-key-xyz';
    const mockSupabase = buildMockSupabase({
      anthropic_key_encrypted: encrypt(anthropicPlain),
      openai_key_encrypted: encrypt(openaiPlain),
      gemini_key_encrypted: encrypt(geminiPlain),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getDecryptedUserApiKeys('user-2', mockSupabase as any);
    expect(result.anthropicKey).toBe(anthropicPlain);
    expect(result.openaiKey).toBe(openaiPlain);
    expect(result.geminiKey).toBe(geminiPlain);
  });

  it('returns undefined for keys with null encrypted values', async () => {
    const mockSupabase = buildMockSupabase({
      anthropic_key_encrypted: null,
      openai_key_encrypted: null,
      gemini_key_encrypted: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getDecryptedUserApiKeys('user-3', mockSupabase as any);
    expect(result.anthropicKey).toBeUndefined();
    expect(result.openaiKey).toBeUndefined();
    expect(result.geminiKey).toBeUndefined();
  });
});

describe('encrypt/decrypt integration with settings types', () => {
  it('full roundtrip: encrypt → store → decrypt matches original', () => {
    const original = 'sk-ant-my-api-key-abcdefg';
    const stored = encrypt(original);
    const recovered = decrypt(stored);
    expect(recovered).toBe(original);
  });

  it('encrypt produces different ciphertexts for identical values', () => {
    const key = 'sk-openai-identical';
    const enc1 = encrypt(key);
    const enc2 = encrypt(key);
    expect(enc1).not.toBe(enc2);
    // But both decrypt to the same value
    expect(decrypt(enc1)).toBe(key);
    expect(decrypt(enc2)).toBe(key);
  });
});
