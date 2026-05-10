/**
 * Format Sync API Endpoint
 *
 * Allows syncing format data from Pokémon Showdown
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncShowdownData } from '@/services/showdown-sync'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'

const log = createLogger('FormatsSyncRoute')

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * SEC-AUDIT (vibe-security): admin gate must use Clerk's `auth()` and a
 * service-role Supabase client. The original `supabase.auth.getUser(token)`
 * call cannot validate Clerk JWTs and was effectively a permanent 401.
 */
async function verifyAdmin(_request: NextRequest): Promise<{ authorized: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error('Admin gate misconfigured — service role key missing')
    return { authorized: false, error: 'Service unavailable' }
  }

  const { userId } = await auth()
  if (!userId) return { authorized: false, error: 'Authentication required' }

  // Service-role read is necessary because user_profiles.is_admin is the
  // source of truth and we need to bypass RLS to verify it.
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    log.warn('Admin check query failed', { userId, message: error.message })
    return { authorized: false, error: 'Authorization check failed' }
  }
  const row = profile as { is_admin?: boolean } | null
  if (!row?.is_admin) return { authorized: false, error: 'Admin access required' }
  return { authorized: true }
}

/**
 * POST /api/formats/sync
 * Trigger a sync with Pokémon Showdown data (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.error === 'Admin access required' ? 403 : 401 })
    }
    const result = await syncShowdownData()

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully synced ${result.formatsUpdated} formats from Pokémon Showdown`,
        data: result
      }, { status: 200 })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Failed to sync formats',
        errors: result.errors
      }, { status: 500 })
    }
  } catch (error) {
    log.error('Error in format sync endpoint:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/formats/sync
 * Get sync status
 */
export async function GET() {
  try {
    // In a real implementation, you'd check the last sync time from a database
    // For now, we'll return a simple status
    return NextResponse.json({
      success: true,
      message: 'Format sync endpoint is available',
      endpoint: '/api/formats/sync',
      method: 'POST'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
