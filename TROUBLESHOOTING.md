# Linkworks CRM - Troubleshooting Guide

> A record of production issues encountered, their root causes, and how they were fixed. Reference this before debugging similar problems.

---

## Issue 1: Vercel API Returns 500 - FUNCTION_INVOCATION_FAILED

**Symptom:** All `/api/*` endpoints return `{"error":{"code":"500","message":"A server error has occurred"}}`. The Vercel function logs show `FUNCTION_INVOCATION_FAILED`.

**Root Cause:** The serverless function crashed at module load time. The Express app (`server/src/index.js`) imports the email poller, which imports `imapflow`, `mailparser`, `pdf-parse`, `mammoth`, and `xlsx` at the top level. These heavy Node.js packages with native bindings fail to bundle in Vercel's serverless runtime. They are only needed for email polling (which doesn't even run on Vercel), but because they were top-level `import` statements, they were evaluated during cold start and crashed the function before it could serve any request.

Additionally, `attachmentParser.js` used `createRequire(import.meta.url)` to load `pdf-parse` as CommonJS - Vercel's bundler cannot handle this pattern.

**Fix:**
- Changed all heavy packages to lazy dynamic `import()` - they only load when actually called
- Files changed: `server/src/services/email/adapter.js`, `server/src/services/attachmentParser.js`
- Added `includeFiles: "server/src/**"` to `vercel.json` to ensure server source is bundled

**How to verify:** `curl https://linkworks-crm.vercel.app/api/dashboard/stats` should return JSON, not a 500 error.

**Lesson:** Never top-level import heavy/native packages in code paths that run on serverless. Use dynamic `import()` for anything that isn't needed on every request.

---

## Issue 2: Vercel API Returns 500 - Task Timed Out After 10 Seconds

**Symptom:** API calls like `/api/dashboard/hourly` return `Vercel Runtime Timeout Error: Task timed out after 10 seconds`.

**Root Cause:** The dashboard routes used sequential database queries in loops:
- `/api/dashboard/hourly` made **24 separate Supabase queries** (one per hour of the day)
- `/api/dashboard/weekly` made **7 separate queries** (one per day)
- `/api/dashboard/stats` made **5 sequential queries**

Each Supabase query has ~300-900ms network latency from Vercel to Supabase. 24 queries x 400ms = ~10 seconds, hitting the timeout.

**Fix:**
- `/hourly`: single query fetches all today's requests, groups by hour in JavaScript
- `/weekly`: single query fetches last 7 days, groups by date in JavaScript
- `/stats`: 5 count queries run in parallel via `Promise.all`
- Bumped `maxDuration` from 10s to 30s in `vercel.json` for cold start headroom
- File changed: `server/src/routes/dashboard.js`, `vercel.json`

**How to verify:** API response times should be under 2 seconds.

**Lesson:** Never loop DB queries in serverless functions. Fetch data in bulk and process in code. Use `Promise.all` for independent queries.

---

## Issue 3: Infinite Loading Spinner on Page Refresh

**Symptom:** After logging in, refreshing the page shows an infinite loading spinner. The app never resolves to the dashboard or the login page.

**Root Cause (Layer 1 - the real bug):** The `AuthContext` used `supabase.auth.getSession()` to get the session on page load, then called `fetchProfile()` to get the user's role from the `profiles` table. The problem:

- `getSession()` in Supabase JS v2 returns the session from **localStorage without refreshing the token**
- If the access token is expired (1-hour default lifetime), `getSession()` returns it as-is
- `fetchProfile()` uses this expired token to query the `profiles` table
- Supabase RLS evaluates `auth.uid()` which returns `null` for expired JWTs
- The query fails, and `loading` state was never set to `false`

**Root Cause (Layer 2 - missing error handling):** The original `getSession().then()` chain had no `.catch()` handler. If anything threw, `setLoading(false)` was never called.

**What did NOT work:**
1. Adding `.catch()` to `getSession()` - fixed the missing handler but didn't fix the expired token issue
2. Adding a hard timeout (8s) - masked the problem, caused a retry loop because the underlying issue persisted on every reload
3. Using `getUser()` instead of `getSession()` - `getUser()` also does NOT refresh tokens; it just validates the current access token and returns 403 if expired. This made normal refreshes fail too.

**What fixed it:** Using `onAuthStateChange` with the `INITIAL_SESSION` event (Supabase JS v2.39+):
```javascript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'INITIAL_SESSION') {
    // Token is already refreshed by this point
    // Safe to fetch profile and set loading = false
  }
})
```

The Supabase client automatically refreshes the access token using the refresh token BEFORE firing `INITIAL_SESSION`. By the time the callback runs, the session has a valid (non-expired) access token - or is `null` if the refresh token is also dead.

**Failsafe:** A 10-second timeout shows a "Something went wrong" modal with Retry and Sign out buttons if auth initialization hangs for any reason (network issues, Supabase downtime, etc.).

**File changed:** `client/src/contexts/AuthContext.jsx`

**How to verify:**
1. Log in, wait 1+ hours (or manually expire the token), refresh - should load normally
2. Kill network, refresh - should show error modal after 10 seconds with Retry + Sign out

**Lesson:** 
- `getSession()` does NOT refresh tokens - it reads from localStorage as-is
- `getUser()` does NOT refresh tokens - it validates the current access token
- `onAuthStateChange` with `INITIAL_SESSION` is the Supabase-recommended pattern for initializing auth state, because the client handles token refresh internally before firing the event
- Always have a failsafe timeout for auth initialization

---

## Issue 4: VITE_SUPABASE_ANON_KEY Not Reaching the Build

**Symptom:** The deployed JS bundle contains `"placeholder"` instead of the actual Supabase anon key, causing all client-side Supabase queries to fail with `Invalid API key`.

**Root Cause:** Vite only exposes environment variables prefixed with `VITE_` to the client build. These are baked in at **build time**, not runtime. If the env var is added to Vercel after the last deployment, it won't appear in the bundle until a redeploy.

**How to diagnose:** Pull the deployed JS bundle and search for the key:
```bash
curl -s "https://linkworks-crm.vercel.app/" | grep -oP 'index-[^"]+\.js'
# get the bundle filename, then:
curl -s "https://linkworks-crm.vercel.app/assets/<bundle>.js" | grep -oP 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -3
```
If you see the full 3-part JWT, the key is set. If you only see `placeholder`, it's missing.

**Fix:** 
1. Set `VITE_SUPABASE_ANON_KEY` in Vercel dashboard (Settings -> Environment Variables)
2. Make sure **Production** environment is checked
3. Trigger a redeploy (Deployments -> latest -> Redeploy)

**Required Vercel Environment Variables:**

| Variable | Used by | Build/Runtime |
|----------|---------|---------------|
| `VITE_SUPABASE_URL` | Client (Vite) | Build time |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite) | Build time |
| `SUPABASE_URL` | Server (Express) | Runtime |
| `SUPABASE_SERVICE_KEY` | Server (Express) | Runtime |
| `SUPABASE_ANON_KEY` | Server (Express) | Runtime |

**Lesson:** `VITE_` env vars are baked into the JS bundle at build time. Always verify they're present in the deployed bundle, not just in the Vercel dashboard. A redeploy is required after adding/changing them.

---

## Issue 5: Chromium Browser Cache Serving Stale JS Bundle

**Symptom:** After deploying a fix, the browser still runs old code. Hard refresh (`Ctrl+Shift+R`) fixes it.

**Root Cause:** Vercel's default caching headers allow browsers to cache `index.html`. Even though Vite uses content-hashed filenames for JS/CSS assets (e.g., `index-BRlpXBU8.js`), the `index.html` that references them was being served from browser cache, pointing to the old bundle.

**Fix:** Added cache-control headers in `vercel.json`:
- `index.html` and `/`: `no-cache, no-store, must-revalidate` - browser always fetches fresh HTML
- `/assets/*`: `public, max-age=31536000, immutable` - hashed assets cached forever (filename changes on rebuild)

**File changed:** `vercel.json`

**How to verify:** After deploy, a normal refresh (not hard refresh) should load the new code.

**Lesson:** Always set `no-cache` on `index.html` for SPAs. Hashed assets can be cached aggressively since their filenames change on every build.

---

## Quick Diagnostic Commands

**Check if API is working:**
```bash
curl -s "https://linkworks-crm.vercel.app/api/dashboard/stats" -H "Authorization: Bearer <token>"
```

**Check what's baked into the deployed JS bundle:**
```bash
# Get bundle filename
curl -s "https://linkworks-crm.vercel.app/" | grep -oP 'index-[^"]+\.js'

# Check for Supabase URL
curl -s "https://linkworks-crm.vercel.app/assets/<bundle>.js" | grep -oP 'ekxtmthchkvhzxelzbjt'

# Check for anon key (should be a 3-part JWT)
curl -s "https://linkworks-crm.vercel.app/assets/<bundle>.js" | grep -oP 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
```

**Check if a JWT is expired:**
```bash
# Decode the payload (middle part of the JWT)
echo "<middle-part>" | base64 -d 2>/dev/null | python3 -m json.tool
# Look at the "exp" field - that's the Unix timestamp of expiry
```

**Test Supabase profile query directly:**
```bash
curl -s "https://<project>.supabase.co/rest/v1/profiles?select=role&id=eq.<user-id>" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <access-token>"
```
