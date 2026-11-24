import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'

const log = createLogger('UserExportAPI')

type Result = { data: unknown; error: { message: string } | null }

const EMPTY: Result = { data: [], error: null }

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Export requires the service role key — falling back to the anon key would
  // silently respect RLS and return a partial dump, which fails GDPR-style
  // export contracts. Refuse the request instead.
  let db: ReturnType<typeof createServiceRoleClient>
  try {
    db = createServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Get user email from Clerk
  let userEmail: string | undefined
  try {
    const clerk = await clerkClient()
    const clerkUser = await clerk.users.getUser(userId)
    userEmail = clerkUser.emailAddresses?.[0]?.emailAddress
  } catch {
    // Non-critical, continue without email
  }

  const fail = (what: string, error: { message: string }) => {
    log.error('User export query failed', { table: what, error: error.message })
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }

  const [participants, ownedTeams] = await Promise.all([
    db.from('participants').select('*').eq('user_id', userId),
    db.from('teams').select('id').eq('owner_id', userId),
  ])
  if (participants.error) return fail('participants', participants.error)
  if (ownedTeams.error) return fail('teams', ownedTeams.error)

  const participantIds = (participants.data ?? []).map(p => p.id)
  const teamIds = [...new Set([
    ...(participants.data ?? []).map(p => p.team_id).filter((id): id is string => !!id),
    ...(ownedTeams.data ?? []).map(t => t.id),
  ])]
  // `.in(col, [])` is not valid PostgREST, so empty id lists short-circuit.
  const byTeams = (q: () => PromiseLike<Result>) => (teamIds.length ? q() : Promise.resolve(EMPTY))
  const teamList = teamIds.join(',')

  const queries: Record<string, PromiseLike<Result>> = {
    profile: db.from('user_profiles').select('*').eq('user_id', userId),
    teams: byTeams(() => db.from('teams').select('*').in('id', teamIds)),
    picks: byTeams(() => db.from('picks').select('*').in('team_id', teamIds)),
    bidHistory: byTeams(() => db.from('bid_history').select('*').in('team_id', teamIds)),
    wishlistItems: participantIds.length
      ? db.from('wishlist_items').select('*').in('participant_id', participantIds)
      : Promise.resolve(EMPTY),
    hostedDrafts: db.from('drafts').select('*').eq('host_id', userId),
    customFormats: db.from('custom_formats').select('*').eq('created_by_user_id', userId),
    // Omit the p256dh/auth key material; it is a credential, not personal data.
    // push_subscriptions is not in the generated Database type yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushSubscriptions: (db as any).from('push_subscriptions')
      .select('id, endpoint, platform, created_at, updated_at').eq('user_id', userId),
    leagueTeams: byTeams(() => db.from('league_teams').select('*').in('team_id', teamIds)),
    matches: byTeams(() => db.from('matches').select('*')
      .or(`home_team_id.in.(${teamList}),away_team_id.in.(${teamList})`)),
    trades: byTeams(() => db.from('trades').select('*')
      .or(`team_a_id.in.(${teamList}),team_b_id.in.(${teamList})`)),
  }

  const keys = Object.keys(queries)
  const results = await Promise.all(keys.map(k => queries[k]))
  const sections: Record<string, unknown> = {}
  for (let i = 0; i < keys.length; i++) {
    const { data, error } = results[i]
    if (error) return fail(keys[i], error)
    sections[keys[i]] = data ?? []
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    userId,
    email: userEmail,
    participants: participants.data ?? [],
    ...sections,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pokemon-draft-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  })
}
