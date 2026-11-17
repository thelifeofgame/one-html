PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, title_zh TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL, description_zh TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('game','visual','tool')),
  author_id TEXT REFERENCES users(id), credit TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '', license TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
  builtin_path TEXT, object_key TEXT, cover TEXT NOT NULL DEFAULT 'custom',
  created_at INTEGER NOT NULL, reviewed_at INTEGER, review_note TEXT NOT NULL DEFAULT '',
  CHECK((builtin_path IS NULL) != (object_key IS NULL))
);
CREATE INDEX IF NOT EXISTS works_public ON works(status, category, created_at DESC);
CREATE TABLE IF NOT EXISTS votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY(user_id,work_id)
);
CREATE INDEX IF NOT EXISTS votes_work ON votes(work_id);
CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY(user_id,work_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_work ON comments(work_id,status,created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  work_id TEXT NOT NULL REFERENCES works(id), reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sponsor_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  work_id TEXT NOT NULL REFERENCES works(id), email TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 500), note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','contacted','declined')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
