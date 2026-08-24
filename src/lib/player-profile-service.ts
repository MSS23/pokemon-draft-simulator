/**
 * Public player career data: profile basics, aggregate record, titles won,
 * and season-by-season history (finish + drafted roster).
 *
 * Everything read here is world-readable under RLS (user_profiles exposes
 * display fields only; user_league_history / picks are public), so this
 * works for the signed-in /profile page AND the public /player/[userId] page.
 */

import { supabase } from './supabase'

export interface PlayerSeason {
  leagueId: string
  leagueName: string
  leagueStatus: string
  endDate: string | null
  teamId: string
  teamName: string
  finalPlacement: number | null
  currentRank: number
  totalTeams: number
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  isTitle: boolean
  picks: { id: string; pokemonId: string; pokemonName: string }[]
}

export interface PlayerCareer {
  profile: {
    userId: string
    displayName: string
    username: string | null
    avatarUrl: string | null
    bio: string | null
    nationality: string | null
    favoritePokemon: string | null
  } | null
  record: { wins: number; losses: number; draws: number }
  titles: number
  leaguesPlayed: number
  seasons: PlayerSeason[]
}

interface HistoryRow {
  league_id: string
  league_name: string
  league_status: string
  end_date: string | null
  team_id: string
  team_name: string
  final_placement: number | null
  current_rank: number
  total_teams: number
  wins: number
  losses: number
  draws: number
  points_for: number
  points_against: number
}

export class PlayerProfileService {
  static async getCareer(userId: string): Promise<PlayerCareer> {
    if (!supabase) throw new Error('Supabase not configured')

    const [profileRes, historyRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('user_id, display_name, username, avatar_url, bio, nationality, favorite_pokemon')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('user_league_history')
        .select('league_id, league_name, league_status, end_date, team_id, team_name, final_placement, current_rank, total_teams, wins, losses, draws, points_for, points_against')
        .eq('user_id', userId)
        .order('end_date', { ascending: false, nullsFirst: false })
        .limit(50),
    ])

    // Pre-migration fallback: retry without the nationality column so the
    // page still renders before 20260824140000 is applied.
    let profileRow = profileRes.data as Record<string, unknown> | null
    if (!profileRow && profileRes.error) {
      const retry = await supabase
        .from('user_profiles')
        .select('user_id, display_name, username, avatar_url, bio, favorite_pokemon')
        .eq('user_id', userId)
        .maybeSingle()
      profileRow = retry.data ? { ...(retry.data as Record<string, unknown>), nationality: null } : null
    }

    const rows = ((historyRes.data ?? []) as unknown as HistoryRow[])

    // Rosters for every season team in one query
    const teamIds = rows.map(r => r.team_id)
    const picksByTeam = new Map<string, PlayerSeason['picks']>()
    if (teamIds.length > 0) {
      const { data: picks } = await supabase
        .from('picks')
        .select('id, team_id, pokemon_id, pokemon_name')
        .in('team_id', teamIds)
        .order('pick_order', { ascending: true })
      for (const p of picks ?? []) {
        const arr = picksByTeam.get(p.team_id) ?? []
        arr.push({ id: p.id, pokemonId: p.pokemon_id, pokemonName: p.pokemon_name })
        picksByTeam.set(p.team_id, arr)
      }
    }

    const seasons: PlayerSeason[] = rows.map(r => ({
      leagueId: r.league_id,
      leagueName: r.league_name,
      leagueStatus: r.league_status,
      endDate: r.end_date,
      teamId: r.team_id,
      teamName: r.team_name,
      finalPlacement: r.final_placement,
      currentRank: r.current_rank,
      totalTeams: Number(r.total_teams) || 0,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      pointsFor: r.points_for,
      pointsAgainst: r.points_against,
      // A title = finishing 1st: explicit final placement, or rank 1 in a
      // league that has completed without recording placements.
      isTitle: r.final_placement === 1 ||
        (r.league_status === 'completed' && r.final_placement == null && r.current_rank === 1),
      picks: picksByTeam.get(r.team_id) ?? [],
    }))

    const p = profileRow as {
      user_id: string; display_name: string | null; username: string | null
      avatar_url: string | null; bio: string | null; nationality: string | null
      favorite_pokemon: string | null
    } | null

    return {
      profile: p ? {
        userId: p.user_id,
        displayName: p.display_name || p.username || 'Trainer',
        username: p.username,
        avatarUrl: p.avatar_url,
        bio: p.bio,
        nationality: p.nationality,
        favoritePokemon: p.favorite_pokemon,
      } : null,
      record: {
        wins: seasons.reduce((s, x) => s + x.wins, 0),
        losses: seasons.reduce((s, x) => s + x.losses, 0),
        draws: seasons.reduce((s, x) => s + x.draws, 0),
      },
      titles: seasons.filter(s => s.isTitle).length,
      leaguesPlayed: seasons.length,
      seasons,
    }
  }

  /** owner_id → nationality for a set of users (for flag badges on standings). */
  static async getNationalities(userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (!supabase || userIds.length === 0) return map
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id, nationality')
      .in('user_id', userIds)
      .not('nationality', 'is', null)
    for (const row of (data ?? []) as { user_id: string; nationality: string | null }[]) {
      if (row.nationality) map.set(row.user_id, row.nationality)
    }
    return map
  }
}
