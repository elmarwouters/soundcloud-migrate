# soundcloud-migrate-cli

Production-grade CLI tool to migrate actions between SoundCloud accounts using the official SoundCloud API and OAuth 2.1 PKCE.

## Running via GitHub Actions

The recommended way to run this tool is through GitHub Actions — no local Node.js environment required.

### Step 1 — Create a SoundCloud API application

1. Go to [SoundCloud Developers](https://developers.soundcloud.com/) and sign in.
2. Register a new app and note your **Client ID** and **Client Secret**.
3. Add `http://127.0.0.1:17892/callback` as a redirect URI.

### Step 2 — Obtain tokens locally (one-time)

Install dependencies, build, and authenticate via the browser OAuth flow on your local machine:

```bash
npm install
npm run build
```

```bash
cp .env.example .env
# Fill in SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET
```

```bash
node dist/cli.js connect source   # log in as your OLD account
node dist/cli.js connect target   # log in as your NEW account
```

### Step 3 — Extract tokens from the local database

```bash
sqlite3 data/migrate.sqlite "SELECT name, access_token, refresh_token FROM accounts;"
```

This outputs something like:

```
source|ACCESS_TOKEN_SOURCE|REFRESH_TOKEN_SOURCE
target|ACCESS_TOKEN_TARGET|REFRESH_TOKEN_TARGET
```

### Step 4 — Add secrets to GitHub

In your GitHub repository go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `SOUNDCLOUD_CLIENT_ID` | Your SoundCloud app client ID |
| `SOUNDCLOUD_CLIENT_SECRET` | Your SoundCloud app client secret |
| `SC_SOURCE_ACCESS_TOKEN` | `access_token` for the **source** account |
| `SC_SOURCE_REFRESH_TOKEN` | `refresh_token` for the **source** account |
| `SC_TARGET_ACCESS_TOKEN` | `access_token` for the **target** account |
| `SC_TARGET_REFRESH_TOKEN` | `refresh_token` for the **target** account |

### Step 5 — Trigger the workflow

Go to **Actions → SoundCloud Migration → Run workflow** and choose:

- **job**: migration to run (`followings`, `likes`, `reposts`, or `all` — default: `followings`)
- **limit**: API page size (default: `200`)
- **sleep**: ms between actions (default: `900`)

The workflow seeds both accounts using pre-obtained tokens, runs the migration, and automatically commits the updated SQLite database back to the repository after each run. Account tokens are cleared from the database before committing so credentials are never stored in git history. Progress is preserved across runs — re-running the workflow resumes from where it left off.

---

## Local usage

### Requirements

- Node.js 20+
- SoundCloud API application credentials (client ID + client secret)

### Setup

```bash
npm install
```

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Populate required values:

- `SOUNDCLOUD_CLIENT_ID`
- `SOUNDCLOUD_CLIENT_SECRET`

Optional settings:

- `REDIRECT_PORT` (default: `17892`)
- `DB_PATH` (default: `./data/migrate.sqlite`)
- `USER_AGENT` (default: `soundcloud-migrate-cli/0.1.0`)
- `SLEEP_MS` (default: `900`)

### Build

```bash
npm run build
```

### Connect accounts (browser-based OAuth)

Authenticate and store tokens for the source and target accounts using the browser OAuth flow:

```bash
node dist/cli.js connect source
node dist/cli.js connect target
```

The CLI will open the SoundCloud authorization page in your browser and start a local callback server on `http://127.0.0.1:<REDIRECT_PORT>/callback`.

### Run migrations

```bash
node dist/cli.js run followings --limit 200 --sleep 900
node dist/cli.js run likes --limit 200 --sleep 900
node dist/cli.js run reposts --limit 200 --sleep 900
node dist/cli.js run all --limit 200 --sleep 900
```

- `--limit`: page size for the SoundCloud API (max 200)
- `--sleep`: milliseconds to sleep between actions

Available jobs:

| Job | Description |
|---|---|
| `followings` | Follow all users that the source account follows |
| `likes` | Like all tracks that the source account has liked |
| `reposts` | Repost all tracks that the source account has reposted |
| `all` | Run all of the above in sequence |

Progress is persisted in SQLite so you can safely rerun the command to resume.

---

## Notes

- Uses OAuth 2.1 PKCE flow with S256 (browser-based `connect` command).
- Uses SQLite for idempotent processing and resuming progress.
- Only official SoundCloud API endpoints are used.

## License

MIT
