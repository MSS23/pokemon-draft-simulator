'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { User, Save, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNotify } from '@/components/providers/NotificationProvider'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const notify = useNotify()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')

  useEffect(() => {
    if (!authLoading && !user) {
      notify.warning('Authentication Required', 'Please sign in to access your profile')
      router.push('/')
      return
    }

    if (user) {
      loadProfile()
    }
  }, [user, authLoading])

  async function loadProfile() {
    if (!supabase || !user) return

    try {
      setLoading(true)

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error
      }

      if (profile) {
        setDisplayName((profile as { display_name: string })?.display_name || '')
        setOriginalName((profile as { display_name: string })?.display_name || '')
      } else {
        // Profile doesn't exist yet, create it
        const defaultName = user.email?.split('@')[0] || 'User'
        const { error: insertError } = await (supabase
          .from('user_profiles') as any)
          .insert({
            user_id: user.id,
            display_name: defaultName
          })

        if (insertError) throw insertError

        setDisplayName(defaultName)
        setOriginalName(defaultName)
      }
    } catch (error) {
      console.error('Error loading profile:', error)
      notify.error('Error', 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!supabase || !user) return

    if (!displayName.trim()) {
      notify.warning('Invalid Name', 'Display name cannot be empty')
      return
    }

    if (displayName === originalName) {
      notify.info('No Changes', 'Display name is unchanged')
      return
    }

    try {
      setSaving(true)

      // Check if display name is already taken by another user (globally)
      const { data: existingUsers, error: checkError } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .ilike('display_name', displayName.trim())

      if (checkError) throw checkError

      // Filter out the current user
      const otherUsers = (existingUsers as { id: string; display_name: string }[])?.filter(u => u.id !== user.id) || []

      if (otherUsers.length > 0) {
        notify.error('Username Taken', `The username "${displayName.trim()}" is already taken. Please choose a different name.`)
        setSaving(false)
        return
      }

      const { error } = await (supabase
        .from('user_profiles') as any)
        .update({
          display_name: displayName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (error) {
        // Handle unique constraint violation
        if (error.code === '23505') {
          notify.error('Username Taken', `The username "${displayName.trim()}" is already taken. Please choose a different name.`)
        } else {
          throw error
        }
        return
      }

      setOriginalName(displayName.trim())
      notify.success('Profile Updated', 'Your display name has been updated successfully')
    } catch (error) {
      console.error('Error updating profile:', error)
      notify.error('Update Failed', 'Failed to update your profile')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading profile...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => router.push('/')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
          <ThemeToggle />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Manage your account information</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email"
                  type="email"
                  value={user.email || ''}
                  disabled
                  className="bg-slate-100 dark:bg-slate-800"
                />
                <Badge variant="secondary">Verified</Badge>
              </div>
              <p className="text-xs text-slate-500">
                Your email cannot be changed
              </p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-sm font-medium">
                Display Name
              </Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Enter your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-white dark:bg-slate-900"
                maxLength={50}
              />
              <p className="text-xs text-slate-500">
                This name will appear in draft rooms and leaderboards
              </p>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button
                onClick={handleSave}
                disabled={saving || displayName === originalName || !displayName.trim()}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              {displayName !== originalName && (
                <Button
                  variant="outline"
                  onClick={() => setDisplayName(originalName)}
                >
                  Cancel
                </Button>
              )}
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                About Display Names
              </h4>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Display names must be <strong>globally unique</strong> across the entire platform</li>
                <li>• No two users can have the same display name (case-insensitive)</li>
                <li>• Changes take effect immediately for new drafts you join</li>
                <li>• Existing drafts will show your old name until you rejoin</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
