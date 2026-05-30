// E2E test server: boots the real PlanPush app against a fresh throwaway SQLite DB,
// seeds fixtures, mints express-session cookies directly (NO production /e2e route),
// and writes a fixtures JSON file the specs read. Spawned by global-setup.js.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { createHmac, randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure DATA_DIR exists before importing db (db.js opens SQLite on import + runs migrations,
// which on a fresh DB also SEEDS the RBAC roles/permissions — so we must NOT resetDb here).
const DATA_DIR = process.env.DATA_DIR || './data';
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const { knex } = await import('../../src/db.js');
const { app } = await import('../../src/app.js');
const { kv } = await import('../../src/kv.js');
const { seedUser, seedSession } = await import('../../test/helpers/db.js');
const { ConnectSessionKnexStore } = await import('connect-session-knex');

const PORT = process.env.PORT || 5173;
const SECRET = process.env.SECRET_KEY;
const FIXTURES_PATH = join(__dirname, '.fixtures.json');

// Write session rows through connect-session-knex's OWN store, mirroring app.js's config, so the
// `expired` column + row shape match exactly what the store's get() expects on read. (A hand-rolled
// INSERT stores `expired` in a format the store can't read back, so the session silently never loads.)
const sessionStore = new ConnectSessionKnexStore({ knex, tableName: 'sessions_store', createTable: false });

// express-session signed-cookie format: s:<sid>.<base64 HMAC-SHA256(sid), '=' stripped>
function signSid(sid, secret) {
  const sig = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  return `s:${sid}.${sig}`;
}

// Persist a server-side session via the real store + return the matching signed cookie.
async function mintCookie(user, role) {
  const sid = randomBytes(18).toString('hex');
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const sess = {
    cookie: { originalMaxAge: maxAge, expires: new Date(Date.now() + maxAge).toISOString(), httpOnly: true, path: '/', sameSite: 'lax' },
    user_id: user.id,
    display_name: user.display_name,
    role,
    created_at: Date.now(),
  };
  await new Promise((resolve, reject) => sessionStore.set(sid, sess, (err) => (err ? reject(err) : resolve())));
  return signSid(sid, SECRET);
}

const TEST_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Test Plan</title></head>
<body>
  <h1>Test Plan</h1>
  <section data-anchor="Intro"><h2>Intro</h2><p>This is a test design doc for E2E testing.</p></section>
</body></html>`;

async function start() {
  if (sessionStore.ready) { try { await sessionStore.ready; } catch { /* table already exists via migration */ } }
  // Fresh temp DB — migrations (incl. 009 RBAC seed) ran on import. Do NOT resetDb (it wipes the role seed).
  const adminUser = await seedUser({ role: 'admin' });
  const memberUser = await seedUser({ role: 'developer' });
  const privateViewerUser = await seedUser({ role: 'developer' });

  const publishedSession = await seedSession({ created_by: memberUser.id, published_at: new Date().toISOString(), title: 'Published Test Plan' });
  await kv.put(`plan:${publishedSession.id}:current`, TEST_HTML);

  const privateSession = await seedSession({ created_by: privateViewerUser.id, published_at: null, title: 'Private Test Plan' });
  await kv.put(`plan:${privateSession.id}:current`, TEST_HTML);

  const fixtures = {
    baseURL: `http://localhost:${PORT}`,
    admin: { id: adminUser.id, displayName: adminUser.display_name, cookie: await mintCookie(adminUser, 'admin') },
    member: { id: memberUser.id, displayName: memberUser.display_name, cookie: await mintCookie(memberUser, 'developer') },
    privateViewer: { id: privateViewerUser.id, displayName: privateViewerUser.display_name, cookie: await mintCookie(privateViewerUser, 'developer') },
    publishedSessionId: publishedSession.id,
    privateSessionId: privateSession.id,
  };
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  console.log('[e2e-server] fixtures written to', FIXTURES_PATH);

  const server = app.listen(PORT, () => console.log(`[e2e-server] PlanPush listening on port ${PORT}`));

  async function shutdown() {
    server.close(async () => { await knex.destroy(); process.exit(0); });
    setTimeout(() => process.exit(0), 10000);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => { console.error('[e2e-server] startup error:', err); process.exit(1); });
