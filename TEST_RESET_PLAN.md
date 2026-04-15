# Test Data Reset + Gmail UAT Plan

> Clear all test rows, keep schema + admin + templates + pricing rules, add 3 member accounts, wire a real Gmail inbox to the IMAP poller for end-to-end UAT on local machine.

**Status:** Planned - not executed
**Host:** Stays on Vercel (no migration until Azure AD creds land)
**Poller host:** Local machine only (Vercel can't run IMAP)

---

## Accounts

### Kept
| Email | Role |
|-------|------|
| admin@linkworks.ai | admin |

### Removed
All Supabase Auth users + their `profiles` rows EXCEPT `admin@linkworks.ai`.

### New (to create)
| Email | Role | Password |
|-------|------|----------|
| memberone@linkworks.ai | member | Balaji generates |
| membertwo@linkworks.ai | member | Balaji generates |
| memberthree@linkworks.ai | member | Balaji generates |

Create via **Supabase Dashboard -> Authentication -> Users -> Add user** (email + password, mark email confirmed). Then INSERT matching `profiles` row with `role = 'member'` and `is_active = true`.

---

## Data Reset

### Wipe (all rows)
- `audit_log`
- `requests`
- `attachments`
- `emails`

### Keep
- `profiles` - keep admin row only, delete the rest
- `email_templates` - preserve as-is
- `pricing_rules` - preserve as-is (auto-seeded from `schema.sql` anyway)

### SQL (run in Supabase SQL editor, in order)

```sql
-- 1. Truncate operational data (CASCADE handles FK dependencies to requests/emails)
TRUNCATE TABLE audit_log, attachments, requests, emails RESTART IDENTITY CASCADE;

-- 2. Delete non-admin profiles
DELETE FROM profiles WHERE email != 'admin@linkworks.ai';
```

### Then manually in Supabase Dashboard -> Auth -> Users
1. Delete every auth user except `admin@linkworks.ai`.
2. Add the 3 new member users (see table above).
3. For each new auth user, copy the UUID from the Users list.
4. Run this INSERT per new member (replace `<uuid>`):

```sql
INSERT INTO profiles (id, email, full_name, role, is_active)
VALUES
  ('<uuid-one>',   'memberone@linkworks.ai',   'Member One',   'member', true),
  ('<uuid-two>',   'membertwo@linkworks.ai',   'Member Two',   'member', true),
  ('<uuid-three>', 'memberthree@linkworks.ai', 'Member Three', 'member', true);
```

> Note: The existing `server/src/seed.js` is NOT used for this reset. It has its own fixed PROFILES list and would wipe the admin + re-insert demo data. This reset is manual SQL + dashboard actions on purpose.

---

## Gmail IMAP Setup (daily.test4@gmail.com)

### One-time Gmail account prep
1. Sign in to `daily.test4@gmail.com`.
2. Enable **2-Step Verification**: https://myaccount.google.com/security (required for app passwords).
3. Generate an **App Password**: https://myaccount.google.com/apppasswords
   - App name: "Linkworks CRM local"
   - Copy the 16-char password (no spaces). Store securely.
4. Leave IMAP enabled (default in Gmail). Verify at https://mail.google.com/mail/u/0/#settings/fwdandpop -> IMAP Access = Enabled.

### Local `.env` (server/.env)

Add / update these in `server/.env` ONLY (not Vercel - Vercel won't run the poller):

```
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
IMAP_USER=daily.test4@gmail.com
IMAP_PASSWORD=<16-char-app-password-no-spaces>
```

For reply-sending during UAT (optional, if you want to test outbound too):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=daily.test4@gmail.com
SMTP_PASSWORD=<same-app-password>
```

---

## Run the Flow Locally

```bash
# Terminal 1 - backend (loads server/.env, runs poller on schedule)
cd server && npm run dev

# Terminal 2 - frontend
cd client && npm run dev
```

Then:
1. Send a test booking email to `daily.test4@gmail.com` from any other address.
2. Watch the server terminal for `[IMAP] Connected` + poller logs.
3. Open the local frontend (`http://localhost:5173`), sign in as `admin@linkworks.ai`.
4. Verify the email shows up in Triage Queue -> classify as booking -> moves through Draft -> Confirmed -> Processing -> Replied.
5. Test member workflow: sign in as `memberone@linkworks.ai`, confirm they see only non-admin views.

---

## Verification Checklist

- [ ] `SELECT count(*) FROM requests;` -> 0
- [ ] `SELECT count(*) FROM emails;` -> 0 (before first poll)
- [ ] `SELECT count(*) FROM audit_log;` -> 0
- [ ] `SELECT count(*) FROM attachments;` -> 0
- [ ] `SELECT email, role FROM profiles ORDER BY role, email;` -> exactly 1 admin + 3 members
- [ ] `SELECT count(*) FROM email_templates;` -> unchanged
- [ ] `SELECT count(*) FROM pricing_rules;` -> unchanged (preset rows still there)
- [ ] All 4 users can log in via the frontend
- [ ] Poller fetches a new email from `daily.test4@gmail.com` and creates a row in `emails`
- [ ] Classified email produces a `requests` row
- [ ] Audit log records user actions again going forward

---

## Rollback

- Data wipe is destructive; only rollback is Supabase's **Point-in-Time Recovery** (Pro plan) or a pre-reset `pg_dump`. **Before running the SQL above, take a manual backup:** Supabase Dashboard -> Database -> Backups -> "Download backup" (or `pg_dump` via connection string).
- New member accounts can be deleted individually from Auth dashboard.
- Gmail app password can be revoked at https://myaccount.google.com/apppasswords at any time without breaking anything else.

---

## Security Notes

- `daily.test4@gmail.com` app password = inbox access. Keep out of git (already gitignored via `.env`).
- Do NOT set IMAP_* env vars in Vercel. Poller only runs locally; adding them to Vercel wastes cold-start time loading IMAP deps that won't be used.
- Revoke the app password after UAT concludes and before switching to Azure AD / Graph API in production.
