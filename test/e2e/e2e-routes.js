/**
 * E2E helper routes - only loaded in test environment
 * These provide a way to authenticate users in E2E tests without a production login endpoint
 */

export function attachE2eRoutes(app) {
  // Only in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

  /**
   * POST /e2e/auth/session
   * Creates a session for the given user (for E2E testing only)
   */
  app.post('/e2e/auth/session', (req, res) => {
    const { userId, displayName, role } = req.body;

    if (!userId || !displayName) {
      return res.status(400).json({ error: 'userId and displayName required' });
    }

    // Set session data directly via express-session
    req.session.user_id = userId;
    req.session.display_name = displayName;
    req.session.role = role || 'member';
    req.session.created_at = Date.now();

    // Save session and return the cookie value
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to save session', details: err.message });
      }

      // The session ID is stored in req.sessionID
      // We need to return the signed cookie value that the browser should set
      const crypto = require('crypto');
      const secret = process.env.SECRET_KEY;
      const sid = req.sessionID;

      // Sign the session ID using express-session's cookie-signature format
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(sid);
      const digest = hmac.digest('base64');
      const sig = digest.replace(/=/g, '');
      const signedCookie = `s:${sid}.${sig}`;

      res.json({
        sessionCookie: signedCookie,
        sessionId: sid,
        userId,
        displayName,
        role,
      });
    });
  });

  /**
   * GET /e2e/test-data
   * Retrieves test credentials and IDs for use in tests
   */
  app.get('/e2e/test-data', async (req, res) => {
    try {
      const { kv } = await import('../../src/kv.js');
      const data = await kv.get('e2e:test-credentials', 'json');
      if (!data) {
        return res.status(404).json({ error: 'test-data not found' });
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
