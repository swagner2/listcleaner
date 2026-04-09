const now = () => new Date().toISOString();

export async function createRun(db) {
  const result = await db.prepare(
    'INSERT INTO runs (started_at, status) VALUES (?, ?)'
  ).bind(now(), 'running').run();
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

export async function upsertProfile(db, profile) {
  const timestamp = now();
  await db.prepare(`
    INSERT INTO profiles (klaviyo_id, email, domain, first_checked, last_checked, status, source, raw_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(klaviyo_id) DO UPDATE SET
      email = excluded.email,
      last_checked = excluded.last_checked,
      status = excluded.status,
      source = excluded.source,
      raw_result = excluded.raw_result
  `).bind(
    profile.klaviyo_id,
    profile.email,
    profile.domain,
    timestamp,
    timestamp,
    profile.status,
    profile.source || null,
    profile.raw_result ? JSON.stringify(profile.raw_result) : null
  ).run();
}

export async function getProfileByKlaviyoId(db, klaviyoId) {
  return await db.prepare(
    'SELECT * FROM profiles WHERE klaviyo_id = ?'
  ).bind(klaviyoId).first();
}

export async function isProfileStale(db, klaviyoId, recheckDays) {
  const profile = await getProfileByKlaviyoId(db, klaviyoId);
  if (!profile) return true;

  const lastChecked = new Date(profile.last_checked);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recheckDays);
  return lastChecked < cutoff;
}

export async function logAction(db, runId, action) {
  await db.prepare(`
    INSERT INTO actions (run_id, klaviyo_id, email, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    runId,
    action.klaviyo_id,
    action.email,
    action.action,
    action.detail || null,
    now()
  ).run();
}

export async function getRunStats(db, limit = 20) {
  return await db.prepare(
    'SELECT * FROM runs ORDER BY id DESC LIMIT ?'
  ).bind(limit).all();
}

export async function getRunDetail(db, runId) {
  const run = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first();
  const actions = await db.prepare(
    'SELECT * FROM actions WHERE run_id = ? ORDER BY id'
  ).bind(runId).all();
  return { run, actions: actions.results };
}

export async function getStatusSummary(db) {
  return await db.prepare(`
    SELECT status, COUNT(*) as count FROM profiles GROUP BY status ORDER BY count DESC
  `).all();
}

export async function getProfiles(db, status, page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  const query = status
    ? 'SELECT * FROM profiles WHERE status = ? ORDER BY last_checked DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM profiles ORDER BY last_checked DESC LIMIT ? OFFSET ?';

  const params = status
    ? [status, pageSize, offset]
    : [pageSize, offset];

  const stmt = db.prepare(query);
  const bound = status
    ? stmt.bind(status, pageSize, offset)
    : stmt.bind(pageSize, offset);

  return await bound.all();
}

export async function getTotalProfiles(db) {
  const result = await db.prepare('SELECT COUNT(*) as total FROM profiles').first();
  return result.total;
}
