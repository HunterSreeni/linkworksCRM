# Changelog

All notable changes to Linkworks CRM are documented here.
Format follows [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0) - Breaking changes, incompatible API/DB changes
- **MINOR** (0.X.0) - New features, backwards-compatible additions
- **PATCH** (0.0.X) - Bug fixes, performance improvements, no new features

---

## [0.1.8] - 2026-04-15 (Security + codebase cleanup)

Post-audit pass. Two subagents swept the codebase for security holes and silent bugs; this release fixes everything they found except the known-test-only IMAP app password.

### Critical
- **CORS was wide open** - `server/src/index.js` used `cors()` with no args, accepting every origin. Now an allowlist via `ALLOWED_ORIGINS` env var (comma-separated), falling back to localhost in dev. Unknown origins get rejected.
- **Default API key `dev-api-key-change-me` removed** - `server/src/middleware/auth.js` no longer has a hard-coded fallback. When `API_KEY` env is unset, the `x-api-key` auth path is disabled; only Supabase Bearer tokens work.

### Schema drift (silent data loss)
- **email_templates columns** - `server/src/routes/templates.js` was writing `subject`/`body`/`category`, schema has `subject_template`/`body_template`/`description`. Every template create/update was silently failing. Fixed column names everywhere including the preview endpoint and `server/src/utils/templateEngine.js`.
- **pricing_rules columns** - `server/src/routes/pricing.js` was writing `hazardous_surcharge`/`currency`, schema has `is_hazardous`/`price_per_kg` with a composite unique key `(vehicle_type, is_hazardous)`. Fixed POST, PUT, and `/calculate` logic to use the actual columns.
- **Pricing list frontend** - `client/src/pages/PricingInfo.jsx` expected `r.pricing`/`r.pricing_rules`; API returns `r.rules`. Showed "No pricing rules defined" despite 8 rows existing.
- **Pricing PUT frontend** - was calling `api.put('/pricing', {id})`, API route is `/pricing/:id`. Fixed.
- **Dashboard stat keys** - frontend read `stats.totalAll`/`totalPrevMonth`/etc., API returned `total_requests`/`requests_prev_month`/etc. All cards were stuck at 0.
- **TeamManagement form** - sent `name`, API expected `full_name`. New users were created without names.

### UI fields that never existed
- **RequestDetail `request.delivery_status`** doesn't exist as a column - delivery-failed banner never showed. Now driven by `status === 'delivery_failed'` which is a valid enum value.
- **OutputTracker `r.replied_at` / `r.delivery_status`** - neither exists. Replaced with `updated_at` and proper `status`-based rendering (delivery_failed / closed / replied).
- **BookingsIntake `req.overall_confidence` and `req.assigned_to_name`** - neither ever came from the API. Removed the Confidence column entirely (v0.1.4 raw-email mode doesn't compute confidence anyway). `assigned_to_name` replaced by proper `profiles` join -> `req.assigned_profile.full_name`.
- **AuditTrails `log.user_name` / `log.user_email`** - API returned only `user_id`. Backend now joins `profiles` into the select; frontend reads `log.user.full_name || log.user.email`.
- **AuditTrails response shape** - frontend expected `res.audit` / `res.totalPages`, API returns `res.audit_logs` / `res.pagination.pages`.

### Reply flow
- **Audit log column mismatch** - `server/src/routes/reply.js` was inserting `request_id` into `audit_log` where the schema expects `entity_type`/`entity_id`. Every reply-sent audit was silently failing. Fixed + added error log check.
- **Unchecked `.update()` linking outbound email** - if the request update failed after send, the link was silently dropped. Now `{ error }` destructured and logged.

### Auth + infra
- **Supabase env var validation** - `server/src/config/supabase.js` now throws at startup if `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, or `SUPABASE_ANON_KEY` are missing. Previously the app started with undefined keys and failed on the first DB call.
- **Helmet CSP** - explicit directives replacing the default permissive config. Blocks inline scripts, restricts connect-src to Supabase, sets `frame-ancestors 'none'`.
- **Rate limit on /api/auth/** - `express-rate-limit` 10 requests per 15 min per IP. Returns 429 with a clear message. Verified: 11th login attempt → 429.
- **Attachment download IDOR closed** - `server/src/routes/attachments.js` now checks the attachment's linked request. Members can only download attachments for requests assigned to them (or unassigned drafts). Admins unrestricted.
- **ILIKE / OR sanitization** - `server/src/routes/requests.js` search param now escapes `%`, `_`, and strips `,()` before interpolation into the PostgREST `.or()` filter string. Prevents wildcard DoS and clause injection.
- **RLS tightening** - `requests_update_policy` no longer uses `USING (true)`. Now mirrors the SELECT policy: admin, assigned, or unassigned-draft. Backend uses service-role and bypasses RLS, but this is defense-in-depth for any future direct-frontend writes.

### Added
- **Migration `0003_tighten_requests_update_rls.sql`** - DROP + CREATE on the UPDATE policy. Run once in Supabase SQL editor.

### Migration step (run once before pulling v0.1.8)
```sql
DROP POLICY IF EXISTS requests_update_policy ON requests;
CREATE POLICY requests_update_policy ON requests
  FOR UPDATE TO authenticated
  USING (is_admin() OR assigned_to = auth.uid() OR (assigned_to IS NULL AND status = 'draft'))
  WITH CHECK (is_admin() OR assigned_to = auth.uid() OR (assigned_to IS NULL AND status = 'draft'));
```

### Required env vars (add before deploy)
- `ALLOWED_ORIGINS` - comma-separated list of allowed browser origins, e.g. `https://linkworks-crm.vercel.app,http://localhost:5173`
- `API_KEY` - optional; only set if you want server-to-server API key auth enabled

### E2E verified
- Dashboard stats populated (60 total, correct counts)
- Bookings Intake lists 7 drafts + pagination + no fake Confidence column
- Pricing page lists all 8 rules with correct is_hazardous + price_per_kg
- Templates render subject/body placeholders
- Audit trail reads (no backfilled data yet - empty list)
- Attachment download returns signed URL (admin path)
- CORS rejects `https://evil.example.com`, allows `http://localhost:5173`
- Rate limit returns 429 after 10 login attempts

---

## [0.1.7] - 2026-04-15 (Email attachments download)

### Fixed
- **Attachment inserts were silently failing** - `server/src/services/email/poller.js` was writing `content_type` and `size` column names but the schema calls them `file_type` and `file_size`. Plus the insert had no error check (same pattern as the v0.1.3 request-insert bug). Result: `has_attachments=true` on emails but zero rows in the `attachments` table. Fixed by renaming fields and adding explicit error logging.

### Added
- **Attachment binaries uploaded to Supabase Storage** - Poller now uploads `att.content` Buffer to the private `email-attachments` bucket at `{email_id}/{attachment_id}_{safe_filename}`. The `storage_path` column is populated on success; null on upload failure (attachment metadata is still recorded even if upload fails).
- **Download endpoint** - New `GET /api/attachments/:id/download` returns `{ url, filename, file_type, expires_in }` where `url` is a signed URL from `supabaseAdmin.storage.createSignedUrl(..., 300)` - valid for 5 minutes. No direct storage exposure to the browser.
- **Download buttons on Request Detail** - `RequestDetail.jsx` attachment buttons now call the download endpoint and open the signed URL in a new tab. Shows file size in KB next to filename. Buttons disable with a tooltip when `storage_path` is null (emails received before storage was enabled).
- **Migration `0002_email_attachments_bucket.sql`** - Creates the private `email-attachments` bucket with a 50 MB per-file cap. Run once in the Supabase SQL editor before pulling this version.
- **Microsoft Graph attachment notes** - `ARCHITECTURE.md` "Mail Sources" section extended with the Graph two-phase attachment fetch pattern (`GET /messages/{id}/attachments/{id}/$value`), reference-attachment handling, and large-file streaming caveats - ready for the Graph adapter implementation.

### Migration step (run once before pulling v0.1.7)
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', false, 52428800)
ON CONFLICT (id) DO NOTHING;
```

### Known limitations
- Emails ingested before v0.1.7 (the current 60 in the DB from UAT) have no binary stored. Their attachment buttons show disabled with a "not captured" tooltip. To backfill: truncate emails/attachments/requests, then hit Refresh inbox - Gmail still has the attachments and the poller will now upload them.
- Storage egress counts toward Supabase free 5 GB/month. At 500 KB average PDF and a typical 200-email/day shared inbox, that's ~3 GB/month just from uploads + occasional downloads. Comfortable but worth tracking.

---

## [0.1.6] - 2026-04-15 (Pagination + DB watermark)

### Added
- **Pagination on Bookings Intake** - Page size 25 (configurable via `PAGE_SIZE` const at the top of `BookingsIntake.jsx`). Pagination footer shows `Page X of Y - N total` with Prev/Next buttons. Backend `/api/requests` already accepted `page` and `limit` query params; the UI now uses them and reads `pagination.pages` / `pagination.total` from the response. Refresh inbox jumps back to page 1 so newly polled emails are visible.
- **Migration `0001_emails_imap_uid.sql`** - New `server/supabase/migrations/` folder with a numbered migration adding the `imap_uid INTEGER` column on `emails` plus an index `idx_emails_imap_uid_desc`. Run once in the Supabase SQL editor before deploying v0.1.6.

### Changed
- **Poll watermark moved from RAM to DB** - Removed the in-memory `lastSeenUid` variable. `pollCycle` now calls `getWatermark()` which runs `SELECT imap_uid FROM emails WHERE imap_uid IS NOT NULL ORDER BY imap_uid DESC LIMIT 1`. Survives server restarts, DB truncates, and any other state desync. Each new email's `imap_uid` is stored on insert.
- **`resetPollerState()` is now a no-op** - The endpoint `/api/emails/poll { reset: true }` still exists for backwards compat but does nothing - there is no in-memory state to reset. To force a re-fetch from a specific UID, manually wipe rows from `emails` (the watermark drops to 0 automatically).

### Why
Production won't have this problem - Microsoft Graph webhooks push events with stable IDs, no UID tracking needed. This fix is for the test path so Balaji's UAT doesn't keep desyncing after DB wipes / restarts. Pagination is a general scalability fix; a real shared inbox at the client may have hundreds of drafts pending review on day one of go-live.

### Migration step (run once before pulling v0.1.6 server code)
```sql
ALTER TABLE emails ADD COLUMN IF NOT EXISTS imap_uid INTEGER;
CREATE INDEX IF NOT EXISTS idx_emails_imap_uid_desc ON emails(imap_uid DESC NULLS LAST);
```

---

## [0.1.5] - 2026-04-15 (Server stability)

### Fixed
- **Server crash on IMAP socket timeout** - `imapflow` emits an asynchronous `error` event on its underlying TLS socket when Gmail drops idle connections (timeout / EPIPE). With no listener attached, Node's default behavior is to terminate the process (`Error: Socket timeout` -> `[nodemon] app crashed`). Added a `client.on('error', ...)` listener in `server/src/services/email/adapter.js` that logs and lets the next poll cycle reconnect.
- **Process-level safety nets** - Added `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers in `server/src/index.js`. Any future async error anywhere in the codebase is logged instead of killing the process. Note: these are belt-and-braces - they don't substitute for fixing the actual error source, just prevent dev-time crashes during UAT.

### Why
This is a test-path concern only - production will use Microsoft Graph webhooks with no long-lived IMAP socket. Fixing it anyway because UAT needs a stable local server for Balaji to demo the flow without restarting `npm run dev` every few minutes.

---

## [0.1.4] - 2026-04-15 (Raw email mode)

The parser rework is deferred to v0.2.0. For v0.1.4 we simplify the pipeline: every inbound email becomes a Draft request carrying the full raw body, the user fills details manually.

### Changed
- **Every inbound email -> Bookings Intake** - The classifier's routing decision is ignored. Every email stored in `emails` table triggers a new Draft request row with `inbound_email_id` set. No keyword-based booking/query/noise branching at the request-creation layer.
- **Full raw body preserved** - Request detail page reads `emails.body_raw` via `inbound_email_id` and shows the complete email text including `-- Forwarded message --`, `On DATE, NAME wrote:` trails, and appended attachment text. No body cleanup, no trail stripping. User decides what matters.
- **Extraction fields left null on auto-create** - `collection_address`, `delivery_address`, `collection_datetime`, `delivery_datetime`, `weight`, `vehicle`, `is_hazardous`, `customer_ref_number` etc. are all left null when the poller creates the request. User fills them in manually by reading the body.

### Disabled (commented out with v0.2.0 TODO, not deleted)
- **Classifier** - `server/src/services/email/classifier.js` import/call in the poller is commented. Classifier file kept intact.
- **Parser regex extraction** - `extractFromEmail()` call in `server/src/services/email/poller.js` is commented. Parser module kept intact.
- **Attachment text parsing** - `parseAttachmentContent()` call is commented. Attachments are still stored as rows in the `attachments` table with filename/size/type, just no text extraction.
- **Triage Queue page** - `/triage` route replaced with a "Coming in v0.2.0" placeholder. Sidebar link hidden. `TriageQueue.jsx` component kept intact but not imported.

### Added
- **Inbound email shown on Request Detail** - `RequestDetail.jsx` now reads the joined `emails` + `attachments` arrays from `GET /api/requests/:id` (previously it was reading fields like `request.email_subject` that never existed on the response, so the panel always showed `-`/`No email content available`). Subject, From, To, Received, body, and attachments all render correctly now.
- **Inbound email subject + sender on Bookings Intake list** - `GET /api/requests` now includes a `inbound_email` relation (`subject, from_address, to_address, received_at`) via Supabase foreign-key select. `BookingsIntake.jsx` card reads from that nested object instead of the non-existent `req.email_subject` / `req.email_from`.

### Why
Real-world emails break the regex extractor in too many shapes (empty addresses, wrong weights, CSV-junk from xlsx, over-greedy ref regex, classifier misrouting queries as bookings). Deferring automated extraction to an LLM-based approach in v0.2.0 and having the human read the raw body in the meantime unblocks UAT completely and gives the client a predictable, boring, always-works pipeline to demo.

---

## [0.2.0] - Planned

### Features
- **Notifications** - Enable the notification bell in the header with real-time alerts for new bookings, status changes, and team activity
- **Filters** - Enable filtering across all list views (requests, emails, audit logs) by status, date range, member, classification
- **Member status tracking** - Manual status updates for team members (active/idle/busy) with timestamp tracking
- **Per-member email and task tracking** - Track which member sent which email, individual task assignments, and activity history per member
- **Docket/task state flow** - Fix the processing/confirmed/completed status transitions - implement proper state machine for: draft -> confirmed -> processing -> replied -> closed / delivery_failed
- **Replied-by / Closed-by member tracking** - New `replied_by` and `closed_by` columns on `requests`, stamped on state transitions, surfaced in dashboard per-member stats
- **LLM parser middleware** - Replace / augment regex-based extraction (`server/src/services/email/parser.js`) with an LLM structured-extraction layer that returns typed JSON (addresses, dates, weight, vehicle, hazardous, customer ref). Regex kept as fast-path fallback. Motivated by UAT surfacing persistent parser-quality issues on real-world emails.
- **Re-enable classifier + Triage Queue** - Once the LLM parser is confident enough to auto-extract, restore the classifier's routing so low-confidence / query-shaped emails land in Triage again. Uncomment the blocks marked with `TODO(v0.2.0)` in `server/src/services/email/poller.js` and `client/src/App.jsx`.

---

## [0.1.3] - 2026-04-15

### Fixed
- **PDF parser broken on v2 API** - `pdf-parse` v2.4.5 is a class-based rewrite with no default export. Updated `server/src/services/attachmentParser.js` to use `new PDFParse({ data: buffer }).getText()` instead of the v1 `pdf(buffer)` call. PDF attachments now extract text correctly.
- **Silent request-insert failures** - `server/src/services/email/poller.js` was awaiting `supabaseAdmin.from('requests').insert()` without checking the error. Failed inserts were logged as `"Created request"`, hiding the real problem. Added `{ error }` destructure + explicit `FAILED to create request from "<subject>": <reason>` log.
- **Vehicle enum mismatch dropping requests** - Parser extracted vehicle strings like `"artic"`, `"van"`, `"7.5t"`, `"flatbed"` which don't match the DB enum `vehicle_type` (`standard | tailift | oog | curtain_side`). Added `normaliseVehicle()` mapper in the poller to coerce raw strings to valid enum values (or null).
- **Datetime string insert errors** - Parser returned strings like `"18 April 2026, by 17:00"` which Postgres rejected for `TIMESTAMPTZ` columns. Added `toIsoTimestamp()` in the poller to parse `DD Month YYYY [HH:MM]` patterns into valid ISO strings before insert; unparseable values become `null` instead of failing the whole request.
- **Customer ref regex grabbing word fragments** - Pattern `/(?:order|po)\s*.../` was matching inside `po`tential / `po`ssible / `po`stcode. Added `\b` word boundaries and required a separator (colon/number/hash) after the keyword, so only real references like `PO-45872-A`, `CR-2026-0417` are captured.

### Added
- **Manual poll endpoint** - `POST /api/emails/poll` (auth required) triggers an immediate poll cycle. Accepts `{ reset: true }` to reset the in-memory `lastSeenUid` tracker - useful after a DB wipe to reconsider every message in the inbox.
- **Refresh inbox button** - Added to `TriageQueue.jsx` and `BookingsIntake.jsx` (top-right). Calls `POST /api/emails/poll` and re-fetches the list when polling completes. Removes the 60-second wait for the next automatic poll tick.
- **Vite host binding** - `client/vite.config.js` now sets `server.host: true` so the dev server listens on `0.0.0.0` and is reachable from other machines on the LAN.
- **NETLIFY_MIGRATION.md** - Plan for future Vercel -> Netlify migration using `serverless-http`. Deferred until Azure AD Graph API credentials land.
- **TEST_RESET_PLAN.md** - SQL + Supabase dashboard steps to wipe operational data, keep admin + templates + pricing rules, add 3 member accounts, and wire a real Gmail inbox via IMAP app password for local UAT.
- **test-emails/** - Reproducible UAT fixtures: `generate.py` produces 3 PDFs, 1 DOCX, and 1 XLSX covering standard / hazardous / bulk multi-order / out-of-gauge / tail-lift scenarios plus query and missing-fields text emails.

---

## [0.1.2] - 2026-04-13

### Fixed
- **Auth deadlock on page refresh** - Moved `fetchProfile()` out of `onAuthStateChange` callback to prevent Supabase internal lock deadlock ([supabase-js#2126](https://github.com/supabase/supabase-js/issues/2126)). The callback now only updates React state - all DB queries run in a separate `useEffect` with `setTimeout(0)` deferral.
- **Dashboard API timeout** - Replaced N+1 sequential queries with single bulk-fetch queries. `/hourly` went from 24 queries to 1, `/weekly` from 7 to 1, `/stats` runs 5 queries in parallel via `Promise.all`.
- **Serverless function crash** - Lazy-load `imapflow`, `mailparser`, `pdf-parse`, `mammoth`, `xlsx` via dynamic `import()` to prevent Vercel bundling failures.
- **500 error handling in API client** - `api.js` now throws a clear message on server errors instead of trying to parse the error body.

### Added
- **Versioning system** - `client/src/lib/version.js` controls app version and cache flushing. Version displayed in sidebar.
- **Cache busting** - When `FLUSH_CACHE` is `true` in `version.js`, old browser caches are cleared on first load of new version. Set to `false` after confirming deploy stability.
- **Auth error screen** - `ProtectedRoute` shows a "Something went wrong" modal with Retry and Sign out buttons when auth fails, instead of infinite spinner.
- **10-second auth failsafe timeout** - If auth initialization hangs (network, Supabase down), the error modal appears automatically.
- **Cache-control headers** - `vercel.json` sets `no-cache` on HTML, `immutable` on hashed assets.
- **ARCHITECTURE.md** - Full system design and folder structure doc.
- **TROUBLESHOOTING.md** - Production issue log with root causes and fixes.
- **POST_MVP_PLAN.md** - Roadmap for repo split, logging, and production hardening.

### Changed
- `vercel.json` - `maxDuration` increased from 10s to 30s for cold start headroom. Added `includeFiles` for server source bundling.
- `index.html` - Title changed from "client" to "Linkworks CRM".

---

## [0.1.1] - 2026-04-13

### Fixed
- **Vercel deployment config** - Added server dependencies to root `package.json` so they're available to the serverless function.

---

## [0.1.0] - 2026-04-13

### Added
- Initial MVP release.
- React 19 SPA with 12 pages (Dashboard, Bookings, Processing, Output, Quality, Triage, Request Detail, Audit, Pricing, Team, Templates, Login).
- Express 5 REST API with 9 route modules.
- Supabase Auth (JWT) with role-based access (admin/member).
- Email ingestion pipeline - IMAP adapter, classifier, parser, attachment extraction.
- Email reply system - SMTP sending with template engine.
- Vercel deployment - static frontend + serverless API function.
- Database schema with RLS policies, audit logging, pricing rules.

---

## Version Management

### How to release a new version

1. Update `APP_VERSION` in `client/src/lib/version.js`
2. Set `FLUSH_CACHE = true` if cache busting is needed for this release
3. Update version in all three `package.json` files (root, client, server)
4. Add entry to this changelog
5. Commit and push

### How cache busting works

- `client/src/lib/version.js` exports `APP_VERSION` and `FLUSH_CACHE`
- On app load, `main.jsx` compares `APP_VERSION` against `localStorage`
- If `FLUSH_CACHE` is `true` and the version has changed:
  - Clears all browser Cache API entries
  - Stores the new version in `localStorage`
  - Reloads the page once (only for returning users, not first visits)
- After confirming the deploy is stable, set `FLUSH_CACHE = false` in the next patch to avoid unnecessary reloads for late visitors

### When to bump which number

| Change type | Bump | Example |
|-------------|------|---------|
| DB schema change, API contract break | MAJOR | 1.0.0 |
| New page, new API endpoint, new feature | MINOR | 0.2.0 |
| Bug fix, performance fix, config change | PATCH | 0.1.3 |
