-- TEMPORARY: Disable RLS to test connection
-- WARNING: Only use this for testing! Re-enable RLS before production!

-- Disable RLS on all tables temporarily
ALTER TABLE IF EXISTS drafts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS picks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auctions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bid_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS draft_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS draft_result_teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wishlists DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT schemaname, tablename, policyname
              FROM pg_policies
              WHERE schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) ||
                ' ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- Verify RLS is disabled
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('drafts', 'teams', 'participants', 'picks', 'auctions');
