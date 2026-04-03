import { NextRequest, NextResponse } from 'next/server'
import { feedbackSchema, validateRequestBody } from '@/lib/schemas'

const DISCORD_WEBHOOK_URL = process.env.DISCORD_FEEDBACK_WEBHOOK_URL

const CATEGORY_COLORS: Record<string, number> = {
  bug: 0xef4444,
  feature: 0x3b82f6,
  improvement: 0xf59e0b,
  other: 0x6b7280,
}

const CATEGORY_EMOJI: Record<string, string> = {
  bug: '\u{1F41B}',
  feature: '\u{2728}',
  improvement: '\u{1F4A1}',
  other: '\u{1F4AC}',
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const validation = validateRequestBody(feedbackSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { category, title, description, contact } = validation.data

    if (DISCORD_WEBHOOK_URL) {
      const emoji = CATEGORY_EMOJI[category] || CATEGORY_EMOJI.other
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other

      const embed = {
        title: `${emoji} [${category.toUpperCase()}] ${title}`,
        description,
        color,
        fields: contact
          ? [{ name: 'Contact', value: contact, inline: true }]
          : [],
        timestamp: new Date().toISOString(),
        footer: { text: 'Pokemon Draft Feedback' },
      }

      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      })
    }

    return NextResponse.json({ success: true })
  } catch (_err) {
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}
