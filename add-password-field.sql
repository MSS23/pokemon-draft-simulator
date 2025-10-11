-- Add password field to drafts table for private draft protection
-- Run this in your Supabase SQL Editor

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS password TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN drafts.password IS 'Optional password for non-public drafts. NULL means no password required.';
