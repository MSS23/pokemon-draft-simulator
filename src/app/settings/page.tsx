'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Pencil, Shield, Bell, Eye, Trash2 } from 'lucide-react'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { toast } from 'sonner'

interface UserProfile {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  favorite_pokemon: string
  bio: string | null
  twitter_profile: string | null
  twitch_channel: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [notifications, setNotifications] = useState({
    turnAlerts: true,
    bidAlerts: true,
    matchReminders: true,
    tradeNotifications: true,
  })
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'public' as 'public' | 'league_only' | 'private',
    showOnlineStatus: true,
  })

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return

    // Skip profile load if not authenticated
    if (!user) {
      setLoading(false)
      return
    }

    // Load user profile
    loadProfile(user.id)
  }, [authLoading, user])

  async function loadProfile(userId: string) {
    if (!supabase) return

    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileData && !profileError) {
      setProfile(profileData as unknown as UserProfile)
      // Load preferences if stored
      const prefs = (profileData as Record<string, unknown>).preferences as Record<string, unknown> | null
      if (prefs) {
        if (prefs.notifications) setNotifications(prev => ({ ...prev, ...(prefs.notifications as object) }))
        if (prefs.privacy) setPrivacy(prev => ({ ...prev, ...(prefs.privacy as object) }))
      }
    } else {
      // Create default profile
      const defaultProfile: Partial<UserProfile> = {
        user_id: userId,
        username: '',
        display_name: '',
        avatar_url: null,
        favorite_pokemon: 'Pikachu',
        bio: null,
        twitter_profile: null,
        twitch_channel: null
      }
      setProfile(defaultProfile as UserProfile)
    }

    setLoading(false)
  }

  async function handleSave() {
    if (!profile || !supabase) return

    setSaving(true)

    const updateResponse = await supabase
      .from('user_profiles')
      .upsert({
        user_id: profile.user_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        favorite_pokemon: profile.favorite_pokemon,
        bio: profile.bio,
        twitter_profile: profile.twitter_profile,
        twitch_channel: profile.twitch_channel,
        updated_at: new Date().toISOString()
      })

    setSaving(false)

    if (!updateResponse?.error) {
      toast.success('Profile saved successfully!')
    } else {
      toast.error('Failed to save profile')
    }
  }

  // Show loading while auth or profile is loading
  if (authLoading || loading) {
    return (
      <SidebarLayout>
        <div className="min-h-full flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </SidebarLayout>
    )
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-full p-8 flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Login Required
              </h2>
              <p className="text-muted-foreground">
                You need to be logged in to view your profile settings
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your profile allows you to customize your display name, avatar, and connect your social media accounts.
                Please log in to access these settings.
              </p>
              <Button
                variant="brand"
                className="w-full"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          redirectTo="/settings"
        />
      </SidebarLayout>
    )
  }

  // Don't render if no profile (waiting for data or redirecting)
  if (!profile) return null

  return (
    <SidebarLayout>
      <div className="min-h-full p-8">
        <div className="container mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold brand-gradient-text mb-2">Profile Settings</h1>
        </div>

        <Card className="p-8">
          {/* Profile Header */}
          <div className="flex items-start gap-6 mb-8 pb-8 border-b">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile.avatar_url || ''} />
                <AvatarFallback className="brand-gradient-bg text-white text-2xl">
                  {profile.username?.[0]?.toUpperCase() || profile.display_name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <button className="absolute bottom-0 right-0 bg-primary rounded-full p-2 hover:bg-primary/90 transition">
                <Pencil className="h-3 w-3 text-primary-foreground" />
              </button>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-1">
                {profile.display_name || 'Ash Ketchum'}
              </h2>
              <p className="text-muted-foreground">
                Tell us a bit about yourself. This information will be visible to other trainers.
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={profile.username || ''}
                  onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                  placeholder="AshKetchum10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="favorite">Favorite Pokémon</Label>
                <Input
                  id="favorite"
                  value={profile.favorite_pokemon || 'Pikachu'}
                  onChange={(e) => setProfile({ ...profile, favorite_pokemon: e.target.value })}
                  placeholder="Pikachu"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">About Me</Label>
              <Textarea
                id="bio"
                value={profile.bio || ''}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="I wanna be the very best, like no one ever was..."
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="twitter">Twitter Profile</Label>
                <Input
                  id="twitter"
                  value={profile.twitter_profile || ''}
                  onChange={(e) => setProfile({ ...profile, twitter_profile: e.target.value })}
                  placeholder="https://twitter.com/username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitch">Twitch Channel</Label>
                <Input
                  id="twitch"
                  value={profile.twitch_channel || ''}
                  onChange={(e) => setProfile({ ...profile, twitch_channel: e.target.value })}
                  placeholder="https://twitch.tv/channel"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-8 pt-8 border-t">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard')}
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </Card>

        {/* Security - Password Change */}
        <Card className="p-8 mt-6">
          <CardHeader className="p-0 mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </h3>
            <p className="text-sm text-muted-foreground">Change your password.</p>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>
            <Button
              variant="outline"
              disabled={changingPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
              onClick={async () => {
                if (!supabase) return
                setChangingPassword(true)
                try {
                  const { error } = await supabase.auth.updateUser({ password: newPassword })
                  if (error) throw error
                  toast.success('Password updated successfully')
                  setNewPassword('')
                  setConfirmPassword('')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to update password')
                } finally {
                  setChangingPassword(false)
                }
              }}
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </Button>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
            {newPassword && newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-sm text-destructive">Password must be at least 6 characters</p>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="p-8 mt-6">
          <CardHeader className="p-0 mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </h3>
            <p className="text-sm text-muted-foreground">Control which notifications you receive.</p>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            {[
              { key: 'turnAlerts' as const, label: 'Turn Alerts', desc: 'Get notified when it\'s your turn to pick' },
              { key: 'bidAlerts' as const, label: 'Bid Alerts', desc: 'Notifications for outbids in auctions' },
              { key: 'matchReminders' as const, label: 'Match Reminders', desc: 'Reminders for upcoming league matches' },
              { key: 'tradeNotifications' as const, label: 'Trade Notifications', desc: 'Alerts for trade proposals and approvals' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <Switch
                  checked={notifications[item.key]}
                  onCheckedChange={checked =>
                    setNotifications(prev => ({ ...prev, [item.key]: checked }))
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!supabase || !profile) return
                await supabase
                  .from('user_profiles')
                  .update({
                    preferences: { notifications, privacy },
                    updated_at: new Date().toISOString(),
                  })
                  .eq('user_id', profile.user_id)
                toast.success('Notification preferences saved')
              }}
            >
              Save Preferences
            </Button>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card className="p-8 mt-6">
          <CardHeader className="p-0 mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Privacy
            </h3>
            <p className="text-sm text-muted-foreground">Control your profile visibility.</p>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-visibility">Profile Visibility</Label>
              <select
                id="profile-visibility"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={privacy.profileVisibility}
                onChange={e => setPrivacy(prev => ({ ...prev, profileVisibility: e.target.value as 'public' | 'league_only' | 'private' }))}
              >
                <option value="public">Public — Anyone can see your profile</option>
                <option value="league_only">League Only — Only league members can see</option>
                <option value="private">Private — Only you can see your profile</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Show Online Status</div>
                <div className="text-xs text-muted-foreground">Let others see when you&apos;re online</div>
              </div>
              <Switch
                checked={privacy.showOnlineStatus}
                onCheckedChange={checked =>
                  setPrivacy(prev => ({ ...prev, showOnlineStatus: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Data Export */}
        <Card className="p-8 mt-6">
          <CardHeader className="p-0 mb-4">
            <h3 className="text-xl font-bold">Your Data</h3>
            <p className="text-sm text-muted-foreground">Download all data associated with your account (GDPR).</p>
          </CardHeader>
          <CardContent className="p-0">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const session = await supabase.auth.getSession()
                  const token = session.data.session?.access_token
                  if (!token) { toast.error('You must be logged in'); return }
                  const res = await fetch('/api/user/export', {
                    headers: { Authorization: `Bearer ${token}` }
                  })
                  if (!res.ok) { toast.error('Export failed'); return }
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `pokemon-draft-export-${new Date().toISOString().split('T')[0]}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  toast.success('Data exported!')
                } catch { toast.error('Export failed') }
              }}
            >
              Download My Data
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone - Account Deletion */}
        <Card className="p-8 mt-6 border-destructive/50">
          <CardHeader className="p-0 mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Danger Zone
            </h3>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm" className="text-sm">
                Type your username <strong>{profile.username || profile.display_name || 'DELETE'}</strong> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type to confirm"
                className="border-destructive/50"
              />
            </div>
            <Button
              variant="destructive"
              disabled={
                isDeleting ||
                deleteConfirmText !== (profile.username || profile.display_name || 'DELETE')
              }
              onClick={async () => {
                setIsDeleting(true)
                try {
                  const session = await supabase.auth.getSession()
                  const token = session.data.session?.access_token
                  if (!token) { toast.error('You must be logged in'); return }
                  const res = await fetch('/api/user/delete', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                  })
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    throw new Error(data.error || 'Deletion failed')
                  }
                  await supabase.auth.signOut()
                  toast.success('Account deleted. Goodbye!')
                  router.push('/')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to delete account')
                } finally {
                  setIsDeleting(false)
                }
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete My Account'}
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    </SidebarLayout>
  )
}
