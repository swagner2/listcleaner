import * as Sentry from '@sentry/cloudflare';
import { getConfig, setConfig, getCursor, setCursor, getAccounts, getAccount, addAccount, removeAccount } from './config.js';
import { fetchProfiles, fetchProfilesByList, suppressProfiles, getProfileCount } from './klaviyo.js';
import { checkDomain } from './domain-checker.js';
import { createVerifier } from './verification.js';
import * as db from './db.js';
import { renderAccountList, renderDashboard } from './dashboard.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Auth middleware ---
function checkAuth(request, env) {
  if (!env.DASHBOARD_TOKEN) return true;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  return token === env.DASHBOARD_TOKEN;
}

// --- Route parser ---
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

// --- HTTP Handler ---
async function handleFetch(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/health') {
    return new Response('OK', { status: 200 });
  }

  if (!checkAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { route, accountId, runId } = matchRoute(path);

  // Set Sentry context for account-scoped routes
  if (accountId) {
    Sentry.setTag('account_id', accountId);
  }

  if (route === '/' && method === 'GET') {
    return handleAccountListPage(env);
  }

  if (route === '/api/accounts' && method === 'GET') {
    const accounts = await getAccounts(env.CONFIG);
    return json(accounts.map(a => ({ id: a.id, name: a.name })));
  }
  if (route === '/api/accounts' && method === 'POST') {
    const body = await request.json();
    return handleAddAccount(env, body);
  }
  if (route === 'api_account_single' && method === 'DELETE') {
    return handleRemoveAccount(env, accountId);
  }

  if (route === 'account_dashboard' && method === 'GET') {
    return handleDashboard(env, accountId);
  }
  if (route === 'account_api_stats' && method === 'GET') {
    return handleStats(env, accountId);
  }
  if (route === 'account_run_detail' && method === 'GET') {
    return handleRunDetail(env, accountId, runId);
  }
  if (route === 'account_api_profiles' && method === 'GET') {
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    return handleProfiles(env, accountId, status, page);
  }
  if (route === 'account_api_status' && method === 'GET') {
    return handleStatus(env, accountId);
  }
  if (route === 'account_api_config' && method === 'GET') {
    return handleGetConfig(env, accountId);
  }
  if (route === 'account_api_config' && method === 'POST') {
    const body = await request.json();
    return handleSetConfig(env, accountId, body);
  }
  if (route === 'account_api_trigger' && method === 'POST') {
    return handleTrigger(env, ctx, accountId);
  }

  return new Response('Not Found', { status: 404 });
}

// --- Account list page ---
async function handleAccountListPage(env) {
  const accounts = await getAccounts(env.CONFIG);
  const accountData = [];
  for (const acct of accounts) {
    const [totalProfiles, lastRun] = await Promise.all([
      db.getTotalProfiles(env.DB, acct.id),
      db.getLastRun(env.DB, acct.id),
    ]);
    accountData.push({ ...acct, totalProfiles, lastRun });
  }
  const html = renderAccountList(accountData);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// --- Account CRUD ---
async function handleAddAccount(env, body) {
  if (!body.id || !body.name || !body.klaviyo_api_key) {
    return json({ error: 'Required: id, name, klaviyo_api_key' }, 400);
  }
  const id = body.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  // Validate the API key against Klaviyo and get profile count
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
    Sentry.captureException(err);
    return json({ error: err.message }, 409);
  }
}

async function handleRemoveAccount(env, accountId) {
  try {
    await removeAccount(env.CONFIG, accountId);
    return json({ deleted: true, id: accountId });
  } catch (err) {
    return json({ error: err.message }, 404);
  }
}

// --- Per-account handlers ---
async function handleDashboard(env, accountId) {
  const account = await getAccount(env.CONFIG, accountId);
  if (!account) return json({ error: 'Account not found' }, 404);

  const [runs, statusSummary, config, totalProfiles] = await Promise.all([
    db.getRunStats(env.DB, accountId, 20),
    db.getStatusSummary(env.DB, accountId),
    getConfig(env.CONFIG, accountId),
    db.getTotalProfiles(env.DB, accountId),
  ]);
  const html = renderDashboard(account, runs.results, statusSummary.results, config, totalProfiles);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleStats(env, accountId) {
  const [runs, statusSummary] = await Promise.all([
    db.getRunStats(env.DB, accountId, 20),
    db.getStatusSummary(env.DB, accountId),
  ]);
  return json({ runs: runs.results, statusSummary: statusSummary.results });
}

async function handleRunDetail(env, accountId, runId) {
  const detail = await db.getRunDetail(env.DB, accountId, runId);
  if (!detail.run) return json({ error: 'Run not found' }, 404);
  return json(detail);
}

async function handleProfiles(env, accountId, status, page) {
  const profiles = await db.getProfiles(env.DB, accountId, status, page);
  return json({ profiles: profiles.results, page });
}

async function handleStatus(env, accountId) {
  const activeRun = await db.getActiveRun(env.DB, accountId);
  if (!activeRun) {
    return json({ running: false });
  }
  return json({
    running: true,
    run_id: activeRun.id,
    started_at: activeRun.started_at,
    profiles_fetched: activeRun.profiles_fetched,
    stage1_flagged: activeRun.stage1_flagged,
    stage2_sent: activeRun.stage2_sent,
    stage2_invalid: activeRun.stage2_invalid,
    errors: activeRun.errors,
  });
}

async function handleGetConfig(env, accountId) {
  const config = await getConfig(env.CONFIG, accountId);
  return json(config);
}

async function handleSetConfig(env, accountId, updates) {
  const config = await setConfig(env.CONFIG, accountId, updates);
  return json(config);
}

async function handleTrigger(env, ctx, accountId) {
  const account = await getAccount(env.CONFIG, accountId);
  if (!account) return json({ error: 'Account not found' }, 404);
  ctx.waitUntil(
    runPipeline(env, account).catch(err => {
      console.error(`Trigger error for ${accountId}:`, err);
      Sentry.captureException(err, { tags: { account_id: accountId } });
    })
  );
  return json({ triggered: true, account: accountId, message: 'Cleaning run started' }, 202);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Cleaning Pipeline ---
async function runPipeline(env, account) {
  const accountId = account.id;
  const config = await getConfig(env.CONFIG, accountId);
  const runId = await db.createRun(env.DB, accountId);

  Sentry.setTag('account_id', accountId);
  Sentry.setContext('run', { runId, accountId });

  const stats = {
    profiles_fetched: 0,
    stage1_flagged: 0,
    stage2_sent: 0,
    stage2_invalid: 0,
    suppressed: 0,
    errors: 0,
    status: 'completed',
  };

  try {
    const klaviyoKey = account.klaviyo_api_key;
    if (!klaviyoKey) throw new Error(`No Klaviyo API key for account "${accountId}"`);

    let cursor = await getCursor(env.CONFIG, accountId);
    let totalProcessed = 0;
    const stage2Queue = [];

    while (totalProcessed < config.max_profiles_per_run) {
      const remaining = config.max_profiles_per_run - totalProcessed;
      const pageSize = Math.min(config.batch_size, remaining);

      let result;
      if (config.klaviyo_list_id) {
        result = await fetchProfilesByList(klaviyoKey, config.klaviyo_list_id, cursor, pageSize);
      } else {
        result = await fetchProfiles(klaviyoKey, cursor, pageSize);
      }

      const { profiles, nextCursor } = result;
      if (profiles.length === 0) {
        await setCursor(env.CONFIG, accountId, null);
        break;
      }

      stats.profiles_fetched += profiles.length;
      totalProcessed += profiles.length;

      for (const profile of profiles) {
        try {
          const isStale = await db.isProfileStale(env.DB, accountId, profile.id, config.recheck_days);
          if (!isStale) continue;

          const domain = profile.email.split('@')[1] || '';
          const domainResult = checkDomain(profile.email);

          if (!domainResult.valid) {
            const statusVal = domainResult.reason === 'disposable_domain' ? 'disposable' : 'invalid_domain';

            await db.upsertProfile(env.DB, accountId, {
              klaviyo_id: profile.id, email: profile.email, domain,
              status: statusVal, source: 'domain_check',
            });
            await db.logAction(env.DB, runId, accountId, {
              klaviyo_id: profile.id, email: profile.email,
              action: 'flagged_domain', detail: domainResult.detail,
            });
            stats.stage1_flagged++;
          } else {
            stage2Queue.push({ id: profile.id, email: profile.email, domain });
            await db.upsertProfile(env.DB, accountId, {
              klaviyo_id: profile.id, email: profile.email, domain,
              status: 'pending', source: null,
            });
          }
        } catch (err) {
          console.error(`[${accountId}] Error processing profile ${profile.id}:`, err.message);
          Sentry.captureException(err, { tags: { account_id: accountId, profile_id: profile.id } });
          stats.errors++;
        }
      }

      // Update progress in DB for live status
      await db.updateRunProgress(env.DB, runId, stats);

      cursor = nextCursor;
      await setCursor(env.CONFIG, accountId, cursor);
      if (!nextCursor) break;
      await sleep(80);
    }

    // Stage 2: 3rd-party verification
    if (config.stage2_enabled && stage2Queue.length > 0) {
      const verifierKey = env.NEVERBOUNCE_API_KEY;
      if (!verifierKey) {
        console.warn(`[${accountId}] NEVERBOUNCE_API_KEY not set, skipping Stage 2`);
      } else {
        try {
          const verifier = createVerifier(config.stage2_provider, verifierKey);

          for (let i = 0; i < stage2Queue.length; i += config.stage2_batch_size) {
            const batch = stage2Queue.slice(i, i + config.stage2_batch_size);
            const emails = batch.map(p => p.email);
            const results = await verifier.verifyBatch(emails);
            stats.stage2_sent += results.length;

            for (let j = 0; j < results.length; j++) {
              const vResult = results[j];
              const profile = batch[j];

              await db.upsertProfile(env.DB, accountId, {
                klaviyo_id: profile.id, email: profile.email, domain: profile.domain,
                status: vResult.status, source: `3p_${config.stage2_provider}`, raw_result: vResult.raw,
              });

              if (vResult.status !== 'valid' && vResult.status !== 'unknown') {
                stats.stage2_invalid++;
                await db.logAction(env.DB, runId, accountId, {
                  klaviyo_id: profile.id, email: profile.email,
                  action: 'flagged_3p', detail: `${config.stage2_provider}: ${vResult.status}`,
                });
              }
            }
            // Update progress after each 3P batch
            await db.updateRunProgress(env.DB, runId, stats);
          }
        } catch (err) {
          console.error(`[${accountId}] Stage 2 verification error:`, err.message);
          Sentry.captureException(err, { tags: { account_id: accountId, stage: 'stage2' } });
          stats.errors++;
        }
      }
    }

    // Auto-suppress if enabled
    if (config.auto_suppress) {
      const invalidStatuses = ['invalid_domain', 'invalid_3p', 'disposable', 'spamtrap', 'abuse'];
      const toSuppress = [];
      for (const item of stage2Queue) {
        const profile = await db.getProfileByKlaviyoId(env.DB, accountId, item.id);
        if (profile && invalidStatuses.includes(profile.status)) {
          toSuppress.push(profile.email);
        }
      }

      if (toSuppress.length > 0) {
        try {
          await suppressProfiles(account.klaviyo_api_key, toSuppress);
          stats.suppressed = toSuppress.length;
          for (const email of toSuppress) {
            await db.logAction(env.DB, runId, accountId, {
              klaviyo_id: '', email, action: 'suppressed', detail: 'Auto-suppressed in Klaviyo',
            });
          }
        } catch (err) {
          console.error(`[${accountId}] Suppression error:`, err.message);
          Sentry.captureException(err, { tags: { account_id: accountId, stage: 'suppress' } });
          stats.errors++;
        }
      }
    }

    console.log(`[${accountId}] Run ${runId} complete:`, JSON.stringify(stats));
  } catch (err) {
    console.error(`[${accountId}] Pipeline error in run ${runId}:`, err.message);
    Sentry.captureException(err, { tags: { account_id: accountId, run_id: runId } });
    stats.status = 'failed';
    stats.errors++;
  }

  await db.finishRun(env.DB, runId, stats);

  // Send email notification if configured
  if (config.notification_emails && config.notification_emails.length > 0 && env.SENDGRID_API_KEY) {
    try {
      await sendRunNotification(env.SENDGRID_API_KEY, config.notification_emails, account, runId, stats);
    } catch (err) {
      console.error(`[${accountId}] Email notification error:`, err.message);
    }
  }

  return stats;
}

// --- Email notification ---
async function sendRunNotification(apiKey, emails, account, runId, stats) {
  const statusEmoji = stats.status === 'completed' ? 'Completed' : 'Failed';
  const subject = `List Cleaner: ${account.name} run #${runId} — ${statusEmoji}`;

  const body = `
    <h2 style="font-family:sans-serif;color:#333">Run #${runId} — ${account.name}</h2>
    <table style="font-family:sans-serif;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 16px 4px 0;color:#666">Status</td><td style="font-weight:bold;color:${stats.status === 'completed' ? '#00a86b' : '#e53935'}">${stats.status}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Profiles Fetched</td><td>${stats.profiles_fetched}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Domain Typos Found</td><td>${stats.stage1_flagged}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Sent to NeverBounce</td><td>${stats.stage2_sent}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">3P Invalid</td><td>${stats.stage2_invalid}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Suppressed</td><td>${stats.suppressed}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#666">Errors</td><td style="color:${stats.errors > 0 ? '#e53935' : '#333'}">${stats.errors}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:13px;color:#999;margin-top:16px">Sent by Klaviyo List Cleaner</p>
  `.trim();

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: emails.map(e => ({ email: e })) }],
      from: { email: 'noreply@inboxsmarts.com', name: 'List Cleaner' },
      subject,
      content: [{ type: 'text/html', value: body }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`SendGrid error: ${resp.status}`);
  }
}

// --- Export with Sentry wrapping ---
export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN || '',
    tracesSampleRate: 0.1,
  }),
  {
    async fetch(request, env, ctx) {
      return handleFetch(request, env, ctx);
    },

    async scheduled(event, env, ctx) {
      const accounts = await getAccounts(env.CONFIG);
      if (accounts.length === 0) {
        console.log('No accounts configured, skipping scheduled run');
        return;
      }

      for (const account of accounts) {
        console.log(`[cron] Starting pipeline for account: ${account.id}`);
        try {
          await runPipeline(env, account);
        } catch (err) {
          console.error(`[cron] Pipeline failed for ${account.id}:`, err.message);
          Sentry.captureException(err, { tags: { account_id: account.id, source: 'cron' } });
        }
      }
    },
  }
);
