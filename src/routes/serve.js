import { knex } from '../db.js';
import { kv } from '../kv.js';
import { generateNonce } from '../utils/crypto.js';
import { buildOverlayHTML } from '../utils/commentOverlay.js';
import { canAccessSession } from '../utils/visibility.js';
import { BASE_PAGE_CSS, THEME_FLASH_SCRIPT, escHtml } from '../utils/html.js';
import { isValidSessionId } from '../utils/validate.js';

function buildCsp(nonce) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

// Inject content before a closing tag using indexOf+slice (avoids full-string regex scan)
function injectBefore(html, tag, injection) {
  const idx = html.indexOf(tag);
  if (idx === -1) return html + injection;
  return html.slice(0, idx) + injection + html.slice(idx);
}

export async function handleServe(req, res) {
  const sessionId = req.params.sessionId;
  const tokenData = req.tokenData;

  if (!isValidSessionId(sessionId)) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  // Optimistically fetch current HTML and user role in parallel with session lookup
  // (for versioned requests, we'll need a second KV fetch)
  const requestedVersion = parseInt(req.query.v, 10) || 0;
  const [session, currentHtml, userRow] = await Promise.all([
    knex('sessions')
      .where({ id: sessionId })
      .whereNull('deleted_at')
      .select('id', 'current_version', 'created_at', 'published_at', 'created_by', 'archived_at')
      .first(),
    requestedVersion > 0
      ? null // skip optimistic fetch for versioned requests
      : kv.get(`plan:${sessionId}:current`),
    knex('users').where({ id: tokenData.user_id }).select('role').first(),
  ]);

  if (!session) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  const isAdmin = userRow?.role === 'admin';
  if (!canAccessSession(session, tokenData, isAdmin ? 'admin' : 'member')) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  const isVersioned = requestedVersion > 0 && requestedVersion < session.current_version;

  // Use the optimistically fetched HTML, or fetch the versioned snapshot
  const html = isVersioned
    ? await kv.get(`plan:${sessionId}:v:${requestedVersion}`)
    : currentHtml;

  if (!html) {
    if (isVersioned) {
      return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(versionNotFoundPage(sessionId, requestedVersion));
    }
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  // Generate per-request nonce for CSP
  const nonce = generateNonce();
  const baseUrl = req.planpushBaseUrl;

  // Inject comment overlay
  const isOwner = session.created_by === tokenData.user_id;
  const canPublish = !session.published_at && !session.archived_at && (isOwner || isAdmin);
  const overlay = buildOverlayHTML({
    sessionId,
    currentUserId: tokenData.github_user_id,
    displayName: tokenData.display_name,
    apiOrigin: baseUrl,
    currentVersion: session.current_version,
    viewingVersion: isVersioned ? requestedVersion : null,
    canPublish,
    isPrivate: !session.published_at,
    nonce,
  });

  // Inject theme flash script + plan.css into <head>, plan.js + overlay before </body>
  let out = html;
  out = injectBefore(out, '</head>', THEME_FLASH_SCRIPT);
  const cssLink = '<link rel="stylesheet" href="/assets/plan.css">';
  if (!out.includes('/assets/plan.css')) {
    out = injectBefore(out, '</head>', cssLink);
  }

  const planScript = `<script nonce="${nonce}" src="/assets/plan.js"></script>`;
  out = injectBefore(out, '</body>', planScript + '\n' + overlay);

  res.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': buildCsp(nonce),
    'X-Frame-Options': 'DENY',
  }).send(out);
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Not Found</title>
${THEME_FLASH_SCRIPT}
<style>
${BASE_PAGE_CSS}
body{display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center}h1{font-size:48px;margin-bottom:8px}p{color:var(--pp-text-muted);font-size:14px}a{color:var(--pp-accent)}
</style></head><body><div class="c"><h1>404</h1><p>This plan doesn't exist or has been removed.</p></div></body></html>`;
}

function versionNotFoundPage(sessionId, version) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Version Not Found</title>
${THEME_FLASH_SCRIPT}
<style>
${BASE_PAGE_CSS}
body{display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center}h1{font-size:48px;margin-bottom:8px}p{color:var(--pp-text-muted);font-size:14px}a{color:var(--pp-accent)}
</style></head><body><div class="c"><h1>404</h1><p>Version ${parseInt(version, 10)} has expired or doesn't exist.</p><p style="margin-top:8px"><a href="/p/${escHtml(sessionId)}">View latest version</a></p></div></body></html>`;
}
