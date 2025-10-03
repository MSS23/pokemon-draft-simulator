'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Tag, Save, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNotify } from '@/components/providers/NotificationProvider'
import type { Draft } from '@/types'

interface DraftSettingsProps {
  draft: Draft
  isHost: boolean
  onUpdate?: () => void
}

export function DraftSettings({ draft, isHost, onUpdate }: DraftSettingsProps) {
  const notify = useNotify()
  const [isUpdating, setIsUpdating] = useState(false)
  const [settings, setSettings] = useState({
    isPublic: (draft as any).is_public || false,
    description: (draft as any).description || '',
    tags: ((draft as any).tags || []).join(', ')
  })

  const handleTogglePublic = async () => {
    if (!isHost) {
      notify.warning('Permission Denied', 'Only the host can change spectator settings')
      return
    }

    if (!supabase) {
      notify.error('Offline', 'Cannot update settings while offline')
      return
    }

    setIsUpdating(true)
    try {
      const newIsPublic = !settings.isPublic

      const { error } = await (supabase
        .from('drafts') as any)
        .update({
          is_public: newIsPublic,
          updated_at: new Date().toISOString()
        })
        .eq('id', draft.id)

      if (error) throw error

      setSettings(prev => ({ ...prev, isPublic: newIsPublic }))
      notify.success(
        newIsPublic ? 'Draft is now public' : 'Draft is now private',
        newIsPublic
          ? 'Anyone can now spectate this draft'
          : 'Draft is no longer visible to spectators'
      )
      onUpdate?.()
    } catch (error) {
      console.error('Error toggling public status:', error)
      notify.error('Update Failed', 'Failed to update spectator settings')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSaveMetadata = async () => {
    if (!isHost) {
      notify.warning('Permission Denied', 'Only the host can change draft details')
      return
    }

    if (!supabase) {
      notify.error('Offline', 'Cannot update settings while offline')
      return
    }

    setIsUpdating(true)
    try {
      const tags = settings.tags
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)

      const { error } = await (supabase
        .from('drafts') as any)
        .update({
          description: settings.description || null,
          tags: tags.length > 0 ? tags : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', draft.id)

      if (error) throw error

      notify.success('Settings Saved', 'Draft details updated successfully')
      onUpdate?.()
    } catch (error) {
      console.error('Error saving metadata:', error)
      notify.error('Save Failed', 'Failed to update draft details')
    } finally {
      setIsUpdating(false)
    }
  }

  if (!isHost) {
    // Show read-only view for non-hosts
    return (
      <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Spectator Mode
          </CardTitle>
          <CardDescription>
            Draft visibility settings (host only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={settings.isPublic ? 'default' : 'secondary'}>
              {settings.isPublic ? (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Public
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Private
                </>
              )}
            </Badge>
            {settings.isPublic && (
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Anyone can spectate
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Spectator Mode Settings
        </CardTitle>
        <CardDescription>
          Control who can watch this draft
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Public Toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="flex-1">
            <Label className="font-medium">Public Draft</Label>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {settings.isPublic
                ? 'Anyone can watch this draft in real-time'
                : 'Only participants can view this draft'}
            </p>
          </div>
          <Button
            onClick={handleTogglePublic}
            disabled={isUpdating}
            variant={settings.isPublic ? 'default' : 'outline'}
            size="sm"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : settings.isPublic ? (
              <>
                <Eye className="h-4 w-4 mr-1" />
                Public
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                Private
              </>
            )}
          </Button>
        </div>

        {/* Metadata (only shown if public) */}
        {settings.isPublic && (
          <div className="space-y-3 p-3 border border-slate-200 dark:border-slate-600 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Description (Optional)
              </Label>
              <textarea
                id="description"
                placeholder="Describe your draft for spectators"
                value={settings.description}
                onChange={(e) => setSettings(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags" className="text-sm font-medium flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Tags (Optional)
              </Label>
              <Input
                id="tags"
                placeholder="e.g., tournament, competitive, casual"
                value={settings.tags}
                onChange={(e) => setSettings(prev => ({ ...prev, tags: e.target.value }))}
                className="bg-white dark:bg-slate-800"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Separate tags with commas
              </p>
            </div>
            <Button
              onClick={handleSaveMetadata}
              disabled={isUpdating}
              size="sm"
              className="w-full"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Details
                </>
              )}
            </Button>
          </div>
        )}

        {/* Spectator Stats */}
        <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-blue-900 dark:text-blue-100">
              {(draft as any).spectator_count || 0} spectators
            </span>
          </div>
          {settings.isPublic && (
            <Badge variant="outline" className="text-xs">
              Discoverable in /spectate
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}