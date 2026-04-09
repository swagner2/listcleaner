-- Tracks every Klaviyo profile we have processed
CREATE TABLE IF NOT EXISTS profiles (
  klaviyo_id    TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  domain        TEXT NOT NULL,
  first_checked TEXT NOT NULL,
  last_checked  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  source        TEXT,
  raw_result    TEXT,
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_last_checked ON profiles(last_checked);
CREATE INDEX IF NOT EXISTS idx_profiles_domain ON profiles(domain);

-- One row per cron/manual run
CREATE TABLE IF NOT EXISTS runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at        TEXT NOT NULL,
  finished_at       TEXT,
  profiles_fetched  INTEGER DEFAULT 0,
  stage1_flagged    INTEGER DEFAULT 0,
  stage2_sent       INTEGER DEFAULT 0,
  stage2_invalid    INTEGER DEFAULT 0,
  suppressed        INTEGER DEFAULT 0,
  errors            INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'running'
);

-- Audit log of actions taken per run
CREATE TABLE IF NOT EXISTS actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL,
  klaviyo_id  TEXT NOT NULL,
  email       TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_actions_run ON actions(run_id);
