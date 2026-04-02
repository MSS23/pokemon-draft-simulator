import { NextResponse, type NextRequest } from 'next/server'

const DISCORD_WEBHOOK_URL = process.env.DISCORD_FEEDBACK_WEBHOOK_URL

const CATEGORY_COLORS: Record<string, number> = {
  bug: 0xef4444,      // red
  feature: 0x3b82f6,  // blue
  improvement: 0xf59e0b, // amber
  other: 0x6b7280,    // gray
}

const CATEGORY_EMOJI: Record<string, string> = {
  bug: '\u{1F41B}',
  feature: '\u{2728}',
  improvement: '\u{1F4A1}',
  other: '\u{1F4AC}',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { category, title, description, contact } = body as {
      category: string
      title: string
      description: string
      contact?: string
    }

    // Validate required fields
    if (!category || !title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: category, title, description' },
        { status: 400 }
      )
    }

    if (title.length > 200 || description.length > 2000) {
      return NextResponse.json(
        { error: 'Title must be under 200 characters, description under 2000' },
        { status: 400 }
      )
    }

    // Send to Discord webhook if configured
    if (DISCORD_WEBHOOK_URL) {
      const emoji = CATEGORY_EMOJI[category] || CATEGORY_EMOJI.other
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other

      const embed = {
        title: `${emoji} [${category.toUpperCase()}] ${title}`,
        description: description,
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
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}
