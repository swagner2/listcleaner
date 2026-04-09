import * as Sentry from '@sentry/cloudflare';
import { getConfig, setConfig, getCursor, setCursor, getAccounts, getAccount, addAccount, removeAccount } from './config.js';
import { fetchProfiles, fetchProfilesByList, suppressProfiles, getProfileCount } from './klaviyo.js';
import { checkDomain, getDomainCorrections, setDomainCorrections, getSafeDomains, setSafeDomains, getDisposableDomains, setDisposableDomains, initDomainLists } from './domain-checker.js';
import { createVerifier } from './verification.js';
import * as db from './db.js';
import { renderAccountList, renderDashboard } from './dashboard.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkAuth(request, env) {
  if (!env.DASHBOARD_TOKEN) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth.replace('Bearer ', '') === env.DASHBOARD_TOKEN;
}

function matchRoute(path) {
  let m = path.match(/^\/accounts\/([^/]+)\/api\/runs\/(\d+)$/);
  if (m) return { route: 'account_run_detail', accountId: m[1], runId: parseInt(m[2]) };
  m = path.match(/^\/accounts\/([^/]+)\/api\/(.+)$/);
  if (m) return { route: `account_api_${m[2]}`, accountId: m[1] };
  m = path.match(/^\/accounts\/([^/]+)$/);
  if (m) return { route: 'account_dashboard', accountId: m[1] };
  m = path.match(/^\/api\/accounts\/([^/]+)$/);
  if (m) return { route: 'api_account_single', accountId: m[1] };
  return { route: path };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================
// HTTP Handler
// ============================================================
async function handleFetch(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/health') return new Response('OK');

  if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });

  const { route, accountId, runId } = matchRoute(path);
  if (accountId) Sentry.setTag('account_id', accountId);

  // --- Global routes ---
  if (route === '/' && method === 'GET') return handleAccountListPage(env);
  if (route === '/api/accounts' && method === 'GET') {
    const accounts = await getAccounts(env.CONFIG);
    return json(accounts.map(a => ({ id: a.id, name: a.name })));
  }
  if (route === '/api/accounts' && method === 'POST') return handleAddAccount(env, await request.json());
  if (route === 'api_account_single' && method === 'DELETE') return handleRemoveAccount(env, accountId);
  if (route === '/api/domain-lists' && method === 'GET') return handleGetDomainLists(env);
  if (route === '/api/domain-lists' && method === 'POST') return handleSetDomainLists(env, await request.json());
  if (route === '/domain-lists' && method === 'GET') return handleDomainListsPage(env);

  // --- Per-account routes ---
  if (route === 'account_dashboard' && method === 'GET') return handleDashboard(env, accountId);
  if (route === 'account_api_stats' && method === 'GET') return handleStats(env, accountId);
  if (route === 'account_run_detail' && method === 'GET') return handleRunDetail(env, accountId, runId);
  if (route === 'account_api_profiles' && method === 'GET') {
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const format = url.searchParams.get('format');
    return handleProfiles(env, accountId, status, page, format);
  }
  if (route === 'account_api_status' && method === 'GET') return handleStatus(env, accountId);
  if (route === 'account_api_config' && method === 'GET') return handleGetConfig(env, accountId);
  if (route === 'account_api_config' && method === 'POST') return handleSetConfig(env, accountId, await request.json());
  if (route === 'account_api_trigger' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return handleTrigger(env, ctx, accountId, body.mode || 'full');
  }

  return new Response('Not Found', { status: 404 });
}

// ============================================================
// Page & CRUD handlers
// ============================================================
async function handleAccountListPage(env) {
  await db.cleanupStuckRuns(env.DB);
  const accounts = await getAccounts(env.CONFIG);
  const accountData = [];
  for (const acct of accounts) {
    const [totalProfiles, lastRun] = await Promise.all([
      db.getTotalProfiles(env.DB, acct.id),
      db.getLastRun(env.DB, acct.id),
    ]);
    accountData.push({ ...acct, totalProfiles, lastRun });
  }
  return new Response(renderAccountList(accountData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleAddAccount(env, body) {
  if (!body.id || !body.name || !body.klaviyo_api_key) return json({ error: 'Required: id, name, klaviyo_api_key' }, 400);
  const id = body.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  let profileCount = 0;
  try {
    const result = await getProfileCount(body.klaviyo_api_key);
    profileCount = result.profile_count;
  } catch (err) {
    return json({ error: `Klaviyo API key validation failed: ${err.message}` }, 400);
  }
  try {
    await addAccount(env.CONFIG, { id, name: body.name, klaviyo_api_key: body.klaviyo_api_key });
    return json({ created: true, id, klaviyo_profile_count: profileCount }, 201);
  } catch (err) {
    return json({ error: err.message }, 409);
  }
}

async function handleRemoveAccount(env, accountId) {
  try { await removeAccount(env.CONFIG, accountId); return json({ deleted: true, id: accountId }); }
  catch (err) { return json({ error: err.message }, 404); }
}

async function handleGetDomainLists(env) {
  await initDomainLists(env.CONFIG);
  const [corrections, safeDomains, disposableDomains] = await Promise.all([
    getDomainCorrections(env.CONFIG), getSafeDomains(env.CONFIG), getDisposableDomains(env.CONFIG),
  ]);
  return json({ corrections, safe_domains: safeDomains, disposable_domains: disposableDomains });
}

async function handleSetDomainLists(env, body) {
  if (body.corrections !== undefined) await setDomainCorrections(env.CONFIG, body.corrections);
  if (body.safe_domains !== undefined) await setSafeDomains(env.CONFIG, body.safe_domains);
  if (body.disposable_domains !== undefined) await setDisposableDomains(env.CONFIG, body.disposable_domains);
  return json({ saved: true });
}

async function handleDomainListsPage(env) {
  await initDomainLists(env.CONFIG);
  const [corrections, safeDomains, disposableDomains] = await Promise.all([
    getDomainCorrections(env.CONFIG), getSafeDomains(env.CONFIG), getDisposableDomains(env.CONFIG),
  ]);
  const { renderDomainListsPage } = await import('./dashboard.js');
  return new Response(renderDomainListsPage(corrections, safeDomains, disposableDomains),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleDashboard(env, accountId) {
  const account = await getAccount(env.CONFIG, accountId);
  if (!account) return json({ error: 'Account not found' }, 404);
  await db.cleanupStuckRuns(env.DB);
  const [runs, statusSummary, config, totalProfiles] = await Promise.all([
    db.getRunStats(env.DB, accountId, 20),
    db.getStatusSummary(env.DB, accountId),
    getConfig(env.CONFIG, accountId),
    db.getTotalProfiles(env.DB, accountId),
  ]);
  return new Response(renderDashboard(account, runs.results, statusSummary.results, config, totalProfiles),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleStats(env, accountId) {
  const [runs, statusSummary] = await Promise.all([
    db.getRunStats(env.DB, accountId, 20), db.getStatusSummary(env.DB, accountId),
  ]);
  return json({ runs: runs.results, statusSummary: statusSummary.results });
}

async function handleRunDetail(env, accountId, runId) {
  const detail = await db.getRunDetail(env.DB, accountId, runId);
  if (!detail.run) return json({ error: 'Run not found' }, 404);
  return json(detail);
}

async function handleProfiles(env, accountId, status, page, format) {
  const profiles = await db.getProfiles(env.DB, accountId, status, page, format === 'csv' ? 10000 : 50);
  if (format === 'csv') {
    const rows = [['email', 'domain', 'status', 'source', 'last_checked']];
    for (const p of profiles.results) rows.push([p.email, p.domain, p.status, p.source || '', p.last_checked]);
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    return new Response(csv, { headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="profiles-${accountId}-${status || 'all'}.csv"`,
    }});
  }
  return json({ profiles: profiles.results, page });
}

async function handleStatus(env, accountId) {
  const activeRun = await db.getActiveRun(env.DB, accountId);
  if (!activeRun) return json({ running: false });
  const minutesAgo = (Date.now() - new Date(activeRun.started_at).getTime()) / 60000;
  if (minutesAgo > 10) {
    await db.finishRun(env.DB, activeRun.id, { ...activeRun, errors: activeRun.errors + 1, status: 'failed' });
    return json({ running: false });
  }
  return json({
    running: true, run_id: activeRun.id, job_type: activeRun.job_type,
    started_at: activeRun.started_at,
    profiles_fetched: activeRun.profiles_fetched, stage1_flagged: activeRun.stage1_flagged,
    stage2_sent: activeRun.stage2_sent, stage2_invalid: activeRun.stage2_invalid,
    errors: activeRun.errors,
  });
}

async function handleGetConfig(env, accountId) { return json(await getConfig(env.CONFIG, accountId)); }
async function handleSetConfig(env, accountId, updates) { return json(await setConfig(env.CONFIG, accountId, updates)); }

async function handleTrigger(env, ctx, accountId, mode) {
  const account = await getAccount(env.CONFIG, accountId);
  if (!account) return json({ error: 'Account not found' }, 404);
  await db.cleanupStuckRuns(env.DB);

  const labels = { sync: 'Sync started', spellcheck: 'Spell check started', verify: 'Verification started', full: 'Full scan started' };

  // Run the single job step, then chain the next step via self-fetch
  ctx.waitUntil(
    runJobStep(env, account, mode).catch(err => {
      console.error(`[${accountId}] ${mode} error:`, err);
      Sentry.captureException(err, { tags: { account_id: accountId, mode } });
    })
  );
  return json({ triggered: true, account: accountId, mode, message: labels[mode] || labels.full }, 202);
}

// Chain the next job step by calling our own trigger endpoint
async function chainNext(env, accountId, nextMode) {
  const workerUrl = env.WORKER_URL || 'https://klaviyo-list-cleaner.crmr.workers.dev';
  const url = `${workerUrl}/accounts/${accountId}/api/trigger`;
  console.log(`[${accountId}] Chaining next step: ${nextMode}`);
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.DASHBOARD_TOKEN ? `Bearer ${env.DASHBOARD_TOKEN}` : '',
      },
      body: JSON.stringify({ mode: nextMode }),
    });
  } catch (err) {
    console.error(`[${accountId}] Chain fetch error:`, err.message);
  }
}

// ============================================================
// Job Step Runner — runs ONE step, then chains the next
// ============================================================
async function runJobStep(env, account, mode) {
  if (mode === 'sync') {
    const result = await runSync(env, account);
    // If sync isn't done, chain another sync
    if (!result.sync_complete && result.status !== 'failed') {
      await chainNext(env, account.id, 'sync');
    }
    return;
  }

  if (mode === 'spellcheck') {
    await runSpellCheck(env, account);
    return;
  }

  if (mode === 'verify') {
    await runVerify(env, account);
    return;
  }

  // full = sync (self-chaining), then spellcheck, then verify
  // Start with sync; when sync is complete it chains to _full_spellcheck
  const result = await runSync(env, account);
  if (!result.sync_complete && result.status !== 'failed') {
    // More profiles to sync — chain another full run (continues syncing)
    await chainNext(env, account.id, 'full');
  } else {
    // Sync complete — run spell check + verify in this invocation (they're fast)
    await runSpellCheck(env, account);
    await runVerify(env, account);
  }
}

// ============================================================
// Job 1: Sync Profiles from Klaviyo → D1
// ============================================================
async function runSync(env, account) {
  const accountId = account.id;
  const config = await getConfig(env.CONFIG, accountId);
  const runId = await db.createRun(env.DB, accountId, 'sync');

  console.log(`[${accountId}] SYNC started (run ${runId})`);
  Sentry.setContext('run', { runId, accountId, job: 'sync' });

  const stats = { profiles_fetched: 0, stage1_flagged: 0, stage2_sent: 0, stage2_invalid: 0, suppressed: 0, errors: 0, status: 'completed' };

  try {
    const klaviyoKey = account.klaviyo_api_key;
    if (!klaviyoKey) throw new Error(`No Klaviyo API key for account "${accountId}"`);

    let cursor = await getCursor(env.CONFIG, accountId);
    let pages = 0;
    // Hard cap: 15 pages (1500 profiles) per invocation to stay within Worker CPU limits
    const MAX_PAGES_PER_RUN = 15;

    while (pages < MAX_PAGES_PER_RUN) {
      let result;
      if (config.klaviyo_list_id) {
        result = await fetchProfilesByList(klaviyoKey, config.klaviyo_list_id, cursor, 100);
      } else {
        result = await fetchProfiles(klaviyoKey, cursor, 100);
      }

      const { profiles, nextCursor } = result;
      if (profiles.length === 0) {
        console.log(`[${accountId}] SYNC complete — all profiles synced`);
        await setCursor(env.CONFIG, accountId, null);
        break;
      }

      // Batch insert into D1
      await db.batchUpsertProfiles(env.DB, accountId, profiles);
      stats.profiles_fetched += profiles.length;
      pages++;

      console.log(`[${accountId}] SYNC page ${pages}: ${profiles.length} profiles (${stats.profiles_fetched} total)`);
      await db.updateRunProgress(env.DB, runId, stats);

      cursor = nextCursor;
      await setCursor(env.CONFIG, accountId, cursor);
      if (!nextCursor) {
        console.log(`[${accountId}] SYNC complete — reached end of profiles`);
        break;
      }
      await sleep(80);
    }

    stats.sync_complete = !cursor;
    if (cursor) {
      console.log(`[${accountId}] SYNC paused at ${stats.profiles_fetched} profiles — cursor saved, more to sync`);
    }
  } catch (err) {
    console.error(`[${accountId}] SYNC error:`, err.message, err.stack);
    Sentry.captureException(err, { tags: { account_id: accountId, job: 'sync' } });
    stats.status = 'failed';
    stats.errors++;
  }

  await db.finishRun(env.DB, runId, stats);
  console.log(`[${accountId}] SYNC run ${runId} finished: ${stats.profiles_fetched} profiles`);
  return stats;
}

// ============================================================
// Job 2: Spell Check (domain typo detection) — pure DB work
// ============================================================
async function runSpellCheck(env, account) {
  const accountId = account.id;
  const runId = await db.createRun(env.DB, accountId, 'spellcheck');

  console.log(`[${accountId}] SPELLCHECK started (run ${runId})`);
  Sentry.setContext('run', { runId, accountId, job: 'spellcheck' });

  // Load domain lists
  await initDomainLists(env.CONFIG);
  const [corrections, safeDomains, disposableDomains] = await Promise.all([
    getDomainCorrections(env.CONFIG), getSafeDomains(env.CONFIG), getDisposableDomains(env.CONFIG),
  ]);

  const stats = { profiles_fetched: 0, stage1_flagged: 0, stage2_sent: 0, stage2_invalid: 0, suppressed: 0, errors: 0, status: 'completed' };

  try {
    // Read all unscanned profiles from D1
    const result = await db.getUnscannedProfiles(env.DB, accountId, 50000);
    const profiles = result.results;
    stats.profiles_fetched = profiles.length;

    console.log(`[${accountId}] SPELLCHECK: ${profiles.length} unscanned profiles`);

    if (profiles.length === 0) {
      await db.finishRun(env.DB, runId, stats);
      return stats;
    }

    // Check all profiles in memory
    const updates = [];
    const actionLogs = [];

    for (const p of profiles) {
      const result = checkDomain(p.email, corrections, safeDomains, disposableDomains);
      if (!result.valid) {
        const status = result.reason === 'disposable_domain' ? 'disposable' : 'invalid_domain';
        updates.push({ klaviyo_id: p.klaviyo_id, status, source: 'domain_check' });
        actionLogs.push({ klaviyo_id: p.klaviyo_id, email: p.email, action: 'flagged_domain', detail: result.detail });
        stats.stage1_flagged++;
      } else {
        updates.push({ klaviyo_id: p.klaviyo_id, status: 'clean', source: 'domain_check' });
      }
    }

    console.log(`[${accountId}] SPELLCHECK: ${stats.stage1_flagged} flagged, ${profiles.length - stats.stage1_flagged} clean`);

    // Batch write results to D1
    await db.batchUpdateStatus(env.DB, accountId, updates);
    if (actionLogs.length > 0) {
      await db.batchLogActions(env.DB, runId, accountId, actionLogs);
    }

    await db.updateRunProgress(env.DB, runId, stats);
  } catch (err) {
    console.error(`[${accountId}] SPELLCHECK error:`, err.message, err.stack);
    Sentry.captureException(err, { tags: { account_id: accountId, job: 'spellcheck' } });
    stats.status = 'failed';
    stats.errors++;
  }

  await db.finishRun(env.DB, runId, stats);
  console.log(`[${accountId}] SPELLCHECK run ${runId} finished: ${stats.stage1_flagged} flagged out of ${stats.profiles_fetched}`);
  return stats;
}

// ============================================================
// Job 3: Verify via NeverBounce — reads "clean" from D1
// ============================================================
async function runVerify(env, account) {
  const accountId = account.id;
  const config = await getConfig(env.CONFIG, accountId);
  const runId = await db.createRun(env.DB, accountId, 'verify');

  console.log(`[${accountId}] VERIFY started (run ${runId})`);
  Sentry.setContext('run', { runId, accountId, job: 'verify' });

  const stats = { profiles_fetched: 0, stage1_flagged: 0, stage2_sent: 0, stage2_invalid: 0, suppressed: 0, errors: 0, status: 'completed' };

  try {
    if (!config.stage2_enabled) {
      console.log(`[${accountId}] VERIFY skipped — stage2_enabled is false`);
      await db.finishRun(env.DB, runId, stats);
      return stats;
    }

    const verifierKey = env.NEVERBOUNCE_API_KEY;
    if (!verifierKey) {
      console.warn(`[${accountId}] VERIFY skipped — NEVERBOUNCE_API_KEY not set`);
      await db.finishRun(env.DB, runId, stats);
      return stats;
    }

    const result = await db.getCleanProfiles(env.DB, accountId, config.max_profiles_per_run);
    const profiles = result.results;
    stats.profiles_fetched = profiles.length;

    console.log(`[${accountId}] VERIFY: ${profiles.length} clean profiles to verify`);

    if (profiles.length === 0) {
      await db.finishRun(env.DB, runId, stats);
      return stats;
    }

    const verifier = createVerifier(config.stage2_provider, verifierKey);

    for (let i = 0; i < profiles.length; i += config.stage2_batch_size) {
      const batch = profiles.slice(i, i + config.stage2_batch_size);
      const emails = batch.map(p => p.email);
      const results = await verifier.verifyBatch(emails);

      const updates = [];
      const actionLogs = [];

      for (let j = 0; j < results.length; j++) {
        const vResult = results[j];
        const profile = batch[j];
        stats.stage2_sent++;

        updates.push({
          klaviyo_id: profile.klaviyo_id,
          status: vResult.status,
          source: `3p_${config.stage2_provider}`,
        });

        if (vResult.status !== 'valid' && vResult.status !== 'unknown') {
          stats.stage2_invalid++;
          actionLogs.push({
            klaviyo_id: profile.klaviyo_id, email: profile.email,
            action: 'flagged_3p', detail: `${config.stage2_provider}: ${vResult.status}`,
          });
        }
      }

      await db.batchUpdateStatus(env.DB, accountId, updates);
      if (actionLogs.length > 0) await db.batchLogActions(env.DB, runId, accountId, actionLogs);
      await db.updateRunProgress(env.DB, runId, stats);

      console.log(`[${accountId}] VERIFY batch ${Math.floor(i / config.stage2_batch_size) + 1}: ${stats.stage2_sent} sent, ${stats.stage2_invalid} invalid`);
    }

    // Auto-suppress if enabled
    if (config.auto_suppress) {
      const invalidStatuses = ['invalid_domain', 'invalid_3p', 'disposable', 'spamtrap', 'abuse'];
      const toSuppress = profiles
        .filter((p, idx) => {
          const update = updates?.[idx]; // won't work — need to re-query
          return false; // handled below
        });

      // Re-query for invalid profiles to suppress
      const allInvalid = await db.getProfiles(env.DB, accountId, null, 1, 10000);
      const suppressEmails = allInvalid.results
        .filter(p => invalidStatuses.includes(p.status))
        .map(p => p.email);

      if (suppressEmails.length > 0) {
        try {
          await suppressProfiles(account.klaviyo_api_key, suppressEmails);
          stats.suppressed = suppressEmails.length;
          console.log(`[${accountId}] VERIFY: suppressed ${suppressEmails.length} profiles`);
        } catch (err) {
          console.error(`[${accountId}] Suppression error:`, err.message);
          Sentry.captureException(err, { tags: { account_id: accountId, job: 'verify' } });
          stats.errors++;
        }
      }
    }
  } catch (err) {
    console.error(`[${accountId}] VERIFY error:`, err.message, err.stack);
    Sentry.captureException(err, { tags: { account_id: accountId, job: 'verify' } });
    stats.status = 'failed';
    stats.errors++;
  }

  await db.finishRun(env.DB, runId, stats);
  console.log(`[${accountId}] VERIFY run ${runId} finished: ${stats.stage2_sent} verified, ${stats.stage2_invalid} invalid`);

  // Email notification
  const config2 = await getConfig(env.CONFIG, accountId);
  if (config2.notification_emails?.length > 0 && env.SENDGRID_API_KEY) {
    try {
      await sendRunNotification(env.SENDGRID_API_KEY, config2.notification_emails, account, runId, stats);
    } catch (err) {
      console.error(`[${accountId}] Email notification error:`, err.message);
    }
  }

  return stats;
}

// ============================================================
// Email notification
// ============================================================
async function sendRunNotification(apiKey, emails, account, runId, stats) {
  const subject = `List Cleaner: ${account.name} run #${runId} — ${stats.status === 'completed' ? 'Completed' : 'Failed'}`;
  const body = `
    <h2 style="font-family:sans-serif;color:#333">Run #${runId} — ${account.name}</h2>
    <table style="font-family:sans-serif;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 16px 4px 0;color:#666">Status</td><td style="font-weight:bold;color:${stats.status === 'completed' ? '#00a86b' : '#e53935'}">${stats.status}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Profiles</td><td>${stats.profiles_fetched}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Domain Typos</td><td>${stats.stage1_flagged}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">3P Verified</td><td>${stats.stage2_sent}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">3P Invalid</td><td>${stats.stage2_invalid}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Errors</td><td>${stats.errors}</td></tr>
    </table>
  `.trim();

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: emails.map(e => ({ email: e })) }],
      from: { email: 'noreply@inboxsmarts.com', name: 'List Cleaner' },
      subject, content: [{ type: 'text/html', value: body }],
    }),
  });
}

// ============================================================
// Export with Sentry
// ============================================================
export default Sentry.withSentry(
  (env) => ({ dsn: env.SENTRY_DSN || '', tracesSampleRate: 0.1 }),
  {
    async fetch(request, env, ctx) { return handleFetch(request, env, ctx); },

    async scheduled(event, env, ctx) {
      await db.cleanupStuckRuns(env.DB);
      const accounts = await getAccounts(env.CONFIG);
      if (accounts.length === 0) { console.log('No accounts, skipping cron'); return; }

      for (const account of accounts) {
        console.log(`[cron] Triggering full scan for: ${account.id}`);
        try {
          // Trigger via self-fetch so each account gets its own invocation chain
          await chainNext(env, account.id, 'full');
        } catch (err) {
          console.error(`[cron] Failed to trigger ${account.id}:`, err.message);
          Sentry.captureException(err, { tags: { account_id: account.id, source: 'cron' } });
        }
      }
    },
  }
);
