# Changelog

All notable changes to Linkworks CRM are documented here.
Format follows [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0) - Breaking changes, incompatible API/DB changes
- **MINOR** (0.X.0) - New features, backwards-compatible additions
- **PATCH** (0.0.X) - Bug fixes, performance improvements, no new features

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
