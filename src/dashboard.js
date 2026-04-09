export function renderDashboard(runs, statusSummary, config, totalProfiles) {
  const totalInvalid = statusSummary
    .filter(s => s.status !== 'valid' && s.status !== 'pending')
    .reduce((sum, s) => sum + s.count, 0);

  const lastRun = runs.length > 0 ? runs[0] : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Klaviyo List Cleaner</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #060810;
      color: #e0e8f0;
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { color: #00e5a0; margin-bottom: 8px; font-size: 24px; }
    h2 { color: #7ec8f5; margin: 32px 0 16px; font-size: 18px; }
    .subtitle { color: #7aaad4; margin-bottom: 24px; font-size: 14px; }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .card {
      background: #0d1a2e;
      border: 1px solid #1a2d4a;
      border-radius: 8px;
      padding: 20px;
    }
    .card .label { color: #7aaad4; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .card .value { font-size: 28px; font-weight: 700; color: #fff; margin-top: 4px; }
    .card .value.green { color: #00e5a0; }
    .card .value.red { color: #ff6b8a; }
    .card .value.yellow { color: #ffd166; }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #0d1a2e;
      border-radius: 8px;
      overflow: hidden;
    }
    th { background: #0a1525; color: #7aaad4; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; text-align: left; padding: 12px 16px; }
    td { padding: 10px 16px; border-top: 1px solid #1a2d4a; font-size: 14px; }
    tr:hover { background: #111f35; }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-badge.completed { background: #00e5a033; color: #00e5a0; }
    .status-badge.running { background: #ffd16633; color: #ffd166; }
    .status-badge.failed { background: #ff6b8a33; color: #ff6b8a; }

    .bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin: 8px 0; }
    .bar-seg { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; min-width: 30px; }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
    }
    .config-item {
      background: #0d1a2e;
      border: 1px solid #1a2d4a;
      border-radius: 6px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .config-key { color: #7aaad4; font-size: 13px; font-family: monospace; }
    .config-val { color: #fff; font-weight: 600; font-size: 14px; }

    .btn {
      display: inline-block;
      background: #00e5a0;
      color: #060810;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      margin-top: 16px;
    }
    .btn:hover { background: #00cc8e; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #7aaad4; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; }

    @media (max-width: 600px) {
      body { padding: 16px; }
      .cards { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <h1>Klaviyo List Cleaner</h1>
  <p class="subtitle">Email verification dashboard — ${totalProfiles} profiles tracked</p>

  <div class="cards">
    <div class="card">
      <div class="label">Total Profiles</div>
      <div class="value">${totalProfiles.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="label">Invalid Found</div>
      <div class="value red">${totalInvalid.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="label">Last Run</div>
      <div class="value" style="font-size:14px">${lastRun ? formatDate(lastRun.started_at) : 'Never'}</div>
    </div>
    <div class="card">
      <div class="label">Last Run Status</div>
      <div class="value ${lastRun?.status === 'completed' ? 'green' : lastRun?.status === 'failed' ? 'red' : 'yellow'}">${lastRun?.status || '—'}</div>
    </div>
  </div>

  ${renderStatusBar(statusSummary, totalProfiles)}

  <h2>Run History</h2>
  <table>
    <thead>
      <tr>
        <th>Run</th>
        <th>Started</th>
        <th>Fetched</th>
        <th>Domain Typos</th>
        <th>3P Sent</th>
        <th>3P Invalid</th>
        <th>Suppressed</th>
        <th>Errors</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${runs.map(r => `
        <tr>
          <td><a href="/api/runs/${r.id}" style="color:#7ec8f5">#${r.id}</a></td>
          <td>${formatDate(r.started_at)}</td>
          <td>${r.profiles_fetched}</td>
          <td>${r.stage1_flagged}</td>
          <td>${r.stage2_sent}</td>
          <td>${r.stage2_invalid}</td>
          <td>${r.suppressed}</td>
          <td>${r.errors > 0 ? `<span style="color:#ff6b8a">${r.errors}</span>` : '0'}</td>
          <td><span class="status-badge ${r.status}">${r.status}</span></td>
        </tr>
      `).join('')}
      ${runs.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:#7aaad4;padding:24px">No runs yet. Trigger one below or wait for the cron schedule.</td></tr>' : ''}
    </tbody>
  </table>

  <h2>Configuration</h2>
  <div class="config-grid">
    ${renderConfigItem('max_profiles_per_run', config.max_profiles_per_run)}
    ${renderConfigItem('batch_size', config.batch_size)}
    ${renderConfigItem('stage2_enabled', config.stage2_enabled)}
    ${renderConfigItem('stage2_provider', config.stage2_provider)}
    ${renderConfigItem('stage2_batch_size', config.stage2_batch_size)}
    ${renderConfigItem('auto_suppress', config.auto_suppress)}
    ${renderConfigItem('recheck_days', config.recheck_days)}
    ${renderConfigItem('klaviyo_list_id', config.klaviyo_list_id || 'all profiles')}
  </div>

  <button class="btn" onclick="triggerRun()" id="triggerBtn">Run Now</button>

  <script>
    async function triggerRun() {
      const btn = document.getElementById('triggerBtn');
      btn.disabled = true;
      btn.textContent = 'Starting...';
      try {
        const resp = await fetch('/api/trigger', { method: 'POST' });
        const data = await resp.json();
        btn.textContent = 'Started! Refresh to see results.';
        setTimeout(() => location.reload(), 5000);
      } catch (err) {
        btn.textContent = 'Error — try again';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

function renderStatusBar(statusSummary, total) {
  if (total === 0) return '';

  const colors = {
    valid: '#00e5a0',
    pending: '#7aaad4',
    invalid_domain: '#ff6b8a',
    invalid_3p: '#ff4466',
    disposable: '#ffa500',
    catch_all: '#ffd166',
    spamtrap: '#cc33ff',
    abuse: '#ff3333',
    unknown: '#555',
    suppressed: '#666',
  };

  const segments = statusSummary
    .filter(s => s.count > 0)
    .map(s => {
      const pct = ((s.count / total) * 100).toFixed(1);
      return `<div class="bar-seg" style="width:${pct}%;background:${colors[s.status] || '#444'}" title="${s.status}: ${s.count}">${pct > 5 ? `${s.count}` : ''}</div>`;
    })
    .join('');

  const legendItems = statusSummary
    .filter(s => s.count > 0)
    .map(s => `<div class="legend-item"><div class="legend-dot" style="background:${colors[s.status] || '#444'}"></div>${s.status} (${s.count})</div>`)
    .join('');

  return `
    <h2>Status Breakdown</h2>
    <div class="bar">${segments}</div>
    <div class="legend">${legendItems}</div>
  `;
}

function renderConfigItem(key, value) {
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return `<div class="config-item"><span class="config-key">${key}</span><span class="config-val">${display}</span></div>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
