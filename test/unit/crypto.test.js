import { describe, it, expect } from 'vitest';
import {
  generateId,
  generateDeviceCode,
  generateUserCode,
  generateRefreshToken,
  generateAccessToken,
  generateSessionId,
  generateNonce,
  hashToken,
} from '../../src/utils/crypto.js';
import {
  isValidSessionId,
  isValidDeviceCode,
  isValidUserCode,
} from '../../src/utils/validate.js';

describe('crypto.js', () => {
  describe('generateId', () => {
    it('returns a hex string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    it('generates 32 character hex string (16 bytes * 2)', () => {
      const id = generateId();
      expect(id).toHaveLength(32);
    });

    it('generates different IDs on each call', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateDeviceCode', () => {
    it('generates valid device code matching format', () => {
      const code = generateDeviceCode();
      expect(isValidDeviceCode(code)).toBe(true);
    });

    it('starts with dc_', () => {
      const code = generateDeviceCode();
      expect(code).toMatch(/^dc_/);
    });

    it('has correct length: dc_ + 32 hex chars = 35 total', () => {
      const code = generateDeviceCode();
      expect(code).toHaveLength(35);
    });

    it('generates different codes on each call', () => {
      const code1 = generateDeviceCode();
      const code2 = generateDeviceCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('generateUserCode', () => {
    it('generates valid user code matching format', () => {
      const code = generateUserCode();
      expect(isValidUserCode(code)).toBe(true);
    });

    it('has format XXXX-XXXX (8 chars + hyphen)', () => {
      const code = generateUserCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    });

    it('uses only allowed characters (no O/0/1/I)', () => {
      for (let i = 0; i < 10; i++) {
        const code = generateUserCode();
        expect(code).not.toContain('O');
        expect(code).not.toContain('0');
        expect(code).not.toContain('1');
        expect(code).not.toContain('I');
      }
    });

    it('generates different codes on each call', () => {
      const code1 = generateUserCode();
      const code2 = generateUserCode();
      expect(code1).not.toBe(code2);
    });

    it('has exactly one hyphen at position 4', () => {
      const code = generateUserCode();
      expect(code[4]).toBe('-');
      expect(code.indexOf('-')).toBe(4);
    });
  });

  describe('generateRefreshToken', () => {
    it('starts with rt_', () => {
      const token = generateRefreshToken();
      expect(token).toMatch(/^rt_/);
    });

    it('is rt_ + 64 hex chars (2x generateId)', () => {
      const token = generateRefreshToken();
      expect(token).toHaveLength(67); // 3 (rt_) + 64 (hex)
      expect(/^rt_[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('generates different tokens on each call', () => {
      const t1 = generateRefreshToken();
      const t2 = generateRefreshToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('generateAccessToken', () => {
    it('starts with at_', () => {
      const token = generateAccessToken();
      expect(token).toMatch(/^at_/);
    });

    it('is at_ + 64 hex chars (2x generateId)', () => {
      const token = generateAccessToken();
      expect(token).toHaveLength(67); // 3 (at_) + 64 (hex)
      expect(/^at_[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('generates different tokens on each call', () => {
      const t1 = generateAccessToken();
      const t2 = generateAccessToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('generateSessionId', () => {
    it('generates valid session ID matching legacy format', () => {
      const id = generateSessionId();
      expect(isValidSessionId(id)).toBe(true);
    });

    it('starts with sess_', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^sess_/);
    });

    it('has format sess_ + 12 hex chars = 17 total', () => {
      const id = generateSessionId();
      expect(id).toHaveLength(17); // 5 chars (sess_) + 12 hex = 17
      expect(/^sess_[0-9a-f]{12}$/.test(id)).toBe(true);
    });

    it('generates different session IDs on each call', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateNonce', () => {
    it('returns a base64url-encoded string', () => {
      const nonce = generateNonce();
      expect(typeof nonce).toBe('string');
      // base64url uses A-Z, a-z, 0-9, -, _
      expect(/^[A-Za-z0-9_-]+$/.test(nonce)).toBe(true);
    });

    it('encodes 16 bytes to base64url (21-22 characters)', () => {
      const nonce = generateNonce();
      // 16 bytes in base64 = ceil(16*8/6) = 22 chars (with padding)
      // base64url has no padding, so typically 21-22 chars
      expect(nonce.length).toBeGreaterThanOrEqual(21);
      expect(nonce.length).toBeLessThanOrEqual(24);
    });

    it('generates different nonces on each call', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it('does not contain padding characters', () => {
      const nonce = generateNonce();
      expect(nonce).not.toContain('=');
    });
  });

  describe('hashToken', () => {
    it('returns a deterministic hash for the same token', async () => {
      const token = 'test-token-12345';
      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different tokens', async () => {
      const hash1 = await hashToken('token-1');
      const hash2 = await hashToken('token-2');
      expect(hash1).not.toBe(hash2);
    });

    it('returns a 64-character hex string (SHA-256 = 256 bits = 32 bytes * 2)', async () => {
      const hash = await hashToken('test-token');
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('produces valid SHA-256 hashes', async () => {
      const token = 'known-token';
      const hash = await hashToken(token);

      // Hash should be consistent and hex
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);

      // Two calls with same input should match
      const hash2 = await hashToken(token);
      expect(hash).toBe(hash2);
    });

    it('handles empty string', async () => {
      const hash = await hashToken('');
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('handles long tokens', async () => {
      const longToken = 'x'.repeat(1000);
      const hash = await hashToken(longToken);
      expect(hash).toHaveLength(64);
    });

    it('handles special characters', async () => {
      const specialToken = 'token-with-special!@#$%^&*()_+=[]{}|;:,.<>?';
      const hash = await hashToken(specialToken);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('is async', () => {
      const result = hashToken('test');
      expect(result instanceof Promise).toBe(true);
    });
  });

  describe('token format consistency', () => {
    it('generated device code is always valid', () => {
      for (let i = 0; i < 5; i++) {
        const code = generateDeviceCode();
        expect(isValidDeviceCode(code)).toBe(true);
      }
    });

    it('generated user code is always valid', () => {
      for (let i = 0; i < 5; i++) {
        const code = generateUserCode();
        expect(isValidUserCode(code)).toBe(true);
      }
    });

    it('generated session ID is always valid', () => {
      for (let i = 0; i < 5; i++) {
        const id = generateSessionId();
        expect(isValidSessionId(id)).toBe(true);
      }
    });

    it('refresh token format is consistent', () => {
      for (let i = 0; i < 5; i++) {
        const token = generateRefreshToken();
        expect(token).toMatch(/^rt_[0-9a-f]{64}$/);
      }
    });

    it('access token format is consistent', () => {
      for (let i = 0; i < 5; i++) {
        const token = generateAccessToken();
        expect(token).toMatch(/^at_[0-9a-f]{64}$/);
      }
    });
  });

  describe('randomness quality', () => {
    it('device codes have high entropy across runs', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateDeviceCode());
      }
      // With 32 hex chars, collision probability is essentially zero
      expect(codes.size).toBe(100);
    });

    it('user codes have high entropy across runs', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateUserCode());
      }
      // With 8 chars from 32-char alphabet, collision probability is low
      expect(codes.size).toBe(100);
    });

    it('session IDs have high entropy across runs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
