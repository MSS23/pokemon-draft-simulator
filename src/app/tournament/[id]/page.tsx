'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KnockoutService } from '@/lib/knockout-service'
import { getFormatById } from '@/lib/formats'
import { MatchRecorderModal } from '@/components/league/MatchRecorderModal'
import { PlayoffBracket } from '@/components/league/PlayoffBracket'
import { PokemonSprite } from '@/components/ui/pokemon-sprite'
import { LoadingScreen } from '@/components/ui/loading-states'
import { buildTeamColorMap } from '@/utils/team-colors'
import { useAuth } from '@/contexts/AuthContext'
import { UserSessionService } from '@/lib/user-session'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import { TeamSheetService, type TeamSheet } from '@/lib/teamsheet-service'
import { TeamSheetModal } from '@/components/tournament/TeamSheetModal'
import { TeamSheetView } from '@/components/tournament/TeamSheetView'
import {
  ArrowLeft, Trophy, Swords, Copy, Check, Crown, Users, Play, Loader2, FileText, ClipboardList,
} from 'lucide-react'
import type { League, Match, Team, Pick } from '@/types'
import type { Tournament } from '@/lib/tournament-service'

const log = createLogger('TournamentPage')

export default function TournamentPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string

  const [league, setLeague] = useState<(League & { teams: Team[] }) | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<(Match & { homeTeam: Team; awayTeam: Team })[]>([])
  const [teamPicks, setTeamPicks] = useState<Record<string, Pick[]>>({})
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  // Lobby state
  const [lobbyPlayers, setLobbyPlayers] = useState<{ id: string; name: string; ownerId: string | null }[]>([])
  const [isLobby, setIsLobby] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)

  // Team sheets
  const [teamSheets, setTeamSheets] = useState<Record<string, TeamSheet>>({})
  const [showSheetModal, setShowSheetModal] = useState(false)
  const [viewingSheet, setViewingSheet] = useState<{ name: string; sheet: TeamSheet; teamId: string } | null>(null)
  const [userTeamId, setUserTeamId] = useState<string | null>(null)

  // Match recorder
  const [selectedMatch, setSelectedMatch] = useState<(Match & { homeTeam: Team; awayTeam: Team }) | null>(null)
  const [homeTeamPicks, setHomeTeamPicks] = useState<Pick[]>([])
  const [awayTeamPicks, setAwayTeamPicks] = useState<Pick[]>([])

  const { user } = useAuth()

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // First try loading as an active tournament
      const data = await KnockoutService.getFullTournament(tournamentId)

      if (data) {
        // Active tournament with bracket
        setLeague(data.league)
        setTournament(data.tournament)
        setMatches(data.matches)
        setIsLobby(false)

        // Load team rosters
        const teamIds = data.league.teams.map(t => t.id)
        const picks = await KnockoutService.getTeamPicks(teamIds)
        setTeamPicks(picks)

        // Get room code from settings
        const settings = data.league.settings as Record<string, unknown>
        if (settings?.roomCode) setRoomCode(settings.roomCode as string)

        // Load team sheets
        try {
          const sheets = await TeamSheetService.getAllTeamSheets(data.league.draftId)
          setTeamSheets(sheets)
        } catch { /* ignore */ }

        // Find user's team
        if (user?.id) {
          const myTeam = data.league.teams.find(t => t.ownerId === user.id)
          if (myTeam) setUserTeamId(myTeam.id)
        }
      } else {
        // Might be a lobby (no bracket yet) — try loading league directly
        const { supabase } = await import('@/lib/supabase')
        if (!supabase) { setError('Not connected'); return }

        const { data: leagueRow } = await supabase
          .from('leagues')
          .select('*')
          .eq('id', tournamentId)
          .single()

        if (!leagueRow) { setError('Tournament not found'); return }

        const settings = (leagueRow.settings ?? {}) as Record<string, unknown>
        const code = settings.roomCode as string | undefined

        if (leagueRow.status === 'scheduled' && code) {
          // It's a lobby
          setIsLobby(true)
          setRoomCode(code)

          // Load players from teams table via draft
          const { data: teamRows } = await supabase
            .from('teams')
            .select('id, name, owner_id')
            .eq('draft_id', leagueRow.draft_id)
            .order('draft_order')

          setLobbyPlayers(teamRows?.map(t => ({ id: t.id, name: t.name, ownerId: t.owner_id })) || [])

          // Load team sheets
          try {
            const sheets = await TeamSheetService.getAllTeamSheets(leagueRow.draft_id)
            setTeamSheets(sheets)
          } catch { /* ignore */ }

          // Find user's team
          if (user?.id && teamRows) {
            const myTeam = teamRows.find(t => t.owner_id === user.id)
            if (myTeam) setUserTeamId(myTeam.id)
          }

          // Create a minimal league object for display
          setLeague({
            id: leagueRow.id,
            draftId: leagueRow.draft_id,
            name: leagueRow.name,
            leagueType: leagueRow.league_type,
            seasonNumber: leagueRow.season_number,
            status: leagueRow.status,
            startDate: leagueRow.start_date,
            endDate: leagueRow.end_date,
            currentWeek: leagueRow.current_week,
            totalWeeks: leagueRow.total_weeks,
            settings: leagueRow.settings,
            createdAt: leagueRow.created_at,
            updatedAt: leagueRow.updated_at,
            teams: [],
          })
        } else {
          setError('Tournament not found')
          return
        }
      }

      // Check commissioner
      let userId = user?.id
      if (!userId) {
        try {
          const session = await UserSessionService.getOrCreateSession()
          userId = session.userId
        } catch { /* ignore */ }
      }
      if (userId) {
        const result = await KnockoutService.isCommissioner(tournamentId, userId)
        setIsCommissioner(result)
      }
    } catch (err) {
      log.error('Error loading tournament:', err)
      setError(err instanceof Error ? err.message : 'Failed to load tournament')
    } finally {
      setIsLoading(false)
    }
  }, [tournamentId, user?.id])

  useEffect(() => { loadData() }, [loadData])

  // Poll lobby for new players
  useEffect(() => {
    if (!isLobby) return
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [isLobby, loadData])

  const handleCopyCode = async () => {
    if (!roomCode) return
    await navigator.clipboard.writeText(roomCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleStart = useCallback(async () => {
    if (!user) return
    setIsStarting(true)
    try {
      await KnockoutService.beginTournament(tournamentId, user.id)
      notify.success('Tournament Started!', 'Bracket generated')
      await loadData()
    } catch (err) {
      log.error('Failed to start tournament:', err)
      notify.error('Failed', err instanceof Error ? err.message : 'Could not start tournament')
    } finally {
      setIsStarting(false)
    }
  }, [user, tournamentId, loadData])

  const handleRecordMatch = useCallback((match: Match & { homeTeam: Team; awayTeam: Team }) => {
    setHomeTeamPicks(teamPicks[match.homeTeamId] || [])
    setAwayTeamPicks(teamPicks[match.awayTeamId] || [])
    setSelectedMatch(match)
  }, [teamPicks])

  const handleMatchRecorded = useCallback(async () => {
    if (!selectedMatch) return
    setSelectedMatch(null)
    try {
      await loadData()
      notify.success('Match Recorded', 'Bracket updated')
    } catch (err) {
      log.error('Error updating bracket:', err)
    }
  }, [selectedMatch, loadData])

  const activeMatches = useMemo(() => {
    if (!tournament) return []
    return matches.filter(m => m.status === 'scheduled' || m.status === 'in_progress')
  }, [tournament, matches])

  const completedMatches = useMemo(() => {
    return matches.filter(m => m.status === 'completed')
  }, [matches])

  const teamColorMap = useMemo(() => {
    if (!league) return new Map<string, { bg: string; text: string; border: string }>()
    const teamIds = isLobby
      ? lobbyPlayers.map(p => p.id)
      : league.teams.map(t => t.id)
    return buildTeamColorMap(teamIds)
  }, [league, isLobby, lobbyPlayers])

  if (isLoading) {
    return <LoadingScreen title="Loading Tournament..." description="Fetching tournament data." />
  }

  if (error || !league) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Error</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error || 'Tournament not found'}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatId = (league.settings as Record<string, unknown>)?.formatId as string | undefined
  const tournamentFormat = formatId ? getFormatById(formatId) : null
  const tournamentType = (league.settings as Record<string, unknown>)?.tournamentType as string | undefined

  // ═══════════════════ LOBBY VIEW ═══════════════════
  if (isLobby) {
    return (
      <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{league.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {tournamentFormat && <Badge variant="outline">{tournamentFormat.shortName}</Badge>}
                {tournamentType && (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {tournamentType.replace('-', ' ')}
                  </Badge>
                )}
                <Badge variant="outline" className="text-yellow-600 border-yellow-500/30">Waiting for players</Badge>
              </div>
            </div>
          </div>

          {/* Room Code */}
          <Card className="mb-4 border-2 border-primary/30 bg-primary/5">
            <CardContent className="py-5 text-center space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Room Code</p>
              <button
                onClick={handleCopyCode}
                className="text-4xl font-mono font-bold tracking-[0.3em] hover:text-primary transition-colors"
              >
                {roomCode}
              </button>
              <p className="text-xs text-muted-foreground">
                {copiedCode ? (
                  <span className="text-green-500 flex items-center justify-center gap-1">
                    <Check className="h-3 w-3" /> Copied!
                  </span>
                ) : (
                  'Tap to copy — share with players'
                )}
              </p>
            </CardContent>
          </Card>

          {/* Players */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Players
                <Badge variant="outline" className="ml-auto">{lobbyPlayers.length}/32</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lobbyPlayers.map((player, i) => {
                const colors = teamColorMap.get(player.id)
                return (
                  <div key={player.id} className="flex items-center gap-3 p-2.5 border rounded-lg">
                    <div className={`w-2 h-8 rounded-full shrink-0 ${colors?.bg || 'bg-muted'}`} />
                    <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{i + 1}</span>
                    <span className="font-medium text-sm flex-1 truncate">{player.name}</span>
                    {teamSheets[player.id] ? (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setViewingSheet({ name: player.name, sheet: teamSheets[player.id], teamId: player.id }) }}>
                        <FileText className="h-3 w-3 mr-0.5 text-green-500" />Team
                      </Button>
                    ) : (
                      <Badge variant="outline" size="sm" className="text-[10px] text-muted-foreground">No team</Badge>
                    )}
                    {i === 0 && (
                      <Badge variant="outline" size="sm" className="text-amber-500 border-amber-500/30">
                        <Crown className="h-3 w-3 mr-0.5" /> Host
                      </Badge>
                    )}
                  </div>
                )
              })}

              {lobbyPlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No players yet</p>
              )}
            </CardContent>
          </Card>

          {/* Submit Team Sheet */}
          {userTeamId && (
            <Card className="mb-4">
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Open Team Sheet</p>
                    <p className="text-xs text-muted-foreground">
                      {teamSheets[userTeamId] ? `${teamSheets[userTeamId].length} Pokemon submitted` : 'Submit your team before the tournament starts'}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant={teamSheets[userTeamId] ? 'outline' : 'default'} onClick={() => setShowSheetModal(true)}>
                  {teamSheets[userTeamId] ? 'Edit Team' : 'Submit Team'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Start Button */}
          {isCommissioner && (
            <Button
              className="w-full h-12 text-base"
              onClick={handleStart}
              disabled={isStarting || lobbyPlayers.length < 2}
            >
              {isStarting ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Generating Bracket...</>
              ) : lobbyPlayers.length < 2 ? (
                <><Users className="h-5 w-5 mr-2" />Need at least 2 players</>
              ) : (
                <><Play className="h-5 w-5 mr-2" />Start Tournament ({lobbyPlayers.length} players)</>
              )}
            </Button>
          )}

          {!isCommissioner && (
            <div className="text-center text-sm text-muted-foreground py-4">
              Waiting for the host to start the tournament...
            </div>
          )}

          {/* Modals */}
          {showSheetModal && userTeamId && (
            <TeamSheetModal
              isOpen={showSheetModal}
              onClose={() => setShowSheetModal(false)}
              draftId={league.draftId}
              teamId={userTeamId}
              existingSheet={teamSheets[userTeamId]}
              onSubmitted={loadData}
            />
          )}
          {viewingSheet && (
            <TeamSheetView
              isOpen={!!viewingSheet}
              onClose={() => setViewingSheet(null)}
              playerName={viewingSheet.name}
              sheet={viewingSheet.sheet}
              isOwner={viewingSheet.teamId === userTeamId}
            />
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════ ACTIVE TOURNAMENT VIEW ═══════════════════
  const currentRoundName = tournament?.rounds.find(r =>
    r.matches.some(m => m.status === 'pending' || m.status === 'in-progress')
  )?.name || (tournament?.status === 'completed' ? 'Complete' : 'Round 1')

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{league.name}</h1>
              {tournamentFormat && (
                <Badge variant="outline">{tournamentFormat.shortName}</Badge>
              )}
              {tournament?.status === 'completed' && (
                <Badge variant="default" className="bg-yellow-500 text-yellow-950">Complete</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tournamentType ? tournamentType.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Knockout'} &middot; {league.teams.length} players &middot; {currentRoundName}
            </p>
          </div>
          {roomCode && (
            <Button variant="ghost" size="sm" className="shrink-0 font-mono text-xs" onClick={handleCopyCode}>
              {copiedCode ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {roomCode}
            </Button>
          )}
        </div>

        {/* Champion Banner */}
        {tournament?.winner && (
          <Card className="mb-6 border-2 border-yellow-500/50 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20">
            <CardContent className="py-4 flex items-center justify-center gap-3">
              <Crown className="h-6 w-6 text-yellow-500" />
              <span className="text-lg font-bold">{tournament.winner.name}</span>
              <span className="text-muted-foreground">wins the tournament!</span>
              <Trophy className="h-6 w-6 text-yellow-500" />
            </CardContent>
          </Card>
        )}

        {/* Submit Team Sheet (active tournament) */}
        {userTeamId && !teamSheets[userTeamId] && (
          <Card className="mb-4 border-primary/30">
            <CardContent className="py-3 flex items-center justify-between">
              <p className="text-sm"><ClipboardList className="h-4 w-4 inline mr-1.5 text-primary" />Submit your open team sheet</p>
              <Button size="sm" onClick={() => setShowSheetModal(true)}>Submit Team</Button>
            </CardContent>
          </Card>
        )}

        {/* Bracket */}
        {tournament && <PlayoffBracket tournament={tournament} className="mb-6" />}

        {/* Open Team Sheets */}
        {Object.keys(teamSheets).length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Open Team Sheets
                <Badge variant="outline" className="ml-auto">{Object.keys(teamSheets).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {league.teams.filter(t => teamSheets[t.id]).map(team => {
                const sheet = teamSheets[team.id]
                const colors = teamColorMap.get(team.id)
                return (
                  <button
                    key={team.id}
                    onClick={() => setViewingSheet({ name: team.name, sheet, teamId: team.id })}
                    className="w-full flex items-center gap-3 p-2.5 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className={`w-1.5 h-8 rounded-full shrink-0 ${colors?.bg || 'bg-muted'}`} />
                    <span className="font-medium text-sm flex-1 min-w-0 truncate">{team.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {sheet.slice(0, 6).map((mon, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-muted/60 rounded text-[10px] font-medium truncate max-w-[65px]">{mon.name}</span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Active Matches */}
        {activeMatches.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Swords className="h-4 w-4 text-red-500" />
                Upcoming Matches
                <Badge variant="outline" className="ml-auto">{activeMatches.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeMatches.map(match => {
                const homeColors = teamColorMap.get(match.homeTeamId)
                const awayColors = teamColorMap.get(match.awayTeamId)
                const homePicks = teamPicks[match.homeTeamId] || []
                const awayPicks = teamPicks[match.awayTeamId] || []

                return (
                  <div key={match.id} className="border rounded-lg overflow-hidden">
                    {/* Teams + Score bar */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-1.5 h-6 rounded-full shrink-0 ${homeColors?.bg || 'bg-muted'}`} />
                        <span className="font-semibold text-sm truncate">{match.homeTeam.name}</span>
                      </div>
                      <div className="px-3 shrink-0">
                        <Badge variant="outline" size="sm">vs</Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="font-semibold text-sm truncate">{match.awayTeam.name}</span>
                        <div className={`w-1.5 h-6 rounded-full shrink-0 ${awayColors?.bg || 'bg-muted'}`} />
                      </div>
                    </div>

                    {/* Rosters */}
                    <div className="grid grid-cols-2 gap-0 divide-x">
                      <div className="px-2.5 py-2 space-y-0.5">
                        {homePicks.slice(0, 6).map(pick => (
                          <div key={pick.id} className="flex items-center gap-1.5">
                            <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-6 h-6 object-contain" lazy />
                            <span className="text-xs capitalize truncate">{pick.pokemonName}</span>
                          </div>
                        ))}
                        {homePicks.length === 0 && <p className="text-xs text-muted-foreground py-1">No Pokemon</p>}
                      </div>
                      <div className="px-2.5 py-2 space-y-0.5">
                        {awayPicks.slice(0, 6).map(pick => (
                          <div key={pick.id} className="flex items-center gap-1.5 justify-end">
                            <span className="text-xs capitalize truncate">{pick.pokemonName}</span>
                            <PokemonSprite pokemonId={pick.pokemonId} pokemonName={pick.pokemonName} className="w-6 h-6 object-contain" lazy />
                          </div>
                        ))}
                        {awayPicks.length === 0 && <p className="text-xs text-muted-foreground py-1 text-right">No Pokemon</p>}
                      </div>
                    </div>

                    {/* Record button */}
                    {isCommissioner && (
                      <div className="border-t px-3 py-1.5 bg-muted/10">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs w-full h-7"
                          onClick={() => handleRecordMatch(match)}
                        >
                          Record Result
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Completed Matches */}
        {completedMatches.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-green-500" />
                Completed Matches
                <Badge variant="secondary" className="ml-auto">{completedMatches.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedMatches.map(match => {
                const homeColors = teamColorMap.get(match.homeTeamId)
                const awayColors = teamColorMap.get(match.awayTeamId)
                const roundInfo = tournament?.rounds.find(r =>
                  r.matches.some(m =>
                    (m.participant1?.teamId === match.homeTeamId && m.participant2?.teamId === match.awayTeamId) ||
                    (m.participant1?.teamId === match.awayTeamId && m.participant2?.teamId === match.homeTeamId)
                  )
                )

                return (
                  <div key={match.id} className="flex items-center justify-between p-2.5 border rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-1.5 h-5 rounded-full shrink-0 ${homeColors?.bg || 'bg-muted'}`} />
                      <span className={`text-sm truncate ${match.winnerTeamId === match.homeTeamId ? 'font-bold' : 'text-muted-foreground'}`}>
                        {match.homeTeam.name}
                      </span>
                    </div>
                    <div className="px-3 text-center shrink-0 flex items-center gap-2">
                      <span className={`text-sm font-bold tabular-nums ${match.winnerTeamId === match.homeTeamId ? 'text-green-500' : ''}`}>
                        {match.homeScore}
                      </span>
                      <span className="text-xs text-muted-foreground">-</span>
                      <span className={`text-sm font-bold tabular-nums ${match.winnerTeamId === match.awayTeamId ? 'text-green-500' : ''}`}>
                        {match.awayScore}
                      </span>
                      {roundInfo && (
                        <Badge variant="outline" size="sm" className="text-[10px] ml-1">
                          {roundInfo.name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className={`text-sm truncate ${match.winnerTeamId === match.awayTeamId ? 'font-bold' : 'text-muted-foreground'}`}>
                        {match.awayTeam.name}
                      </span>
                      <div className={`w-1.5 h-5 rounded-full shrink-0 ${awayColors?.bg || 'bg-muted'}`} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Match Recorder Modal */}
        {selectedMatch && (
          <MatchRecorderModal
            isOpen={!!selectedMatch}
            onClose={() => setSelectedMatch(null)}
            match={selectedMatch}
            homeTeamPicks={homeTeamPicks}
            awayTeamPicks={awayTeamPicks}
            onSuccess={handleMatchRecorded}
          />
        )}

        {/* Team Sheet Modals */}
        {showSheetModal && userTeamId && (
          <TeamSheetModal
            isOpen={showSheetModal}
            onClose={() => setShowSheetModal(false)}
            draftId={league.draftId}
            teamId={userTeamId}
            existingSheet={teamSheets[userTeamId]}
            onSubmitted={loadData}
          />
        )}
        {viewingSheet && (
          <TeamSheetView
            isOpen={!!viewingSheet}
            onClose={() => setViewingSheet(null)}
            playerName={viewingSheet.name}
            sheet={viewingSheet.sheet}
          />
        )}
      </div>
    </div>
  )
}
