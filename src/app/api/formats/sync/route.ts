/**
 * Format Sync API Endpoint
 *
 * Allows syncing format data from Pokémon Showdown
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncShowdownData } from '@/services/showdown-sync'
import { createClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'

const log = createLogger('FormatsSyncRoute')

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

async function verifyAdmin(request: NextRequest): Promise<{ authorized: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return { authorized: false, error: 'Service unavailable' }

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { authorized: false, error: 'Authentication required' }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { authorized: false, error: 'Invalid session' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) return { authorized: false, error: 'Admin access required' }
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
