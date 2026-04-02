import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Get user email from Clerk
  let userEmail: string | undefined
  try {
    const clerk = await clerkClient()
    const clerkUser = await clerk.users.getUser(userId)
    userEmail = clerkUser.emailAddresses?.[0]?.emailAddress
  } catch {
    // Non-critical, continue without email
  }

  // Fetch all user data in parallel
  const [profile, participants, teams, picks, bids, wishlist] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', userId),
    supabase.from('participants').select('*').eq('user_id', userId),
    supabase.from('teams').select('*').in('id',
      (await supabase.from('participants').select('team_id').eq('user_id', userId)).data?.map(p => p.team_id).filter(Boolean) || []
    ),
    supabase.from('picks').select('*').in('team_id',
      (await supabase.from('participants').select('team_id').eq('user_id', userId)).data?.map(p => p.team_id).filter(Boolean) || []
    ),
    supabase.from('bid_history').select('*').eq('bidder_id', userId),
    supabase.from('wishlist_items').select('*').eq('participant_id', userId),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    userId,
    email: userEmail,
    profile: profile.data || [],
    participants: participants.data || [],
    teams: teams.data || [],
    picks: picks.data || [],
    bidHistory: bids.data || [],
    wishlistItems: wishlist.data || [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pokemon-draft-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  })
}
