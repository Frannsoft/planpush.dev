CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL UNIQUE,
  github_username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  anchor TEXT,
  plan_version INTEGER NOT NULL DEFAULT 1,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  hashed_token TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS device_codes (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  github_user_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_github_user_id ON users(github_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_last_updated ON sessions(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_comments_session_id ON comments(session_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hashed_token ON api_tokens(hashed_token);
CREATE INDEX IF NOT EXISTS idx_device_codes_user_code ON device_codes(user_code);
