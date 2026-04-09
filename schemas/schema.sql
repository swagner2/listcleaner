CREATE TABLE IF NOT EXISTS profiles (
  klaviyo_id    TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  email         TEXT NOT NULL,
  domain        TEXT NOT NULL,
  first_checked TEXT NOT NULL,
  last_checked  TEXT NOT NULL,
  synced_at     TEXT,
  status        TEXT NOT NULL DEFAULT 'unscanned',
  source        TEXT,
  raw_result    TEXT,
  PRIMARY KEY (klaviyo_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_last_checked ON profiles(last_checked);
CREATE INDEX IF NOT EXISTS idx_profiles_domain ON profiles(domain);
CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON profiles(account_id, status);

CREATE TABLE IF NOT EXISTS runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        TEXT NOT NULL,
  job_type          TEXT NOT NULL DEFAULT 'full',
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

CREATE INDEX IF NOT EXISTS idx_runs_account ON runs(account_id);

CREATE TABLE IF NOT EXISTS actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL,
  account_id  TEXT NOT NULL,
  klaviyo_id  TEXT NOT NULL,
  email       TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_actions_run ON actions(run_id);
CREATE INDEX IF NOT EXISTS idx_actions_account ON actions(account_id);
