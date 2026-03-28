import { knex } from '../db.js';
import { kv } from '../kv.js';
import { buildOverlayHTML } from '../utils/commentOverlay.js';
import { BASE_PAGE_CSS } from '../utils/html.js';

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

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
  const tokenData = req.tokenData; // populated by requireAuthOrRedirect middleware

  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  // Look up session in DB
  const session = await knex('sessions')
    .where({ id: sessionId })
    .select('id', 'current_version', 'created_at')
    .first();

  if (!session) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  // Fetch HTML from KV
  const html = await kv.get(`plan:${sessionId}:current`);

  if (!html) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  // Generate per-request nonce for CSP
  const nonce = generateNonce();
  const baseUrl = req.planpushBaseUrl;

  // Inject comment overlay
  const overlay = buildOverlayHTML({
    sessionId,
    currentUserId: tokenData.github_user_id,
    displayName: tokenData.display_name,
    apiOrigin: baseUrl,
    currentVersion: session.current_version,
    nonce,
  });

  // Inject plan.css into <head>, plan.js + overlay before </body>
  let out = html;
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
<style>
${BASE_PAGE_CSS}
body{display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center}h1{font-size:48px;margin-bottom:8px}p{color:var(--muted);font-size:14px}
</style></head><body><div class="c"><h1>404</h1><p>This plan doesn't exist or has been removed.</p></div></body></html>`;
}
