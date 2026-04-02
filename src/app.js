import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAdmin, requireAuthOrRedirect } from './middleware/auth.js';
import { attachBaseUrl } from './middleware/baseUrl.js';
import { handleLogin, handleCallback, handleLogout, handleAuthDevice, handleAuthDeviceToken, handleAuthToken, handleActivateGet, handleActivatePost, handleInfo, handleSessionCheck } from './routes/auth.js';
import { handlePush } from './routes/push.js';
import { handleServe } from './routes/serve.js';
import { handleGetComments, handlePostComment, handleResolveComment } from './routes/comments.js';
import { handleDashboard } from './routes/dashboard.js';
import { handleSessionInfo } from './routes/sessionInfo.js';
import { handleDeleteSession, handlePatchUserRole, handleDeactivateUser, handleGetAdminActivity } from './routes/admin.js';
import { handleListTokens, handleRevokeToken } from './routes/tokens.js';
import { handleAsset } from './routes/assets.js';

// Validate required env vars at startup
if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 32) {
  throw new Error('SECRET_KEY must be at least 32 characters');
}
if (!process.env.GITHUB_CLIENT_ID) throw new Error('GITHUB_CLIENT_ID environment variable is required');
if (!process.env.GITHUB_CLIENT_SECRET) throw new Error('GITHUB_CLIENT_SECRET environment variable is required');
if (!process.env.GITHUB_ORG) throw new Error('GITHUB_ORG environment variable is required');

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

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/html', limit: '4mb' }));
app.use(cookieParser());

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
app.use('/api/auth/device/token', devicePollLimiter);
app.use('/api/auth/', authLimiter);
app.use('/activate', authLimiter);
app.use('/auth/', authLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.get('/auth/login', handleLogin);
app.get('/auth/callback', handleCallback);
app.post('/auth/logout', handleLogout);
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
app.post('/api/comments', requireAuth, handlePostComment);
app.patch('/api/comments/:id/resolve', requireAuth, handleResolveComment);
app.get('/api/sessions/:id/info', requireAuth, handleSessionInfo);

// Admin routes
app.delete('/api/sessions/:id', requireAdmin, handleDeleteSession);
app.patch('/api/users/:id/role', requireAdmin, handlePatchUserRole);
app.patch('/api/users/:id/deactivate', requireAdmin, handleDeactivateUser);
app.get('/api/admin/activity', requireAdmin, handleGetAdminActivity);

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
