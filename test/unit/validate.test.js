import { describe, it, expect } from 'vitest';
import { isValidSessionId, isValidDeviceCode, isValidUserCode } from '../../src/utils/validate.js';

describe('validate.js', () => {
  describe('isValidSessionId', () => {
    it('accepts legacy sess_ format with 12 hex chars', () => {
      expect(isValidSessionId('sess_064d4a62049b')).toBe(true);
      expect(isValidSessionId('sess_000000000000')).toBe(true);
      expect(isValidSessionId('sess_ffffffffffff')).toBe(true); // 12 hex chars, valid
      expect(isValidSessionId('sess_ffffffffffffffff')).toBe(false); // 16 chars — too long, should fail
    });

    it('rejects sess_ with non-hex chars', () => {
      expect(isValidSessionId('sess_064d4a62049g')).toBe(false); // 'g' not hex
      expect(isValidSessionId('sess_AAAA4a62049b')).toBe(false); // uppercase
    });

    it('rejects sess_ with wrong length', () => {
      expect(isValidSessionId('sess_064d4a')).toBe(false); // too short
      expect(isValidSessionId('sess_064d4a620495ab')).toBe(false); // too long (16 hex)
    });

    it('accepts named slug format (lowercase alphanumeric + hyphens)', () => {
      expect(isValidSessionId('auth-redesign')).toBe(true);
      expect(isValidSessionId('my-plan')).toBe(true);
      expect(isValidSessionId('a')).toBe(true); // single char OK
      expect(isValidSessionId('plan123')).toBe(true);
      expect(isValidSessionId('x-y-z')).toBe(true);
    });

    it('rejects slug with uppercase or invalid chars', () => {
      expect(isValidSessionId('Auth-Redesign')).toBe(false); // uppercase
      expect(isValidSessionId('auth_redesign')).toBe(false); // underscore
      expect(isValidSessionId('auth/redesign')).toBe(false); // path traversal
      expect(isValidSessionId('auth..redesign')).toBe(false); // double dot
    });

    it('rejects slug starting or ending with hyphen', () => {
      expect(isValidSessionId('-auth')).toBe(false);
      expect(isValidSessionId('auth-')).toBe(false);
    });

    it('rejects slug over 64 chars', () => {
      const longSlug = 'a'.repeat(65);
      expect(isValidSessionId(longSlug)).toBe(false); // 65 chars, too long
      expect(isValidSessionId('a'.repeat(64))).toBe(true); // 64 is max, single char at start/end OK
      expect(isValidSessionId('a-' + 'b'.repeat(61) + '-a')).toBe(false); // 65 total, too long
      expect(isValidSessionId('a-' + 'b'.repeat(60) + '-a')).toBe(true); // 64 total, valid
    });

    it('rejects non-string input', () => {
      expect(isValidSessionId(null)).toBe(false);
      expect(isValidSessionId(undefined)).toBe(false);
      expect(isValidSessionId(123)).toBe(false);
      expect(isValidSessionId({})).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidSessionId('')).toBe(false);
    });
  });

  describe('isValidDeviceCode', () => {
    it('accepts valid device code format: dc_ + 32 hex chars', () => {
      const validCode = 'dc_' + '0'.repeat(32);
      expect(isValidDeviceCode(validCode)).toBe(true);
      expect(isValidDeviceCode('dc_' + 'f'.repeat(32))).toBe(true);
      expect(isValidDeviceCode('dc_0123456789abcdef0123456789abcdef')).toBe(true);
    });

    it('rejects wrong prefix', () => {
      expect(isValidDeviceCode('uc_' + '0'.repeat(32))).toBe(false);
      expect(isValidDeviceCode('dc' + '0'.repeat(32))).toBe(false); // missing underscore
      expect(isValidDeviceCode('DC_' + '0'.repeat(32))).toBe(false); // uppercase
    });

    it('rejects wrong length', () => {
      expect(isValidDeviceCode('dc_' + '0'.repeat(31))).toBe(false); // too short
      expect(isValidDeviceCode('dc_' + '0'.repeat(33))).toBe(false); // too long
    });

    it('rejects non-hex chars', () => {
      expect(isValidDeviceCode('dc_' + 'g'.repeat(32))).toBe(false);
      expect(isValidDeviceCode('dc_' + 'G'.repeat(32))).toBe(false); // uppercase hex
    });

    it('rejects non-string input', () => {
      expect(isValidDeviceCode(null)).toBe(false);
      expect(isValidDeviceCode(undefined)).toBe(false);
      expect(isValidDeviceCode(123)).toBe(false);
    });
  });

  describe('isValidUserCode', () => {
    it('accepts valid user code format: XXXX-XXXX with allowed chars', () => {
      expect(isValidUserCode('ABCD-EFGH')).toBe(true);
      expect(isValidUserCode('2345-6789')).toBe(true);
      expect(isValidUserCode('ABCD-2345')).toBe(true);
    });

    it('uses alphabet without 0/1 to avoid confusion (O and I are allowed in validator)', () => {
      // Valid: A-Z (includes O and I) plus 2-9 (no 0 or 1)
      expect(isValidUserCode('ABCD-EFGH')).toBe(true);
      expect(isValidUserCode('PQRS-TUVW')).toBe(true);
      expect(isValidUserCode('XYZ2-3456')).toBe(true);
      // Invalid: contains confusing digit chars (0, 1)
      expect(isValidUserCode('ABCD-EFG0')).toBe(false); // 0 not allowed (looks like O)
      expect(isValidUserCode('ABCD-EFG1')).toBe(false); // 1 not allowed (looks like I or L)
      // Note: The regex allows O and I (A-Z), but the generator avoids them
      // The validator accepts both O and I (design choice: flexible validator)
      expect(isValidUserCode('ABCD-EFGO')).toBe(true);
      expect(isValidUserCode('ABCD-EFGI')).toBe(true);
    });

    it('rejects wrong format', () => {
      expect(isValidUserCode('ABCDEFGH')).toBe(false); // no hyphen
      expect(isValidUserCode('ABC-DEFGH')).toBe(false); // 3 before hyphen
      expect(isValidUserCode('ABCD-EFGHI')).toBe(false); // 5 after hyphen
      expect(isValidUserCode('ABCD-EFG')).toBe(false); // only 3 after hyphen
    });

    it('rejects uppercase and lowercase mixed', () => {
      expect(isValidUserCode('abcd-efgh')).toBe(false); // lowercase
      expect(isValidUserCode('Abcd-Efgh')).toBe(false); // mixed case
    });

    it('rejects invalid chars', () => {
      expect(isValidUserCode('ABCD-EF_H')).toBe(false); // underscore
      expect(isValidUserCode('ABCD-EF@H')).toBe(false); // special char
    });

    it('rejects non-string input', () => {
      expect(isValidUserCode(null)).toBe(false);
      expect(isValidUserCode(undefined)).toBe(false);
      expect(isValidUserCode(123)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidUserCode('')).toBe(false);
    });
  });
});
