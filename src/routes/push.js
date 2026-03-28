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
  let sessionTitle;

  if (existingSessionId) {
    // Validate session ID format
    if (!/^sess_[0-9a-f]{12}$/.test(existingSessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const session = await db.prepare(
      `SELECT id, title, created_by FROM sessions WHERE id = ?`
    ).bind(existingSessionId).first();

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // Only the session creator can update it
    if (session.created_by !== tokenData.user_id) {
      return res.status(403).json({ error: 'not_session_owner' });
    }

    sessionId = existingSessionId;
    sessionTitle = session.title;

    // Atomic version increment + read inside transaction
    currentVersion = await db._knex.transaction(async (trx) => {
      await trx('sessions')
        .where('id', sessionId)
        .update({
          last_updated: db._knex.fn.now(),
          current_version: db._knex.raw('current_version + 1'),
        });
      const row = await trx('sessions').where('id', sessionId).select('current_version').first();
      return row.current_version;
    });
  } else {
    // Create new session
    sessionId = generateSessionId();
    currentVersion = 1;

    // Extract title from HTML <title> tag if present, decode HTML entities
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim().slice(0, 200) : 'Untitled Plan';
    sessionTitle = rawTitle.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    await db.prepare(
      `INSERT INTO sessions (id, title, created_by) VALUES (?, ?, ?)`
    ).bind(sessionId, sessionTitle, tokenData.user_id).run();
  }

  // Write HTML to KV (current + versioned snapshot)
  await kv.put(`plan:${sessionId}:current`, html);

  // Fire-and-forget versioned snapshot
  setImmediate(() => {
    kv.put(`plan:${sessionId}:v:${currentVersion}`, html).catch(console.error);
  });

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const planUrl = `${baseUrl}/p/${sessionId}`;

  // Fire-and-forget Slack notification (only on subsequent pushes)
  if (existingSessionId) {
    setImmediate(() => {
      notifySlack({
        event: 'plan_updated',
        sessionId,
        sessionTitle: sessionTitle || 'Untitled Plan',
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
