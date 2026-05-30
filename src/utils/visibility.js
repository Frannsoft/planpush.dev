/**
 * Session visibility check — enforces three-tier access control.
 *
 * VISIBILITY TIERS:
 * 1. PRIVATE (session.published_at is null):
 *    - Visible only to: owner (session.created_by) and users with session_view_private permission
 *    - Enforced across serve.js, comments.js, sessionInfo.js, and dashboard
 *
 * 2. PUBLIC (session.published_at is set):
 *    - Visible to: all authenticated users (no permission check required)
 *    - Set via one-way publish: POST /api/sessions/:id/publish (cannot be undone)
 *
 * 3. ARCHIVED:
 *    - Controlled by archived_at column; admin/owner view only
 *    - Hidden from default session listings, toggleable via PATCH /api/sessions/:id/archive
 *
 * AUTHORIZATION FAILURES:
 * - Returns false (triggering 404 response, not 403)
 * - 404 prevents leaking session existence to unauthorized users
 * - Applied consistently across all routes that serve/reference sessions
 *
 * Updated for RBAC: takes user permissions array instead of a single role string
 */
export function canAccessSession(session, tokenData, userPermissions) {
  // Public plans: visible to all authenticated users
  if (session.published_at) {
    return true;
  }
  // Private plan + has admin privilege
  if (userPermissions && userPermissions.includes('session_view_private')) {
    return true;
  }
  // Private plan + is owner
  if (session.created_by === tokenData.user_id) {
    return true;
  }
  return false;
}
