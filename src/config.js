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

export async function getConfig(kv) {
  const stored = await kv.get('config', { type: 'json' });
  return { ...DEFAULTS, ...(stored || {}) };
}

export async function setConfig(kv, updates) {
  const current = await getConfig(kv);
  const merged = { ...current, ...updates };
  await kv.put('config', JSON.stringify(merged));
  return merged;
}

export async function getCursor(kv) {
  return await kv.get('pagination_cursor');
}

export async function setCursor(kv, cursor) {
  if (cursor) {
    await kv.put('pagination_cursor', cursor);
  } else {
    await kv.delete('pagination_cursor');
  }
}
