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
import { unstable_cache } from 'next/cache'
import { AIAnalysisService } from '@/lib/ai-analysis-service'
import { LeagueStatsService } from '@/lib/league-stats-service'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { auth } from '@clerk/nextjs/server'
import { analyzeTeamSchema, validateRequestBody } from '@/lib/schemas'
import { createLogger } from '@/lib/logger'
import type { Pick } from '@/types'

const log = createLogger('AnalyzeTeamAPI')

// COST: AI analysis is deterministic over (picks, stats). Picks change only
// on user action and the existing per-user rate limit is 10/hr, so a 60s
// time-based cache is safe and turns hot retries into a no-cost read.
// Access control is intentionally NOT cached — runs per-request below.
const getCachedAnalysis = unstable_cache(
  async (teamId: string) => {
    const [picksResult, stats] = await Promise.all([
      createServiceRoleClient().from('picks').select('*').eq('team_id', teamId),
      LeagueStatsService.getAdvancedTeamStats(teamId),
    ])

    const { data: picks } = picksResult
    if (!picks) return null

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

    return AIAnalysisService.analyzeTeam(teamId, mappedPicks, stats || undefined)
  },
  ['analyze-team-v1'],
  { revalidate: 60, tags: ['team-analysis'] }
)

export async function POST(request: NextRequest) {
  try {
    // SEC-AUDIT: previously this read a Bearer token and called
    // supabase.auth.getUser(token), which cannot validate Clerk JWTs and
    // always returned undefined. AccessControl then fell back to body-only
    // checks. Use Clerk auth() directly — the canonical pattern used by
    // the rest of the codebase (e.g. /api/formats/sync).
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required', userRole: 'guest' }, { status: 401 })
    }

    const body = await request.json()
    const validation = validateRequestBody(analyzeTeamSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { teamId, leagueId } = validation.data

    // Service role: the browser client is anon on the server, so private
    // leagues would look missing. The team must belong to the league's draft,
    // or a member of league A could analyze any team in league B.
    const db = createServiceRoleClient()
    const [{ data: league }, { data: team }] = await Promise.all([
      db.from('leagues').select('draft_id').eq('id', leagueId).maybeSingle(),
      db.from('teams').select('draft_id').eq('id', teamId).maybeSingle(),
    ])
    if (!league) {
      return NextResponse.json({ error: 'League not found' }, { status: 403 })
    }
    if (!team || team.draft_id !== league.draft_id) {
      return NextResponse.json({ error: 'Team is not in this league' }, { status: 403 })
    }
    const { data: ownTeams } = await db
      .from('teams')
      .select('id')
      .eq('draft_id', league.draft_id)
      .eq('owner_id', userId)
      .limit(1)
    if (!ownTeams?.length) {
      return NextResponse.json(
        { error: 'Only league participants can analyze teams', userRole: 'spectator' },
        { status: 403 }
      )
    }

    const analysis = await getCachedAnalysis(teamId)
    if (!analysis) {
      return NextResponse.json(
        { error: 'Team picks not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(analysis)
  } catch (error) {
    log.error('Error in analyze-team API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
