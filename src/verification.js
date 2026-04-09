function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Factory for creating a verification provider.
 * Add new providers by implementing verify(email) and verifyBatch(emails).
 */
export function createVerifier(provider, apiKey) {
  switch (provider) {
    case 'neverbounce':
      return new NeverBounceVerifier(apiKey);
    default:
      throw new Error(`Unknown verification provider: ${provider}`);
  }
}

class NeverBounceVerifier {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Verify a single email via NeverBounce.
   * Endpoint: GET https://api.neverbounce.com/v4/single/check
   * Returns { email, status, raw }
   */
  async verify(email) {
    const url = new URL('https://api.neverbounce.com/v4/single/check');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('email', email);

    const resp = await fetch(url.toString());

    if (!resp.ok) {
      return {
        email,
        status: 'unknown',
        raw: { error: `HTTP ${resp.status}` },
      };
    }

    const data = await resp.json();

    if (data.status === 'success') {
      return {
        email,
        status: this.mapResult(data.result),
        raw: data,
      };
    }

    return {
      email,
      status: 'unknown',
      raw: data,
    };
  }

  /**
   * Map NeverBounce result codes to internal status.
   * NeverBounce results: 0=valid, 1=invalid, 2=disposable, 3=catchall, 4=unknown
   */
  mapResult(result) {
    const map = {
      0: 'valid',
      1: 'invalid_3p',
      2: 'disposable',
      3: 'catch_all',
      4: 'unknown',
      'valid': 'valid',
      'invalid': 'invalid_3p',
      'disposable': 'disposable',
      'catchall': 'catch_all',
      'unknown': 'unknown',
    };
    return map[result] || 'unknown';
  }

  /**
   * Verify a batch of emails with rate limiting.
   * NeverBounce single API: keep to ~8 requests/sec to be safe.
   */
  async verifyBatch(emails) {
    const results = [];
    for (const email of emails) {
      try {
        const result = await this.verify(email);
        results.push(result);
      } catch (err) {
        console.error(`Verification error for ${email}:`, err.message);
        results.push({
          email,
          status: 'unknown',
          raw: { error: err.message },
        });
      }
      // Rate limit: ~8/sec
      await sleep(130);
    }
    return results;
  }
}
