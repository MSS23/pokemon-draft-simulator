'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Clock, Zap, Trophy, AlertCircle, Eye } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

function JoinDraftForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [isJoining, setIsJoining] = useState(false)
  const [draftInfo, setDraftInfo] = useState<any>(null)
  const [error, setError] = useState('')
  const [userDisplayName, setUserDisplayName] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [formData, setFormData] = useState({
    teamName: '',
    roomCode: searchParams.get('code') || '',
    password: ''
  })
  const [joinAsSpectator, setJoinAsSpectator] = useState(false)
  const [requiresPassword, setRequiresPassword] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (field === 'roomCode') {
      setError('')
      setDraftInfo(null)
    }
  }

  const lookupDraft = async () => {
    if (!formData.roomCode.trim()) {
      setError('Please enter a room code')
      return
    }

    setIsJoining(true)
    try {
      const { DraftService } = await import('@/lib/draft-service')
      const draftState = await DraftService.getDraftState(formData.roomCode.toLowerCase())

      if (!draftState) {
        setError('Draft room not found. Please check the room code.')
        return
      }

      const hostParticipant = draftState.participants.find(p => p.is_host)
      const hasPassword = !!(draftState.draft as any).password

      setRequiresPassword(hasPassword)
      setDraftInfo({
        roomCode: formData.roomCode.toUpperCase(),
        maxTeams: draftState.draft.max_teams,
        currentTeams: draftState.teams.length,
        draftType: draftState.draft.format,
        timeLimit: draftState.draft.settings?.timeLimit || 60,
        pokemonPerTeam: draftState.draft.settings?.pokemonPerTeam || 6,
        createdBy: hostParticipant?.display_name || 'Unknown',
        status: draftState.draft.status === 'setup' ? 'waiting' : draftState.draft.status,
        hasPassword
      })
    } catch (error) {
      console.error('Failed to lookup draft:', error)
      setError('Draft room not found. Please check the room code.')
    } finally {
      setIsJoining(false)
    }
  }

  const handleJoinDraft = async () => {
    if (!userDisplayName.trim()) {
      setError('Please wait for your profile to load')
      return
    }

    if (!joinAsSpectator && !formData.teamName.trim()) {
      setError('Please enter a team name or join as spectator')
      return
    }

    if (requiresPassword && !formData.password.trim()) {
      setError('This draft requires a password')
      return
    }

    setIsJoining(true)
    try {
      const { DraftService } = await import('@/lib/draft-service')
      const { grantDraftAccess } = await import('@/lib/draft-access')

      // Verify password if required
      if (requiresPassword) {
        const passwordValid = await DraftService.verifyDraftPassword({
          roomCode: formData.roomCode,
          password: formData.password
        })

        if (!passwordValid) {
          setError('Incorrect password')
          setIsJoining(false)
          return
        }
      }

      // Grant access to this draft in the user's session
      grantDraftAccess(formData.roomCode, false)

      if (joinAsSpectator) {
        // Join as spectator (no team)
        await DraftService.joinAsSpectator({
          roomCode: formData.roomCode,
          userId: user!.id
        })

        router.push(`/draft/${formData.roomCode.toLowerCase()}?spectator=true`)
      } else {
        // Join as participant with team
        const result = await DraftService.joinDraft({
          roomCode: formData.roomCode,
          userId: user!.id,
          teamName: formData.teamName
        })

        // Check if auto-joined as spectator (draft was full/started)
        if (result.asSpectator) {
          router.push(`/draft/${formData.roomCode.toLowerCase()}?spectator=true`)
        } else {
          router.push(`/draft/${formData.roomCode.toLowerCase()}`)
        }
      }
    } catch (error) {
      console.error('Failed to join draft:', error)
      setError(error instanceof Error ? error.message : 'Failed to join draft room. Please try again.')
    } finally {
      setIsJoining(false)
    }
  }

  // Load user profile on mount
  useEffect(() => {
    async function loadUserProfile() {
      if (authLoading) return

      if (!user) {
        setError('You must be signed in to join a draft')
        setLoadingProfile(false)
        return
      }

      try {
        if (!supabase) throw new Error('Supabase not configured')

        console.log('[Join Draft] Loading profile for user:', user.id)

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) {
          console.error('[Join Draft] Profile query error:', profileError)
          throw profileError
        }

        if (!profile) {
          console.warn('[Join Draft] No profile found, using email as display name')
          // If no profile exists, use email username as display name
          const displayName = user.email?.split('@')[0] || 'User'
          setUserDisplayName(displayName)
        } else {
          console.log('[Join Draft] Profile loaded:', profile)
          const profileData = profile as { display_name: string }
          setUserDisplayName(profileData.display_name || user.email?.split('@')[0] || 'User')
        }
      } catch (error) {
        console.error('[Join Draft] Error loading profile:', error)
        // Don't block the user - use email as fallback
        const fallbackName = user.email?.split('@')[0] || 'User'
        setUserDisplayName(fallbackName)
        // Clear the error so user can still proceed
        setError('')
      } finally {
        setLoadingProfile(false)
      }
    }

    loadUserProfile()
  }, [user, authLoading])

  useEffect(() => {
    if (formData.roomCode && !authLoading && user) {
      lookupDraft()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.roomCode, authLoading, user])

  const isFormValid = userDisplayName.trim() && formData.roomCode.trim() && (joinAsSpectator || formData.teamName.trim())

  return (
    <div className="min-h-screen bg-background pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="relative text-center mb-8">
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
            Join Draft Room
          </h1>
          <p className="text-lg text-slate-700 dark:text-slate-300 mb-6">
            Enter a room code to join an existing Pokémon draft
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-xl border-0">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-slate-800 dark:text-slate-100">
                Join Existing Draft
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Enter the room code and your details to join the draft
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Room Code */}
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                  Room Code
                </h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter 6-character room code"
                    value={formData.roomCode}
                    onChange={(e) => handleInputChange('roomCode', e.target.value.toUpperCase())}
                    className="bg-white dark:bg-slate-800 font-mono text-lg text-center"
                    maxLength={6}
                  />
                  <Button
                    onClick={lookupDraft}
                    disabled={!formData.roomCode.trim() || isJoining}
                    variant="outline"
                  >
                    {isJoining ? 'Looking up...' : 'Find Room'}
                  </Button>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">{error}</span>
                  </div>
                </div>
              )}

              {/* Draft Info */}
              {draftInfo && (
                <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <h3 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Draft Found!
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Badge variant="secondary" className="flex items-center gap-1 justify-center">
                      <Users className="h-3 w-3" />
                      {draftInfo.currentTeams}/{draftInfo.maxTeams} teams
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1 justify-center">
                      <Zap className="h-3 w-3" />
                      {draftInfo.draftType} format
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1 justify-center">
                      <Clock className="h-3 w-3" />
                      {draftInfo.timeLimit}s per pick
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1 justify-center">
                      <Trophy className="h-3 w-3" />
                      {draftInfo.pokemonPerTeam} Pokémon
                    </Badge>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Created by: <strong>{draftInfo.createdBy}</strong>
                  </p>
                </div>
              )}

              {/* User Identity */}
              {draftInfo && (
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Your Identity
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="userName" className="text-sm font-medium">
                        Your Username
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="userName"
                          value={userDisplayName}
                          disabled
                          className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        />
                        <Badge variant="secondary" className="text-xs">From Profile</Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Your display name from your profile settings
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamName" className="text-sm font-medium">
                        {joinAsSpectator ? 'Join Mode' : 'Team Name'}
                      </Label>
                      {joinAsSpectator ? (
                        <div className="flex items-center justify-center h-10 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm font-medium">
                            <Eye className="h-4 w-4" />
                            Joining as Spectator
                          </div>
                        </div>
                      ) : (
                        <Input
                          id="teamName"
                          placeholder="Enter team name"
                          value={formData.teamName}
                          onChange={(e) => handleInputChange('teamName', e.target.value)}
                          className="bg-white dark:bg-slate-800"
                        />
                      )}
                    </div>
                  </div>

                  {/* Password Field */}
                  {requiresPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-medium text-red-700 dark:text-red-400">
                        Password Required *
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter draft password"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="bg-white dark:bg-slate-800 border-red-300 dark:border-red-700"
                      />
                      <p className="text-xs text-red-600 dark:text-red-400">
                        This is a private draft and requires a password to join
                      </p>
                    </div>
                  )}

                  {/* Spectator Mode Toggle */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Join as Spectator
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Watch the draft without participating
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={joinAsSpectator ? "default" : "outline"}
                        size="sm"
                        onClick={() => setJoinAsSpectator(!joinAsSpectator)}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        {joinAsSpectator ? 'Spectating' : 'Spectate'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="flex-1"
              >
                Cancel
              </Button>
              {draftInfo && (
                <Button
                  onClick={handleJoinDraft}
                  disabled={!isFormValid || isJoining}
                  className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                >
                  {isJoining ? 'Joining...' : 'Join Draft'}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function JoinDraftPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <JoinDraftForm />
    </Suspense>
  )
}