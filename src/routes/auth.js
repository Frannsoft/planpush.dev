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
import { escHtml, safeRedirectUrl, BASE_PAGE_CSS, THEME_FLASH_SCRIPT } from '../utils/html.js';
import { setSessionCookie, clearSessionCookie, verifyRequest, signSession, verifySession } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { isValidDeviceCode, isValidUserCode } from '../utils/validate.js';
import { getProvider } from '../auth/providers/index.js';
import { reconcileRolesFromGroups } from '../utils/roleSync.js';

const DEVICE_CODE_EXPIRY_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY_MINUTES = 60;

function getAuthProvider() {
  return process.env.AUTH_PROVIDER || 'github';
}

// --- GET /auth/login ---
export async function handleLogin(req, res) {
  const redirectTo = req.query.redirect_to || '/dashboard';
  const activate = req.query.activate || '';
  const baseUrl = req.planpushBaseUrl;

  if (getAuthProvider() === 'okta') {
    return handleLoginOkta(req, res, redirectTo, activate, baseUrl);
  }
  return handleLoginGithub(req, res, redirectTo, activate, baseUrl);
}

async function handleLoginGithub(req, res, redirectTo, activate, baseUrl) {
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

  const provider = getProvider('github');
  const config = provider.getOAuthConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${baseUrl}/auth/callback`,
    scope: 'read:org',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

async function handleLoginOkta(req, res, redirectTo, activate, baseUrl) {
  const provider = getProvider('okta');
  const csrfNonce = randomBytes(16).toString('hex');
  const state = signSession({ redirect_to: redirectTo, activate, nonce: csrfNonce });

  const { authorizationUrl, codeVerifier, nonce } = await provider.getAuthorizationUrl(
    `${baseUrl}/auth/callback`,
    state
  );

  // Store PKCE verifier + nonce in short-lived signed cookie
  res.cookie('__oauth_state', JSON.stringify({ csrf_nonce: csrfNonce, code_verifier: codeVerifier, nonce }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });

  res.redirect(authorizationUrl);
}

// --- GET /auth/callback ---
export async function handleCallback(req, res) {
  if (getAuthProvider() === 'okta') {
    return handleCallbackOkta(req, res);
  }
  return handleCallbackGithub(req, res);
}

async function handleCallbackGithub(req, res) {
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
  const provider = getProvider('github');
  const config = provider.getOAuthConfig();

  const fetchWithTimeout = (url, opts = {}, timeoutMs = 10000) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(timer));
  };

  const tokenResp = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
  });

  const tokenData = await tokenResp.json();
  if (tokenData.error || !tokenData.access_token) {
    console.error('[auth] GitHub OAuth error:', tokenData.error, tokenData.error_description);
    return res.status(400).send('GitHub OAuth failed. Please try again.');
  }

  const ghToken = tokenData.access_token;

  // Fetch GitHub user profile and verified email
  const ghUser = await provider.getUser(ghToken);
  const email = await provider.getEmail(ghToken);

  if (!ghUser || !ghUser.id) return res.status(500).send('Failed to fetch GitHub user profile');

  const githubUserId = String(ghUser.id);
  const githubUsername = ghUser.login;
  const displayName = ghUser.name || ghUser.login;

  // Check GitHub org membership
  if (config.org) {
    const isMember = await provider.checkOrgMembership(githubUsername, config.org, ghToken);
    if (!isMember) {
      return res.status(403).send(getForbiddenPage(config.org));
    }
  }

  // Resolve or create user via identity table
  const idp = 'github';
  const subject = githubUserId;

  let userId, role, isNewUser;

  const result = await knex.transaction(async (trx) => {
    // Look up existing identity
    const identity = await trx('user_identities')
      .where({ idp, subject })
      .select('user_id')
      .first();

    if (identity) {
      return { userId: identity.user_id, isNewUser: false };
    }

    // New user: create atomically with first-user-becomes-admin
    const userCount = await trx('users').count('id as c').first();
    const count = parseInt(userCount.c, 10);
    const newRole = count === 0 ? 'admin' : 'member';

    const newUserId = randomUUID();
    const identityId = `${newUserId}-${idp}`;

    await trx('users').insert({
      id: newUserId,
      github_user_id: githubUserId,
      github_username: githubUsername,
      display_name: displayName,
      email,
      role: newRole,
    });

    await trx('user_identities').insert({
      id: identityId,
      user_id: newUserId,
      idp,
      subject,
    });

    return {
      userId: newUserId,
      isNewUser: true,
      role: newRole,
    };
  });

  userId = result.userId;
  isNewUser = result.isNewUser;
  role = result.role || 'member';

  // Update existing user info
  if (!isNewUser) {
    await knex('users')
      .where({ id: userId })
      .update({
        github_username: githubUsername,
        display_name: displayName,
        email: email || knex.raw('email'),
      });
    const user = await knex('users').where({ id: userId }).select('role').first();
    role = user.role;
  }

  setSessionCookie(res, {
    user_id: userId,
    display_name: displayName,
    role,
  });

  writeAuditLog(knex, {
    actorId: userId,
    action: 'user.login',
    targetType: 'user',
    targetId: userId,
    meta: { github_username: githubUsername, is_new: isNewUser },
  });

  if (stateData.activate) {
    return res.redirect('/activate');
  }
  res.redirect(safeRedirectUrl(stateData.redirect_to));
}

async function handleCallbackOkta(req, res) {
  const { code, state } = req.query;

  const clearOAuthState = () => res.clearCookie('__oauth_state', {
    path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
  });

  if (!code) { clearOAuthState(); return res.status(400).send('Missing authorization code'); }

  // Verify state CSRF nonce
  const stateData = verifySession(state || '');
  if (!stateData) { clearOAuthState(); return res.status(400).send('Invalid or expired OAuth state'); }

  let cookieData;
  try {
    cookieData = JSON.parse(req.cookies?.['__oauth_state'] || '{}');
  } catch (e) {
    clearOAuthState();
    return res.status(400).send('Invalid OAuth state cookie');
  }

  if (!cookieData.csrf_nonce || cookieData.csrf_nonce !== stateData.nonce) {
    clearOAuthState();
    return res.status(400).send('OAuth state mismatch — possible CSRF. Please try again.');
  }

  clearOAuthState();

  // Exchange code for Okta ID token
  const provider = getProvider('okta');
  const baseUrl = req.planpushBaseUrl;

  let claims;
  try {
    claims = await provider.exchangeCodeForToken(
      code,
      `${baseUrl}/auth/callback`,
      cookieData.code_verifier,
      cookieData.nonce
    );
  } catch (err) {
    console.error('[auth] Okta OIDC error:', err.message);
    return res.status(400).send('Okta OIDC failed. Please try again.');
  }

  const idp = 'okta';
  const subject = claims.subject;
  const email = claims.email;
  const emailVerified = claims.email_verified === true;
  // Only a verified email may satisfy a privilege match (INITIAL_ADMIN_EMAILS);
  // an unverified address must never grant roles.
  const trustedEmail = emailVerified ? email : null;
  const displayName = claims.name || claims.email;
  const groups = claims.groups || [];

  // Resolve or create user via identity table
  let userId, isNewUser;

  const result = await knex.transaction(async (trx) => {
    const identity = await trx('user_identities')
      .where({ idp, subject })
      .select('user_id')
      .first();

    if (identity) {
      return { userId: identity.user_id, isNewUser: false };
    }

    // New user: no roles yet; will be set by reconcile
    const newUserId = randomUUID();
    const identityId = `${newUserId}-${idp}`;

    await trx('users').insert({
      id: newUserId,
      display_name: displayName,
      email,
      role: 'member',
    });

    await trx('user_identities').insert({
      id: identityId,
      user_id: newUserId,
      idp,
      subject,
    });

    return {
      userId: newUserId,
      isNewUser: true,
    };
  });

  userId = result.userId;
  isNewUser = result.isNewUser;

  // Update existing user info
  if (!isNewUser) {
    await knex('users')
      .where({ id: userId })
      .update({
        display_name: displayName,
        email: email || knex.raw('email'),
      });
  }

  // Reconcile roles from Okta groups (and INITIAL_ADMIN_EMAILS).
  // Pass the verified-only email so an unverified address cannot earn admin.
  const userRoles = await reconcileRolesFromGroups(userId, trustedEmail, groups);

  // If user has no roles, deny access
  if (userRoles.length === 0) {
    writeAuditLog(knex, {
      actorId: userId,
      action: 'user.login_denied',
      targetType: 'user',
      targetId: userId,
      meta: { okta_subject: subject, reason: 'no_roles_mapped' },
    });
    return res.status(403).set('Content-Type', 'text/html; charset=UTF-8').send(getAccessDeniedPage());
  }

  // User has roles; set session cookie
  // Get the user's first role for legacy cookie (will migrate to RBAC-only later)
  const userRole = await knex('users').where({ id: userId }).select('role').first();

  setSessionCookie(res, {
    user_id: userId,
    display_name: displayName,
    role: userRole.role || 'member',
  });

  writeAuditLog(knex, {
    actorId: userId,
    action: 'user.login',
    targetType: 'user',
    targetId: userId,
    meta: { okta_subject: subject, is_new: isNewUser, groups: groups.length },
  });

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
      .where({ id: row.user_id })
      .select('id', 'github_username', 'display_name', 'role')
      .first();

    if (!user) {
      const base = req.planpushBaseUrl || process.env.BASE_URL || '';
      return res.status(400).json({
        error: 'user_not_found',
        message: `User not found. Please sign in at ${base}/auth/login first.`,
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
      .select('t.id', 't.user_id', 't.revoked_at', 't.family_id', 'u.display_name', 'u.role')
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
    .update({ status: 'authorized', user_id: tokenData.user_id });

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
  const authProvider = getAuthProvider();
  const info = {
    auth: authProvider,
    version: '1.0.0',
  };

  if (authProvider === 'github') {
    info.org = process.env.GITHUB_ORG || null;
  }

  res.json(info);
}

// --- GET /api/auth/session ---
export async function handleSessionCheck(req, res) {
  const tokenData = await verifyRequest(req);
  if (!tokenData) return res.status(401).json({ error: 'not_authenticated' });
  res.json({
    user_id: tokenData.user_id,
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
${THEME_FLASH_SCRIPT}
<style>
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); padding: 36px 32px; text-align: center; box-shadow: var(--pp-shadow-md); }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.02em; }
  p { font-size: 14px; color: var(--pp-text-muted); margin-bottom: 20px; line-height: 1.5; }
  input { width: 100%; padding: 14px; font-size: 20px; text-align: center; letter-spacing: 4px; border: 1px solid var(--pp-border); border-radius: var(--pp-radius); background: var(--pp-bg); color: var(--pp-text); margin-bottom: 16px; font-family: var(--pp-font-mono); transition: border-color .15s, box-shadow .15s; }
  input:focus { outline: none; border-color: var(--pp-accent); box-shadow: 0 0 0 3px var(--pp-accent-soft); }
  button, .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 12px; font-size: 14px; font-weight: 600; background: var(--pp-accent); color: #fff; border: none; border-radius: var(--pp-radius); cursor: pointer; text-decoration: none; text-align: center; min-height: 44px; transition: background .15s, transform .1s; }
  button:hover, .btn:hover { background: var(--pp-accent-hover); }
  button:active, .btn:active { transform: scale(.98); }
  button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .error { color: var(--pp-error); font-size: 13px; margin-bottom: 16px; }
  .signed-in-as { font-size: 13px; color: var(--pp-success); margin-bottom: 16px; font-weight: 500; }
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
${THEME_FLASH_SCRIPT}
<style>
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); padding: 40px 32px; box-shadow: var(--pp-shadow-md); }
  .check { width: 56px; height: 56px; border-radius: 50%; background: var(--pp-success-bg); color: var(--pp-success); display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
  p { font-size: 14px; color: var(--pp-text-muted); }
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
${THEME_FLASH_SCRIPT}
<style>
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; background: var(--pp-surface-1); border: 1px solid var(--pp-error); border-radius: var(--pp-radius-lg); padding: 36px 32px; box-shadow: var(--pp-shadow-md); }
  .icon { width: 56px; height: 56px; border-radius: 50%; background: var(--pp-error-bg); color: var(--pp-error); display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--pp-error); letter-spacing: -0.02em; }
  p { font-size: 14px; color: var(--pp-text-muted); line-height: 1.5; }
  code { background: var(--pp-surface-2); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: var(--pp-font-mono); }
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

function getAccessDeniedPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Access Not Yet Granted</title>
${THEME_FLASH_SCRIPT}
<style>
  ${BASE_PAGE_CSS}
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 400px; width: 100%; text-align: center; background: var(--pp-surface-1); border: 1px solid var(--pp-error); border-radius: var(--pp-radius-lg); padding: 36px 32px; box-shadow: var(--pp-shadow-md); }
  .icon { width: 56px; height: 56px; border-radius: 50%; background: var(--pp-error-bg); color: var(--pp-error); display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--pp-error); letter-spacing: -0.02em; }
  p { font-size: 14px; color: var(--pp-text-muted); line-height: 1.5; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">&#10007;</div>
  <h1>Access Not Yet Granted</h1>
  <p>Your Okta groups have not been mapped to any roles yet. Please contact your administrator to grant you access.</p>
</div>
</body>
</html>`;
}
