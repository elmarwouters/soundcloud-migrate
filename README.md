# soundcloud-migrate-cli

Production-grade CLI tool to migrate actions between SoundCloud accounts using the official SoundCloud API and OAuth 2.1 PKCE.

## Running via GitHub Actions

The recommended way to run this tool is through GitHub Actions — no local Node.js environment is required beyond the one-time token setup below.

### Step 1 — Create a SoundCloud API application

1. Go to [SoundCloud Developers](https://developers.soundcloud.com/) and sign in.
2. Register a new app and note your **Client ID** and **Client Secret**.
3. Add `http://127.0.0.1:17892/callback` as a redirect URI.

### Step 2 — Obtain OAuth tokens locally (one-time)

Install dependencies and build the CLI locally:

```bash
npm install
npm run build
```

Create a `.env` file from the example and fill in your credentials:

```bash
cp .env.example .env
```

```
SOUNDCLOUD_CLIENT_ID=your_client_id
SOUNDCLOUD_CLIENT_SECRET=your_client_secret
```

Authenticate both accounts (this opens a browser window for each):

```bash
node dist/cli.js connect source   # log in as your OLD account
node dist/cli.js connect target   # log in as your NEW account
```

### Step 3 — Extract tokens from the local database

After connecting, retrieve the tokens from the SQLite database:

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
| `SC_SOURCE_ACCESS_TOKEN` | `access_token` for the **source** account row |
| `SC_SOURCE_REFRESH_TOKEN` | `refresh_token` for the **source** account row |
| `SC_TARGET_ACCESS_TOKEN` | `access_token` for the **target** account row |
| `SC_TARGET_REFRESH_TOKEN` | `refresh_token` for the **target** account row |

### Step 5 — Trigger the workflow

Go to **Actions → SoundCloud Migration → Run workflow** and choose:

- **job**: migration to run (default: `followings`)
- **limit**: API page size (default: `200`)
- **sleep**: ms between follow actions (default: `900`)

The workflow seeds both accounts from secrets, runs the migration, and caches the SQLite DB between runs so progress is preserved and the migration can be safely resumed.

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

### Connect accounts

Authenticate and store tokens for the source and target accounts.

```bash
node dist/cli.js connect source
node dist/cli.js connect target
```

The CLI will open the SoundCloud authorization page in your browser and start a local callback server on `http://127.0.0.1:<REDIRECT_PORT>/callback`.

### Run followings migration

```bash
node dist/cli.js run followings --limit 200 --sleep 900
```

- `--limit`: page size for the SoundCloud API (max 200)
- `--sleep`: milliseconds to sleep between follow actions

Progress is persisted in SQLite so you can safely rerun the command to resume.

---

## Notes

- Uses OAuth 2.1 PKCE flow with S256.
- Uses SQLite for idempotent processing and resuming progress.
- Only official SoundCloud API endpoints are used.

## License

MIT
