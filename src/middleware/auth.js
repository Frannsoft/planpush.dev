import { createHmac, timingSafeEqual } from 'crypto';

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
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export async function verifyRequest(req) {
  // Path 1: Bearer token (CLI device-flow access tokens)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token.startsWith('at_')) {
      return req.app.locals.kv.get(`access_token:${token}`, 'json');
    }
  }

  // Path 2: Session cookie (browser)
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie) return verifySession(cookie);

  return null;
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
    const redirectTo = encodeURIComponent(req.originalUrl || req.path);
    return res.redirect(`/auth/login?redirect_to=${redirectTo}`);
  }
  req.tokenData = tokenData;
  next();
}

export async function requireAdmin(req, res, next) {
  const tokenData = await verifyRequest(req);
  if (!tokenData) return res.status(401).json({ error: 'unauthorized' });
  if (tokenData.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  req.tokenData = tokenData;
  next();
}
