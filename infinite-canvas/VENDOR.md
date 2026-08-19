# Vendored infinite-canvas

Upstream: https://github.com/basketikun/infinite-canvas  
License: MIT (see `LICENSE`) — keep the original author notice and in-app marks.  
Pinned commit: `b66936d891b82c2b51c1ed05e1a6eae3e31d4ca3` (2026-08-11, VERSION `v0.15.1`)

This directory is a **pinned snapshot**, not a live fork tracking `main`. Upstream says storage formats may change without compatibility.

## Why it lives here

Creator Studio's canvas host is this app. Do not mount it inside `creator-studio/apps/web`. Do not add it to the root pnpm workspace.

## Run

From the repo root:

```bash
make canvas-install    # first time
make dev-studio        # web + API + this host together; open http://127.0.0.1:5173
```

`make dev-canvas` only starts this host. You do not open :3300 in the browser — the studio page embeds it.

Port: `CREATOR_STUDIO_CANVAS_PORT` (default `3300`). It is a second Vite process, not a conflict with :5173.  
API keys stay in the browser (their Settings page).

Studio embeds this app at `/projects/:id/canvas` with `?embed=1&externalId=...`. Embed mode hides the upstream top nav and Agent rail so HelloAlro keeps the workspace chrome.

## Update (rare)

```bash
git clone https://github.com/basketikun/infinite-canvas.git /tmp/infinite-canvas
git -C /tmp/infinite-canvas rev-parse HEAD   # record the new SHA
# replace this directory with the new tree, drop .git, refresh .vendor-commit
```

Do not merge upstream casually.
