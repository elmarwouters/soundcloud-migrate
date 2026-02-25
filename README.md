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

- **job**: migration to run (default: `followings`)
- **limit**: API page size (default: `200`)
- **sleep**: ms between follow actions (default: `900`)

The workflow authenticates both accounts using the provided credentials, runs the migration, and caches the SQLite DB between runs so progress is preserved and the migration can be safely resumed.

> **MFA accounts:** The password grant does not support multi-factor authentication. If either account has MFA enabled, follow the [MFA fallback](#mfa-fallback-seed-pre-obtained-tokens) section below instead.

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

### Login accounts (credential-based, no browser)

Alternatively, authenticate using your SoundCloud username and password directly (no browser required):

```bash
SC_SOURCE_USERNAME=your@email.com SC_SOURCE_PASSWORD=yourpassword node dist/cli.js login source
SC_TARGET_USERNAME=your@email.com SC_TARGET_PASSWORD=yourpassword node dist/cli.js login target
```

### Run followings migration

```bash
node dist/cli.js run followings --limit 200 --sleep 900
```

- `--limit`: page size for the SoundCloud API (max 200)
- `--sleep`: milliseconds to sleep between follow actions

Progress is persisted in SQLite so you can safely rerun the command to resume.

---

## MFA fallback — seed pre-obtained tokens

If an account has **multi-factor authentication (MFA) enabled**, the password grant used by `sc-migrate login` will not work. Use the following one-time local flow to obtain tokens, then inject them as GitHub Secrets.

### Step 1 — Obtain tokens locally (one-time)

Install dependencies, build, and authenticate via the browser OAuth flow:

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

### Step 2 — Extract tokens from the local database

```bash
sqlite3 data/migrate.sqlite "SELECT name, access_token, refresh_token FROM accounts;"
```

This outputs something like:

```
source|ACCESS_TOKEN_SOURCE|REFRESH_TOKEN_SOURCE
target|ACCESS_TOKEN_TARGET|REFRESH_TOKEN_TARGET
```

### Step 3 — Add token secrets to GitHub

In **Settings → Secrets and variables → Actions** add:

| Secret | Value |
|---|---|
| `SC_SOURCE_ACCESS_TOKEN` | `access_token` for the **source** account row |
| `SC_SOURCE_REFRESH_TOKEN` | `refresh_token` for the **source** account row |
| `SC_TARGET_ACCESS_TOKEN` | `access_token` for the **target** account row |
| `SC_TARGET_REFRESH_TOKEN` | `refresh_token` for the **target** account row |

### Step 4 — Update the workflow to use `seed`

In `.github/workflows/migrate.yml`, replace the `Login source/target account` steps with:

```yaml
- name: Seed source account tokens
  run: node dist/cli.js seed source
  env:
    SOUNDCLOUD_CLIENT_ID: ${{ secrets.SOUNDCLOUD_CLIENT_ID }}
    SOUNDCLOUD_CLIENT_SECRET: ${{ secrets.SOUNDCLOUD_CLIENT_SECRET }}
    DB_PATH: ./data/migrate.sqlite
    SC_SOURCE_ACCESS_TOKEN: ${{ secrets.SC_SOURCE_ACCESS_TOKEN }}
    SC_SOURCE_REFRESH_TOKEN: ${{ secrets.SC_SOURCE_REFRESH_TOKEN }}

- name: Seed target account tokens
  run: node dist/cli.js seed target
  env:
    SOUNDCLOUD_CLIENT_ID: ${{ secrets.SOUNDCLOUD_CLIENT_ID }}
    SOUNDCLOUD_CLIENT_SECRET: ${{ secrets.SOUNDCLOUD_CLIENT_SECRET }}
    DB_PATH: ./data/migrate.sqlite
    SC_TARGET_ACCESS_TOKEN: ${{ secrets.SC_TARGET_ACCESS_TOKEN }}
    SC_TARGET_REFRESH_TOKEN: ${{ secrets.SC_TARGET_REFRESH_TOKEN }}
```

---

## Notes

- Uses OAuth 2.1 PKCE flow with S256 (browser-based `connect` command).
- Credential-based login uses the SoundCloud password grant (no browser required).
- Uses SQLite for idempotent processing and resuming progress.
- Only official SoundCloud API endpoints are used.

## License

MIT
