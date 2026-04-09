-- Recreate profiles table with composite primary key (klaviyo_id, account_id)
-- SQLite doesn't support ALTER TABLE to change primary keys, so we recreate

CREATE TABLE IF NOT EXISTS profiles_new (
  klaviyo_id    TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  email         TEXT NOT NULL,
  domain        TEXT NOT NULL,
  first_checked TEXT NOT NULL,
  last_checked  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  source        TEXT,
  raw_result    TEXT,
  PRIMARY KEY (klaviyo_id, account_id)
);

-- Copy existing data
INSERT OR IGNORE INTO profiles_new (klaviyo_id, account_id, email, domain, first_checked, last_checked, status, source, raw_result)
  SELECT klaviyo_id, account_id, email, domain, first_checked, last_checked, status, source, raw_result FROM profiles;

-- Swap tables
DROP TABLE profiles;
ALTER TABLE profiles_new RENAME TO profiles;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_last_checked ON profiles(last_checked);
CREATE INDEX IF NOT EXISTS idx_profiles_domain ON profiles(domain);
CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles(account_id);
