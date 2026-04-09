# Klaviyo List Cleaner

Cloudflare Worker that automatically cleans Klaviyo email profiles by identifying invalid emails through two-stage verification. Supports multiple Klaviyo accounts.

1. **Stage 1 (Free):** Checks for common domain misspellings (gnail.com, hotmial.com, yahoo.con, etc.) and disposable email domains
2. **Stage 2 (NeverBounce):** Sends remaining emails through NeverBounce for deep verification (valid, invalid, catchall, disposable)

## Klaviyo API Key

Each Klaviyo account requires a **Private API Key** with **Full Access**.

To create one:
1. In Klaviyo, go to **Settings > API Keys**
2. Click **Create Private API Key**
3. Select **Full Access Key**
4. Copy the key (starts with `pk_`) — you'll enter it when adding the account to the dashboard

## Setup

```bash
npm install
npm run db:init:local   # Initialize local D1 database
```

## Secrets

```bash
npx wrangler secret put NEVERBOUNCE_API_KEY   # NeverBounce API key
npx wrangler secret put DASHBOARD_TOKEN       # Bearer token for dashboard auth
```

Note: Klaviyo API keys are stored per-account via the dashboard, not as worker secrets.

## Development

```bash
npm run dev             # Start local dev server (http://localhost:8787)
```

## Deploy

```bash
npm run db:init         # Initialize remote D1 database (first time only)
npm run deploy          # Deploy to Cloudflare
```

## Multi-Account Dashboard

The worker serves an HTML dashboard at its root URL:

- **Root (`/`)** — Lists all Klaviyo accounts with profile counts and last run status. Includes a form to add new accounts.
- **Per-account (`/accounts/:id`)** — Run history, status breakdown, configuration, and a "Run Now" trigger button.

### Account Management API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/accounts` | List all accounts |
| `POST` | `/api/accounts` | Add account `{id, name, klaviyo_api_key}` |
| `DELETE` | `/api/accounts/:id` | Remove account |

Protected by `DASHBOARD_TOKEN` bearer auth.

## Configuration

Adjustable per-account via `POST /accounts/:id/api/config`:

| Setting | Default | Description |
|---|---|---|
| `max_profiles_per_run` | 500 | Cap per cron run |
| `batch_size` | 50 | Profiles per Klaviyo API page |
| `stage2_enabled` | true | Toggle NeverBounce verification |
| `auto_suppress` | false | Auto-suppress invalid profiles in Klaviyo |
| `recheck_days` | 30 | Skip recently-checked profiles |
| `klaviyo_list_id` | null | Restrict to specific list (null = all) |

## Schedule

Default: daily at 3 AM UTC. Change in `wrangler.toml` under `[triggers]`. The cron runs the pipeline for each account sequentially.
