// Session visibility check — owner and admins can see private plans; everyone sees published plans

export function canAccessSession(session, tokenData, userRole) {
  if (session.published_at) return true;
  if (userRole === 'admin') return true;
  if (session.created_by === tokenData.user_id) return true;
  return false;
}
