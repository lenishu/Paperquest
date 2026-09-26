# Netlify hosting

`netlify.toml` builds the React client with `VITE_CLOUD=true` and publishes
`client/dist`. Netlify runs `netlify/functions/api.mjs` at `/api/*` and
`worker-background.mjs` for slow jobs. Explicit external dependencies include
Express, Multer, serverless-http and PDF.js so the deployment package contains
the modules required by the CommonJS server. The v2 entries load cloud.js with
createRequire so the file tracer follows the original CommonJS requires; an
ESM import had transformed them into untraceable bundled aliases. Use a credit-based Free plan (legacy Free
plans do not include background functions). No paid database or hosted AI key
is required. Visitors supply their own provider keys.

## Private workspaces

`server/cloud.js` issues a random 256-bit recovery token in a Secure, HttpOnly,
SameSite=Strict, host-only cookie. All API requests check Origin/Fetch Metadata.
The SHA-256-derived namespace separates users. There are no email accounts;
possession of the recovery key grants access. Settings explains this and lets
the user save their key or restore a workspace. Losing both cookie and recovery
key means losing access. Separate people sharing one browser profile share its
workspace; use separate browser profiles for separate workspaces.

Site-wide Netlify Blobs (`paperquest-private-v1`, strong consistency) stores
AES-256-GCM-encrypted compressed snapshots. Encryption keys derive from the
recovery token, which is never stored with the snapshot. Nothing from local
`data/` is deployed. The site owner controls the running service; this is not
end-to-end encryption against the operator.

Each request hydrates a unique temporary directory. `server/workspace.js`
uses AsyncLocalStorage so the existing atomic file store stays isolated across
simultaneous requests. Identifiers must be safe path segments. Completed
requests save only changed files, merging unrelated changes with conditional
ETag writes. Concurrent edits to the same file return 409 rather than silently
losing data. Temporary files are removed in `finally`. No success response is
returned before persistence succeeds.

## Importing local projects

`npm run workspace:export` runs `scripts/export-workspace.js` and writes the
gitignored `.netlify/paperquest-projects-backup.json`. `server/backup.js`
validates the versioned file map, safe paths, base64, JSON, project metadata,
file count and 24 MB decoded size. Only project files and mastery/profile/
bookmarks are included; credentials and career/resume files are excluded.

Settings > Import local projects sends 1 MB chunks to `/api/session/import`.
One encrypted staging record per workspace expires logically after 30 minutes;
a new upload replaces it. Ordered chunks are retry-safe and use ETag writes.
Finish checks SHA-256, validates the whole backup, and atomically merges it into
an empty workspace with conflict checks. Existing projects/progress cannot be
overwritten; repeating an identical completed import is safe. Successful import
replaces the staging payload with a small receipt. Incomplete uploads remain
encrypted until replaced. Tests cover ownership, corruption, unsafe paths,
credentials exclusion, retries, preservation and original saved lessons.

## Long operations

AI calls, PDF/Markdown uploads, and reference lookups are queued in one encrypted
job record per workspace. The normal API sends only the task ID and workspace
cookie to the background worker. Production uses `URL` (the public site), while
previews use `DEPLOY_URL`; private deploy permalinks can otherwise reject the
server-to-server request. CAS claims prevent duplicate
execution on Netlify retries. `client/src/api.js` polls for the original API
response with backoff. A cached lesson runs synchronously without AI.

One slow task may run per workspace. A failed or interrupted worker expires
after 15 minutes and can be retried manually. After a page reload the browser's
progress dock resets; server work continues, and refreshing later shows saved
results. Repeated AI work is never retried automatically. Concurrent edits to
the same record may return 409 and require a manual retry, potentially using
provider tokens again.

## Limits and operation

- 4 MB per upload (Netlify binary payload limit), 24 MB per workspace.
- PDFs use PDF.js on Netlify; optional local Docling still works locally.
- Built-in AI provider HTTPS origins only; the owner may add trusted origins
  through the runtime env var `PAPERQUEST_ALLOWED_AI_ORIGINS` (comma-separated).
  Redirects are blocked for hosted provider calls to prevent SSRF.
- Netlify Free credits are finite. Sites pause on exhaustion; do not enable a
  paid plan or recharge when free-only hosting is required. Provider AI charges
  are separate. This small-workspace snapshot store is intended for light use.
- Run `npm test`, `npm run build`, and `npx netlify build` before deployment.
- `server/cloud.test.js` tests sessions, isolation, persistence, concurrent
  writes, recovery, job ownership/claims, cached lessons, and multipart uploads.
- `.netlify/` and `.env*` are ignored. Never commit service tokens or local data.

## Deploy

Import `lenishu/Paperquest` into Netlify on a credit-based Free team, branch
`main`, with the settings from `netlify.toml`. Or authenticate the Netlify CLI,
link/create a site in the Free team, then run `npx netlify deploy --build --prod`.
No extra secrets are required for storage or sessions. Netlify automatically
provides the Blobs credentials and deployment URL. Verify `/api/session`, an
isolated demo project, reload persistence, upload, and a completed background
task on the live site. Do not call a successful static build a full deployment.

Production URL: https://paperquestapp.netlify.app/

**Make the project public.** Credit-based teams created on or after 2026-07-28
start new projects private. While private, every path (`/`, `/api/*`, assets)
returns 401 with Netlify's "This site is private" sign-in page. After the first
production deploy, press **Make public**, or open Project configuration >
General > Visitor access > Project visibility and choose Public. If the team
default is "Private for all projects", change it first under Team settings >
General > Visitor access. `api.mjs` starts jobs by fetching the deploy's own
`/.netlify/functions/worker-background`, and that request hits the same gate.
On a private deploy, uploads, AI actions, and reference lookups fail with
"Could not start the background worker", even for the signed-in owner. Production
dispatch now uses the public site URL to support protected deploy previews.
