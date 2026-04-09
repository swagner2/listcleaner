-- Migration: add account_id to existing tables
ALTER TABLE profiles ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE runs ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE actions ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_runs_account ON runs(account_id);
CREATE INDEX IF NOT EXISTS idx_actions_account ON actions(account_id);
