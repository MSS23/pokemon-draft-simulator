-- ============================================================================
-- Migration 028: Extract drafts.password into draft_passwords (service-role-only)
-- ============================================================================
-- Problem: bcrypt password hash was stored on public.drafts.password. Despite
-- attempts in migrations 024/026 to hide that column via column-level
-- privilege REVOKE, PostgREST's `select=*` expansion made the hash readable
-- to anon clients in practice. Migration 027 widened SELECT on the whole
-- table, leaving the hash exposed.
--
-- Fix: Move the hash to a separate table, public.draft_passwords, with RLS
-- enabled and NO policies (so only the service role can read/write it via
-- the privileged server route). The drafts table grows a boolean
-- has_password column so clients can still tell whether a password prompt
-- is required, without ever seeing the hash itself.
--
-- Idempotent: re-running this migration is safe.
-- ============================================================================

-- Step 1: Create draft_passwords (service-role-only store for bcrypt hashes)
CREATE TABLE IF NOT EXISTS public.draft_passwords (
  draft_id   uuid PRIMARY KEY REFERENCES public.drafts(id) ON DELETE CASCADE,
  password   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.draft_passwords IS
  'Service-role-only store for bcrypt-hashed draft passwords. RLS is enabled with NO policies — anon and authenticated roles cannot read this table. Server routes use the service-role client to insert/verify hashes.';

-- Step 2: Enable RLS with no policies (effectively locks the table except for
-- the service role, which bypasses RLS entirely).
ALTER TABLE public.draft_passwords ENABLE ROW LEVEL SECURITY;

-- Step 3: Defensive: revoke any inherited grants from anon/authenticated.
REVOKE ALL ON public.draft_passwords FROM PUBLIC;
REVOKE ALL ON public.draft_passwords FROM anon;
REVOKE ALL ON public.draft_passwords FROM authenticated;
-- service_role bypasses RLS, but explicitly keep table-level rights for safety.
GRANT ALL ON public.draft_passwords TO service_role;

-- Step 4: Add boolean has_password to drafts (safe for clients to read).
ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS has_password boolean NOT NULL DEFAULT false;

-- Step 5: Migrate any existing hashes. Idempotent via ON CONFLICT.
-- Skipped gracefully if the password column has already been dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'drafts'
       AND column_name  = 'password'
  ) THEN
    INSERT INTO public.draft_passwords (draft_id, password)
    SELECT id, password
      FROM public.drafts
     WHERE password IS NOT NULL
    ON CONFLICT (draft_id) DO NOTHING;

    UPDATE public.drafts
       SET has_password = (password IS NOT NULL)
     WHERE has_password IS DISTINCT FROM (password IS NOT NULL);
  END IF;
END
$$;

-- Step 6: Drop the password column from drafts now that the hash lives only
-- in draft_passwords. This is what actually closes the anon-key exposure.
ALTER TABLE public.drafts DROP COLUMN IF EXISTS password;

-- Step 7: Record migration in _migrations.
INSERT INTO public._migrations (name, description, applied_by, rollback_sql)
VALUES (
  '028_extract_drafts_password_to_separate_table',
  'Move bcrypt password hash from public.drafts.password into service-role-only public.draft_passwords; add boolean drafts.has_password for client-side gating. Closes anon-key exposure of the hash that migrations 024/026/027 could not safely close at the column level.',
  'mcp-agent',
  $rb$
-- Rollback: restore password column on drafts and copy data back.
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS password text;
UPDATE public.drafts d
   SET password = dp.password
  FROM public.draft_passwords dp
 WHERE dp.draft_id = d.id;
ALTER TABLE public.drafts DROP COLUMN IF EXISTS has_password;
DROP TABLE IF EXISTS public.draft_passwords;
$rb$
)
ON CONFLICT DO NOTHING;
