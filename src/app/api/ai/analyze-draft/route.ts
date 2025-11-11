/**
 * API Route: Analyze Draft
 *
 * POST /api/ai/analyze-draft
 *
 * Authorization: Anyone if draft is public, participants only if private
 * Body: { draftId }
 * Response: DraftAnalysis | { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { AIDraftAnalysisService } from '@/lib/ai-draft-analysis-service'
import { AIAccessControl } from '@/lib/ai-access-control'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { draftId } = body

    if (!draftId) {
      return NextResponse.json(
        { error: 'Missing required field: draftId' },
        { status: 400 }
      )
    }

    // Check authorization
    const accessCheck = await AIAccessControl.canAnalyzeDraft({ draftId })

    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          error: accessCheck.reason || 'Unauthorized',
          userRole: accessCheck.userRole
        },
        { status: 403 }
      )
    }

    // Run draft analysis
    const analysis = await AIDraftAnalysisService.analyzeDraft(draftId)

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error in analyze-draft API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
