-- Reset all profiles for re-processing under new status flow
UPDATE profiles SET status = 'unscanned', source = NULL WHERE status IN ('pending', 'valid', 'clean');

-- Add synced_at timestamp
ALTER TABLE profiles ADD COLUMN synced_at TEXT;
UPDATE profiles SET synced_at = first_checked;

-- Add job_type to runs so we can tell sync/spellcheck/verify apart
ALTER TABLE runs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'full';
