-- Migration: Add Soft Delete Support to Drafts Table
-- Purpose: Allow drafts to be soft-deleted so participants can be notified and history is preserved
-- Date: 2025-01-12

-- Add soft delete columns to drafts table
ALTER TABLE drafts
  ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN deleted_by TEXT DEFAULT NULL;

-- Create index for queries that filter out deleted drafts (performance optimization)
CREATE INDEX idx_drafts_not_deleted ON drafts (id) WHERE deleted_at IS NULL;

-- Create index for querying deleted drafts (admin/audit purposes)
CREATE INDEX idx_drafts_deleted_at ON drafts (deleted_at) WHERE deleted_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN drafts.deleted_at IS 'Timestamp when draft was soft-deleted. NULL means not deleted.';
COMMENT ON COLUMN drafts.deleted_by IS 'User ID who deleted the draft (host_id or admin).';

-- Update RLS policies to exclude soft-deleted drafts from normal queries
-- This ensures deleted drafts don't appear in user queries

-- Drop existing SELECT policy if it exists
DROP POLICY IF EXISTS "Users can view drafts they are in" ON drafts;

-- Recreate SELECT policy with soft delete filter
CREATE POLICY "Users can view drafts they are in" ON drafts
  FOR SELECT
  USING (
    deleted_at IS NULL  -- Only show non-deleted drafts
    AND (
      host_id = auth.uid()::text
      OR id IN (
        SELECT draft_id FROM participants WHERE user_id = auth.uid()::text
      )
      OR id IN (
        SELECT draft_id FROM teams WHERE owner_id = auth.uid()::text
      )
    )
  );

-- Admin users can still see deleted drafts for management purposes
CREATE POLICY "Admins can view all drafts including deleted" ON drafts
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );

-- UPDATE policy - unified for both normal updates and soft delete
DROP POLICY IF EXISTS "Hosts can update their drafts" ON drafts;
DROP POLICY IF EXISTS "Hosts can soft-delete their drafts" ON drafts;

-- Unified policy that allows both normal updates and soft-deletes
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

-- Backfill existing data (all current drafts are not deleted)
UPDATE drafts
SET deleted_at = NULL, deleted_by = NULL
WHERE deleted_at IS NULL;

-- Add check constraint to ensure deleted_by is set when deleted_at is set
ALTER TABLE drafts
  ADD CONSTRAINT check_deleted_by_required
  CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
  );

COMMENT ON CONSTRAINT check_deleted_by_required ON drafts IS 'Ensures deleted_by is set when draft is soft-deleted';
