-- Migration: tighten requests UPDATE RLS to match SELECT policy.
-- v0.1.8 - Previously `USING (true)` allowed any authenticated member to
-- update rows they couldn't even SELECT. Now an UPDATE requires the same
-- visibility rule as SELECT: admin, assigned to the user, or unassigned
-- draft that anyone can pick up.
--
-- Run once in the Supabase SQL editor.

DROP POLICY IF EXISTS requests_update_policy ON requests;

CREATE POLICY requests_update_policy ON requests
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR assigned_to = auth.uid()
    OR (assigned_to IS NULL AND status = 'draft')
  )
  WITH CHECK (
    is_admin()
    OR assigned_to = auth.uid()
    OR (assigned_to IS NULL AND status = 'draft')
  );
