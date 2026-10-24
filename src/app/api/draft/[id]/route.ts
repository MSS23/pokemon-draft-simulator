import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/draft/[id]')

/**
 * Soft-delete a draft (host only). Done server-side because the live RLS
 * policy on public.drafts rejects the browser's UPDATE that sets deleted_at
 * ("new row violates row-level security policy"), so every host saw
 * "Failed to delete". `id` is the room code.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const roomCode = (await params).id.trim().toLowerCase()
  if (!/^[a-z0-9]{6}$/.test(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code.' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { data: draft } = await db
    .from('drafts')
    .select('id, host_id, deleted_at')
    .ilike('room_code', roomCode)
    .maybeSingle()
  if (!draft || draft.deleted_at) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
  if (draft.host_id !== userId) return NextResponse.json({ error: 'Only the host can delete this draft.' }, { status: 403 })

  const now = new Date().toISOString()
  const { error } = await db
    .from('drafts')
    .update({ deleted_at: now, deleted_by: userId, updated_at: now })
    .eq('id', draft.id)
  if (error) {
    log.error('soft-delete failed', { draftId: draft.id, error: error.message })
    return NextResponse.json({ error: 'Failed to delete draft.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
