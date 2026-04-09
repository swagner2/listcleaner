import { getConfig, setConfig, getCursor, setCursor } from './config.js';
import { fetchProfiles, fetchProfilesByList, suppressProfiles } from './klaviyo.js';
import { checkDomain } from './domain-checker.js';
import { createVerifier } from './verification.js';
import * as db from './db.js';
import { renderDashboard } from './dashboard.js';

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

// --- HTTP Handler ---
async function handleFetch(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Auth check (skip for health endpoint)
  if (path !== '/health' && !checkAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Route handling
  if (path === '/' && request.method === 'GET') {
    return handleDashboard(env);
  }
  if (path === '/health') {
    return new Response('OK', { status: 200 });
  }
  if (path === '/api/stats' && request.method === 'GET') {
    return handleStats(env);
  }
  if (path.startsWith('/api/runs/') && request.method === 'GET') {
    const runId = parseInt(path.split('/').pop());
    return handleRunDetail(env, runId);
  }
  if (path === '/api/profiles' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    return handleProfiles(env, status, page);
  }
  if (path === '/api/config' && request.method === 'GET') {
    return handleGetConfig(env);
  }
  if (path === '/api/config' && request.method === 'POST') {
    const body = await request.json();
    return handleSetConfig(env, body);
  }
  if (path === '/api/trigger' && request.method === 'POST') {
    // Run pipeline in background, return immediately
    const ctx = { waitUntil: (p) => p };
    ctx.waitUntil(runPipeline(env));
    return json({ triggered: true, message: 'Cleaning run started' }, 202);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleDashboard(env) {
  const [runs, statusSummary, config, totalProfiles] = await Promise.all([
    db.getRunStats(env.DB, 20),
    db.getStatusSummary(env.DB),
    getConfig(env.CONFIG),
    db.getTotalProfiles(env.DB),
  ]);
  const html = renderDashboard(runs.results, statusSummary.results, config, totalProfiles);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function handleStats(env) {
  const [runs, statusSummary] = await Promise.all([
    db.getRunStats(env.DB, 20),
    db.getStatusSummary(env.DB),
  ]);
  return json({ runs: runs.results, statusSummary: statusSummary.results });
}

async function handleRunDetail(env, runId) {
  const detail = await db.getRunDetail(env.DB, runId);
  if (!detail.run) return json({ error: 'Run not found' }, 404);
  return json(detail);
}

async function handleProfiles(env, status, page) {
  const profiles = await db.getProfiles(env.DB, status, page);
  return json({ profiles: profiles.results, page });
}

async function handleGetConfig(env) {
  const config = await getConfig(env.CONFIG);
  return json(config);
}

async function handleSetConfig(env, updates) {
  const config = await setConfig(env.CONFIG, updates);
  return json(config);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Cleaning Pipeline ---
async function runPipeline(env) {
  const config = await getConfig(env.CONFIG);
  const runId = await db.createRun(env.DB);

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
    const klaviyoKey = env.KLAVIYO_API_KEY;
    if (!klaviyoKey) throw new Error('KLAVIYO_API_KEY not set');

    let cursor = await getCursor(env.CONFIG);
    let totalProcessed = 0;
    const stage2Queue = []; // Emails that pass Stage 1, need 3rd-party check

    // Fetch and process profiles page by page
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
        // Reached end of all profiles — reset cursor
        await setCursor(env.CONFIG, null);
        break;
      }

      stats.profiles_fetched += profiles.length;
      totalProcessed += profiles.length;

      // Process each profile
      for (const profile of profiles) {
        try {
          // Check if recently verified
          const isStale = await db.isProfileStale(env.DB, profile.id, config.recheck_days);
          if (!isStale) continue;

          const domain = profile.email.split('@')[1] || '';

          // Stage 1: Domain check
          const domainResult = checkDomain(profile.email);

          if (!domainResult.valid) {
            const statusVal = domainResult.reason === 'disposable_domain'
              ? 'disposable'
              : 'invalid_domain';

            await db.upsertProfile(env.DB, {
              klaviyo_id: profile.id,
              email: profile.email,
              domain,
              status: statusVal,
              source: 'domain_check',
            });

            await db.logAction(env.DB, runId, {
              klaviyo_id: profile.id,
              email: profile.email,
              action: 'flagged_domain',
              detail: domainResult.detail,
            });

            stats.stage1_flagged++;
          } else {
            // Domain looks fine — queue for Stage 2 if enabled
            stage2Queue.push({ id: profile.id, email: profile.email, domain });

            // Upsert as pending for now
            await db.upsertProfile(env.DB, {
              klaviyo_id: profile.id,
              email: profile.email,
              domain,
              status: 'pending',
              source: null,
            });
          }
        } catch (err) {
          console.error(`Error processing profile ${profile.id}:`, err.message);
          stats.errors++;
        }
      }

      // Save cursor for next page / next run
      cursor = nextCursor;
      await setCursor(env.CONFIG, cursor);

      if (!nextCursor) {
        // Reached end of all profiles
        break;
      }

      // Small delay between Klaviyo pages
      await sleep(80);
    }

    // Stage 2: 3rd-party verification
    if (config.stage2_enabled && stage2Queue.length > 0) {
      const verifierKey = env.NEVERBOUNCE_API_KEY;
      if (!verifierKey) {
        console.warn('NEVERBOUNCE_API_KEY not set, skipping Stage 2');
      } else {
        try {
          const verifier = createVerifier(config.stage2_provider, verifierKey);

          // Process in batches
          for (let i = 0; i < stage2Queue.length; i += config.stage2_batch_size) {
            const batch = stage2Queue.slice(i, i + config.stage2_batch_size);
            const emails = batch.map(p => p.email);
            const results = await verifier.verifyBatch(emails);

            stats.stage2_sent += results.length;

            for (let j = 0; j < results.length; j++) {
              const vResult = results[j];
              const profile = batch[j];

              await db.upsertProfile(env.DB, {
                klaviyo_id: profile.id,
                email: profile.email,
                domain: profile.domain,
                status: vResult.status,
                source: `3p_${config.stage2_provider}`,
                raw_result: vResult.raw,
              });

              if (vResult.status !== 'valid' && vResult.status !== 'unknown') {
                stats.stage2_invalid++;

                await db.logAction(env.DB, runId, {
                  klaviyo_id: profile.id,
                  email: profile.email,
                  action: 'flagged_3p',
                  detail: `${config.stage2_provider}: ${vResult.status}`,
                });
              }
            }
          }
        } catch (err) {
          console.error('Stage 2 verification error:', err.message);
          stats.errors++;
        }
      }
    }

    // Auto-suppress if enabled
    if (config.auto_suppress) {
      const invalidStatuses = ['invalid_domain', 'invalid_3p', 'disposable', 'spamtrap', 'abuse'];
      // Get all profiles flagged in this run that need suppression
      const toSuppress = [];
      for (const item of stage2Queue) {
        const profile = await db.getProfileByKlaviyoId(env.DB, item.id);
        if (profile && invalidStatuses.includes(profile.status)) {
          toSuppress.push(profile.email);
        }
      }

      if (toSuppress.length > 0) {
        try {
          await suppressProfiles(klaviyoKey, toSuppress);
          stats.suppressed = toSuppress.length;

          for (const email of toSuppress) {
            await db.logAction(env.DB, runId, {
              klaviyo_id: '',
              email,
              action: 'suppressed',
              detail: 'Auto-suppressed in Klaviyo',
            });
          }
        } catch (err) {
          console.error('Suppression error:', err.message);
          stats.errors++;
        }
      }
    }

    console.log(`Run ${runId} complete:`, JSON.stringify(stats));
  } catch (err) {
    console.error(`Pipeline error in run ${runId}:`, err.message);
    stats.status = 'failed';
    stats.errors++;
  }

  await db.finishRun(env.DB, runId, stats);
  return stats;
}

// --- Export ---
export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPipeline(env));
  },
};
