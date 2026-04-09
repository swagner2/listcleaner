const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

function headers(apiKey) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'revision': REVISION,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate a Klaviyo API key and get the total profile count.
 * Uses the profile count endpoint (POST /api/profile-count) if available,
 * otherwise estimates by paginating with minimal fields.
 */
export async function getProfileCount(apiKey) {
  // First, validate the key with a minimal request
  const testResp = await fetch(`${KLAVIYO_BASE}/profiles/?page[size]=1&fields[profile]=email`, {
    headers: headers(apiKey),
  });

  if (testResp.status === 401 || testResp.status === 403) {
    throw new Error('Invalid Klaviyo API key');
  }
  if (!testResp.ok) {
    throw new Error(`Klaviyo API error: ${testResp.status}`);
  }

  // Count profiles by paginating with max page size, minimal fields
  let count = 0;
  let cursor = null;

  while (true) {
    let url = `${KLAVIYO_BASE}/profiles/?page[size]=100&fields[profile]=email`;
    if (cursor) url += `&page[cursor]=${encodeURIComponent(cursor)}`;

    const resp = await fetch(url, { headers: headers(apiKey) });
    if (!resp.ok) break;

    const data = await resp.json();
    count += (data.data || []).length;

    if (!data.links?.next) break;
    const nextUrl = new URL(data.links.next);
    cursor = nextUrl.searchParams.get('page[cursor]');
    if (!cursor) break;

    await sleep(80);
  }

  return {
    valid: true,
    profile_count: count,
  };
}

/**
 * Fetch a page of profiles from Klaviyo.
 * Returns { profiles: [{ id, email }], nextCursor: string|null }
 */
export async function fetchProfiles(apiKey, cursor = null, pageSize = 50) {
  let url = `${KLAVIYO_BASE}/profiles/?page[size]=${pageSize}`;
  if (cursor) {
    url += `&page[cursor]=${encodeURIComponent(cursor)}`;
  }

  const resp = await fetch(url, { headers: headers(apiKey) });

  if (resp.status === 429) {
    // Rate limited — wait 1s and retry once
    console.log('Klaviyo rate limited, waiting 1s...');
    await sleep(1000);
    const retry = await fetch(url, { headers: headers(apiKey) });
    if (!retry.ok) {
      throw new Error(`Klaviyo API error after retry: ${retry.status} ${await retry.text()}`);
    }
    return parseProfilesResponse(await retry.json());
  }

  if (!resp.ok) {
    throw new Error(`Klaviyo API error: ${resp.status} ${await resp.text()}`);
  }

  return parseProfilesResponse(await resp.json());
}

/**
 * Fetch profiles from a specific Klaviyo list.
 */
export async function fetchProfilesByList(apiKey, listId, cursor = null, pageSize = 50) {
  let url = `${KLAVIYO_BASE}/lists/${listId}/profiles/?page[size]=${pageSize}`;
  if (cursor) {
    url += `&page[cursor]=${encodeURIComponent(cursor)}`;
  }

  const resp = await fetch(url, { headers: headers(apiKey) });

  if (resp.status === 429) {
    console.log('Klaviyo rate limited, waiting 1s...');
    await sleep(1000);
    const retry = await fetch(url, { headers: headers(apiKey) });
    if (!retry.ok) {
      throw new Error(`Klaviyo list API error after retry: ${retry.status}`);
    }
    return parseProfilesResponse(await retry.json());
  }

  if (!resp.ok) {
    throw new Error(`Klaviyo list API error: ${resp.status}`);
  }

  return parseProfilesResponse(await resp.json());
}

function parseProfilesResponse(data) {
  const profiles = (data.data || [])
    .filter(p => p.attributes?.email)
    .map(p => ({
      id: p.id,
      email: p.attributes.email.toLowerCase().trim(),
    }));

  let nextCursor = null;
  if (data.links?.next) {
    const nextUrl = new URL(data.links.next);
    nextCursor = nextUrl.searchParams.get('page[cursor]');
  }

  return { profiles, nextCursor };
}

/**
 * Suppress profiles in Klaviyo (bulk, up to 100 at a time).
 * Accepts an array of email strings.
 */
export async function suppressProfiles(apiKey, emails) {
  const batches = [];
  for (let i = 0; i < emails.length; i += 100) {
    batches.push(emails.slice(i, i + 100));
  }

  const results = [];
  for (const batch of batches) {
    const body = {
      data: {
        type: 'profile-suppression-bulk-create-job',
        attributes: {
          profiles: {
            data: batch.map(email => ({
              type: 'profile',
              attributes: { email },
            })),
          },
        },
      },
    };

    const resp = await fetch(`${KLAVIYO_BASE}/profile-suppression-bulk-create-jobs/`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      console.log('Klaviyo suppress rate limited, waiting 1s...');
      await sleep(1000);
      const retry = await fetch(`${KLAVIYO_BASE}/profile-suppression-bulk-create-jobs/`, {
        method: 'POST',
        headers: headers(apiKey),
        body: JSON.stringify(body),
      });
      results.push({ status: retry.status, ok: retry.ok, count: batch.length });
    } else {
      results.push({ status: resp.status, ok: resp.ok, count: batch.length });
    }

    // Small delay between batches
    await sleep(100);
  }

  return results;
}
