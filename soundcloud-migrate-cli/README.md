# soundcloud-migrate-cli

Production-grade CLI tool to migrate actions between SoundCloud accounts using the official SoundCloud API and OAuth 2.1 PKCE.

## Requirements

- Node.js 20+
- SoundCloud API application credentials (client ID + client secret)

## Setup

> **Running via GitHub Actions?** No `.env` file is needed. See [Running via GitHub Actions](#running-via-github-actions) for the secrets-based setup.

```bash
npm install
```

Create a `.env` file based on `.env.example` (local development only):

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

## Build

```bash
npm run build
```

## Usage

### Connect accounts

Authenticate and store tokens for the source and target accounts.

```bash
sc-migrate connect source
sc-migrate connect target
```

The CLI will open the SoundCloud authorization page in your browser and start a local callback server on `http://127.0.0.1:<REDIRECT_PORT>/callback`.

### Run followings migration

```bash
sc-migrate run followings --limit 200 --sleep 900
```

- `--limit`: page size for the SoundCloud API (max 200)
- `--sleep`: milliseconds to sleep between follow actions

Progress is persisted in SQLite so you can safely rerun the command to resume.

## Running via GitHub Actions

The repository includes a `SoundCloud Migration` workflow (`migrate.yml`) that can run the migration non-interactively using stored OAuth tokens.

### Prerequisites

1. Run `sc-migrate connect source` and `sc-migrate connect target` locally once to obtain OAuth tokens.
2. Add the following secrets to your GitHub repository (**Settings → Secrets and variables → Actions**):

   | Secret | Description |
   |---|---|
   | `SOUNDCLOUD_CLIENT_ID` | SoundCloud app client ID |
   | `SOUNDCLOUD_CLIENT_SECRET` | SoundCloud app client secret |
   | `SC_SOURCE_ACCESS_TOKEN` | Access token for the source account |
   | `SC_SOURCE_REFRESH_TOKEN` | Refresh token for the source account |
   | `SC_TARGET_ACCESS_TOKEN` | Access token for the target account |
   | `SC_TARGET_REFRESH_TOKEN` | Refresh token for the target account |

### Triggering the workflow

Go to **Actions → SoundCloud Migration → Run workflow** and choose:

- **job**: migration to run (default: `followings`)
- **limit**: API page size (default: `200`)
- **sleep**: ms between follow actions (default: `900`)

The workflow caches the SQLite DB between runs so progress is preserved and the migration can be safely resumed.

### `seed` command

The workflow uses `sc-migrate seed <account>` under the hood to load tokens from environment variables into the local SQLite DB without requiring an interactive browser flow.

## Notes

- Uses OAuth 2.1 PKCE flow with S256.
- Uses SQLite for idempotent processing and resuming progress.
- Only official SoundCloud API endpoints are used.

## License

MIT
