# Linkworks CRM - Architecture & Folder Design

> This document maps out the full system design, folder structure, and where each piece of code lives. Written for developers and AI assistants working on this codebase.

---

## System Overview

Linkworks CRM is a logistics docket management system for processing booking requests from emails. It consists of:

- **Frontend** - React 19 SPA (Vite, Tailwind CSS 4, Recharts)
- **Backend** - Node.js/Express 5 REST API
- **Database** - Supabase (PostgreSQL) with Row Level Security
- **Auth** - Supabase Auth (JWT-based)
- **Deployment** - Vercel (frontend as static, backend as serverless function)

---

## Folder Structure

```
BalajiCSE/
|
|-- api/                          # Vercel serverless function entry point
|   |-- index.js                  # Re-exports Express app for Vercel runtime
|
|-- client/                       # React frontend (SPA)
|   |-- src/
|   |   |-- main.jsx              # React root - mounts <App /> to #root
|   |   |-- App.jsx               # Router config - all routes defined here
|   |   |-- App.css               # App-level styles
|   |   |-- index.css             # Global styles + Tailwind import
|   |   |
|   |   |-- lib/
|   |   |   |-- api.js            # HTTP client wrapper - adds Bearer token to all requests
|   |   |   |-- supabase.js       # Supabase client singleton (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
|   |   |
|   |   |-- contexts/
|   |   |   |-- AuthContext.jsx   # Auth state provider - user, session, role, signIn/signOut
|   |   |
|   |   |-- components/
|   |   |   |-- Layout.jsx        # Main layout - collapsible sidebar + header + <Outlet />
|   |   |   |-- ProtectedRoute.jsx# Route guard - redirects to /login if unauthenticated
|   |   |
|   |   |-- pages/
|   |   |   |-- LoginPage.jsx         # Email/password login form
|   |   |   |-- Dashboard.jsx         # Stats cards + weekly/hourly charts + team activity
|   |   |   |-- BookingsIntake.jsx     # New booking submission form
|   |   |   |-- ProcessingTracker.jsx  # Track requests in progress
|   |   |   |-- OutputTracker.jsx      # Completed/delivered requests view
|   |   |   |-- Quality.jsx           # Quality control & validation
|   |   |   |-- TriageQueue.jsx        # Email classification queue (unclassified emails)
|   |   |   |-- RequestDetail.jsx      # Full request view/edit (largest page - 18KB)
|   |   |   |-- AuditTrails.jsx        # User action audit logs
|   |   |   |-- PricingInfo.jsx        # Pricing rules management (admin only)
|   |   |   |-- TeamManagement.jsx     # User/team management (admin only)
|   |   |   |-- TemplateManagement.jsx # Email template editor (admin only)
|   |   |
|   |   |-- assets/               # Static assets (images, SVGs)
|   |
|   |-- vite.config.js            # Vite build config - proxy /api to localhost:3001 in dev
|   |-- package.json              # Frontend dependencies
|   |-- index.html                # HTML shell
|
|-- server/                       # Express backend
|   |-- src/
|   |   |-- index.js              # Express app setup - middleware, route mounting, export
|   |   |-- seed.js               # Database seeder (npm run seed / seed:clear)
|   |   |
|   |   |-- config/
|   |   |   |-- supabase.js       # Supabase clients - supabaseAdmin (service key) + supabaseAnon
|   |   |
|   |   |-- middleware/
|   |   |   |-- auth.js           # Auth middleware - JWT validation + API key fallback + role check
|   |   |
|   |   |-- routes/
|   |   |   |-- auth.js           # POST /api/auth/login, /signup, /logout, GET /me
|   |   |   |-- dashboard.js      # GET /api/dashboard/stats, /weekly, /hourly, /team-activity
|   |   |   |-- requests.js       # CRUD /api/requests - booking request management + audit logging
|   |   |   |-- emails.js         # GET/POST /api/emails - email listing + classification
|   |   |   |-- reply.js          # POST /api/reply - send email replies via SMTP/Graph API
|   |   |   |-- templates.js      # CRUD /api/templates - email template management
|   |   |   |-- pricing.js        # CRUD /api/pricing - vehicle pricing rules
|   |   |   |-- users.js          # CRUD /api/users - user/team management
|   |   |   |-- audit.js          # GET /api/audit - audit log queries
|   |   |
|   |   |-- services/
|   |   |   |-- attachmentParser.js   # PDF/Word/Excel parsing (lazy-loaded deps for Vercel)
|   |   |   |-- email/
|   |   |   |   |-- adapter.js        # Email adapters - IMAP + Graph API (lazy-loaded deps)
|   |   |   |   |-- poller.js         # Email polling service - fetch, classify, create requests
|   |   |   |   |-- classifier.js     # Rule-based email classification (booking/query/bounce/noise)
|   |   |   |   |-- parser.js         # Extract logistics fields from email text (regex-based)
|   |   |
|   |   |-- utils/
|   |       |-- templateEngine.js # Mustache-style {{placeholder}} replacement for email templates
|   |
|   |-- supabase/
|   |   |-- schema.sql            # Full database schema - tables, enums, indexes, triggers
|   |
|   |-- package.json              # Backend dependencies
|   |-- .env                      # Local env vars (gitignored)
|
|-- vercel.json                   # Vercel deployment config
|-- package.json                  # Root package.json - dev scripts + server deps for Vercel
|-- .gitignore
```

---

## How the System Works

### Request Flow

```
Email arrives
  -> Poller fetches via IMAP/Graph API (server-only, not on Vercel)
  -> Classifier categorizes: booking | query | bounce | noise | auto_reply
  -> Parser extracts logistics fields (addresses, dates, weight, etc.)
  -> AttachmentParser extracts text from PDF/Word/Excel attachments
  -> Request record created in DB with confidence scores
  -> Appears in Triage Queue or directly as a Draft request

User processes request:
  Dashboard -> Triage Queue -> BookingsIntake -> ProcessingTracker -> OutputTracker
  
  Draft -> Confirmed -> Processing -> Replied -> Closed
                                              -> Delivery Failed (on bounce)
```

### Authentication Flow

```
Client                          Server                      Supabase
  |                               |                            |
  |-- signIn(email, pass) ------->|                            |
  |                               |-- auth.signInWithPassword->|
  |                               |<-- session + JWT ----------|
  |<-- session --------------------|                            |
  |                               |                            |
  |-- API request + Bearer JWT -->|                            |
  |                               |-- auth.getUser(token) ---->|
  |                               |<-- user data --------------|
  |                               |-- profiles.select() ------>|
  |                               |<-- role, is_active --------|
  |<-- response ------------------|                            |
```

### Local Development

```bash
# From root - starts both server and client
npm run dev

# Server only (port 3001)
cd server && npm run dev

# Client only (port 5173, proxies /api to :3001)
cd client && npm run dev

# Seed database
cd server && npm run seed
cd server && npm run seed -- --clear  # clear + re-seed
```

---

## Mail Sources - Test vs Production

The system has **two mail source adapters**, and which one runs depends on the environment. This distinction matters for deployment, cost modelling, and state design:

| Environment | Source | Mechanism | Where it runs |
|-------------|--------|-----------|----------------|
| **Production** | Single Microsoft 365 shared mailbox | Graph API change notifications (webhooks) | Netlify function endpoint receives pushed events |
| **UAT / local testing only** | Gmail inbox (`daily.test4@gmail.com`) | IMAP polling with app password | Balaji's local machine during UAT |

**Key design consequence:** IMAP polling is scaffolding. It is only active when `EMAIL_POLLING_ENABLED=true` and the IMAP credentials are present in `server/.env`. It is **not** expected to run in the deployed production environment.

**Implications:**
- No always-on worker is required in production. Netlify free tier is sufficient because webhooks are push-based (~100-500 invocations/month from mail events).
- In-memory polling state (like the historical `lastSeenUid` variable) is a test-path concern; the webhook path doesn't accumulate state between events.
- When Azure AD / Graph credentials arrive from the client, the Graph adapter becomes the sole production path. IMAP stays in the codebase purely to support local UAT and future test environments.
- Feature design, pricing estimates, and performance discussions should assume Graph webhooks as the baseline, not polling.

For the deferred Netlify hosting migration, see `NETLIFY_MIGRATION.md`.

---

## Vercel Deployment

The app deploys to Vercel as:
- **Static site** - client/dist (Vite build output)
- **Serverless function** - api/index.js (re-exports the Express app)

### How it works

1. `vercel.json` tells Vercel to build the client and serve from `client/dist`
2. The `api/index.js` file exports the Express app as a Vercel serverless function
3. A rewrite rule sends all `/api/*` requests to the serverless function
4. Express handles routing internally (same routes as local dev)

### Required Environment Variables (set in Vercel dashboard)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Anonymous/public key |
| `VITE_SUPABASE_URL` | Same URL, exposed to client build |
| `VITE_SUPABASE_ANON_KEY` | Anon key, exposed to client build |
| `SMTP_HOST` | SMTP server for sending replies |
| `SMTP_PORT` | SMTP port (587 or 465) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `API_KEY` | Optional - for MVP API key auth |

### Vercel Limitations

- Email polling does NOT run on Vercel (serverless = stateless, no long-running processes)
- IMAP connections are not possible in serverless functions
- The `imapflow`, `mailparser`, `pdf-parse`, `mammoth`, and `xlsx` packages are lazy-loaded to avoid bundling crashes

---

## Database Schema (Key Tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `profiles` | User accounts (extends Supabase auth.users) | id, email, full_name, role (admin/member), is_active |
| `emails` | Inbound/outbound email records | id, direction, classification, subject, from/to, body, attachments |
| `attachments` | Email file attachments | id, email_id (FK), filename, content_type, size |
| `requests` | Booking/delivery requests | id, status, addresses, dates, cargo details, pricing, assignment |
| `email_templates` | Reusable reply templates | id, name, subject_template, body_template, {{placeholders}} |
| `pricing_rules` | Vehicle pricing + hazard surcharges | id, vehicle_type, is_hazardous, base_price, price_per_kg |
| `audit_log` | Immutable action log | id, user_id, action, entity_type, entity_id, details (JSONB) |

### Enums

- `user_role`: admin, member
- `request_status`: draft, confirmed, processing, replied, closed, delivery_failed
- `email_direction`: inbound, outbound
- `email_classification`: booking, query, bounce, noise, auto_reply, unclassified
- `vehicle_type`: standard, tailift, oog, curtain_side
- `confidence_level`: extracted, uncertain, missing

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | No | Sign in with email/password |
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/logout | Yes | Sign out |
| GET | /api/auth/me | Yes | Get current user profile |
| GET | /api/dashboard/stats | Yes | Overview statistics |
| GET | /api/dashboard/weekly | Yes | Requests per day (last 7 days) |
| GET | /api/dashboard/hourly | Yes | Requests per hour (today) |
| GET | /api/dashboard/team-activity | Yes | Team member active/idle status |
| GET | /api/requests | Yes | List requests (filterable) |
| POST | /api/requests | Yes | Create a request |
| GET | /api/requests/:id | Yes | Get request detail |
| PATCH | /api/requests/:id | Yes | Update request fields |
| GET | /api/emails | Yes | List emails (filterable by classification) |
| POST | /api/emails/:id/classify | Yes | Classify an email |
| POST | /api/reply | Yes | Send email reply |
| GET | /api/templates | Yes | List email templates |
| POST | /api/templates | Admin | Create template |
| PATCH | /api/templates/:id | Admin | Update template |
| DELETE | /api/templates/:id | Admin | Delete template |
| GET | /api/pricing | Yes | List pricing rules |
| POST | /api/pricing | Admin | Create pricing rule |
| PATCH | /api/pricing/:id | Admin | Update pricing rule |
| GET | /api/users | Admin | List users |
| PATCH | /api/users/:id | Admin | Update user role/status |
| GET | /api/audit | Yes | Query audit logs |

---

## Client Routes

| Path | Component | Access | Description |
|------|-----------|--------|-------------|
| /login | LoginPage | Public | Login form |
| / | Dashboard | Protected | Main dashboard with stats and charts |
| /bookings | BookingsIntake | Protected | Submit new bookings |
| /processing | ProcessingTracker | Protected | Track in-progress requests |
| /output | OutputTracker | Protected | View completed requests |
| /quality | Quality | Protected | Quality control |
| /triage | TriageQueue | Protected | Email classification queue |
| /requests/:id | RequestDetail | Protected | View/edit single request |
| /audit | AuditTrails | Protected | Audit log viewer |
| /pricing | PricingInfo | Admin only | Pricing rules management |
| /team | TeamManagement | Admin only | User management |
| /templates | TemplateManagement | Admin only | Email template editor |

---

## Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | React | 19.2 |
| Routing | React Router | 7.14 |
| Build tool | Vite | 8.0 |
| CSS | Tailwind CSS | 4.2 |
| Icons | Lucide React | 1.8 |
| Charts | Recharts | 3.8 |
| Backend framework | Express | 5.2 |
| Database | Supabase (PostgreSQL) | - |
| Auth | Supabase Auth | 2.103 |
| Email (IMAP) | ImapFlow | 1.3 |
| Email (parsing) | Mailparser | 3.9 |
| Email (sending) | Nodemailer | 8.0 |
| PDF parsing | pdf-parse | 2.4 |
| Word parsing | Mammoth | 1.12 |
| Excel parsing | SheetJS (xlsx) | 0.18 |
| Deployment | Vercel | - |
