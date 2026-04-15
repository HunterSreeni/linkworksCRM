# Linkworks CRM - Post-MVP Plan

> This document outlines the changes to make once the MVP is validated and we get the green light to professionalize the codebase.

---

## Current State (MVP)

- Monorepo: `client/`, `server/`, `api/` all in one repo
- Deployed on Vercel (frontend as static, backend as serverless function)
- Logging via `console.log` / `console.error`
- No structured error tracking or monitoring
- No CI/CD pipeline beyond Vercel auto-deploy

---

## Phase 1: Split Into Separate Repos

**Goal:** Independent deployment, versioning, and maintenance for frontend and backend.

### Frontend Repo (`linkworks-web`)

```
linkworks-web/
  src/
    components/
    contexts/
    lib/
    pages/
    assets/
  vite.config.js
  package.json
  vercel.json         # Static site config only
  .env.example
```

- Deploy as static site on Vercel (or Netlify)
- `VITE_API_URL` env var points to backend URL
- No more `/api` proxy - direct CORS requests to backend

### Backend Repo (`linkworks-api`)

```
linkworks-api/
  src/
    config/
    middleware/
    routes/
    services/
    utils/
    index.js
  supabase/
    schema.sql
  package.json
  vercel.json         # Serverless function config
  .env.example
```

- Deploy as standalone API on Vercel serverless (or Railway/Render for persistent process)
- Own domain: `api.linkworks.ai` or similar
- CORS configured to allow only the frontend origin

### Migration Steps

1. Create two new GitHub repos
2. Move `client/` contents to `linkworks-web`
3. Move `server/` and `api/` contents to `linkworks-api`
4. Update `api.js` in frontend to use `VITE_API_URL` (already supports this)
5. Add CORS origin whitelist in backend
6. Set up env vars in both Vercel projects
7. Verify both deploy independently
8. Archive the monorepo

---

## Phase 2: Backend Logging

**Goal:** Structured, queryable logs for debugging and monitoring.

### What to Add

| Area | Current | Target |
|------|---------|--------|
| Request logging | `morgan('combined')` | Structured JSON logs with request ID |
| Error logging | `console.error` | Logger with levels (error, warn, info, debug) |
| Request tracing | None | Unique request ID in every log line |
| Audit trail | DB-only | DB + structured log for backup |
| Performance | None | Response time logged per request |

### Implementation Plan

1. **Add a logger module** - Use `pino` (fast, JSON output, works well with Vercel)
   - Log levels: error, warn, info, debug
   - JSON format for machine parsing
   - Pretty-print in dev mode

2. **Request ID middleware** - Generate UUID per request, attach to all logs
   ```
   [req-abc123] POST /api/requests 201 45ms
   [req-abc123] Created request r-456 from booking email
   ```

3. **Replace all console.log/error** - Grep and replace across codebase
   - `console.log` -> `logger.info`
   - `console.error` -> `logger.error`

4. **Error logging middleware** - Catch unhandled errors with full stack trace + request context

5. **Health check enhancements** - Add DB connectivity check, response time

### Packages

- `pino` - Logger (current latest: v9.x)
- `pino-pretty` - Dev-mode pretty printing
- `uuid` - Already installed, reuse for request IDs

---

## Phase 3: Professionalize

**Goal:** Production-grade reliability, security, and developer experience.

### Error Handling

- [ ] Global error boundary in React frontend (catch rendering crashes)
- [ ] API error responses with consistent format: `{ error: string, code: string, requestId: string }`
- [ ] Retry logic in `api.js` for transient failures (503, network errors)
- [ ] Dead letter queue for failed email processing

### Security

- [ ] Rate limiting on auth endpoints (`express-rate-limit`)
- [ ] Input validation with `zod` on all API endpoints
- [ ] Remove API key auth fallback (MVP-only feature)
- [ ] Add CSRF protection if needed
- [ ] Rotate Supabase service key, ensure old keys are revoked

### CI/CD

- [ ] GitHub Actions for both repos
  - Lint + type check on PR
  - Run tests (once tests exist)
  - Auto-deploy on merge to main
- [ ] Branch preview deployments on Vercel

### Monitoring

- [ ] Error tracking (Sentry free tier or similar)
- [ ] Uptime monitoring on `/health` endpoint
- [ ] Vercel function usage dashboard review

### Developer Experience

- [ ] `.env.example` files with all required vars documented
- [ ] `docker-compose.yml` for local dev (Supabase local + API + client)
- [ ] API documentation (OpenAPI/Swagger or simple markdown)
- [ ] Contributing guide

---

## Priority Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Repo split | Medium | High - unblocks independent deploys |
| 2 | Structured logging (pino) | Low | High - essential for debugging production |
| 3 | Request ID tracing | Low | Medium - correlate logs per request |
| 4 | Global error boundary (FE) | Low | Medium - graceful crash recovery |
| 5 | Rate limiting | Low | Medium - prevent abuse |
| 6 | Input validation (zod) | Medium | High - security + data integrity |
| 7 | CI/CD pipeline | Medium | High - catch issues before deploy |
| 8 | Error tracking (Sentry) | Low | Medium - proactive issue detection |
| 9 | API docs | Medium | Medium - team onboarding |
| 10 | Docker local dev | Medium | Low - nice to have |

---

## Timeline Estimate

- **Phase 1 (Repo split):** Can be done in a single session
- **Phase 2 (Logging):** Half a session - mostly mechanical replacement
- **Phase 3 (Professionalize):** Incremental - pick items as needed

> None of this should be started until the MVP is validated and we get the go-ahead.
