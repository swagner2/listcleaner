const now = () => new Date().toISOString();

// --- Runs ---

export async function createRun(db, accountId, jobType = 'full') {
  const result = await db.prepare(
    'INSERT INTO runs (account_id, job_type, started_at, status) VALUES (?, ?, ?, ?)'
  ).bind(accountId, jobType, now(), 'running').run();
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
    stats.profiles_fetched || 0,
    stats.stage1_flagged || 0,
    stats.stage2_sent || 0,
    stats.stage2_invalid || 0,
    stats.suppressed || 0,
    stats.errors || 0,
    stats.status || 'completed',
    runId
  ).run();
}

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
    stats.profiles_fetched || 0,
    stats.stage1_flagged || 0,
    stats.stage2_sent || 0,
    stats.stage2_invalid || 0,
    stats.suppressed || 0,
    stats.errors || 0,
    runId
  ).run();
}

export async function cleanupStuckRuns(db) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await db.prepare(`
    UPDATE runs SET status = 'failed', finished_at = ?, errors = errors + 1
    WHERE status = 'running' AND started_at < ?
  `).bind(now(), cutoff).run();
}

export async function getActiveRun(db, accountId) {
  return await db.prepare(
    "SELECT * FROM runs WHERE account_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1"
  ).bind(accountId).first();
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

export async function getLastRun(db, accountId) {
  return await db.prepare(
    'SELECT * FROM runs WHERE account_id = ? ORDER BY id DESC LIMIT 1'
  ).bind(accountId).first();
}

// --- Batched profile sync (Job 1) ---

export async function batchUpsertProfiles(db, accountId, profiles) {
  const timestamp = now();
  const stmts = profiles.map(p => {
    const domain = p.email.split('@')[1] || '';
    return db.prepare(`
      INSERT INTO profiles (klaviyo_id, account_id, email, domain, first_checked, last_checked, synced_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'unscanned')
      ON CONFLICT(klaviyo_id, account_id) DO UPDATE SET
        email = excluded.email,
        domain = excluded.domain,
        synced_at = excluded.synced_at
    `).bind(p.id, accountId, p.email, domain, timestamp, timestamp, timestamp);
  });

  // D1 batch limit is 100 statements
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}

// --- Spell check queries (Job 2) ---

export async function getUnscannedProfiles(db, accountId, limit = 5000) {
  return await db.prepare(
    "SELECT klaviyo_id, email, domain FROM profiles WHERE account_id = ? AND status = 'unscanned' LIMIT ?"
  ).bind(accountId, limit).all();
}

export async function batchUpdateStatus(db, accountId, updates) {
  // updates: [{ klaviyo_id, status, source, detail }]
  const timestamp = now();
  const stmts = updates.map(u =>
    db.prepare(`
      UPDATE profiles SET status = ?, source = ?, last_checked = ?
      WHERE klaviyo_id = ? AND account_id = ?
    `).bind(u.status, u.source || null, timestamp, u.klaviyo_id, accountId)
  );

  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}

// --- Verify queries (Job 3) ---

export async function getCleanProfiles(db, accountId, limit = 500) {
  return await db.prepare(
    "SELECT klaviyo_id, email, domain FROM profiles WHERE account_id = ? AND status = 'clean' LIMIT ?"
  ).bind(accountId, limit).all();
}

// --- Actions log ---

export async function logAction(db, runId, accountId, action) {
  await db.prepare(`
    INSERT INTO actions (run_id, account_id, klaviyo_id, email, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(runId, accountId, action.klaviyo_id, action.email, action.action, action.detail || null, now()).run();
}

export async function batchLogActions(db, runId, accountId, actions) {
  const timestamp = now();
  const stmts = actions.map(a =>
    db.prepare(`
      INSERT INTO actions (run_id, account_id, klaviyo_id, email, action, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(runId, accountId, a.klaviyo_id, a.email, a.action, a.detail || null, timestamp)
  );

  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}

// --- Dashboard queries ---

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

export async function getProfileByKlaviyoId(db, accountId, klaviyoId) {
  return await db.prepare(
    'SELECT * FROM profiles WHERE klaviyo_id = ? AND account_id = ?'
  ).bind(klaviyoId, accountId).first();
}
