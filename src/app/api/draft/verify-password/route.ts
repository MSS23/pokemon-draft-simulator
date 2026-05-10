import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'

/**
 * Server-side password verification for draft rooms.
 *
 * The bcrypt hash lives in public.draft_passwords (RLS-enabled, no policies,
 * service-role-only — see migration 028). The anon key cannot read it.
 * This route uses the service-role client to fetch the hash and compare
 * the user-supplied password server-side, returning only a boolean.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roomCode, password } = body as { roomCode?: string; password?: string }

    if (!roomCode || !password) {
      return NextResponse.json(
        { error: 'roomCode and password are required' },
        { status: 400 }
      )
    }

    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    // Look up draft by room code and pull its has_password flag.
    const { data: draft, error } = await supabase
      .from('drafts')
      .select('id, has_password')
      .eq('room_code', roomCode.toLowerCase())
      .single()

    if (error || !draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Draft has no password — allow access.
    if (!draft.has_password) {
      return NextResponse.json({ valid: true })
    }

    // Fetch the bcrypt hash from the service-role-only table.
    const { data: pwRow, error: pwErr } = await supabase
      .from('draft_passwords')
      .select('password')
      .eq('draft_id', draft.id)
      .single()

    if (pwErr || !pwRow) {
      // has_password=true but no row — inconsistent state. Fail closed.
      return NextResponse.json({ valid: false })
    }

    const valid = await bcrypt.compare(password, pwRow.password)
    return NextResponse.json({ valid })
  } catch (_err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
