import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { knex } from './db.js';
import { requireAuth, requireAdmin, requireAuthOrRedirect } from './middleware/auth.js';
import { attachBaseUrl } from './middleware/baseUrl.js';
import { handleLogin, handleCallback, handleLogout, handleAuthDevice, handleAuthDeviceToken, handleAuthToken, handleActivateGet, handleActivatePost, handleInfo, handleSessionCheck } from './routes/auth.js';
import { handlePush } from './routes/push.js';
import { handleServe } from './routes/serve.js';
import { handleGetComments, handlePostComment, handleResolveComment } from './routes/comments.js';
import { handleDashboard } from './routes/dashboard.js';
import { handleSessionInfo } from './routes/sessionInfo.js';
import { handleDeleteSession, handlePatchUserRole, handleDeactivateUser, handleGetAdminActivity } from './routes/admin.js';
import { handleArchiveSession, handlePublishSession, handleRecordViews, handleGetGroupRoleMap, handleAddGroupRoleMap, handleDeleteGroupRoleMap } from './routes/dashboardActions.js';
import { handleListTokens, handleRevokeToken } from './routes/tokens.js';
import { handleAsset } from './routes/assets.js';
import { scimRouter } from './scim/index.js';

// Validate required env vars at startup
const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'github';

if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 32) {
  throw new Error('SECRET_KEY must be at least 32 characters');
}
if (process.env.NODE_ENV === 'production' && !process.env.BASE_URL) {
  throw new Error('BASE_URL environment variable is required in production (prevents Host header injection)');
}

// Validate provider-specific env vars
if (AUTH_PROVIDER === 'github') {
  if (!process.env.GITHUB_CLIENT_ID) throw new Error('GITHUB_CLIENT_ID environment variable is required');
  if (!process.env.GITHUB_CLIENT_SECRET) throw new Error('GITHUB_CLIENT_SECRET environment variable is required');
  if (!process.env.GITHUB_ORG) throw new Error('GITHUB_ORG environment variable is required');
} else if (AUTH_PROVIDER === 'okta') {
  if (!process.env.OKTA_ISSUER) throw new Error('OKTA_ISSUER environment variable is required');
  if (!process.env.OKTA_CLIENT_ID) throw new Error('OKTA_CLIENT_ID environment variable is required');
  if (!process.env.OKTA_CLIENT_SECRET) throw new Error('OKTA_CLIENT_SECRET environment variable is required');
} else {
  throw new Error(`Unknown AUTH_PROVIDER: ${AUTH_PROVIDER}`);
}

const app = express();

// Trust first proxy (nginx, Caddy, Docker) so rate limiter keys on real client IP
app.set('trust proxy', 1);

// Global security headers with default CSP for non-plan pages
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Permissions-Policy: restrict browser features not needed by a design doc tool
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/html', limit: '4mb' }));
app.use(cookieParser());

// Session storage (express-session with Knex store).
// Idle timeout = rolling cookie maxAge (reset on each response); the absolute
// max-age is enforced separately in verifyRequest against session.created_at.
const sessionIdleTimeout = process.env.SESSION_IDLE_TIMEOUT ? parseInt(process.env.SESSION_IDLE_TIMEOUT) * 1000 : 8 * 60 * 60 * 1000; // 8h default
app.use(session({
  secret: process.env.SECRET_KEY,
  store: new ConnectSessionKnexStore({ knex, tableName: 'sessions_store', createTable: false }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: sessionIdleTimeout,
    path: '/',
  },
  name: '__session',
}));

// Attach baseUrl to every request
app.use(attachBaseUrl);

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
// Separate higher-limit rate limiter for device code polling (RFC 8628 polls every 5s)
const devicePollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
// Per-user push rate limit
const pushLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
// Per-user comment rate limit
const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/auth/device/token', devicePollLimiter);
app.use('/api/auth/', authLimiter);
app.use('/activate', authLimiter);
app.use('/auth/', authLimiter);

// Root redirect
app.get('/', (req, res) => res.redirect('/dashboard'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.get('/auth/login', handleLogin);
app.get('/auth/callback', handleCallback);
app.post('/auth/logout', handleLogout);
// SP-initiated login: same as /auth/login, used by IdP dashboard tiles
app.get('/auth/initiate_login_uri', handleLogin);
app.get('/api/auth/device', handleAuthDevice);
app.post('/api/auth/device/token', handleAuthDeviceToken);
app.post('/api/auth/token', handleAuthToken);
app.get('/activate', handleActivateGet);
app.post('/activate', handleActivatePost);
app.get('/api/info', handleInfo);
app.get('/api/auth/session', handleSessionCheck);

// Core routes (authenticated)
app.post('/api/push', requireAuth, pushLimiter, handlePush);
app.get('/api/comments', requireAuth, handleGetComments);
app.post('/api/comments', requireAuth, commentLimiter, handlePostComment);
app.patch('/api/comments/:id/resolve', requireAuth, commentLimiter, handleResolveComment);
app.get('/api/sessions/:id/info', requireAuth, handleSessionInfo);

// Admin routes
app.delete('/api/sessions/:id', requireAdmin, handleDeleteSession);
app.patch('/api/users/:id/role', requireAdmin, handlePatchUserRole);
app.patch('/api/users/:id/deactivate', requireAdmin, handleDeactivateUser);
app.get('/api/admin/activity', requireAdmin, handleGetAdminActivity);

// Dashboard actions
app.patch('/api/sessions/:id/archive', requireAuth, handleArchiveSession);
app.post('/api/sessions/:id/publish', requireAuth, handlePublishSession);
app.post('/api/dashboard/views', requireAuth, handleRecordViews);

// Admin group role mapping (only available for Okta)
if (AUTH_PROVIDER === 'okta') {
  app.get('/api/admin/group-role-map', requireAdmin, handleGetGroupRoleMap);
  app.post('/api/admin/group-role-map', requireAdmin, handleAddGroupRoleMap);
  app.delete('/api/admin/group-role-map/:id', requireAdmin, handleDeleteGroupRoleMap);
}

// Token management
app.get('/api/tokens', requireAuth, handleListTokens);
app.delete('/api/tokens/:id', requireAuth, handleRevokeToken);

// Static assets
app.get('/assets/:file', handleAsset);
app.get('/favicon.ico', (req, res) => { req.params = { file: 'favicon.ico' }; handleAsset(req, res); });

// Dashboard (redirect to login if not authed)
app.get('/dashboard', requireAuthOrRedirect, handleDashboard);

// Plan viewer (redirect to login if not authed)
app.get('/p/:sessionId', requireAuthOrRedirect, handleServe);

// SCIM 2.0 provisioning (separate bearer auth, not session-based)
app.use('/scim/v2', scimRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };
