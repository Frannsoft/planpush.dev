import express from 'express';
import cookieParser from 'cookie-parser';
import { db } from './db.js';
import { FileKv } from './kv.js';
import { requireAuth, requireAuthOrRedirect, requireAdmin } from './middleware/auth.js';
import { handleLogin, handleCallback, handleLogout, handleAuthDevice, handleAuthDeviceToken, handleAuthToken, handleActivateGet, handleActivatePost, handleInfo, handleSessionCheck } from './routes/auth.js';
import { handlePush } from './routes/push.js';
import { handleServe } from './routes/serve.js';
import { handleGetComments, handlePostComment, handleResolveComment } from './routes/comments.js';
import { handleDashboard } from './routes/dashboard.js';
import { handleAsset } from './routes/assets.js';

// Validate required env vars at startup
if (!process.env.SECRET_KEY) throw new Error('SECRET_KEY environment variable is required');
if (!process.env.GITHUB_CLIENT_ID) throw new Error('GITHUB_CLIENT_ID environment variable is required');
if (!process.env.GITHUB_CLIENT_SECRET) throw new Error('GITHUB_CLIENT_SECRET environment variable is required');

const app = express();

// KV store
const DATA_DIR = process.env.DATA_DIR || './data';
const kv = new FileKv(`${DATA_DIR}/kv`);
app.locals.db = db;
app.locals.kv = kv;

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/html', limit: '10mb' }));
app.use(cookieParser());

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

// Static assets
app.get('/assets/:file', handleAsset);

// Dashboard (redirect to login if not authed)
app.get('/dashboard', handleDashboard);

// Plan viewer (redirect to login if not authed)
app.get('/p/:sessionId', handleServe);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export { app, kv };
