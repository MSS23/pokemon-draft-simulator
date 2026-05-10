/**
 * POST /api/draft/create
 *
 * Server-side draft creation. Uses the Supabase **service role key** to
 * bypass RLS and Clerk's server-side `auth()` to authenticate the host.
 *
 * Why this exists: when the Clerk → Supabase JWT bridge is misconfigured
 * (e.g. the "supabase" JWT template isn't set up in the Clerk dashboard, or
 * Supabase's native third-party auth integration isn't enabled), every
 * client-side write hits anon-key RLS and fails with code 42501. This route
 * lets the host create a draft without depending on that bridge.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { generateRoomCode } from '@/lib/room-utils'
import { DEFAULT_FORMAT } from '@/lib/formats'
import { validateName } from '@/lib/profanity'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/draft/create')

interface CreateDraftBody {
  name?: string
  hostName: string
  teamName: string
  settings: {
    maxTeams: number
    draftType: 'tiered' | 'points' | 'auction'
    timeLimit: number
    pokemonPerTeam: number
    budgetPerTeam?: number
    formatId?: string
    scoringSystem?: 'budget' | 'tiered'
    tierConfig?: unknown
    createLeague?: boolean
    splitIntoConferences?: boolean
    leagueWeeks?: number
  }
  isPublic?: boolean
  description?: string | null
  tags?: string[] | null
  password?: string | null
  customFormat?: {
    name: string
    description: string
    pokemonPricing: Record<string, number>
  }
}

export async function POST(request: NextRequest) {
  // 1. Authenticate via Clerk
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'You must be signed in to create a draft.' }, { status: 401 })
  }

  // 2. Validate Supabase config
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error('Service role key not configured', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey,
    })
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Set it in Vercel project env vars.' },
      { status: 503 },
    )
  }

  // 3. Parse + validate the body
  let body: CreateDraftBody
  try {
    body = (await request.json()) as CreateDraftBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !body.settings) {
    return NextResponse.json({ error: 'Missing settings object' }, { status: 400 })
  }

  const hostNameCheck = validateName(body.hostName, { fieldLabel: 'Host name', maxLength: 50 })
  if (!hostNameCheck.ok) {
    return NextResponse.json({ error: hostNameCheck.reason }, { status: 400 })
  }
  const teamNameCheck = validateName(body.teamName, { fieldLabel: 'Team name', maxLength: 50 })
  if (!teamNameCheck.ok) {
    return NextResponse.json({ error: teamNameCheck.reason }, { status: 400 })
  }

  const s = body.settings
  if (!Number.isFinite(s.maxTeams) || s.maxTeams < 2 || s.maxTeams > 32) {
    return NextResponse.json({ error: 'maxTeams must be between 2 and 32' }, { status: 400 })
  }
  const minPokemon = s.draftType === 'auction' ? 1 : 6
  if (!Number.isFinite(s.pokemonPerTeam) || s.pokemonPerTeam < minPokemon || s.pokemonPerTeam > 30) {
    return NextResponse.json(
      { error: `pokemonPerTeam must be between ${minPokemon} and 30` },
      { status: 400 },
    )
  }
  if (s.budgetPerTeam !== undefined && (s.budgetPerTeam < 10 || s.budgetPerTeam > 5000)) {
    return NextResponse.json({ error: 'budgetPerTeam must be between 10 and 5000' }, { status: 400 })
  }

  // 4. Build the privileged Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const roomCode = generateRoomCode()
  const isAuction = s.draftType === 'auction'
  const isTiered = s.draftType === 'tiered'
  const dbFormat: 'snake' | 'auction' = isAuction ? 'auction' : 'snake'
  const scoringSystem: 'budget' | 'tiered' = isTiered ? 'tiered' : 'budget'

  // 5. Optional: insert custom_formats row first (FK target for drafts)
  let customFormatId: string | null = null
  if (body.customFormat) {
    const { data: cf, error: cfErr } = await supabase
      .from('custom_formats')
      .insert({
        name: body.customFormat.name,
        description: body.customFormat.description,
        created_by_user_id: userId,
        created_by_display_name: body.hostName,
        is_public: false,
        pokemon_pricing: body.customFormat.pokemonPricing,
      })
      .select('id')
      .single()

    if (cfErr || !cf) {
      log.error('custom_formats insert failed', cfErr)
      return NextResponse.json(
        { error: `Failed to create custom format: ${cfErr?.message ?? 'unknown'}` },
        { status: 500 },
      )
    }
    customFormatId = (cf as { id: string }).id
  }

  // 6. Insert the draft row
  const draftInsert: Record<string, unknown> = {
    room_code: roomCode.toLowerCase(),
    name: body.name || `${body.hostName}'s Draft`,
    host_id: userId,
    format: dbFormat,
    max_teams: s.maxTeams,
    budget_per_team: isTiered ? 99999 : (s.budgetPerTeam ?? 100),
    status: 'setup',
    current_round: 1,
    settings: {
      timeLimit: s.timeLimit,
      pokemonPerTeam: s.pokemonPerTeam,
      maxPokemonPerTeam: s.pokemonPerTeam,
      formatId: s.formatId || DEFAULT_FORMAT,
      draftType: s.draftType,
      scoringSystem,
      tierConfig: s.tierConfig,
      createLeague: s.createLeague,
      splitIntoConferences: s.splitIntoConferences,
      leagueWeeks: s.leagueWeeks,
    },
  }

  if (body.isPublic !== undefined) draftInsert.is_public = !!body.isPublic
  if (body.description) draftInsert.description = body.description
  if (body.tags) draftInsert.tags = body.tags
  if (body.password) draftInsert.has_password = true
  if (customFormatId) draftInsert.custom_format_id = customFormatId

  const { data: draft, error: draftErr } = await supabase
    .from('drafts')
    .insert(draftInsert)
    .select('id')
    .single()

  if (draftErr || !draft) {
    log.error('drafts insert failed', draftErr)
    return NextResponse.json(
      { error: `Failed to create draft: ${draftErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }
  const draftId = (draft as { id: string }).id

  // Persist bcrypt hash to the service-role-only draft_passwords table so the
  // hash is never exposed via the anon key (see migration 028).
  if (body.password) {
    const passwordHash = await bcrypt.hash(body.password, 12)
    const { error: pwErr } = await supabase
      .from('draft_passwords')
      .insert({ draft_id: draftId, password: passwordHash })

    if (pwErr) {
      log.error('draft_passwords insert failed; rolling back draft', pwErr)
      await supabase.from('drafts').delete().eq('id', draftId)
      return NextResponse.json(
        { error: `Failed to store draft password: ${pwErr.message}` },
        { status: 500 },
      )
    }
  }

  // 7. Insert host team
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .insert({
      draft_id: draftId,
      name: body.teamName,
      owner_id: userId,
      draft_order: 1,
      budget_remaining: isTiered ? 99999 : (s.budgetPerTeam ?? 100),
    })
    .select('id')
    .single()

  if (teamErr || !team) {
    log.error('teams insert failed; rolling back draft', teamErr)
    await supabase.from('drafts').delete().eq('id', draftId)
    return NextResponse.json(
      { error: `Failed to create host team: ${teamErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }
  const teamId = (team as { id: string }).id

  // 8. Insert host participant
  const { error: pErr } = await supabase
    .from('participants')
    .insert({
      draft_id: draftId,
      user_id: userId,
      display_name: body.hostName,
      team_id: teamId,
      is_host: true,
      last_seen: new Date().toISOString(),
    })

  if (pErr) {
    log.error('participants insert failed; rolling back', pErr)
    await supabase.from('teams').delete().eq('id', teamId)
    await supabase.from('drafts').delete().eq('id', draftId)
    return NextResponse.json(
      { error: `Failed to register host: ${pErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    roomCode,
    draftId: roomCode.toLowerCase(),
    teamId,
  })
}
