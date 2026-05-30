import { createHmac } from 'crypto';

/**
 * Sign a session ID using the same format as express-session
 * Format: s:<sid>.<base64url-hmac-sha256>
 */
function signSessionId(sid, secret) {
  // Sign the sid with HMAC-SHA256
  const hmac = createHmac('sha256', secret);
  hmac.update(sid);
  const digest = hmac.digest('base64');
  // Remove padding
  const sig = digest.replace(/=/g, '');
  // Return in express-session format: s:<sid>.<sig>
  return `s:${sid}.${sig}`;
}

/**
 * Create and authenticate a test user session
 * This seeds a session directly in the database (via a request), then sets the cookie
 */
export async function authenticateUserSession(page, userId, displayName, role) {
  // Get the secret key from the server (stored in KV during setup)
  // For now, we'll use a request to /dashboard to trigger auth, OR
  // we can construct the session directly using the browser's local storage

  // The approach: make a request to a hidden endpoint that will set the session,
  // then grab the cookie from that response

  // Actually, simpler approach: we'll create the session via direct DB manipulation
  // by calling a special e2e helper endpoint on the server

  const response = await page.request.post('http://localhost:5173/e2e/auth/session', {
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      userId,
      displayName,
      role,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create session: ${response.status()} ${await response.text()}`);
  }

  const result = await response.json();

  // The server returns the session cookie value; add it to the browser
  await page.context().addCookies([
    {
      name: '__session',
      value: result.sessionCookie,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  return result;
}

/**
 * Helper to extract cookies from a response for manual cookie setting
 */
export function extractSessionCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;

  const match = setCookie.match(/(__session=[^;]+)/);
  return match ? match[1] : null;
}
