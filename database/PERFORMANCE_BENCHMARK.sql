-- =====================================================
-- PERFORMANCE BENCHMARK SUITE
-- =====================================================
-- Run this BEFORE and AFTER applying optimizations
-- Compare results to verify improvements
-- =====================================================

-- Enable timing
\timing on

-- Set output format
\pset format aligned

-- =====================================================
-- BEFORE RUNNING: Create test data if needed
-- =====================================================

DO $$
BEGIN
  -- Check if we have test data
  IF NOT EXISTS (SELECT 1 FROM drafts LIMIT 1) THEN
    RAISE NOTICE 'WARNING: No test data found. Run this on a database with existing drafts for accurate benchmarks.';
  END IF;
END $$;

-- =====================================================
-- BENCHMARK 1: getDraftState (Old vs New)
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 1: getDraftState Performance'
\echo '======================================================'
\echo ''

-- Get a sample room_code for testing
DO $$
DECLARE
  v_room_code TEXT;
  v_draft_id UUID;
BEGIN
  -- Get first draft
  SELECT room_code, id INTO v_room_code, v_draft_id FROM drafts LIMIT 1;

  IF v_room_code IS NULL THEN
    RAISE EXCEPTION 'No drafts found. Create a test draft first.';
  END IF;

  RAISE NOTICE 'Using room_code: %, draft_id: %', v_room_code, v_draft_id;
END $$;

\echo ''
\echo 'OLD METHOD (5 separate queries):'
\echo '---'

EXPLAIN ANALYZE
SELECT * FROM drafts WHERE room_code = (SELECT room_code FROM drafts LIMIT 1);

EXPLAIN ANALYZE
SELECT * FROM teams WHERE draft_id = (SELECT id FROM drafts LIMIT 1);

EXPLAIN ANALYZE
SELECT * FROM participants WHERE draft_id = (SELECT id FROM drafts LIMIT 1);

EXPLAIN ANALYZE
SELECT * FROM picks WHERE draft_id = (SELECT id FROM drafts LIMIT 1);

EXPLAIN ANALYZE
SELECT * FROM auctions WHERE draft_id = (SELECT id FROM drafts LIMIT 1);

\echo ''
\echo 'NEW METHOD (1 optimized query):'
\echo '---'

-- Only works after migration 017
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_draft_state_optimized'
  ) THEN
    EXECUTE 'EXPLAIN ANALYZE SELECT * FROM get_draft_state_optimized((SELECT room_code FROM drafts LIMIT 1))';
  ELSE
    RAISE NOTICE 'Function get_draft_state_optimized does not exist yet. Run migration 017 first.';
  END IF;
END $$;

-- =====================================================
-- BENCHMARK 2: Team Queries with Picks
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 2: Team with Picks Query'
\echo '======================================================'
\echo ''

\echo 'OLD METHOD (manual JOIN):'
\echo '---'

EXPLAIN ANALYZE
SELECT
  t.*,
  COUNT(p.id) as pick_count,
  COALESCE(SUM(p.cost), 0) as total_spent,
  json_agg(p.*) as picks
FROM teams t
LEFT JOIN picks p ON p.team_id = t.id
WHERE t.id = (SELECT id FROM teams LIMIT 1)
GROUP BY t.id;

\echo ''
\echo 'NEW METHOD (optimized view):'
\echo '---'

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE viewname = 'team_with_picks'
  ) THEN
    EXECUTE 'EXPLAIN ANALYZE SELECT * FROM team_with_picks WHERE team_id = (SELECT id FROM teams LIMIT 1)';
  ELSE
    RAISE NOTICE 'View team_with_picks does not exist yet. Run migration 017 first.';
  END IF;
END $$;

-- =====================================================
-- BENCHMARK 3: Budget Deduction (Atomic vs Manual)
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 3: Budget Deduction Performance'
\echo '======================================================'
\echo ''

\echo 'OLD METHOD (manual UPDATE with SQL injection risk):'
\echo '---'

EXPLAIN ANALYZE
UPDATE teams
SET budget_remaining = budget_remaining - 10
WHERE id = (SELECT id FROM teams LIMIT 1)
RETURNING budget_remaining;

-- Rollback
ROLLBACK;

\echo ''
\echo 'NEW METHOD (atomic RPC function):'
\echo '---'

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'deduct_team_budget'
  ) THEN
    EXECUTE 'EXPLAIN ANALYZE SELECT * FROM deduct_team_budget((SELECT id FROM teams LIMIT 1), 10)';
    RAISE NOTICE 'Note: Function includes validation and error handling (not shown in EXPLAIN)';
  ELSE
    RAISE NOTICE 'Function deduct_team_budget does not exist yet. Run migration 015 first.';
  END IF;
END $$;

-- Rollback
ROLLBACK;

-- =====================================================
-- BENCHMARK 4: RLS Policy Performance
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 4: RLS Policy Check Performance'
\echo '======================================================'
\echo ''

\echo 'OLD METHOD (nested subquery in policy):'
\echo '---'

-- Simulate old RLS check
EXPLAIN ANALYZE
SELECT * FROM picks
WHERE draft_id IN (
  SELECT id FROM drafts WHERE is_public = true
  OR id IN (
    SELECT draft_id FROM participants
    WHERE user_id = 'test-user' OR user_id LIKE 'guest-%'
  )
)
LIMIT 10;

\echo ''
\echo 'NEW METHOD (SECURITY DEFINER helper function):'
\echo '---'

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_draft_accessible'
  ) THEN
    -- Simulate new RLS check
    EXECUTE 'EXPLAIN ANALYZE
      SELECT * FROM picks
      WHERE is_draft_accessible(draft_id, ''test-user'')
      LIMIT 10';
  ELSE
    RAISE NOTICE 'Function is_draft_accessible does not exist yet. Run migration 011 first.';
  END IF;
END $$;

-- =====================================================
-- BENCHMARK 5: Index Usage Analysis
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 5: Index Usage Statistics'
\echo '======================================================'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as "Index Scans",
  idx_tup_read as "Tuples Read",
  idx_tup_fetch as "Tuples Fetched",
  pg_size_pretty(pg_relation_size(indexrelid)) as "Size"
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 20;

-- =====================================================
-- BENCHMARK 6: Table Scan vs Index Scan
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 6: Sequential Scan vs Index Scan Ratio'
\echo '======================================================'
\echo ''

SELECT
  schemaname,
  tablename,
  seq_scan as "Sequential Scans",
  idx_scan as "Index Scans",
  CASE
    WHEN seq_scan = 0 THEN 'N/A'
    WHEN idx_scan = 0 THEN '0%'
    ELSE ROUND((idx_scan::numeric / (seq_scan + idx_scan)) * 100, 2) || '%'
  END as "Index Usage %",
  n_tup_ins as "Inserts",
  n_tup_upd as "Updates",
  n_tup_del as "Deletes"
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;

-- =====================================================
-- BENCHMARK 7: Query Plan Costs
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 7: Query Plan Cost Analysis'
\echo '======================================================'
\echo ''

\echo 'Draft State Query (Old):'
SELECT '5 separate queries - Total estimated cost:' as metric;

EXPLAIN (FORMAT JSON)
SELECT * FROM drafts WHERE room_code = (SELECT room_code FROM drafts LIMIT 1);

\echo ''
\echo 'Draft State Query (New):'

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_draft_state_optimized') THEN
    EXECUTE 'EXPLAIN (FORMAT JSON) SELECT * FROM get_draft_state_optimized((SELECT room_code FROM drafts LIMIT 1))';
  ELSE
    RAISE NOTICE 'Run migration 017 to enable optimized query';
  END IF;
END $$;

-- =====================================================
-- BENCHMARK 8: Cache Hit Ratio
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 8: Database Cache Hit Ratio'
\echo '======================================================'
\echo ''

SELECT
  'Cache Hit Ratio' as metric,
  ROUND(
    SUM(blks_hit) / NULLIF(SUM(blks_hit + blks_read), 0) * 100,
    2
  ) || '%' as value
FROM pg_stat_database
WHERE datname = current_database();

-- =====================================================
-- BENCHMARK 9: Lock Contention
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 9: Lock Contention Analysis'
\echo '======================================================'
\echo ''

SELECT
  locktype,
  relation::regclass,
  mode,
  granted,
  COUNT(*) as lock_count
FROM pg_locks
WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
GROUP BY locktype, relation, mode, granted
ORDER BY lock_count DESC
LIMIT 10;

-- =====================================================
-- BENCHMARK 10: Function Performance
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK 10: Function Execution Statistics'
\echo '======================================================'
\echo ''

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    EXECUTE '
      SELECT
        funcname,
        calls,
        ROUND(total_time::numeric, 2) as total_time_ms,
        ROUND(mean_time::numeric, 2) as avg_time_ms,
        ROUND(max_time::numeric, 2) as max_time_ms
      FROM pg_stat_user_functions
      WHERE schemaname = ''public''
      ORDER BY total_time DESC
      LIMIT 10
    ';
  ELSE
    RAISE NOTICE 'pg_stat_statements extension not enabled. Enable for detailed function stats.';
  END IF;
END $$;

-- =====================================================
-- BENCHMARK SUMMARY
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK SUMMARY'
\echo '======================================================'
\echo ''

DO $$
DECLARE
  v_table_count INTEGER;
  v_index_count INTEGER;
  v_function_count INTEGER;
  v_view_count INTEGER;
  v_constraint_count INTEGER;
  v_rls_enabled_count INTEGER;
BEGIN
  -- Count objects
  SELECT COUNT(*) INTO v_table_count
  FROM pg_tables WHERE schemaname = 'public';

  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes WHERE schemaname = 'public';

  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public';

  SELECT COUNT(*) INTO v_view_count
  FROM pg_views WHERE schemaname = 'public';

  SELECT COUNT(*) INTO v_constraint_count
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace;

  SELECT COUNT(*) INTO v_rls_enabled_count
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;

  -- Display summary
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Database Objects Summary:';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Tables:              %', v_table_count;
  RAISE NOTICE 'Indexes:             %', v_index_count;
  RAISE NOTICE 'Functions:           %', v_function_count;
  RAISE NOTICE 'Views:               %', v_view_count;
  RAISE NOTICE 'Constraints:         %', v_constraint_count;
  RAISE NOTICE 'RLS Enabled Tables:  %', v_rls_enabled_count;
  RAISE NOTICE '================================================';
END $$;

-- =====================================================
-- SAVE BENCHMARK RESULTS
-- =====================================================

\echo ''
\echo 'To save these results, redirect output to a file:'
\echo 'psql -f PERFORMANCE_BENCHMARK.sql > benchmark_results_$(date +%Y%m%d).txt'
\echo ''
\echo 'Or run in Supabase SQL Editor and copy output.'
\echo ''

-- Turn off timing
\timing off

-- =====================================================
-- BENCHMARK COMPLETE
-- =====================================================

\echo ''
\echo '======================================================'
\echo 'BENCHMARK COMPLETE!'
\echo '======================================================'
\echo ''
\echo 'Next steps:'
\echo '1. Save these results as benchmark_before.txt'
\echo '2. Run all migrations (009-017)'
\echo '3. Run this benchmark again'
\echo '4. Save results as benchmark_after.txt'
\echo '5. Compare the two files to see improvements'
\echo ''
\echo 'Expected improvements after optimization:'
\echo '- getDraftState: 3-5x faster'
\echo '- Team queries: 5-10x faster'
\echo '- RLS overhead: 40-60% reduction'
\echo '- Index usage: 80%+ of queries'
\echo ''
