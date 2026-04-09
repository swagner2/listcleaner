# Klaviyo List Cleaner

Cloudflare Worker that automatically cleans Klaviyo email profiles by identifying invalid emails through two-stage verification:

1. **Stage 1 (Free):** Checks for common domain misspellings (gnail.com, hotmial.com, yahoo.con, etc.) and disposable email domains
2. **Stage 2 (NeverBounce):** Sends remaining emails through NeverBounce for deep verification (valid, invalid, catchall, disposable)

## Setup

```bash
npm install
npm run db:init:local   # Initialize local D1 database
```

## Secrets

```bash
npx wrangler secret put KLAVIYO_API_KEY       # Klaviyo private key (pk_xxx)
npx wrangler secret put NEVERBOUNCE_API_KEY   # NeverBounce API key
npx wrangler secret put DASHBOARD_TOKEN       # Bearer token for dashboard auth
```

## Development

```bash
npm run dev             # Start local dev server (http://localhost:8787)
```

## Deploy

```bash
npm run db:init         # Initialize remote D1 database (first time only)
npm run deploy          # Deploy to Cloudflare
```

## Dashboard

The worker serves an HTML dashboard at its root URL showing:
- Run history with profile counts and error tracking
- Status breakdown (valid, invalid_domain, invalid_3p, disposable, etc.)
- Current configuration
- Manual "Run Now" trigger button

Protected by `DASHBOARD_TOKEN` bearer auth.

## Configuration

Adjustable via `POST /api/config`:

| Setting | Default | Description |
|---|---|---|
| `max_profiles_per_run` | 500 | Cap per cron run |
| `batch_size` | 50 | Profiles per Klaviyo API page |
| `stage2_enabled` | true | Toggle NeverBounce verification |
| `auto_suppress` | false | Auto-suppress invalid profiles in Klaviyo |
| `recheck_days` | 30 | Skip recently-checked profiles |
| `klaviyo_list_id` | null | Restrict to specific list (null = all) |

## Schedule

Default: daily at 3 AM UTC. Change in `wrangler.toml` under `[triggers]`.
