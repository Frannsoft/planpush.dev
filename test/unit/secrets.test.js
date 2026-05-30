import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/utils/secrets.js';

describe('Secrets AES-256-GCM', () => {
  const SECRET_KEY = 'a'.repeat(32); // Valid 32-char secret key

  it('encrypts and decrypts a secret correctly', () => {
    const plaintext = 'my-secret-value-12345';
    const encrypted = encryptSecret(plaintext, SECRET_KEY);

    // Encrypted should be valid JSON
    const parsed = JSON.parse(encrypted);
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('ct');
    expect(parsed).toHaveProperty('tag');

    // Decrypt should match
    const decrypted = decryptSecret(encrypted, SECRET_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext on each encryption (due to random IV)', () => {
    const plaintext = 'test-value';
    const encrypted1 = encryptSecret(plaintext, SECRET_KEY);
    const encrypted2 = encryptSecret(plaintext, SECRET_KEY);

    // Ciphertexts should differ (random IV)
    expect(encrypted1).not.toBe(encrypted2);

    // But both decrypt correctly
    expect(decryptSecret(encrypted1, SECRET_KEY)).toBe(plaintext);
    expect(decryptSecret(encrypted2, SECRET_KEY)).toBe(plaintext);
  });

  it('fails to decrypt with wrong key', () => {
    const plaintext = 'secret';
    const encrypted = encryptSecret(plaintext, SECRET_KEY);
    const wrongKey = 'b'.repeat(32);

    expect(() => decryptSecret(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt corrupted ciphertext', () => {
    const plaintext = 'secret';
    const encrypted = encryptSecret(plaintext, SECRET_KEY);
    const corrupted = encrypted.slice(0, -5); // Truncate

    expect(() => decryptSecret(corrupted, SECRET_KEY)).toThrow();
  });

  it('handles special characters and unicode', () => {
    const plaintext = 'special!@#$%^&*()_+={}[]|\\:";\'<>?,./\nнеме';
    const encrypted = encryptSecret(plaintext, SECRET_KEY);
    const decrypted = decryptSecret(encrypted, SECRET_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('handles long secrets', () => {
    const plaintext = 'x'.repeat(10000);
    const encrypted = encryptSecret(plaintext, SECRET_KEY);
    const decrypted = decryptSecret(encrypted, SECRET_KEY);
    expect(decrypted).toBe(plaintext);
  });
});
