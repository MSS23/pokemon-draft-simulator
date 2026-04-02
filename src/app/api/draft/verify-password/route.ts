import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

/**
 * Server-side password verification for draft rooms.
 *
 * Previously the client fetched the bcrypt hash and compared locally,
 * which leaked the hash to the browser. This API route keeps the hash
 * server-side and only returns a boolean result.
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

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    const { data: draft, error } = await supabase
      .from('drafts')
      .select('password')
      .eq('room_code', roomCode.toLowerCase())
      .single()

    if (error || !draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // If draft has no password, allow access
    if (!draft.password) {
      return NextResponse.json({ valid: true })
    }

    // Securely compare passwords using bcrypt on the server
    const valid = await bcrypt.compare(password, draft.password)
    return NextResponse.json({ valid })
  } catch (_err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
