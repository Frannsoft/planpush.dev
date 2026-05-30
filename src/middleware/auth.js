import { createHmac, timingSafeEqual } from 'crypto';
import { knex } from '../db.js';
import { kv } from '../kv.js';
import { can } from '../utils/rbac.js';

// Absolute browser-session lifetime, enforced against session.created_at; default 7d.
// (Idle timeout is the rolling express-session cookie maxAge configured in app.js.)
const SESSION_MAX_AGE_MS = process.env.SESSION_MAX_AGE ? parseInt(process.env.SESSION_MAX_AGE) * 1000 : 7 * 24 * 60 * 60 * 1000;

// signSession/verifySession: for OAuth CSRF state tokens only (not for session storage)
export function signSession(payload) {
  const secret = process.env.SECRET_KEY;
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySession(cookie) {
  const secret = process.env.SECRET_KEY;
  if (!secret || !cookie) return null;
  const dotIdx = cookie.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const data = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);
  if (!data || !sig) return null;
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(req, payload) {
  req.session.user_id = payload.user_id;
  req.session.display_name = payload.display_name;
  req.session.role = payload.role;
  req.session.created_at = Date.now();
}

export function clearSessionCookie(req, callback) {
  req.session.destroy(callback || (() => {}));
}

export async function verifyRequest(req) {
  let tokenData = null;
  let tokenId = null;

  // Path 1: Bearer token (CLI device-flow access tokens)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token.startsWith('at_')) {
      tokenData = await kv.get(`access_token:${token}`, 'json');
      if (tokenData) tokenId = tokenData.token_id || null;
    }
  }

  // Path 2: Session (browser via express-session)
  if (!tokenData && req.session?.user_id) {
    // Enforce absolute max-age against session creation time (idle timeout is the
    // rolling express-session cookie; this caps total lifespan regardless of activity).
    if (req.session.created_at && (Date.now() - req.session.created_at) > SESSION_MAX_AGE_MS) {
      req.session.destroy(() => {});
      return null;
    }
    tokenData = {
      user_id: req.session.user_id,
      display_name: req.session.display_name,
      role: req.session.role,
    };
  }

  if (!tokenData) return null;

  // Note: IdP membership is not re-verified after login. If a user is removed from
  // their IdP (GitHub org, Okta group, etc.), their session/tokens remain valid until
  // expiry or admin deactivation. Operators should deactivate users in PlanPush when needed.

  // Check if the underlying refresh token has been revoked (access tokens only)
  if (tokenId) {
    const apiToken = await knex('api_tokens').where({ id: tokenId }).select('revoked_at').first();
    if (!apiToken || apiToken.revoked_at) return null;
  }

  // Check if user is deactivated (cached in KV for 5 min)
  // Note: if deactivated_at is set out-of-band (e.g. direct DB edit), the cache
  // will hold '0' (active) for up to 5 minutes before taking effect.
  const cacheKey = `deactivated:${tokenData.user_id}`;
  const cached = await kv.get(cacheKey);
  if (cached === '1') return null;
  if (cached === null) {
    const user = await knex('users').where({ id: tokenData.user_id }).select('deactivated_at').first();
    if (!user || user.deactivated_at) {
      await kv.put(cacheKey, '1', { expirationTtl: 300 });
      return null;
    }
    await kv.put(cacheKey, '0', { expirationTtl: 300 });
  }

  return tokenData;
}

export async function requireAuth(req, res, next) {
  const tokenData = await verifyRequest(req);
  if (!tokenData) return res.status(401).json({ error: 'unauthorized' });
  req.tokenData = tokenData;
  next();
}

export async function requireAuthOrRedirect(req, res, next) {
  const tokenData = await verifyRequest(req);
  if (!tokenData) {
    const raw = req.originalUrl || req.path;
    const redirectTo = encodeURIComponent(raw.length > 500 ? '/dashboard' : raw);
    return res.redirect(`/auth/login?redirect_to=${redirectTo}`);
  }
  req.tokenData = tokenData;
  next();
}
