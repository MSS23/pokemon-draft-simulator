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
import { analyzeDraftSchema, validateRequestBody } from '@/lib/schemas'
import { createLogger } from '@/lib/logger'

const log = createLogger('AnalyzeDraftAPI')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequestBody(analyzeDraftSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { draftId } = validation.data

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
    log.error('Error in analyze-draft API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
