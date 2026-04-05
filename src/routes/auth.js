import { randomBytes, randomUUID } from 'crypto';
import { knex } from '../db.js';
import { kv } from '../kv.js';
import {
  generateDeviceCode,
  generateUserCode,
  generateRefreshToken,
  generateAccessToken,
  hashToken,
} from '../utils/crypto.js';
import { escHtml, safeRedirectUrl, BASE_PAGE_CSS } from '../utils/html.js';
import { setSessionCookie, clearSessionCookie, verifyRequest, signSession, verifySession } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { isValidDeviceCode, isValidUserCode } from '../utils/validate.js';

const DEVICE_CODE_EXPIRY_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY_MINUTES = 60;

// Fetch with timeout to prevent hanging on unresponsive external services
function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(timer));
}

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

  const baseUrl = req.planpushBaseUrl;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${baseUrl}/auth/callback`,
    scope: 'read:org',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

// --- GET /auth/callback ---
export async function handleCallback(req, res) {
  const { code, state } = req.query;

  const clearOAuthState = () => res.clearCookie('__oauth_state', {
    path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
  });

  if (!code) { clearOAuthState(); return res.status(400).send('Missing authorization code'); }

  // Verify state CSRF nonce
  const stateData = verifySession(state || '');
  if (!stateData) { clearOAuthState(); return res.status(400).send('Invalid or expired OAuth state'); }
  const storedNonce = req.cookies?.['__oauth_state'];
  if (!storedNonce || storedNonce !== stateData.nonce) {
    clearOAuthState();
    return res.status(400).send('OAuth state mismatch — possible CSRF. Please try again.');
  }
  clearOAuthState();

  // Exchange code for GitHub access token
  const tokenResp = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenResp.json();
  if (tokenData.error || !tokenData.access_token) {
    console.error('[auth] GitHub OAuth error:', tokenData.error, tokenData.error_description);
    return res.status(400).send('GitHub OAuth failed. Please try again.');
  }

  const ghToken = tokenData.access_token;

  // Fetch GitHub user profile
  const userResp = await fetchWithTimeout('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/json', 'User-Agent': 'PlanPush' },
  });

  if (!userResp.ok) return res.status(500).send('Failed to fetch GitHub user profile');

  const ghUser = await userResp.json();
  const githubUserId = String(ghUser.id);
  const githubUsername = ghUser.login;
  const displayName = ghUser.name || ghUser.login;
  const avatarUrl = ghUser.avatar_url || '';

  // Check GitHub org membership
  const orgName = process.env.GITHUB_ORG;
  if (orgName) {
    const orgResp = await fetchWithTimeout(`https://api.github.com/orgs/${encodeURIComponent(orgName)}/members/${encodeURIComponent(githubUsername)}`, {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/json', 'User-Agent': 'PlanPush' },
    });

    // 204 = member, 302 = requester is not org member (redirect to login), 404 = not a member
    if (orgResp.status !== 204) {
      return res.status(403).send(getForbiddenPage(orgName));
    }
  }

  // Upsert user in DB
  const existingUser = await knex('users')
    .where({ github_user_id: githubUserId })
    .select('id', 'role')
    .first();

  let userId, role;

  if (existingUser) {
    userId = existingUser.id;
    role = existingUser.role;
    await knex('users')
      .where({ id: userId })
      .update({ github_username: githubUsername, display_name: displayName, avatar_url: avatarUrl });
  } else {
    // Atomic first-user-becomes-admin: transaction prevents race where two simultaneous
    // signups both see count=0 and both get admin
    userId = randomUUID();
    role = await knex.transaction(async (trx) => {
      const countRow = await trx('users').count('id as c').first();
      const c = parseInt(countRow.c, 10);
      const r = c === 0 ? 'admin' : 'member';
      await trx('users').insert({
        id: userId,
        github_user_id: githubUserId,
        github_username: githubUsername,
        display_name: displayName,
        avatar_url: avatarUrl,
        role: r,
      });
      return r;
    });
  }

  // Set session cookie
  setSessionCookie(res, {
    user_id: userId,
    github_user_id: githubUserId,
    github_username: githubUsername,
    display_name: displayName,
    role,
  });

  writeAuditLog(knex, {
    actorId: userId,
    action: 'user.login',
    targetType: 'user',
    targetId: userId,
    meta: { github_username: githubUsername, is_new: !existingUser },
  });

  // Redirect
  if (stateData.activate) {
    return res.redirect('/activate');
  }
  res.redirect(safeRedirectUrl(stateData.redirect_to));
}

// --- POST /auth/logout ---
export async function handleLogout(req, res) {
  // Reject cross-origin logout requests (CSRF protection)
  const origin = req.headers.origin;
  if (origin && origin !== req.planpushBaseUrl) {
    return res.status(403).json({ error: 'forbidden' });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}

// --- GET /api/auth/device ---
export async function handleAuthDevice(req, res) {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await knex('device_codes').insert({
    device_code: deviceCode,
    user_code: userCode,
    status: 'pending',
    expires_at: expiresAt,
  });

  const baseUrl = req.planpushBaseUrl;
  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${baseUrl}/activate`,
    verification_uri_complete: `${baseUrl}/activate?code=${encodeURIComponent(userCode)}`,
    expires_in: DEVICE_CODE_EXPIRY_MINUTES * 60,
    interval: 5,
  });
}

// --- POST /api/auth/device/token ---
export async function handleAuthDeviceToken(req, res) {
  const { device_code } = req.body;

  if (!device_code) return res.status(400).json({ error: 'missing_device_code' });
  if (!isValidDeviceCode(device_code)) return res.status(400).json({ error: 'invalid_device_code' });

  const row = await knex('device_codes').where({ device_code }).first();

  if (!row) return res.status(400).json({ error: 'invalid_device_code' });

  if (new Date(row.expires_at) < new Date()) {
    await knex('device_codes').where({ device_code }).update({ status: 'expired' });
    return res.status(400).json({ error: 'expired_token' });
  }

  if (row.status === 'pending') {
    return res.status(428).json({ error: 'authorization_pending' });
  }

  if (row.status === 'authorized') {
    const user = await knex('users')
      .where({ github_user_id: row.github_user_id })
      .select('id', 'github_user_id', 'github_username', 'display_name', 'role')
      .first();

    if (!user) {
      const base = req.planpushBaseUrl || process.env.BASE_URL || '';
      return res.status(400).json({
        error: 'user_not_found',
        message: `GitHub user not found. Please sign in at ${base}/auth/login first.`,
      });
    }

    // Atomic: delete device code + issue refresh token in one transaction
    // Prevents double-redemption if CLI polls twice concurrently
    const refreshToken = generateRefreshToken();
    const hashed = await hashToken(refreshToken);
    const tokenId = randomUUID();

    const issued = await knex.transaction(async (trx) => {
      const deleted = await trx('device_codes').where({ device_code }).delete();
      if (deleted === 0) return false; // another request already claimed it
      await trx('api_tokens').insert({ id: tokenId, user_id: user.id, hashed_token: hashed, family_id: tokenId });
      return true;
    });

    if (!issued) return res.status(400).json({ error: 'invalid_request' });

    writeAuditLog(knex, {
      actorId: user.id,
      action: 'user.device_auth',
      targetType: 'user',
      targetId: user.id,
      meta: { github_username: user.github_username },
    });

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
  const { refresh_token } = req.body;

  if (!refresh_token) return res.status(400).json({ error: 'missing_refresh_token' });

  const hashed = await hashToken(refresh_token);

  // Atomic token rotation with replay detection inside a single transaction
  const newRefreshToken = generateRefreshToken();
  const newHashed = await hashToken(newRefreshToken);
  const newTokenId = randomUUID();

  const result = await knex.transaction(async (trx) => {
    const token = await trx('api_tokens as t')
      .join('users as u', 't.user_id', 'u.id')
      .where('t.hashed_token', hashed)
      .whereNull('u.deactivated_at')
      .select('t.id', 't.user_id', 't.revoked_at', 't.family_id', 'u.github_user_id', 'u.github_username', 'u.display_name', 'u.role')
      .first();

    if (!token) return { error: 'invalid_refresh_token' };

    // Replay detection: if this token was already rotated (revoked), revoke entire family
    if (token.revoked_at) {
      await trx('api_tokens')
        .where({ family_id: token.family_id })
        .whereNull('revoked_at')
        .update({ revoked_at: trx.fn.now() });
      return { error: 'token_reuse_detected' };
    }

    // Rotate: revoke old token and issue new one
    const familyId = token.family_id || token.id;
    await trx('api_tokens').where({ id: token.id }).update({
      revoked_at: trx.fn.now(),
      last_used_at: trx.fn.now(),
    });
    await trx('api_tokens').insert({
      id: newTokenId,
      user_id: token.user_id,
      hashed_token: newHashed,
      family_id: familyId,
    });

    return { token };
  });

  if (result.error) return res.status(401).json({ error: result.error });
  const { token } = result;

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
      token_id: newTokenId,
    }),
    { expirationTtl: ACCESS_TOKEN_EXPIRY_MINUTES * 60 }
  );

  res.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_MINUTES * 60,
  });
}

// --- GET /activate ---
export async function handleActivateGet(req, res) {
  const tokenData = await verifyRequest(req);
  res.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'",
  }).send(getActivatePage(!!tokenData, tokenData?.display_name));
}

// --- POST /activate ---
export async function handleActivatePost(req, res) {
  const tokenData = await verifyRequest(req);

  if (!tokenData) return res.status(401).json({ error: 'Please sign in first.' });

  const userCode = (req.body.user_code || '').toUpperCase().trim();
  if (!userCode) return res.status(400).json({ error: 'Please enter a code.' });
  if (!isValidUserCode(userCode)) return res.status(400).json({ error: 'Invalid code format.' });

  // Atomic: update only if still pending, preventing double-activation race
  const updated = await knex('device_codes')
    .where({ user_code: userCode, status: 'pending' })
    .where('expires_at', '>', new Date().toISOString())
    .update({ status: 'authorized', github_user_id: tokenData.github_user_id });

  if (updated === 0) {
    // Check if expired or simply not found
    const row = await knex('device_codes').where({ user_code: userCode }).first();
    if (row && new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Code has expired. Run /planpush again.' });
    }
    return res.status(400).json({ error: 'Invalid or expired code. Try again.' });
  }

  res.set('Content-Type', 'text/html; charset=UTF-8').send(getSuccessPage());
}

// --- GET /api/info ---
export async function handleInfo(req, res) {
  res.json({
    auth: 'github',
    version: '1.0.0',
    org: process.env.GITHUB_ORG || null,
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Activate Device</title>
<style>
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 32px; text-align: center; box-shadow: var(--shadow-md); }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.02em; }
  p { font-size: 14px; color: var(--muted); margin-bottom: 20px; line-height: 1.5; }
  input { width: 100%; padding: 14px; font-size: 20px; text-align: center; letter-spacing: 4px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); color: var(--text); margin-bottom: 16px; font-family: var(--font-mono); transition: border-color .15s, box-shadow .15s; }
  input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg); }
  button, .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 12px; font-size: 14px; font-weight: 600; background: var(--accent); color: #fff; border: none; border-radius: var(--radius); cursor: pointer; text-decoration: none; text-align: center; min-height: 44px; transition: background .15s, transform .1s; }
  button:hover, .btn:hover { background: var(--accent-hover); }
  button:active, .btn:active { transform: scale(.98); }
  button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .error { color: var(--error); font-size: 13px; margin-bottom: 16px; }
  .signed-in-as { font-size: 13px; color: var(--success); margin-bottom: 16px; font-weight: 500; }
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
    async function submitCode(code) {
      var btn = document.getElementById('submit-btn');
      var errDiv = document.getElementById('form-error');
      errDiv.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Authorizing...';
      try {
        var resp = await fetch('/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ user_code: code }),
        });
        if (resp.ok) {
          var html = await resp.text();
          document.open(); document.write(html); document.close();
          return;
        }
        var err = await resp.json().catch(function() { return {}; });
        errDiv.textContent = err.error || 'Authorization failed. Try again.';
        errDiv.style.display = 'block';
      } catch(e) {
        errDiv.textContent = 'Something went wrong. Please try again.';
        errDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Authorize';
      }
    }
    document.getElementById('activate-form').addEventListener('submit', function(e) {
      e.preventDefault();
      submitCode(document.getElementById('user_code').value);
    });
    // Auto-fill from URL but require user to click Authorize (prevents silent authorization via crafted links)
    var urlCode = new URLSearchParams(window.location.search).get('code');
    if (urlCode) {
      document.getElementById('user_code').value = urlCode;
    }
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
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 40px 32px; box-shadow: var(--shadow-md); }
  .check { width: 56px; height: 56px; border-radius: 50%; background: var(--success-bg); color: var(--success); display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
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
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; background: var(--bg2); border: 1px solid var(--error); border-radius: var(--radius-lg); padding: 36px 32px; box-shadow: var(--shadow-md); }
  .icon { width: 56px; height: 56px; border-radius: 50%; background: var(--error-bg); color: var(--error); display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--error); letter-spacing: -0.02em; }
  p { font-size: 14px; color: var(--muted); line-height: 1.5; }
  code { background: var(--bg3); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: var(--font-mono); }
</style>
</head>
<body>
<div class="card">
  <div class="icon">&#10007;</div>
  <h1>Access Denied</h1>
  <p>You must be a member of the <code>${escHtml(orgName)}</code> GitHub organization to access this PlanPush instance.</p>
</div>
</body>
</html>`;
}
