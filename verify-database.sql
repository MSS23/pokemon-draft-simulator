-- Run this in Supabase SQL Editor to verify RLS policies are active

-- Check if RLS policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd as operation,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Expected output: Should show 20+ policies across 7 tables
-- If you see no results, RLS migration needs to be applied!

-- Quick count by table
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Expected counts:
-- drafts: 4 policies
-- teams: 4 policies
-- participants: 4 policies
-- picks: 3 policies
-- auctions: 4 policies
-- bid_history: 2 policies
-- (more if you have additional tables)
