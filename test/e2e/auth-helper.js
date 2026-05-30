// E2E auth helper: NO production code / NO server route. global-setup's server-start.js
// already minted express-session cookies (signed with the server's SECRET_KEY) and wrote
// them to .fixtures.json. Here we just read that file and set the cookie on the browser.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '.fixtures.json');

export function loadFixtures() {
  return JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
}

// Set the pre-minted __session cookie for `userKey` (admin | member | privateViewer).
export async function authenticateAs(page, fixtures, userKey) {
  const u = fixtures[userKey];
  if (!u || !u.cookie) throw new Error(`No fixture cookie for user "${userKey}"`);
  await page.context().addCookies([
    {
      name: '__session',
      value: u.cookie,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  return u;
}
