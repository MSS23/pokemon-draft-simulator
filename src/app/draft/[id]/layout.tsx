import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS_LABEL: Record<string, string> = {
  setup: 'Open',
  active: 'Live',
  paused: 'Paused',
  completed: 'Completed',
}

/**
 * Anon lookup of the draft's status (drafts SELECT is public; only the password column is revoked).
 * Returns null when the room definitely does not exist, undefined when the lookup could not run
 * (no env / network / RLS error) so a transient failure never 404s a real room.
 */
async function getDraftStatus(id: string): Promise<string | null | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !id) return undefined
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const isUuid = UUID_RE.test(id)
    const { data, error } = await supabase
      .from('drafts')
      .select('status')
      .eq(isUuid ? 'id' : 'room_code', isUuid ? id : id.toLowerCase())
      .maybeSingle()
    if (error) return undefined
    if (!data || data.status === 'deleted') return null
    return data.status as string
  } catch {
    return undefined
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const status = await getDraftStatus(id)
  // notFound() from generateMetadata yields a real 404 before the page streams (no soft-404).
  if (status === null) notFound()

  const roomCode = id?.toUpperCase() || ''
  const label = status ? STATUS_LABEL[status] : undefined
  const ogImage = `/og-image?title=Draft+Room+${encodeURIComponent(roomCode)}${label ? `&status=${label}` : ''}`

  return {
    title: `Draft ${roomCode}`,
    description: `Join or spectate draft room ${roomCode}`,
    // Draft rooms are ephemeral capability links, not content to index.
    robots: { index: false, follow: false },
    openGraph: {
      title: `Draft Room ${roomCode}`,
      description: label === 'Live' ? 'Live Pokemon draft in progress' : 'Pokemon draft room',
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Draft Room ${roomCode}`,
      images: [ogImage],
    },
  }
}

export default function DraftLayout({ children }: Props) {
  return children
}
