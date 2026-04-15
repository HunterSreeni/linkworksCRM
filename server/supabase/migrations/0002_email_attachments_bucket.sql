-- Migration: create private Storage bucket for email attachments
-- v0.1.7 - Enables uploading inbound email attachment binaries (PDF, DOCX,
-- XLSX etc.) to Supabase Storage. Bucket is private; the backend mediates
-- access by generating short-lived signed URLs. Users never hit storage
-- directly.
--
-- Run once in the Supabase SQL editor.

-- Create the bucket if it doesn't already exist.
-- file_size_limit = 50 MB (Supabase free-tier ceiling per file).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- No RLS policies added on storage.objects:
-- - The poller uses the service-role key (bypasses RLS) to upload.
-- - The download endpoint also uses service-role + returns signed URLs to
--   authenticated API callers.
-- - No direct authenticated-role access required.
-- If that ever changes (e.g. letting the frontend upload user avatars),
-- add explicit policies then.
