const STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #060810;
      color: #e0e8f0;
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    a { color: #7ec8f5; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { color: #00e5a0; margin-bottom: 8px; font-size: 24px; }
    h2 { color: #7ec8f5; margin: 32px 0 16px; font-size: 18px; }
    .subtitle { color: #7aaad4; margin-bottom: 24px; font-size: 14px; }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .card {
      background: #0d1a2e;
      border: 1px solid #1a2d4a;
      border-radius: 8px;
      padding: 20px;
    }
    .card.clickable { cursor: pointer; transition: border-color 0.2s; }
    .card.clickable:hover { border-color: #00e5a0; }
    .card .label { color: #7aaad4; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .card .value { font-size: 28px; font-weight: 700; color: #fff; margin-top: 4px; }
    .card .value.green { color: #00e5a0; }
    .card .value.red { color: #ff6b8a; }
    .card .value.yellow { color: #ffd166; }
    .card .name { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    .card .meta { color: #7aaad4; font-size: 13px; margin-top: 4px; }

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
    .btn.secondary { background: #1a2d4a; color: #e0e8f0; }
    .btn.secondary:hover { background: #243c5e; }

    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #7aaad4; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; }

    .form-row { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .form-row input {
      background: #0d1a2e;
      border: 1px solid #1a2d4a;
      border-radius: 6px;
      padding: 10px 14px;
      color: #e0e8f0;
      font-size: 14px;
      flex: 1;
      min-width: 150px;
    }
    .form-row input::placeholder { color: #555; }
    .form-row input:focus { outline: none; border-color: #00e5a0; }

    .breadcrumb { margin-bottom: 16px; font-size: 14px; }

    @media (max-width: 600px) {
      body { padding: 16px; }
      .cards { grid-template-columns: 1fr; }
      .form-row { flex-direction: column; }
    }
`;

// --- Account list page ---
export function renderAccountList(accounts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Klaviyo List Cleaner</title>
  <style>${STYLES}</style>
</head>
<body>
  <h1>Klaviyo List Cleaner</h1>
  <p class="subtitle">Multi-account email verification dashboard</p>

  <h2>Accounts</h2>
  ${accounts.length > 0 ? `
  <div class="cards">
    ${accounts.map(a => `
      <div class="card clickable" onclick="location.href='/accounts/${a.id}'">
        <div class="name">${escapeHtml(a.name)}</div>
        <div class="meta">${a.totalProfiles.toLocaleString()} profiles</div>
        <div class="meta">Last run: ${a.lastRun ? formatDate(a.lastRun.started_at) : 'Never'}</div>
        ${a.lastRun ? `<div class="meta">Status: <span class="status-badge ${a.lastRun.status}">${a.lastRun.status}</span></div>` : ''}
      </div>
    `).join('')}
  </div>
  ` : '<p style="color:#7aaad4;margin:16px 0">No accounts configured yet. Add one below.</p>'}

  <div style="margin:24px 0">
    <a href="/domain-lists" class="btn secondary" style="text-decoration:none">Edit Domain Lists</a>
  </div>

  <h2>Add Account</h2>
  <div class="form-row">
    <input type="text" id="acctId" placeholder="Account ID (e.g., acme)" />
    <input type="text" id="acctName" placeholder="Display name (e.g., Acme Corp)" />
    <input type="text" id="acctKey" placeholder="Klaviyo API key (pk_xxx)" />
    <button class="btn" onclick="addAccount()" id="addBtn">Add Account</button>
  </div>
  <p id="addMsg" style="margin-top:8px;font-size:13px;color:#7aaad4"></p>

  <script>
    async function addAccount() {
      const id = document.getElementById('acctId').value.trim();
      const name = document.getElementById('acctName').value.trim();
      const key = document.getElementById('acctKey').value.trim();
      const msg = document.getElementById('addMsg');
      const btn = document.getElementById('addBtn');
      if (!id || !name || !key) { msg.textContent = 'All fields required'; msg.style.color = '#ff6b8a'; return; }
      btn.disabled = true;
      btn.textContent = 'Validating API key...';
      msg.textContent = 'Connecting to Klaviyo and counting profiles — this may take a moment...';
      msg.style.color = '#7aaad4';
      try {
        const resp = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, klaviyo_api_key: key })
        });
        const data = await resp.json();
        if (resp.ok) {
          const count = data.klaviyo_profile_count != null ? data.klaviyo_profile_count.toLocaleString() : '?';
          msg.textContent = 'Account added! ' + count + ' profiles found in Klaviyo.';
          msg.style.color = '#00e5a0';
          setTimeout(() => location.reload(), 2000);
        } else {
          msg.textContent = data.error || 'Error adding account';
          msg.style.color = '#ff6b8a';
          btn.disabled = false;
          btn.textContent = 'Add Account';
        }
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = '#ff6b8a';
        btn.disabled = false;
        btn.textContent = 'Add Account';
      }
    }
  </script>
</body>
</html>`;
}

// --- Per-account dashboard ---
export function renderDashboard(account, runs, statusSummary, config, totalProfiles) {
  const totalInvalid = statusSummary
    .filter(s => s.status !== 'valid' && s.status !== 'pending')
    .reduce((sum, s) => sum + s.count, 0);

  const lastRun = runs.length > 0 ? runs[0] : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(account.name)} — Klaviyo List Cleaner</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="breadcrumb"><a href="/">All Accounts</a> / ${escapeHtml(account.name)}</div>
  <h1>${escapeHtml(account.name)}</h1>
  <p class="subtitle">Account: ${escapeHtml(account.id)} — ${totalProfiles} profiles tracked</p>

  <div id="statusBanner" style="display:none;background:#0d2a1e;border:1px solid #00e5a0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="width:10px;height:10px;border-radius:50%;background:#00e5a0;animation:pulse 1.5s infinite"></div>
      <strong style="color:#00e5a0">Run in progress</strong>
      <span id="statusRunId" style="color:#7aaad4;font-size:13px"></span>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px;color:#7aaad4">
      <span>Fetched: <strong id="statusFetched" style="color:#fff">0</strong></span>
      <span>Domain typos: <strong id="statusFlagged" style="color:#ff6b8a">0</strong></span>
      <span>3P sent: <strong id="statusSent" style="color:#fff">0</strong></span>
      <span>3P invalid: <strong id="statusInvalid" style="color:#ff6b8a">0</strong></span>
      <span>Errors: <strong id="statusErrors" style="color:#fff">0</strong></span>
    </div>
  </div>
  <style>@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }</style>

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
          <td><a href="/accounts/${account.id}/api/runs/${r.id}">#${r.id}</a></td>
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
    ${renderConfigInput('max_profiles_per_run', config.max_profiles_per_run, 'number', 'Max profiles per run')}
    ${renderConfigInput('batch_size', config.batch_size, 'number', 'Batch size (Klaviyo page size)')}
    ${renderConfigToggle('stage2_enabled', config.stage2_enabled, 'NeverBounce verification')}
    ${renderConfigInput('stage2_provider', config.stage2_provider, 'text', 'Verification provider')}
    ${renderConfigInput('stage2_batch_size', config.stage2_batch_size, 'number', '3P batch size')}
    ${renderConfigToggle('auto_suppress', config.auto_suppress, 'Auto-suppress invalid profiles')}
    ${renderConfigInput('recheck_days', config.recheck_days, 'number', 'Recheck interval (days)')}
    ${renderConfigInput('klaviyo_list_id', config.klaviyo_list_id || '', 'text', 'Klaviyo list ID (blank = all)')}
    ${renderConfigInput('notification_emails', (config.notification_emails || []).join(', '), 'text', 'Notification emails (comma-separated)')}
  </div>

  <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
    <button class="btn" onclick="saveConfig()" id="saveBtn">Save Configuration</button>
    <span id="saveMsg" style="font-size:13px;color:#7aaad4"></span>
  </div>

  <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap">
    <button class="btn" onclick="triggerRun('full')" id="triggerBtn">Run Full Scan</button>
    <button class="btn secondary" onclick="triggerRun('spellcheck')" id="spellcheckBtn">Spell Check Only</button>
    <a href="/domain-lists" class="btn secondary" style="text-decoration:none">Edit Domain Lists</a>
  </div>

  <script>
    async function saveConfig() {
      const btn = document.getElementById('saveBtn');
      const msg = document.getElementById('saveMsg');
      btn.disabled = true;
      msg.textContent = 'Saving...';
      msg.style.color = '#7aaad4';

      const config = {};
      document.querySelectorAll('[data-config-key]').forEach(el => {
        const key = el.dataset.configKey;
        const type = el.dataset.configType;
        if (type === 'toggle') {
          config[key] = el.checked;
        } else if (key === 'notification_emails') {
          config[key] = el.value ? el.value.split(',').map(e => e.trim()).filter(Boolean) : [];
        } else if (type === 'number') {
          config[key] = parseInt(el.value) || 0;
        } else {
          config[key] = el.value || null;
        }
      });

      try {
        const resp = await fetch('/accounts/${account.id}/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        if (resp.ok) {
          msg.textContent = 'Saved!';
          msg.style.color = '#00e5a0';
          setTimeout(() => { msg.textContent = ''; }, 2000);
        } else {
          const data = await resp.json();
          msg.textContent = data.error || 'Error saving';
          msg.style.color = '#ff6b8a';
        }
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = '#ff6b8a';
      }
      btn.disabled = false;
    }

    async function triggerRun(mode) {
      const btn = mode === 'spellcheck' ? document.getElementById('spellcheckBtn') : document.getElementById('triggerBtn');
      btn.disabled = true;
      btn.textContent = 'Starting...';
      try {
        const resp = await fetch('/accounts/${account.id}/api/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
        const data = await resp.json();
        btn.textContent = mode === 'spellcheck' ? 'Spell check running...' : 'Running...';
        pollStatus();
      } catch (err) {
        btn.textContent = 'Error — try again';
        btn.disabled = false;
      }
    }

    // Poll for live run status
    let pollInterval = null;
    async function pollStatus() {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        try {
          const resp = await fetch('/accounts/${account.id}/api/status');
          const data = await resp.json();
          const banner = document.getElementById('statusBanner');
          if (data.running) {
            banner.style.display = 'block';
            document.getElementById('statusRunId').textContent = '#' + data.run_id;
            document.getElementById('statusFetched').textContent = data.profiles_fetched;
            document.getElementById('statusFlagged').textContent = data.stage1_flagged;
            document.getElementById('statusSent').textContent = data.stage2_sent;
            document.getElementById('statusInvalid').textContent = data.stage2_invalid;
            document.getElementById('statusErrors').textContent = data.errors;
          } else {
            banner.style.display = 'none';
            clearInterval(pollInterval);
            pollInterval = null;
            document.getElementById('triggerBtn').disabled = false;
            document.getElementById('triggerBtn').textContent = 'Run Full Scan';
            document.getElementById('spellcheckBtn').disabled = false;
            document.getElementById('spellcheckBtn').textContent = 'Spell Check Only';
            location.reload();
          }
        } catch (e) {}
      }, 3000);
    }

    // Check on page load if a run is active
    pollStatus();
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

function renderConfigInput(key, value, type, label) {
  return `<div class="config-item">
    <div>
      <span class="config-key">${key}</span>
      <div style="font-size:11px;color:#556;margin-top:2px">${label}</div>
    </div>
    <input type="${type}" value="${escapeHtml(String(value))}"
      data-config-key="${key}" data-config-type="${type}"
      style="background:#0a1525;border:1px solid #1a2d4a;border-radius:4px;padding:6px 10px;color:#fff;font-size:14px;width:140px;text-align:right"
    />
  </div>`;
}

function renderConfigToggle(key, value, label) {
  return `<div class="config-item">
    <div>
      <span class="config-key">${key}</span>
      <div style="font-size:11px;color:#556;margin-top:2px">${label}</div>
    </div>
    <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer">
      <input type="checkbox" ${value ? 'checked' : ''}
        data-config-key="${key}" data-config-type="toggle"
        style="opacity:0;width:0;height:0"
      />
      <span style="position:absolute;inset:0;background:${value ? '#00e5a0' : '#1a2d4a'};border-radius:13px;transition:0.2s"
        onclick="this.style.background=this.previousElementSibling.checked?'#1a2d4a':'#00e5a0'"></span>
      <span style="position:absolute;top:3px;left:${value ? '25px' : '3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:0.2s"
        onclick="const c=this.parentElement.querySelector('input');c.checked=!c.checked;this.style.left=c.checked?'25px':'3px';this.previousElementSibling.style.background=c.checked?'#00e5a0':'#1a2d4a'"></span>
    </label>
  </div>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Domain lists editor page ---
export function renderDomainListsPage(corrections, safeDomains, disposableDomains) {
  // Group corrections by target domain for display
  const grouped = {};
  for (const [typo, correct] of Object.entries(corrections)) {
    if (!grouped[correct]) grouped[correct] = [];
    grouped[correct].push(typo);
  }

  const correctionRows = Object.entries(corrections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([typo, correct]) => `${typo} → ${correct}`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Domain Lists — Klaviyo List Cleaner</title>
  <style>${STYLES}
    textarea {
      width: 100%;
      background: #0a1525;
      border: 1px solid #1a2d4a;
      border-radius: 6px;
      padding: 12px;
      color: #e0e8f0;
      font-family: monospace;
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
    }
    textarea:focus { outline: none; border-color: #00e5a0; }
    .section { margin-bottom: 32px; }
    .section-desc { color: #7aaad4; font-size: 13px; margin-bottom: 8px; }
    .count { color: #7aaad4; font-size: 12px; margin-top: 4px; }
    .add-row { display: flex; gap: 8px; margin-top: 12px; }
    .add-row input {
      background: #0a1525; border: 1px solid #1a2d4a; border-radius: 4px;
      padding: 8px 12px; color: #e0e8f0; font-size: 14px; flex: 1;
    }
    .add-row input:focus { outline: none; border-color: #00e5a0; }
  </style>
</head>
<body>
  <div class="breadcrumb"><a href="/">All Accounts</a> / Domain Lists</div>
  <h1>Domain Lists</h1>
  <p class="subtitle">Master lists shared across all accounts. Changes take effect on the next run.</p>

  <div class="section">
    <h2>Misspelled Domains</h2>
    <p class="section-desc">One entry per line: <code>typo.com → correct.com</code>. These emails get flagged as invalid.</p>
    <textarea id="corrections" rows="20">${escapeHtml(correctionRows)}</textarea>
    <p class="count" id="corrCount">${Object.keys(corrections).length} entries</p>
    <div class="add-row">
      <input type="text" id="addTypo" placeholder="Misspelled domain (e.g., gmial.com)" />
      <input type="text" id="addCorrect" placeholder="Correct domain (e.g., gmail.com)" />
      <button class="btn" onclick="addCorrection()" style="margin:0;white-space:nowrap">Add</button>
    </div>
  </div>

  <div class="section">
    <h2>Disposable Domains</h2>
    <p class="section-desc">One domain per line. Emails from these domains are flagged as disposable.</p>
    <textarea id="disposable" rows="10">${escapeHtml(disposableDomains.join('\n'))}</textarea>
    <p class="count">${disposableDomains.length} entries</p>
  </div>

  <div class="section">
    <h2>Safe Domains (Do Not Flag)</h2>
    <p class="section-desc">One domain per line. These look like typos but are real providers (e.g., gmx.com).</p>
    <textarea id="safe" rows="5">${escapeHtml(safeDomains.join('\n'))}</textarea>
    <p class="count">${safeDomains.length} entries</p>
  </div>

  <div style="display:flex;gap:12px;align-items:center">
    <button class="btn" onclick="saveLists()" id="saveBtn">Save All Lists</button>
    <span id="saveMsg" style="font-size:13px;color:#7aaad4"></span>
  </div>

  <script>
    function addCorrection() {
      const typo = document.getElementById('addTypo').value.trim().toLowerCase();
      const correct = document.getElementById('addCorrect').value.trim().toLowerCase();
      if (!typo || !correct) return;
      const textarea = document.getElementById('corrections');
      textarea.value = textarea.value.trim() + '\\n' + typo + ' → ' + correct;
      document.getElementById('addTypo').value = '';
      document.getElementById('addCorrect').value = '';
      updateCount();
    }

    function updateCount() {
      const lines = document.getElementById('corrections').value.trim().split('\\n').filter(l => l.includes('→')).length;
      document.getElementById('corrCount').textContent = lines + ' entries';
    }

    function parseCorrections(text) {
      const result = {};
      text.trim().split('\\n').forEach(line => {
        line = line.trim();
        if (!line || !line.includes('→')) return;
        const [typo, correct] = line.split('→').map(s => s.trim().toLowerCase());
        if (typo && correct) result[typo] = correct;
      });
      return result;
    }

    function parseList(text) {
      return text.trim().split('\\n').map(l => l.trim().toLowerCase()).filter(Boolean);
    }

    async function saveLists() {
      const btn = document.getElementById('saveBtn');
      const msg = document.getElementById('saveMsg');
      btn.disabled = true;
      msg.textContent = 'Saving...';
      msg.style.color = '#7aaad4';

      const body = {
        corrections: parseCorrections(document.getElementById('corrections').value),
        disposable_domains: parseList(document.getElementById('disposable').value),
        safe_domains: parseList(document.getElementById('safe').value),
      };

      try {
        const resp = await fetch('/api/domain-lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (resp.ok) {
          msg.textContent = 'Saved! Changes will apply on the next run.';
          msg.style.color = '#00e5a0';
          setTimeout(() => { msg.textContent = ''; }, 3000);
        } else {
          msg.textContent = 'Error saving';
          msg.style.color = '#ff6b8a';
        }
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.style.color = '#ff6b8a';
      }
      btn.disabled = false;
    }

    document.getElementById('corrections').addEventListener('input', updateCount);
  </script>
</body>
</html>`;
}
