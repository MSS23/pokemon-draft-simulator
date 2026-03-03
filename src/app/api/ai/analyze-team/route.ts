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
import { analyzeTeamSchema, validateRequestBody } from '@/lib/schemas'
import { createLogger } from '@/lib/logger'
import type { Pick } from '@/types'

const log = createLogger('AnalyzeTeamAPI')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequestBody(analyzeTeamSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { teamId, leagueId } = validation.data

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

    // Map snake_case DB rows to camelCase Pick type
    const mappedPicks: Pick[] = picks.map(p => ({
      id: p.id,
      draftId: p.draft_id,
      teamId: p.team_id,
      pokemonId: p.pokemon_id,
      pokemonName: p.pokemon_name,
      cost: p.cost,
      pickOrder: p.pick_order,
      round: p.round,
      createdAt: p.created_at,
    }))

    // Run AI analysis
    const analysis = await AIAnalysisService.analyzeTeam(teamId, mappedPicks, stats || undefined)

    return NextResponse.json(analysis)
  } catch (error) {
    log.error('Error in analyze-team API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
