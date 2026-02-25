# soundcloud-migrate-cli

Production-grade CLI tool to migrate actions between SoundCloud accounts using the official SoundCloud API and OAuth 2.1 PKCE.

## Running via GitHub Actions

The recommended way to run this tool is through GitHub Actions — no local Node.js environment required.

### Step 1 — Create a SoundCloud API application

1. Go to [SoundCloud Developers](https://developers.soundcloud.com/) and sign in.
2. Register a new app and note your **Client ID** and **Client Secret**.
3. Add `http://127.0.0.1:17892/callback` as a redirect URI.

### Step 2 — Add secrets to GitHub

In your GitHub repository go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `SOUNDCLOUD_CLIENT_ID` | Your SoundCloud app client ID |
| `SOUNDCLOUD_CLIENT_SECRET` | Your SoundCloud app client secret |
| `SC_SOURCE_USERNAME` | SoundCloud username or e-mail of the **source** (old) account |
| `SC_SOURCE_PASSWORD` | SoundCloud password of the **source** (old) account |
| `SC_TARGET_USERNAME` | SoundCloud username or e-mail of the **target** (new) account |
| `SC_TARGET_PASSWORD` | SoundCloud password of the **target** (new) account |

### Step 3 — Trigger the workflow

Go to **Actions → SoundCloud Migration → Run workflow** and choose:

- **job**: migration to run (`followings`, `likes`, `reposts`, or `all` — default: `followings`)
- **limit**: API page size (default: `200`)
- **sleep**: ms between actions (default: `900`)

The workflow authenticates both accounts using a headless browser driven by your credentials, runs the migration, and automatically commits the updated SQLite database back to the repository after each run. Account tokens are cleared from the database before committing so credentials are never stored in git history. Progress is preserved across runs — re-running the workflow resumes from where it left off.

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

Authenticate and store tokens for the source and target accounts. The `connect` command works in two modes:

- **Interactive** (default): Opens the SoundCloud authorization page in your browser and listens for the OAuth callback on `http://127.0.0.1:<REDIRECT_PORT>/callback`.
- **Headless**: If `SC_SOURCE_USERNAME` / `SC_SOURCE_PASSWORD` (or `SC_TARGET_...`) environment variables are set, the command automates the login using a headless Chrome browser instead of opening a tab.

```bash
node dist/cli.js connect source
node dist/cli.js connect target
```

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
