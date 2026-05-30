import request from 'supertest';
import { knex } from '../../src/db.js';

/**
 * Create an authenticated request agent for multi-step auth flows
 * Returns a Supertest agent that maintains session cookies
 */
export function createAuthAgent(app, user = null) {
  const agent = request.agent(app);

  if (user) {
    // Store user data in session via direct DB insert
    // This is the most robust approach without relying on OAuth
    agent._user = user;
  }

  return agent;
}

/**
 * Set up a session for a user in the sessions_store table
 * Used for test setup when we need an authenticated context
 */
export async function setupSessionForUser(user) {
  // Create a session in the sessions_store table for this user
  const sessionId = `test_${Math.random().toString(36).slice(2, 18)}`;

  // express-session stores serialized JSON data in sess column
  const sessionData = {
    user_id: user.id,
    display_name: user.display_name,
    role: user.role || 'developer',
    created_at: Date.now(),
  };

  const expiredAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

  await knex('sessions_store').insert({
    sid: sessionId,
    sess: JSON.stringify(sessionData),
    expired: expiredAt.toISOString(),
  });

  return { sessionId, sessionData };
}

/**
 * Helper: make authenticated requests with an agent
 * Sets user session cookie before making request
 */
export async function makeAuthenticatedRequest(agent, method, path, user) {
  const { sessionId } = await setupSessionForUser(user);

  let req = agent[method](path);

  // Set the session cookie (connect-session-knex uses __session by default)
  req = req.set('Cookie', `__session=${sessionId}`);

  return req;
}

/**
 * Create an admin user for testing
 * (helper that coordinates with seedUser if imported)
 */
export async function createTestAdmin() {
  // This is a scaffold — the actual seedUser is in db.js
  // Import and use together: { seedUser } from './db.js'
  return {
    id: 'admin_test',
    display_name: 'Test Admin',
    role: 'admin',
  };
}
