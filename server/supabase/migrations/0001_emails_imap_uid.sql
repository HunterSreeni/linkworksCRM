-- Migration: add imap_uid column to emails for durable poll watermark
-- v0.1.6 - Replaces in-memory lastSeenUid tracking with a DB-backed watermark.
-- Run once in the Supabase SQL editor against the project DB.

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS imap_uid INTEGER;

CREATE INDEX IF NOT EXISTS idx_emails_imap_uid_desc
  ON emails(imap_uid DESC NULLS LAST);

COMMENT ON COLUMN emails.imap_uid IS
  'IMAP UID of the source message. Used as a durable poll watermark - SELECT MAX(imap_uid) on poll start avoids re-fetching seen emails after server restart or DB wipe. Null for emails sourced from non-IMAP adapters (e.g. Microsoft Graph webhooks in production).';
