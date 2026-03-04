import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Get auth token from request
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify user with anon key
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const userId = user.id

  try {
    // Anonymize teams owned by this user (don't delete - preserves draft history)
    await supabase
      .from('teams')
      .update({ owner_id: 'deleted-user', name: 'Deleted User' })
      .eq('owner_id', userId)

    // Delete user-specific data
    await Promise.all([
      supabase.from('user_profiles').delete().eq('user_id', userId),
      supabase.from('participants').delete().eq('user_id', userId),
      supabase.from('wishlist_items').delete().eq('participant_id', userId),
    ])

    // Delete auth user if service role key is available
    if (supabaseServiceKey) {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey)
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteError) {
        console.error('Failed to delete auth user:', deleteError)
        // Continue anyway - data is already cleaned up
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Account deletion error:', err)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
