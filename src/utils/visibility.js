// Session visibility check — owner and users with session.view_private can see private plans; everyone sees published plans
// Updated for RBAC: takes user permissions array instead of a single role string

export function canAccessSession(session, tokenData, userPermissions) {
  if (session.published_at) {
    return true;
  }
  if (userPermissions && userPermissions.includes('session_view_private')) {
    return true;
  }
  if (session.created_by === tokenData.user_id) {
    return true;
  }
  return false;
}
