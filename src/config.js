const DEFAULTS = {
  batch_size: 50,
  max_profiles_per_run: 500,
  stage2_enabled: true,
  stage2_provider: 'neverbounce',
  stage2_batch_size: 25,
  auto_suppress: false,
  recheck_days: 30,
  klaviyo_list_id: null,
};

// --- Account management ---

export async function getAccounts(kv) {
  const accounts = await kv.get('accounts', { type: 'json' });
  return accounts || [];
}

export async function addAccount(kv, account) {
  const accounts = await getAccounts(kv);
  if (accounts.find(a => a.id === account.id)) {
    throw new Error(`Account "${account.id}" already exists`);
  }
  accounts.push({
    id: account.id,
    name: account.name,
    klaviyo_api_key: account.klaviyo_api_key,
  });
  await kv.put('accounts', JSON.stringify(accounts));
  return account;
}

export async function updateAccount(kv, id, updates) {
  const accounts = await getAccounts(kv);
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error(`Account "${id}" not found`);
  accounts[idx] = { ...accounts[idx], ...updates, id }; // id is immutable
  await kv.put('accounts', JSON.stringify(accounts));
  return accounts[idx];
}

export async function removeAccount(kv, id) {
  const accounts = await getAccounts(kv);
  const filtered = accounts.filter(a => a.id !== id);
  if (filtered.length === accounts.length) {
    throw new Error(`Account "${id}" not found`);
  }
  await kv.put('accounts', JSON.stringify(filtered));
  // Clean up per-account keys
  await kv.delete(`config:${id}`);
  await kv.delete(`cursor:${id}`);
}

export async function getAccount(kv, id) {
  const accounts = await getAccounts(kv);
  return accounts.find(a => a.id === id) || null;
}

// --- Per-account config ---

export async function getConfig(kv, accountId) {
  const stored = await kv.get(`config:${accountId}`, { type: 'json' });
  return { ...DEFAULTS, ...(stored || {}) };
}

export async function setConfig(kv, accountId, updates) {
  const current = await getConfig(kv, accountId);
  const merged = { ...current, ...updates };
  await kv.put(`config:${accountId}`, JSON.stringify(merged));
  return merged;
}

// --- Per-account cursor ---

export async function getCursor(kv, accountId) {
  return await kv.get(`cursor:${accountId}`);
}

export async function setCursor(kv, accountId, cursor) {
  if (cursor) {
    await kv.put(`cursor:${accountId}`, cursor);
  } else {
    await kv.delete(`cursor:${accountId}`);
  }
}
