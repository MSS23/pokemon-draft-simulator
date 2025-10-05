'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Shield, ShieldCheck, ShieldOff, Crown, Users } from 'lucide-react'
import { AdminService } from '@/lib/admin-service'
import { useNotify } from '@/components/providers/NotificationProvider'
import type { Participant } from '@/types'

interface AdminManagementProps {
  draftId: string
  participants: Participant[]
  currentUserId: string
  isHost: boolean
  isAdmin: boolean
}

export default function AdminManagement({
  draftId,
  participants,
  currentUserId,
  isHost,
  isAdmin
}: AdminManagementProps) {
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const notify = useNotify()

  // Only hosts and admins can see this component
  if (!isHost && !isAdmin) {
    return null
  }

  const handlePromote = async (participantId: string, participantName: string) => {
    setIsProcessing(participantId)
    try {
      const result = await AdminService.promoteToAdmin({
        draftId,
        participantId,
        promotingUserId: currentUserId
      })

      if (result.success) {
        notify.success('Admin Promoted', `${participantName} is now an admin`)
      } else {
        notify.error('Failed to Promote', result.error || 'Unknown error')
      }
    } catch (error) {
      notify.error('Failed to Promote', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsProcessing(null)
    }
  }

  const handleDemote = async (participantId: string, participantName: string) => {
    setIsProcessing(participantId)
    try {
      const result = await AdminService.demoteFromAdmin({
        draftId,
        participantId,
        demotingUserId: currentUserId
      })

      if (result.success) {
        notify.success('Admin Demoted', `${participantName} is no longer an admin`)
      } else {
        notify.error('Failed to Demote', result.error || 'Unknown error')
      }
    } catch (error) {
      notify.error('Failed to Demote', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsProcessing(null)
    }
  }

  const host = participants.find(p => p.isHost)
  const admins = participants.filter(p => p.isAdmin && !p.isHost)
  const regularParticipants = participants.filter(p => !p.isHost && !p.isAdmin)

  return (
    <Card className="p-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-700">
          <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            Admin Management
          </h3>
        </div>

        {/* Host */}
        {host && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Crown className="h-4 w-4 text-yellow-600" />
              Host
            </div>
            <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-yellow-600 flex items-center justify-center text-white font-bold text-sm">
                  {host.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {host.displayName}
                    {host.userId === currentUserId && (
                      <span className="text-xs text-slate-600 dark:text-slate-400 ml-2">(You)</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700">
                    <Crown className="h-3 w-3 mr-1" />
                    Host
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admins */}
        {admins.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-purple-600" />
              Admins ({admins.length})
            </div>
            <div className="space-y-2">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                      {admin.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {admin.displayName}
                        {admin.userId === currentUserId && (
                          <span className="text-xs text-slate-600 dark:text-slate-400 ml-2">(You)</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                  </div>
                  {isHost && admin.userId !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDemote(admin.id, admin.displayName)}
                      disabled={isProcessing === admin.id}
                      className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <ShieldOff className="h-3 w-3 mr-1" />
                      {isProcessing === admin.id ? 'Removing...' : 'Remove Admin'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regular Participants */}
        {regularParticipants.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Users className="h-4 w-4" />
              Participants ({regularParticipants.length})
            </div>
            <div className="space-y-2">
              {regularParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-400 flex items-center justify-center text-white font-bold text-sm">
                      {participant.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {participant.displayName}
                      {participant.userId === currentUserId && (
                        <span className="text-xs text-slate-600 dark:text-slate-400 ml-2">(You)</span>
                      )}
                    </div>
                  </div>
                  {(isHost || isAdmin) && participant.userId !== currentUserId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePromote(participant.id, participant.displayName)}
                      disabled={isProcessing === participant.id}
                      className="text-xs"
                    >
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      {isProcessing === participant.id ? 'Promoting...' : 'Make Admin'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          <p>💡 Admins can manage draft settings and control the draft flow</p>
        </div>
      </div>
    </Card>
  )
}
