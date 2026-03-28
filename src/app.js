import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAuthOrRedirect } from './middleware/auth.js';
import { attachBaseUrl } from './middleware/baseUrl.js';
import { handleLogin, handleCallback, handleLogout, handleAuthDevice, handleAuthDeviceToken, handleAuthToken, handleActivateGet, handleActivatePost, handleInfo, handleSessionCheck } from './routes/auth.js';
import { handlePush } from './routes/push.js';
import { handleServe } from './routes/serve.js';
import { handleGetComments, handlePostComment, handleResolveComment } from './routes/comments.js';
import { handleDashboard } from './routes/dashboard.js';
import { handleSessionInfo } from './routes/sessionInfo.js';
import { handleAsset } from './routes/assets.js';

// Validate required env vars at startup
if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 32) {
  throw new Error('SECRET_KEY must be at least 32 characters');
}
if (!process.env.GITHUB_CLIENT_ID) throw new Error('GITHUB_CLIENT_ID environment variable is required');
if (!process.env.GITHUB_CLIENT_SECRET) throw new Error('GITHUB_CLIENT_SECRET environment variable is required');

const app = express();

// Global security headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP set per-page where HTML is returned
  crossOriginEmbedderPolicy: false,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/html', limit: '10mb' }));
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
app.post('/api/push', requireAuth, handlePush);
app.get('/api/comments', requireAuth, handleGetComments);
app.post('/api/comments', requireAuth, handlePostComment);
app.patch('/api/comments/:id/resolve', requireAuth, handleResolveComment);
app.get('/api/sessions/:id/info', requireAuth, handleSessionInfo);

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
