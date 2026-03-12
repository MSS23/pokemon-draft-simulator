'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { KnockoutService } from '@/lib/knockout-service'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import {
  Swords, ArrowLeft, Loader2, Shield,
} from 'lucide-react'

const log = createLogger('JoinTournamentPage')

export default function JoinTournamentPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || ''

  const canJoin = roomCode.trim().length >= 4 && (playerName.trim().length > 0 || displayName.length > 0)

  const handleJoin = useCallback(async () => {
    if (!user) return
    setIsJoining(true)
    try {
      const { league } = await KnockoutService.joinTournament({
        roomCode: roomCode.trim().toUpperCase(),
        playerName: (playerName.trim() || displayName).trim(),
        userId: user.id,
      })
      notify.success('Joined!', 'You\'re in the tournament')
      router.push(`/tournament/${league.id}`)
    } catch (err) {
      log.error('Failed to join tournament:', err)
      notify.error('Failed', err instanceof Error ? err.message : 'Could not join tournament')
    } finally {
      setIsJoining(false)
    }
  }, [user, roomCode, playerName, displayName, router])

  if (authLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarLayout>
    )
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-8 pb-6 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-lg">
                <Shield className="h-6 w-6 text-yellow-500" />Sign In Required
              </div>
              <p className="text-sm text-muted-foreground">Sign in to join a tournament.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => router.push('/')} className="flex-1">Go Back</Button>
                <Button onClick={() => router.push('/auth/login')} className="flex-1">Sign In</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Join Tournament</h1>
            <p className="text-sm text-muted-foreground">Enter the room code from the host</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="room-code">Room Code</Label>
              <Input
                id="room-code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="text-center text-2xl font-mono tracking-[0.3em] uppercase h-14"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="player-name">Your Name</Label>
              <Input
                id="player-name"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder={displayName || 'Enter your name'}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleJoin}
              disabled={isJoining || !canJoin}
            >
              {isJoining ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Joining...</>
              ) : (
                <><Swords className="h-4 w-4 mr-2" />Join Tournament</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  )
}
