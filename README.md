# Klaviyo List Cleaner

Cloudflare Worker that automatically cleans Klaviyo email profiles by identifying invalid emails. Supports multiple Klaviyo accounts with a web dashboard.

## How It Works

Three independent jobs run in sequence — each does one thing well and never times out:

1. **Sync Profiles** — Pulls all profiles from Klaviyo into a local D1 database using batched writes. Resumes from where it left off if interrupted.
2. **Spell Check (Free)** — Scans the database for common domain misspellings (gnail.com, hotmial.com, yahoo.con, etc.) and disposable email domains. Runs entirely in-memory against D1 — no API calls, processes tens of thousands of profiles in seconds.
3. **Verify (NeverBounce)** — Sends "clean" profiles to NeverBounce for deep verification. Identifies invalid, catch-all, disposable, and unknown addresses.

### Status Flow

```
unscanned → clean (passed spell check) → valid / invalid_3p / catch_all / unknown (after NeverBounce)
unscanned → invalid_domain (failed spell check)
unscanned → disposable (disposable email domain)
```

## Klaviyo API Key

Each Klaviyo account requires a **Private API Key** with **Full Access**.

1. In Klaviyo, go to **Settings > API Keys**
2. Click **Create Private API Key**
3. Select **Full Access Key**
4. Copy the key (starts with `pk_`) — you'll enter it when adding the account to the dashboard

When you add an account, the worker validates the key against Klaviyo and counts all profiles.

## Setup

```bash
npm install
npm run db:init:local   # Initialize local D1 database
```

## Secrets

```bash
npx wrangler secret put NEVERBOUNCE_API_KEY   # NeverBounce API key
npx wrangler secret put DASHBOARD_TOKEN       # Bearer token for dashboard auth
npx wrangler secret put SENTRY_DSN            # Sentry DSN for error tracking (optional)
npx wrangler secret put SENDGRID_API_KEY      # SendGrid key for email notifications (optional)
```

Klaviyo API keys are stored per-account via the dashboard, not as worker secrets.

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

The worker serves an HTML dashboard at its root URL:

- **Root (`/`)** — Lists all Klaviyo accounts with profile counts and last run status. Add new accounts here.
- **Per-account (`/accounts/:id`)** — Status cards, run history, configuration, and action buttons.
- **Domain Lists (`/domain-lists`)** — Edit the master misspelled domain list, disposable domains, and safe domains. Shared across all accounts.

### Action Buttons

| Button | What It Does |
|---|---|
| **Sync Profiles** | Pull latest profiles from Klaviyo into D1 |
| **Spell Check** | Run domain typo detection on unscanned profiles |
| **Verify (NeverBounce)** | Send clean profiles to NeverBounce for verification |
| **Full Scan** | Run all 3 jobs in sequence |

### Live Status

A status banner appears during active runs showing real-time progress (profiles fetched, typos found, etc.). The dashboard polls every 3 seconds and auto-refreshes when the run finishes.

### CSV Export

Download buttons appear when invalid profiles are found:
- Domain Typos (CSV)
- 3P Invalid (CSV)
- Disposable (CSV)
- All Profiles (CSV)

## API

### Account Management

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/accounts` | List all accounts |
| `POST` | `/api/accounts` | Add account `{id, name, klaviyo_api_key}` |
| `DELETE` | `/api/accounts/:id` | Remove account |

### Per-Account

| Method | Route | Description |
|---|---|---|
| `GET` | `/accounts/:id` | Account dashboard (HTML) |
| `GET` | `/accounts/:id/api/stats` | Run history + status summary (JSON) |
| `GET` | `/accounts/:id/api/status` | Active run progress (JSON) |
| `GET` | `/accounts/:id/api/profiles?status=invalid_domain` | Browse profiles (JSON) |
| `GET` | `/accounts/:id/api/profiles?status=invalid_domain&format=csv` | Download profiles (CSV) |
| `GET` | `/accounts/:id/api/config` | Get config (JSON) |
| `POST` | `/accounts/:id/api/config` | Update config (JSON) |
| `POST` | `/accounts/:id/api/trigger` | Trigger a job `{mode: "sync"|"spellcheck"|"verify"|"full"}` |

### Domain Lists

| Method | Route | Description |
|---|---|---|
| `GET` | `/domain-lists` | Domain list editor (HTML) |
| `GET` | `/api/domain-lists` | Get all domain lists (JSON) |
| `POST` | `/api/domain-lists` | Update domain lists (JSON) |

All routes protected by `DASHBOARD_TOKEN` bearer auth.

## Configuration

Editable per-account on the dashboard or via `POST /accounts/:id/api/config`:

| Setting | Default | Description |
|---|---|---|
| `max_profiles_per_run` | 500 | Max profiles to process per job run |
| `batch_size` | 50 | Profiles per Klaviyo API page (max 100) |
| `stage2_enabled` | true | Toggle NeverBounce verification |
| `auto_suppress` | false | Auto-suppress invalid profiles in Klaviyo |
| `recheck_days` | 30 | Skip recently-checked profiles |
| `klaviyo_list_id` | null | Restrict to specific Klaviyo list (null = all) |
| `notification_emails` | [] | Email addresses for run completion notifications |

## Schedule

Default: daily at 3 AM UTC. Change in `wrangler.toml` under `[triggers]`.

The cron runs all 3 jobs (sync → spell check → verify) for each account sequentially.

## Error Tracking

Errors are tracked via Sentry (optional). Set the `SENTRY_DSN` secret to enable. All errors include `account_id`, `job` type, and `run_id` tags for filtering.

Stuck runs (running > 10 minutes) are automatically cleaned up and marked as failed.
