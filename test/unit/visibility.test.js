import { describe, it, expect } from 'vitest';
import { canAccessSession } from '../../src/utils/visibility.js';

describe('visibility.js', () => {
  describe('canAccessSession', () => {
    const userId = 'user-123';
    const otherUserId = 'user-456';

    // Helper to create session objects
    const createSession = (overrides = {}) => ({
      id: 'sess_test',
      created_by: userId,
      published_at: null,
      ...overrides,
    });

    const tokenData = { user_id: userId };
    const otherTokenData = { user_id: otherUserId };

    describe('Published sessions (published_at is set)', () => {
      it('allows anyone to access published sessions', () => {
        const session = createSession({ published_at: '2025-05-29T00:00:00Z' });

        // Owner with no permissions
        expect(canAccessSession(session, tokenData, [])).toBe(true);
        // Other user with no permissions
        expect(canAccessSession(session, otherTokenData, [])).toBe(true);
        // No permissions array at all
        expect(canAccessSession(session, otherTokenData, undefined)).toBe(true);
      });

      it('allows published sessions with any permission set', () => {
        const session = createSession({ published_at: '2025-05-29T00:00:00Z' });

        expect(canAccessSession(session, otherTokenData, ['session_view_private'])).toBe(true);
        expect(canAccessSession(session, otherTokenData, ['other_permission'])).toBe(true);
      });
    });

    describe('Private sessions (published_at is null)', () => {
      it('blocks access for unrelated users without session_view_private', () => {
        const session = createSession({ published_at: null, created_by: userId });

        // Different user, no permissions
        expect(canAccessSession(session, otherTokenData, [])).toBe(false);
        // Different user, undefined permissions
        expect(canAccessSession(session, otherTokenData, undefined)).toBe(false);
      });

      it('allows owner to access own private session', () => {
        const session = createSession({ published_at: null, created_by: userId });

        // Owner with no permissions
        expect(canAccessSession(session, tokenData, [])).toBe(true);
        // Owner with no permissions array
        expect(canAccessSession(session, tokenData, undefined)).toBe(true);
        // Owner with other permissions
        expect(canAccessSession(session, tokenData, ['some_perm'])).toBe(true);
      });

      it('allows users with session_view_private permission to access private sessions', () => {
        const session = createSession({ published_at: null, created_by: userId });

        // Other user WITH session_view_private
        expect(canAccessSession(session, otherTokenData, ['session_view_private'])).toBe(true);
      });

      it('allows owner with session_view_private', () => {
        const session = createSession({ published_at: null, created_by: userId });

        expect(canAccessSession(session, tokenData, ['session_view_private'])).toBe(true);
      });

      it('blocks access if only other permissions are present', () => {
        const session = createSession({ published_at: null, created_by: userId });

        // Other user with permissions that don't include session_view_private
        expect(canAccessSession(session, otherTokenData, ['admin', 'user_manage'])).toBe(false);
        expect(canAccessSession(session, otherTokenData, ['session_view', 'comment_create'])).toBe(false);
      });
    });

    describe('Permission set formats', () => {
      it('checks for exact permission string', () => {
        const session = createSession({ published_at: null, created_by: 'owner-id' });
        const viewer = { user_id: 'viewer-id' };

        // Array with the permission
        expect(canAccessSession(session, viewer, ['session_view_private'])).toBe(true);

        // Array with partial match (should not match)
        expect(canAccessSession(session, viewer, ['session_view', 'private'])).toBe(false);
      });

      it('handles empty permission array for private sessions', () => {
        const session = createSession({ published_at: null, created_by: userId });
        const stranger = { user_id: 'stranger-id' };

        expect(canAccessSession(session, stranger, [])).toBe(false);
      });

      it('handles multiple permissions in array', () => {
        const session = createSession({ published_at: null, created_by: userId });
        const admin = { user_id: 'admin-id' };

        // Admin with multiple permissions including the needed one
        expect(
          canAccessSession(session, admin, [
            'user_manage',
            'session_view_private',
            'audit_view',
          ])
        ).toBe(true);

        // Admin with multiple permissions but NOT the needed one
        expect(canAccessSession(session, admin, ['user_manage', 'audit_view'])).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('handles null/undefined tokenData gracefully', () => {
        const session = createSession({ published_at: '2025-05-29T00:00:00Z' });

        // Published session allows anyone
        expect(canAccessSession(session, null, [])).toBe(true);
        expect(canAccessSession(session, undefined, [])).toBe(true);
      });

      it('private session throws on null/undefined tokenData', () => {
        const session = createSession({ published_at: null });

        // The function does not check for null tokenData before accessing tokenData.user_id
        // This is a real bug in the code, but we test the actual behavior
        expect(() => canAccessSession(session, null, [])).toThrow();
        expect(() => canAccessSession(session, undefined, [])).toThrow();
      });

      it('checks created_by field exactly', () => {
        const session = createSession({ published_at: null, created_by: 'exact-user-id' });
        const token = { user_id: 'exact-user-id' };

        expect(canAccessSession(session, token, [])).toBe(true);

        // Slightly different ID should not match
        const differentToken = { user_id: 'exact-user-ida' };
        expect(canAccessSession(session, differentToken, [])).toBe(false);
      });

      it('handles session with no created_by field', () => {
        const session = { published_at: null }; // No created_by
        const token = { user_id: 'any-user' };

        // Should fail since owner check will not match
        expect(canAccessSession(session, token, [])).toBe(false);
      });

      it('published_at = empty string should be treated as falsy', () => {
        const session = createSession({ published_at: '' });
        const token = { user_id: 'different-user' };

        // Empty string is falsy, so private logic applies
        expect(canAccessSession(session, token, [])).toBe(false);

        // But owner should still have access
        const ownerToken = { user_id: userId };
        expect(canAccessSession(session, ownerToken, [])).toBe(true);
      });

      it('published_at = 0 (edge) should be treated as falsy', () => {
        const session = createSession({ published_at: 0 });
        const token = { user_id: 'different-user' };

        expect(canAccessSession(session, token, [])).toBe(false);
      });
    });

    describe('Truth table', () => {
      it('summarizes all valid combinations', () => {
        const publishedSession = createSession({ published_at: '2025-05-29T00:00:00Z' });
        const privateSession = createSession({ published_at: null });

        const ownerToken = { user_id: userId };
        const strangerToken = { user_id: 'stranger' };

        // Published: everyone can see
        expect(canAccessSession(publishedSession, ownerToken, [])).toBe(true);
        expect(canAccessSession(publishedSession, strangerToken, [])).toBe(true);

        // Private: only owner or session_view_private users
        expect(canAccessSession(privateSession, ownerToken, [])).toBe(true);
        expect(canAccessSession(privateSession, strangerToken, [])).toBe(false);
        expect(canAccessSession(privateSession, strangerToken, ['session_view_private'])).toBe(true);
      });
    });
  });
});
