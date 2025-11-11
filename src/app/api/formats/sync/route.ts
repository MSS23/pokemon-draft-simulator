/**
 * Format Sync API Endpoint
 *
 * Allows syncing format data from Pokémon Showdown
 */

import { NextResponse } from 'next/server'
import { syncShowdownData } from '@/services/showdown-sync'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * POST /api/formats/sync
 * Trigger a sync with Pokémon Showdown data
 */
export async function POST() {
  try {
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
    console.error('Error in format sync endpoint:', error)
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
