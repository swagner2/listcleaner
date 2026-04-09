const now = () => new Date().toISOString();

export async function createRun(db, accountId) {
  const result = await db.prepare(
    'INSERT INTO runs (account_id, started_at, status) VALUES (?, ?, ?)'
  ).bind(accountId, now(), 'running').run();
  return result.meta.last_row_id;
}

export async function finishRun(db, runId, stats) {
  await db.prepare(`
    UPDATE runs SET
      finished_at = ?,
      profiles_fetched = ?,
      stage1_flagged = ?,
      stage2_sent = ?,
      stage2_invalid = ?,
      suppressed = ?,
      errors = ?,
      status = ?
    WHERE id = ?
  `).bind(
    now(),
    stats.profiles_fetched,
    stats.stage1_flagged,
    stats.stage2_sent,
    stats.stage2_invalid,
    stats.suppressed,
    stats.errors,
    stats.status || 'completed',
    runId
  ).run();
}

export async function upsertProfile(db, accountId, profile) {
  const timestamp = now();
  await db.prepare(`
    INSERT INTO profiles (klaviyo_id, account_id, email, domain, first_checked, last_checked, status, source, raw_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(klaviyo_id, account_id) DO UPDATE SET
      email = excluded.email,
      last_checked = excluded.last_checked,
      status = excluded.status,
      source = excluded.source,
      raw_result = excluded.raw_result
  `).bind(
    profile.klaviyo_id,
    accountId,
    profile.email,
    profile.domain,
    timestamp,
    timestamp,
    profile.status,
    profile.source || null,
    profile.raw_result ? JSON.stringify(profile.raw_result) : null
  ).run();
}

export async function getProfileByKlaviyoId(db, accountId, klaviyoId) {
  return await db.prepare(
    'SELECT * FROM profiles WHERE klaviyo_id = ? AND account_id = ?'
  ).bind(klaviyoId, accountId).first();
}

export async function isProfileStale(db, accountId, klaviyoId, recheckDays) {
  const profile = await getProfileByKlaviyoId(db, accountId, klaviyoId);
  if (!profile) return true;

  const lastChecked = new Date(profile.last_checked);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recheckDays);
  return lastChecked < cutoff;
}

export async function logAction(db, runId, accountId, action) {
  await db.prepare(`
    INSERT INTO actions (run_id, account_id, klaviyo_id, email, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    accountId,
    action.klaviyo_id,
    action.email,
    action.action,
    action.detail || null,
    now()
  ).run();
}

export async function getRunStats(db, accountId, limit = 20) {
  return await db.prepare(
    'SELECT * FROM runs WHERE account_id = ? ORDER BY id DESC LIMIT ?'
  ).bind(accountId, limit).all();
}

export async function getRunDetail(db, accountId, runId) {
  const run = await db.prepare(
    'SELECT * FROM runs WHERE id = ? AND account_id = ?'
  ).bind(runId, accountId).first();
  const actions = await db.prepare(
    'SELECT * FROM actions WHERE run_id = ? AND account_id = ? ORDER BY id'
  ).bind(runId, accountId).all();
  return { run, actions: actions.results };
}

export async function getStatusSummary(db, accountId) {
  return await db.prepare(`
    SELECT status, COUNT(*) as count FROM profiles WHERE account_id = ? GROUP BY status ORDER BY count DESC
  `).bind(accountId).all();
}

export async function getProfiles(db, accountId, status, page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;

  if (status) {
    return await db.prepare(
      'SELECT * FROM profiles WHERE account_id = ? AND status = ? ORDER BY last_checked DESC LIMIT ? OFFSET ?'
    ).bind(accountId, status, pageSize, offset).all();
  }

  return await db.prepare(
    'SELECT * FROM profiles WHERE account_id = ? ORDER BY last_checked DESC LIMIT ? OFFSET ?'
  ).bind(accountId, pageSize, offset).all();
}

export async function getTotalProfiles(db, accountId) {
  const result = await db.prepare(
    'SELECT COUNT(*) as total FROM profiles WHERE account_id = ?'
  ).bind(accountId).first();
  return result.total;
}

// Get last run for an account (used in account list)
export async function getLastRun(db, accountId) {
  return await db.prepare(
    'SELECT * FROM runs WHERE account_id = ? ORDER BY id DESC LIMIT 1'
  ).bind(accountId).first();
}

// Clean up runs stuck in "running" for more than 10 minutes
export async function cleanupStuckRuns(db) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await db.prepare(`
    UPDATE runs SET status = 'failed', finished_at = ?, errors = errors + 1
    WHERE status = 'running' AND started_at < ?
  `).bind(new Date().toISOString(), cutoff).run();
}

// Get active (running) run for an account
export async function getActiveRun(db, accountId) {
  return await db.prepare(
    "SELECT * FROM runs WHERE account_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1"
  ).bind(accountId).first();
}

// Update run stats mid-pipeline (for live progress)
export async function updateRunProgress(db, runId, stats) {
  await db.prepare(`
    UPDATE runs SET
      profiles_fetched = ?,
      stage1_flagged = ?,
      stage2_sent = ?,
      stage2_invalid = ?,
      suppressed = ?,
      errors = ?
    WHERE id = ?
  `).bind(
    stats.profiles_fetched,
    stats.stage1_flagged,
    stats.stage2_sent,
    stats.stage2_invalid,
    stats.suppressed,
    stats.errors,
    runId
  ).run();
}
