/**
 * API Route: Analyze Team
 *
 * POST /api/ai/analyze-team
 *
 * Authorization: User must be a participant in the league
 * Body: { teamId, leagueId }
 * Response: TeamAnalysis | { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { AIAnalysisService } from '@/lib/ai-analysis-service'
import { AIAccessControl } from '@/lib/ai-access-control'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teamId, leagueId } = body

    if (!teamId || !leagueId) {
      return NextResponse.json(
        { error: 'Missing required fields: teamId, leagueId' },
        { status: 400 }
      )
    }

    // Check authorization
    const accessCheck = await AIAccessControl.canAnalyzeTeam({
      teamId,
      leagueId
    })

    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          error: accessCheck.reason || 'Unauthorized',
          userRole: accessCheck.userRole
        },
        { status: 403 }
      )
    }

    // Get team picks
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      )
    }

    const { data: picks } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', teamId)

    if (!picks) {
      return NextResponse.json(
        { error: 'Team picks not found' },
        { status: 404 }
      )
    }

    // Get team stats
    const stats = await LeagueStatsService.getAdvancedTeamStats(teamId)

    // Run AI analysis
    const analysis = await AIAnalysisService.analyzeTeam(teamId, picks, stats || undefined)

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error in analyze-team API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
