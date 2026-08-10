# Creator Studio

Creator Studio is an independent pnpm-workspace application inside the content-ops repository. It contains a Vite + React client, a local Hono server, and a browser/server-neutral contracts package. The legacy `gpt_image_playground` frontend has been removed from the repository.

## Requirements

- Node.js 22.12 or newer (an active LTS release is recommended; `.nvmrc` selects Node 22)
- pnpm 10 or newer

No global pnpm packages are required.

## Install and develop

From this directory:

```bash
pnpm install
pnpm run dev
```

The `dev` launcher (`scripts/dev.mjs`) prints an emoji banner with the service URLs, color-codes each service's logs (`🌐 web` / `⚙️ server`), and shows a ✅ ready banner once the API health check passes. Running `pnpm run dev` first builds the shared contracts package via `predev`. It stops both processes when either exits:

- Web: `http://127.0.0.1:5173`
- Server: `http://127.0.0.1:4310`

Override the ports with `CREATOR_STUDIO_WEB_PORT` and `CREATOR_STUDIO_PORT`. Vite proxies `/api` to the local server.

From the repository root, the equivalent entry point is:

```bash
pnpm run creator-studio:dev
```

## Build and run production

```bash
pnpm run build
pnpm run start
```

The build creates `apps/web/dist` and `apps/server/dist`. Production is served from `http://127.0.0.1:4310`; the Hono server serves the web assets and falls back to `index.html` for client-side routes.

## Quality checks

Run the complete Foundation exit gate (typecheck, lint, unit, contract, integration, production build, E2E, runtime failure/lifecycle checks, and the seeded performance baseline):

```bash
pnpm run test:foundation
```

Individual checks are also available:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:contract
pnpm run test:integration
pnpm run test:boundary
pnpm run test:e2e
pnpm run test:runtime
pnpm run test:performance
```

Tests use temporary data directories and do not touch `creator-studio/data/`. Playwright requires a locally installed Chromium (`pnpm exec playwright install chromium` if it is missing).

## Local data

Runtime data belongs in `creator-studio/data/` by default:

- `data/creator-studio.sqlite` — SQLite domain data and migration history.
- `data/files/` — imported Asset binaries.
- `data/secrets.json` — local Provider/Connector credentials, mode `0600`.

Override the directory with `CREATOR_STUDIO_DATA_DIR`. The server creates missing directories, applies checked migrations, and creates exactly one default Workspace and CreatorProfile. Runtime contents are ignored by Git.

## Backup and restore

Stop Creator Studio before backing up so the SQLite database, WAL, files, and secret references form one consistent snapshot. Then copy the complete data directory, not only the `.sqlite` file:

```bash
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
```

To restore, keep the server stopped, move the current data directory aside, copy the selected backup back to `data`, confirm the current user can read and write it, and start the server. The startup migration checksum check will reject an incompatible or modified migration history instead of silently changing it.

## Security and operational boundaries

- The server binds only to `127.0.0.1`; API writes require the local session cookie and an allowed same-origin `Origin`.
- Secrets stay in the server-side secret store. API responses and request logs contain status metadata, not credential values or request bodies.
- Asset names are display metadata only. Stored paths are generated under the controlled data root and MIME/signature/size checks run before commit.
- Shut down with `Ctrl-C`, `SIGINT`, or `SIGTERM`. The server closes SQLite before exiting.

## Troubleshooting

- **`EADDRINUSE` / address already in use:** choose free `CREATOR_STUDIO_PORT` and `CREATOR_STUDIO_WEB_PORT` values, or stop the process already using the port.
- **Data directory is not writable:** confirm `CREATOR_STUDIO_DATA_DIR` is a directory owned by the current user and grants read/write/execute permission. The server intentionally exits non-zero rather than falling back elsewhere.
- **Migration checksum/history failure:** do not edit an applied migration. Restore the matching code and data backup, or add a new migration. Never delete `schema_migrations` to bypass the check.
- **Invalid local session after restart:** reload the page; `/bootstrap` rotates a stale local cookie. Requests from another Host or Origin remain rejected.
- **Connector unavailable:** use Settings → Test connection. Lark must resolve to an executable and Obsidian must reference a readable directory; errors intentionally omit sensitive absolute paths.
- **E2E browser missing:** run `pnpm exec playwright install chromium` and retry `pnpm run test:e2e`.
- **Diagnosing a failed request or Task:** correlate the UI request ID or Task ID with server logs. Logs include request ID, method, path, status, and duration only.
