import { verifyRequest } from '../middleware/auth.js';
import { buildOverlayHTML } from '../utils/commentOverlay.js';

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
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
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

export async function handleServe(req, res) {
  const db = req.app.locals.db;
  const kv = req.app.locals.kv;
  const sessionId = req.params.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  // Look up session in DB
  const session = await db.prepare(
    `SELECT id, current_version, created_at FROM sessions WHERE id = ?`
  ).bind(sessionId).first();

  if (!session) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  // Auth check — redirect to login if not authenticated
  const tokenData = await verifyRequest(req);
  if (!tokenData) {
    const redirectTo = encodeURIComponent(`/p/${sessionId}`);
    return res.redirect(`/auth/login?redirect_to=${redirectTo}`);
  }

  // Fetch HTML from KV
  const html = await kv.get(`plan:${sessionId}:current`);

  if (!html) {
    return res.status(404).set('Content-Type', 'text/html; charset=UTF-8').send(notFoundPage());
  }

  // Generate per-request nonce for CSP
  const nonce = generateNonce();

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

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
    out = out.includes('</head>')
      ? out.replace('</head>', cssLink + '</head>')
      : cssLink + out;
  }

  const planScript = `<script nonce="${nonce}" src="/assets/plan.js"></script>`;
  const beforeClose = planScript + '\n' + overlay;
  out = out.includes('</body>')
    ? out.replace('</body>', beforeClose + '</body>')
    : out + beforeClose;

  res.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': buildCsp(nonce),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
  }).send(out);
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Not Found</title>
<style>
:root{--bg:#fff;--text:#1a1d23;--muted:#57606a}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--text:#e6edf3;--muted:#8d96a0}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center}h1{font-size:48px;margin-bottom:8px}p{color:var(--muted);font-size:14px}
</style></head><body><div class="c"><h1>404</h1><p>This plan doesn't exist or has been removed.</p></div></body></html>`;
}
