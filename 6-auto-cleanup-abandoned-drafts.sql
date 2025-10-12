-- =====================================================
-- AUTO-CLEANUP ABANDONED DRAFTS
-- =====================================================
-- This sets up automatic deletion of abandoned drafts:
-- 1. Drafts in 'setup' status for more than 24 hours
-- 2. Drafts in 'paused' status for more than 7 days
-- 3. Completed drafts older than 30 days (optional)
-- =====================================================

-- Function to clean up abandoned drafts
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_drafts()
RETURNS void AS $$
DECLARE
  deleted_setup_count INTEGER;
  deleted_paused_count INTEGER;
  deleted_completed_count INTEGER;
BEGIN
  -- Delete drafts stuck in 'setup' for more than 24 hours
  WITH deleted_setup AS (
    DELETE FROM public.drafts
    WHERE status = 'setup'
    AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_setup_count FROM deleted_setup;

  -- Delete drafts 'paused' for more than 7 days
  WITH deleted_paused AS (
    DELETE FROM public.drafts
    WHERE status = 'paused'
    AND updated_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_paused_count FROM deleted_paused;

  -- Optional: Delete completed drafts older than 30 days
  -- Uncomment the block below if you want to enable this
  /*
  WITH deleted_completed AS (
    DELETE FROM public.drafts
    WHERE status = 'completed'
    AND updated_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_completed_count FROM deleted_completed;
  */

  -- Log cleanup results (optional)
  RAISE NOTICE 'Cleaned up % abandoned setup drafts, % paused drafts',
    deleted_setup_count, deleted_paused_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SCHEDULE AUTOMATIC CLEANUP (requires pg_cron extension)
-- =====================================================
-- Run cleanup every 6 hours

-- First, enable pg_cron extension (run as superuser if needed)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cleanup job (run every 6 hours)
-- SELECT cron.schedule(
--   'cleanup-abandoned-drafts',
--   '0 */6 * * *',  -- Every 6 hours at minute 0
--   'SELECT public.cleanup_abandoned_drafts();'
-- );

-- =====================================================
-- MANUAL CLEANUP
-- =====================================================
-- To manually run the cleanup right now:
-- SELECT public.cleanup_abandoned_drafts();

-- To see what would be deleted (without actually deleting):
-- SELECT id, name, status, created_at, updated_at
-- FROM drafts
-- WHERE (status = 'setup' AND created_at < NOW() - INTERVAL '24 hours')
--    OR (status = 'paused' AND updated_at < NOW() - INTERVAL '7 days');

-- =====================================================
-- ALTERNATIVE: Use Supabase Database Webhooks
-- =====================================================
-- If pg_cron is not available, you can:
-- 1. Create an Edge Function in Supabase
-- 2. Set up a scheduled job using Supabase's built-in cron
-- 3. Call this function from your Edge Function

-- Example Edge Function (Deno/TypeScript):
/*
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { error } = await supabase.rpc('cleanup_abandoned_drafts')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
*/

-- =====================================================
-- CLEANUP FUNCTION READY!
-- =====================================================
-- The function is now available to use
-- Choose one of the scheduling methods above
-- =====================================================
