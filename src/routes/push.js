import { generateSessionId } from '../utils/crypto.js';
import { notifySlack } from '../utils/slack.js';
import { sanitizeHtml } from '../utils/sanitize.js';

export async function handlePush(req, res) {
  const db = req.app.locals.db;
  const kv = req.app.locals.kv;
  const tokenData = req.tokenData;

  const rawHtml = req.body;

  if (!rawHtml || rawHtml.length === 0) {
    return res.status(400).json({ error: 'empty_body' });
  }

  // Sanitize: strip all scripts, event handlers, dangerous elements
  const html = await sanitizeHtml(rawHtml);

  // Check for existing session or create new one
  const existingSessionId = req.headers['x-session-id'];
  let sessionId;
  let currentVersion;

  if (existingSessionId) {
    const session = await db.prepare(
      `SELECT id FROM sessions WHERE id = ?`
    ).bind(existingSessionId).first();

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    sessionId = existingSessionId;

    // Update last_updated and increment version
    await db.prepare(
      `UPDATE sessions SET last_updated = datetime('now'), current_version = current_version + 1 WHERE id = ?`
    ).bind(sessionId).run();

    const versionRow = await db.prepare(
      `SELECT current_version FROM sessions WHERE id = ?`
    ).bind(sessionId).first();
    currentVersion = versionRow.current_version;
  } else {
    // Create new session
    sessionId = generateSessionId();
    currentVersion = 1;

    // Extract title from HTML <title> tag if present, decode HTML entities
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim().slice(0, 200) : 'Untitled Plan';
    const title = rawTitle.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    await db.prepare(
      `INSERT INTO sessions (id, title, created_by) VALUES (?, ?, ?)`
    ).bind(sessionId, title, tokenData.user_id).run();
  }

  // Write HTML to KV (current + versioned snapshot)
  await kv.put(`plan:${sessionId}:current`, html);

  // Fire-and-forget versioned snapshot
  setImmediate(() => {
    kv.put(`plan:${sessionId}:v:${currentVersion}`, html).catch(console.error);
  });

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const planUrl = `${baseUrl}/p/${sessionId}`;

  // Get session title for Slack notification
  const sessionRow = await db.prepare(
    `SELECT title FROM sessions WHERE id = ?`
  ).bind(sessionId).first();

  // Fire-and-forget Slack notification (only on subsequent pushes)
  if (existingSessionId) {
    setImmediate(() => {
      notifySlack({
        event: 'plan_updated',
        sessionId,
        sessionTitle: sessionRow?.title || 'Untitled Plan',
        author: tokenData.display_name || tokenData.github_username,
        planUrl,
      }).catch(console.error);
    });
  }

  res.json({
    session_id: sessionId,
    url: planUrl,
  });
}
