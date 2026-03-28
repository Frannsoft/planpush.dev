import { randomBytes } from 'crypto';
import {
  generateDeviceCode,
  generateUserCode,
  generateRefreshToken,
  generateAccessToken,
  hashToken,
} from '../utils/crypto.js';
import { escHtml, safeRedirectUrl } from '../utils/html.js';
import { setSessionCookie, clearSessionCookie, verifyRequest, signSession, verifySession } from '../middleware/auth.js';

const DEVICE_CODE_EXPIRY_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY_MINUTES = 60;

const GITHUB_CLIENT_ID = () => process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET;
const GITHUB_ORG = () => process.env.GITHUB_ORG;
const BASE_URL = () => process.env.BASE_URL || '';

// --- GET /auth/login ---
export async function handleLogin(req, res) {
  const redirectTo = req.query.redirect_to || '/dashboard';
  const activate = req.query.activate || '';

  // CSRF nonce in state param, signed with HMAC to prevent forgery
  const nonce = randomBytes(16).toString('hex');
  const state = signSession({ redirect_to: redirectTo, activate, nonce });

  // Store nonce in short-lived cookie for verification on callback
  res.cookie('__oauth_state', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID(),
    redirect_uri: `${BASE_URL()}/auth/callback`,
    scope: 'read:org',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

// --- GET /auth/callback ---
export async function handleCallback(req, res) {
  const { code, state } = req.query;
  const db = req.app.locals.db;

  if (!code) return res.status(400).send('Missing authorization code');

  // Verify state CSRF nonce
  const stateData = verifySession(state || '');
  if (!stateData) return res.status(400).send('Invalid or expired OAuth state');
  const storedNonce = req.cookies?.['__oauth_state'];
  if (!storedNonce || storedNonce !== stateData.nonce) {
    return res.status(400).send('OAuth state mismatch — possible CSRF. Please try again.');
  }
  res.clearCookie('__oauth_state', { path: '/' });

  // Exchange code for GitHub access token
  const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID(),
      client_secret: GITHUB_CLIENT_SECRET(),
      code,
    }),
  });

  const tokenData = await tokenResp.json();
  if (tokenData.error || !tokenData.access_token) {
    return res.status(400).send('GitHub OAuth failed: ' + (tokenData.error_description || tokenData.error || 'unknown'));
  }

  const ghToken = tokenData.access_token;

  // Fetch GitHub user profile
  const userResp = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/json', 'User-Agent': 'PlanPush' },
  });

  if (!userResp.ok) return res.status(500).send('Failed to fetch GitHub user profile');

  const ghUser = await userResp.json();
  const githubUserId = String(ghUser.id);
  const githubUsername = ghUser.login;
  const displayName = ghUser.name || ghUser.login;
  const avatarUrl = ghUser.avatar_url || '';

  // Check GitHub org membership
  const orgName = GITHUB_ORG();
  if (orgName) {
    const orgResp = await fetch(`https://api.github.com/orgs/${encodeURIComponent(orgName)}/members/${encodeURIComponent(githubUsername)}`, {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/json', 'User-Agent': 'PlanPush' },
    });

    // 204 = member, 302 = requester is not org member (redirect to login), 404 = not a member
    if (orgResp.status !== 204) {
      return res.status(403).send(getForbiddenPage(orgName));
    }
  }

  // Upsert user in DB
  const existingUser = await db.prepare(
    `SELECT id, role FROM users WHERE github_user_id = ?`
  ).bind(githubUserId).first();

  let userId, role;

  if (existingUser) {
    userId = existingUser.id;
    role = existingUser.role;
    // Update profile fields
    await db.prepare(
      `UPDATE users SET github_username = ?, display_name = ?, avatar_url = ? WHERE id = ?`
    ).bind(githubUsername, displayName, avatarUrl, userId).run();
  } else {
    // Atomic first-user-becomes-admin: transaction prevents race where two simultaneous
    // signups both see count=0 and both get admin
    userId = crypto.randomUUID();
    const insertUser = db.transaction((uid, ghId, ghUsername, dName, avUrl) => {
      const { c } = db._raw.prepare('SELECT COUNT(*) as c FROM users').get();
      const r = c === 0 ? 'admin' : 'member';
      db._raw.prepare(
        `INSERT INTO users (id, github_user_id, github_username, display_name, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uid, ghId, ghUsername, dName, avUrl, r);
      return r;
    });
    role = await insertUser(userId, githubUserId, githubUsername, displayName, avatarUrl);
  }

  // Set session cookie
  setSessionCookie(res, {
    user_id: userId,
    github_user_id: githubUserId,
    github_username: githubUsername,
    display_name: displayName,
    role,
  });

  // Redirect
  if (stateData.activate) {
    return res.redirect('/activate');
  }
  res.redirect(safeRedirectUrl(stateData.redirect_to));
}

// --- POST /auth/logout ---
export async function handleLogout(req, res) {
  clearSessionCookie(res);
  res.json({ ok: true });
}

// --- GET /api/auth/device ---
export async function handleAuthDevice(req, res) {
  const db = req.app.locals.db;
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await db.prepare(
    `INSERT INTO device_codes (device_code, user_code, status, expires_at) VALUES (?, ?, 'pending', ?)`
  ).bind(deviceCode, userCode, expiresAt).run();

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${BASE_URL()}/activate`,
    expires_in: DEVICE_CODE_EXPIRY_MINUTES * 60,
    interval: 5,
  });
}

// --- POST /api/auth/device/token ---
export async function handleAuthDeviceToken(req, res) {
  const db = req.app.locals.db;
  const kv = req.app.locals.kv;
  const { device_code } = req.body;

  if (!device_code) return res.status(400).json({ error: 'missing_device_code' });

  const row = await db.prepare(
    `SELECT * FROM device_codes WHERE device_code = ?`
  ).bind(device_code).first();

  if (!row) return res.status(400).json({ error: 'invalid_device_code' });

  if (new Date(row.expires_at) < new Date()) {
    await db.prepare(
      `UPDATE device_codes SET status = 'expired' WHERE device_code = ?`
    ).bind(device_code).run();
    return res.status(400).json({ error: 'expired_token' });
  }

  if (row.status === 'pending') {
    return res.status(428).json({ error: 'authorization_pending' });
  }

  if (row.status === 'authorized') {
    const user = await db.prepare(
      `SELECT id, github_user_id, github_username, display_name, role FROM users WHERE github_user_id = ?`
    ).bind(row.github_user_id).first();

    if (!user) return res.status(400).json({ error: 'user_not_found' });

    // Issue refresh token
    const refreshToken = generateRefreshToken();
    const hashed = await hashToken(refreshToken);
    const tokenId = crypto.randomUUID();

    await db.prepare(
      `INSERT INTO api_tokens (id, user_id, hashed_token) VALUES (?, ?, ?)`
    ).bind(tokenId, user.id, hashed).run();

    // Clean up device code
    await db.prepare(
      `DELETE FROM device_codes WHERE device_code = ?`
    ).bind(device_code).run();

    return res.json({
      refresh_token: refreshToken,
      user: user.github_username,
      token_type: 'bearer',
    });
  }

  res.status(400).json({ error: 'invalid_request' });
}

// --- POST /api/auth/token ---
export async function handleAuthToken(req, res) {
  const db = req.app.locals.db;
  const kv = req.app.locals.kv;
  const { refresh_token } = req.body;

  if (!refresh_token) return res.status(400).json({ error: 'missing_refresh_token' });

  const hashed = await hashToken(refresh_token);

  const token = await db.prepare(
    `SELECT t.id, t.user_id, u.github_user_id, u.github_username, u.display_name, u.role
     FROM api_tokens t JOIN users u ON t.user_id = u.id
     WHERE t.hashed_token = ?`
  ).bind(hashed).first();

  if (!token) return res.status(401).json({ error: 'invalid_refresh_token' });

  // Update last_used_at
  await db.prepare(
    `UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`
  ).bind(token.id).run();

  // Issue short-lived access token stored in KV
  const accessToken = generateAccessToken();

  await kv.put(
    `access_token:${accessToken}`,
    JSON.stringify({
      user_id: token.user_id,
      github_user_id: token.github_user_id,
      github_username: token.github_username,
      display_name: token.display_name || null,
      role: token.role || 'member',
    }),
    { expirationTtl: ACCESS_TOKEN_EXPIRY_MINUTES * 60 }
  );

  res.json({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_MINUTES * 60,
  });
}

// --- GET /activate ---
export async function handleActivateGet(req, res) {
  const tokenData = await verifyRequest(req);
  res.set('Content-Type', 'text/html; charset=UTF-8').send(getActivatePage(!!tokenData, tokenData?.display_name));
}

// --- POST /activate ---
export async function handleActivatePost(req, res) {
  const db = req.app.locals.db;
  const tokenData = await verifyRequest(req);

  if (!tokenData) return res.status(401).json({ error: 'Please sign in first.' });

  const userCode = (req.body.user_code || '').toUpperCase().trim();
  if (!userCode) return res.status(400).json({ error: 'Please enter a code.' });

  const row = await db.prepare(
    `SELECT * FROM device_codes WHERE user_code = ? AND status = 'pending'`
  ).bind(userCode).first();

  if (!row) return res.status(400).json({ error: 'Invalid or expired code. Try again.' });

  if (new Date(row.expires_at) < new Date()) {
    await db.prepare(
      `UPDATE device_codes SET status = 'expired' WHERE device_code = ?`
    ).bind(row.device_code).run();
    return res.status(400).json({ error: 'Code has expired. Run /planpush-auth again.' });
  }

  await db.prepare(
    `UPDATE device_codes SET status = 'authorized', github_user_id = ? WHERE device_code = ?`
  ).bind(tokenData.github_user_id, row.device_code).run();

  res.set('Content-Type', 'text/html; charset=UTF-8').send(getSuccessPage());
}

// --- GET /api/info ---
export async function handleInfo(req, res) {
  res.json({
    auth: 'github',
    version: '1.0.0',
    org: GITHUB_ORG() || null,
  });
}

// --- GET /api/auth/session ---
export async function handleSessionCheck(req, res) {
  const tokenData = await verifyRequest(req);
  if (!tokenData) return res.status(401).json({ error: 'not_authenticated' });
  res.json({
    user_id: tokenData.user_id,
    github_user_id: tokenData.github_user_id,
    display_name: tokenData.display_name,
    role: tokenData.role,
  });
}

// --- HTML Pages ---

function getActivatePage(isSignedIn, displayName) {
  const baseUrl = BASE_URL();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Activate Device</title>
<style>
  :root { --bg: #fff; --text: #1a1d23; --muted: #57606a; --border: #e1e4e8; --accent: #0969da; --error: #cf222e; --success: #1a7f37; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --text: #e6edf3; --muted: #8d96a0; --border: #30363d; --accent: #58a6ff; --error: #f85149; --success: #3fb950; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 32px; text-align: center; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { font-size: 14px; color: var(--muted); margin-bottom: 20px; }
  input { width: 100%; padding: 12px; font-size: 20px; text-align: center; letter-spacing: 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); margin-bottom: 16px; }
  input:focus { outline: 2px solid var(--accent); border-color: transparent; }
  button, .btn { display: inline-block; width: 100%; padding: 12px; font-size: 14px; font-weight: 600; background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; text-align: center; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { color: var(--error); font-size: 13px; margin-bottom: 16px; }
  .signed-in-as { font-size: 13px; color: var(--success); margin-bottom: 16px; }
  .gh-icon { width: 20px; height: 20px; vertical-align: middle; margin-right: 8px; fill: #fff; }
</style>
</head>
<body>
<div class="card">
  <h1>PlanPush</h1>
  ${isSignedIn ? `
    <div class="signed-in-as">Signed in as ${escHtml(displayName || 'User')}</div>
    <p>Enter the code shown in your terminal to authorize this device.</p>
    <form id="activate-form">
      <input type="text" id="user_code" name="user_code" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" autofocus>
      <button type="submit" id="submit-btn">Authorize</button>
    </form>
    <div id="form-error" class="error" style="display:none;margin-top:12px;"></div>
    <script>
    document.getElementById('activate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const errDiv = document.getElementById('form-error');
      errDiv.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Authorizing...';
      try {
        const code = document.getElementById('user_code').value;
        const resp = await fetch('/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ user_code: code }),
        });
        if (resp.ok) {
          const html = await resp.text();
          document.open(); document.write(html); document.close();
          return;
        }
        const err = await resp.json().catch(() => ({}));
        errDiv.textContent = err.error || 'Authorization failed. Try again.';
        errDiv.style.display = 'block';
      } catch {
        errDiv.textContent = 'Something went wrong. Please try again.';
        errDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Authorize';
      }
    });
    </script>
  ` : `
    <p>Sign in with GitHub to authorize your device.</p>
    <a class="btn" href="/auth/login?activate=1">
      <svg class="gh-icon" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      Sign in with GitHub
    </a>
  `}
</div>
</body>
</html>`;
}

function getSuccessPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Authorized</title>
<style>
  :root { --bg: #fff; --text: #1a1d23; --muted: #57606a; --success: #1a7f37; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --text: #e6edf3; --muted: #8d96a0; --success: #3fb950; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; }
  .check { font-size: 48px; color: var(--success); margin-bottom: 16px; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { font-size: 14px; color: var(--muted); }
</style>
</head>
<body>
<div class="card">
  <div class="check">&#10003;</div>
  <h1>Device Authorized</h1>
  <p>You can close this tab and return to your terminal.</p>
</div>
</body>
</html>`;
}

function getForbiddenPage(orgName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Access Denied</title>
<style>
  :root { --bg: #fff; --text: #1a1d23; --muted: #57606a; --error: #cf222e; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --text: #e6edf3; --muted: #8d96a0; --error: #f85149; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; border: 1px solid var(--error); border-radius: 12px; padding: 32px; }
  h1 { font-size: 20px; margin-bottom: 8px; color: var(--error); }
  p { font-size: 14px; color: var(--muted); }
  code { background: rgba(127,127,127,.1); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<div class="card">
  <h1>Access Denied</h1>
  <p>You must be a member of the <code>${escHtml(orgName)}</code> GitHub organization to access this PlanPush instance.</p>
</div>
</body>
</html>`;
}
