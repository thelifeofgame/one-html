ALTER TABLE works ADD COLUMN current_version_id TEXT;
ALTER TABLE works ADD COLUMN sha256 TEXT;
ALTER TABLE works ADD COLUMN content_bytes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE work_versions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  content_bytes INTEGER NOT NULL,
  object_key TEXT,
  builtin_path TEXT,
  original_filename TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_revision TEXT NOT NULL DEFAULT '',
  source_note TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT 'original' CHECK(variant IN ('original','adapted')),
  adaptation_note TEXT NOT NULL DEFAULT '',
  base_version_id TEXT REFERENCES work_versions(id),
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','published','rejected','archived')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_at INTEGER,
  UNIQUE(work_id,sha256),
  CHECK((builtin_path IS NULL) != (object_key IS NULL))
);
CREATE INDEX versions_work ON work_versions(work_id,created_at DESC);
CREATE INDEX versions_duplicate ON work_versions(created_by,sha256,created_at DESC);
CREATE INDEX versions_pending ON work_versions(status,created_at);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE TABLE submission_dedup (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  version_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,sha256)
);
