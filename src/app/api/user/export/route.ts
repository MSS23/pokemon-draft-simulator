import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Get auth token from request
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const userId = user.id

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
    email: user.email,
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
