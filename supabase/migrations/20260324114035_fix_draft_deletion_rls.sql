-- Fix conflicting RLS policies that prevent draft deletion
-- This script updates the RLS policies to allow hosts to both update and soft-delete their drafts

-- Drop the conflicting policies
DROP POLICY IF EXISTS "Hosts can update their drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can soft-delete their drafts" ON drafts;

-- Create unified policy that allows both normal updates and soft-deletes
CREATE POLICY "Hosts can update their drafts" ON drafts
  FOR UPDATE
  USING (
    host_id = auth.uid()::text
    OR auth.jwt() ->> 'role' = 'admin'
  )
  WITH CHECK (
    host_id = auth.uid()::text
    OR auth.jwt() ->> 'role' = 'admin'
  );
