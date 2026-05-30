import { knex } from '../db.js';
import { kv } from '../kv.js';
import { generateSessionId } from '../utils/crypto.js';
import { notifySlack } from '../utils/slack.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { writeAuditLog } from '../utils/audit.js';
import { isValidSessionId } from '../utils/validate.js';
import { can } from '../utils/rbac.js';

const VERSION_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export async function handlePush(req, res) {
  const tokenData = req.tokenData;

  const rawHtml = req.body;

  if (typeof rawHtml !== 'string') {
    return res.status(400).json({ error: 'content_type_must_be_text_html' });
  }

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
  let publishedAt = null;

  if (existingSessionId) {
    if (!isValidSessionId(existingSessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const session = await knex('sessions')
      .where({ id: existingSessionId })
      .whereNull('deleted_at')
      .select('id', 'title', 'created_by', 'published_at')
      .first();

    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // Only the session creator can update it
    if (session.created_by !== tokenData.user_id) {
      return res.status(403).json({ error: 'not_session_owner' });
    }

    sessionId = existingSessionId;
    sessionTitle = session.title;
    publishedAt = session.published_at;

    // Atomic version increment + record version history inside transaction
    currentVersion = await knex.transaction(async (trx) => {
      await trx('sessions')
        .where('id', sessionId)
        .update({
          last_updated: knex.fn.now(),
          current_version: knex.raw('current_version + 1'),
        });
      const row = await trx('sessions').where('id', sessionId).select('current_version').first();
      await trx('session_versions').insert({
        session_id: sessionId,
        version: row.current_version,
        pushed_by: tokenData.user_id,
      });
      return row.current_version;
    });
  } else {
    // Create new session — derive slug from header, falling back to HTML <title>
    const slugify = (str) => (str || '').trim().toLowerCase()
      .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
    const isValidSlug = (s) => s && /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/.test(s);

    let sessionName = slugify(req.headers['x-session-name']);
    if (!isValidSlug(sessionName)) {
      // Fallback: derive slug from HTML <title>
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      if (titleMatch) sessionName = slugify(titleMatch[1]);
    }

    if (isValidSlug(sessionName)) {
      // Check for name collision
      const existing = await knex('sessions').where({ id: sessionName }).select('id').first();
      if (existing) {
        return res.status(409).json({ error: 'session_name_taken', message: `The name "${sessionName}" is already in use.` });
      }
      sessionId = sessionName;
    } else {
      sessionId = generateSessionId();
    }

    currentVersion = 1;

    // Extract title from HTML <title> tag if present (stored entity-encoded as-is for safety)
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    sessionTitle = titleMatch ? titleMatch[1].trim().slice(0, 200) : 'Untitled Plan';

    const isPrivate = req.headers['x-visibility'] === 'private';

    await knex.transaction(async (trx) => {
      await trx('sessions').insert({
        id: sessionId,
        title: sessionTitle,
        created_by: tokenData.user_id,
        published_at: isPrivate ? null : knex.fn.now(),
      });
      await trx('session_versions').insert({
        session_id: sessionId,
        version: 1,
        pushed_by: tokenData.user_id,
      });
    });
  }

  // Write HTML to KV (current + versioned snapshot with 90-day TTL)
  await kv.put(`plan:${sessionId}:current`, html);

  // Fire-and-forget versioned snapshot
  setImmediate(() => {
    kv.put(`plan:${sessionId}:v:${currentVersion}`, html, { expirationTtl: VERSION_TTL_SECONDS }).catch(console.error);
  });

  const planUrl = `${req.planpushBaseUrl}/p/${sessionId}`;

  // Fire-and-forget Slack notification (only on subsequent pushes to published plans)
  if (existingSessionId && publishedAt) {
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

  writeAuditLog(knex, {
    actorId: tokenData.user_id,
    action: 'session.pushed',
    targetType: 'session',
    targetId: sessionId,
    meta: { version: currentVersion, is_new: !existingSessionId },
  });

  res.json({
    session_id: sessionId,
    url: planUrl,
  });
}
