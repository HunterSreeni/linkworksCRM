# Changelog

All notable changes to Linkworks CRM are documented here.
Format follows [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0) - Breaking changes, incompatible API/DB changes
- **MINOR** (0.X.0) - New features, backwards-compatible additions
- **PATCH** (0.0.X) - Bug fixes, performance improvements, no new features

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
