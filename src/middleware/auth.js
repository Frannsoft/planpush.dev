import { createHmac, timingSafeEqual } from 'crypto';
import { knex } from '../db.js';
import { kv } from '../kv.js';
import { can } from '../utils/rbac.js';

const COOKIE_NAME = '__session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

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

export function setSessionCookie(res, payload) {
  const value = signSession({ ...payload, exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE });
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
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

  // Path 2: Session cookie (browser)
  if (!tokenData) {
    const cookie = req.cookies?.[COOKIE_NAME];
    if (cookie) tokenData = verifySession(cookie);
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

export async function requireAdmin(req, res, next) {
  const tokenData = await verifyRequest(req);
  if (!tokenData) return res.status(401).json({ error: 'unauthorized' });
  // Check user.manage permission via RBAC (covers admin role + future granular permissions)
  const user = { id: tokenData.user_id };
  const hasPermission = await can(user, 'user_manage');
  if (!hasPermission) return res.status(403).json({ error: 'forbidden' });
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
