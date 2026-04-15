# Netlify Migration Plan

> Migrate hosting from Vercel to Netlify. Keep Express + Supabase. Express stays as one bundled serverless function wrapped with `serverless-http`.

**Status:** Planned - not executed
**Reason:** Original MVP intent was Netlify + Supabase (free-tier). Vercel was a rushed shipping decision; consolidating back to the planned stack.
**Risk:** Low - no application code changes, only hosting wrapper + config.

---

## Scope

| Component | Change |
|-----------|--------|
| Express app (`server/src/`) | No change |
| React client (`client/`) | No change |
| Supabase (DB + Auth) | No change |
| Route files, middleware, services | No change |
| Serverless wrapper | Replace Vercel's auto-wrap with `serverless-http` |
| Host config | `vercel.json` -> `netlify.toml` |
| Function entry point | `api/index.js` -> `netlify/functions/api.js` |

---

## File Changes

### 1. Add dependency (root `package.json`)

```
npm install serverless-http
```

### 2. Create `netlify/functions/api.js`

```js
import serverless from 'serverless-http';
import app from '../../server/src/index.js';

export const handler = serverless(app);
```

### 3. Create `netlify.toml` (repo root)

```toml
[build]
  command = "npm install && cd client && npm install && npm run build"
  publish = "client/dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
  included_files = ["server/src/**"]

[functions.api]
  timeout = 26

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 4. Delete

- `api/index.js`
- `api/` directory (if empty after)
- `vercel.json`

### 5. `package.json` (root)

- No script changes required for local dev (still `npm run dev`).
- Add `"type": "module"` already present - keep.
- `serverless-http` added to dependencies.

---

## Environment Variables (set in Netlify dashboard)

Same set as Vercel. Copy these over before first deploy:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Anonymous/public key |
| `VITE_SUPABASE_URL` | Exposed to client build |
| `VITE_SUPABASE_ANON_KEY` | Exposed to client build |
| `SMTP_HOST` | SMTP server |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `API_KEY` | Optional MVP API key auth |

---

## Deployment Steps

1. Create Netlify site, connect GitHub repo (branch: `main`).
2. Add all env vars above in Netlify dashboard (Site settings -> Environment variables).
3. Push the file changes above (branch or PR).
4. Netlify auto-builds on push. Verify:
   - `client/dist` built and served
   - `/api/auth/login` responds (proves function wired)
   - Supabase auth round-trip works from the deployed client
5. Update Supabase Auth allowed redirect URLs to include the new Netlify domain.
6. Cut over DNS (if custom domain attached to Vercel): point to Netlify, remove from Vercel.
7. Delete / pause the Vercel project after Netlify is confirmed healthy for 24-48h.

---

## Post-Migration Doc Updates

- `ARCHITECTURE.md` - replace "Vercel" sections with Netlify equivalents:
  - Deployment section (line 15, 168-201)
  - Tech stack table (line 297)
  - Vercel Limitations -> Netlify Limitations (same content: stateless, no IMAP, same 50MB zipped bundle ceiling)
- `CHANGELOG.md` - add entry under next version: "Migrated hosting from Vercel to Netlify."
- `TROUBLESHOOTING.md` - scan for "Vercel" references, update.
- `POST_MVP_PLAN.md` - scan for Vercel assumptions, update.

---

## Known Constraints (unchanged from Vercel)

- **Email polling still won't run on the host.** Netlify Functions are stateless, max 26s per invocation. IMAP polling needs a separate worker (Pi, Render, Railway, or a Netlify Scheduled Function hitting Graph API every N minutes).
- **Cold starts** similar to Vercel (~200-800ms for a bundled Express function).
- **Free tier limits:** 125k function invocations/month, 100 function hours/month, 300 build minutes/month, 100GB bandwidth. Comfortable headroom for an internal CRM.
- **Bundle size:** 50MB zipped / 250MB unzipped (AWS Lambda ceiling). Lazy-loading of `pdf-parse`, `mammoth`, `xlsx`, `imapflow` stays - same reason as Vercel.

---

## Rollback

If Netlify deploy fails or regresses behavior, Vercel project remains configured and deployable from the same repo until explicitly deleted. Revert = re-enable Vercel deployments, restore `vercel.json` and `api/index.js` from git.

---

## References (verify before executing)

- Netlify Functions docs: https://docs.netlify.com/functions/overview/
- `serverless-http` on npm: https://www.npmjs.com/package/serverless-http
- Netlify build config (`netlify.toml`): https://docs.netlify.com/configure-builds/file-based-configuration/
- Netlify Scheduled Functions (for future email polling cron): https://docs.netlify.com/functions/scheduled-functions/
