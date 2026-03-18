import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from '../../src/lib/server/credentials';

const TEST_KEY = 'a'.repeat(64); // 32 bytes as hex

describe('credentials encrypt/decrypt', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  });

  it('roundtrip: encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'sk-ant-test-api-key-123';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypted string contains exactly 2 colons (iv:ciphertext:authTag)', () => {
    const encrypted = encrypt('hello');
    const colonCount = (encrypted.match(/:/g) ?? []).length;
    expect(colonCount).toBe(2);
  });

  it('different calls produce different ciphertext for same plaintext', () => {
    const plaintext = 'same-secret';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('decrypt throws on malformed input (missing colons)', () => {
    expect(() => decrypt('notvalidformat')).toThrow();
  });

  it('decrypt throws on input with wrong number of parts', () => {
    expect(() => decrypt('only:two')).toThrow();
  });

  it('roundtrip preserves unicode string', () => {
    const plaintext = 'こんにちは🌟';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('roundtrip preserves empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });
});

describe('credentials env var validation', () => {
  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  });

  it('throws if CREDENTIAL_ENCRYPTION_KEY is not set', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('CREDENTIAL_ENCRYPTION_KEY');
  });

  it('throws if CREDENTIAL_ENCRYPTION_KEY has wrong length (too short)', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'aaaa'; // 2 bytes, not 32
    expect(() => encrypt('test')).toThrow();
  });

  it('throws on decrypt if CREDENTIAL_ENCRYPTION_KEY is not set', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    expect(() => decrypt('aa:bb:cc')).toThrow('CREDENTIAL_ENCRYPTION_KEY');
  });
});
