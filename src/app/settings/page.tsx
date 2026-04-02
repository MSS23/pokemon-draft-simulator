'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { User, Shield, Bell, Eye, Trash2, Download, MapPin, Smartphone, ExternalLink } from 'lucide-react'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { SignInButton, useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'
import {
  isPushSupported,
  getPushPermissionStatus,
  subscribeToPush,
  unsubscribeFromPush,
  hasActiveSubscription,
} from '@/lib/push-notifications'

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
  const clerk = useClerk()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
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
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  // Check push notification status on mount
  useEffect(() => {
    const supported = isPushSupported()
    setPushSupported(supported)
    setPushPermission(getPushPermissionStatus())

    if (supported) {
      hasActiveSubscription().then(active => setPushEnabled(active))
    }
  }, [])

  const handlePushToggle = useCallback(async (enable: boolean) => {
    if (!user) return
    setPushLoading(true)
    try {
      if (enable) {
        await subscribeToPush(user.id)
        setPushEnabled(true)
        setPushPermission(getPushPermissionStatus())
        toast.success('Push notifications enabled')
      } else {
        await unsubscribeFromPush()
        setPushEnabled(false)
        toast.success('Push notifications disabled')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update push notifications'
      toast.error(message)
      // Revert toggle on error
      setPushEnabled(!enable)
    } finally {
      setPushLoading(false)
    }
  }, [user])

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (data && !error) {
      setProfile(data as unknown as UserProfile)
      const prefs = (data as Record<string, unknown>).preferences as Record<string, unknown> | null
      if (prefs) {
        if (prefs.notifications) setNotifications(prev => ({ ...prev, ...(prefs.notifications as object) }))
        if (prefs.privacy) setPrivacy(prev => ({ ...prev, ...(prefs.privacy as object) }))
      }
    } else {
      setProfile({
        user_id: userId,
        username: user?.user_metadata?.display_name || user?.email?.split('@')[0] || '',
        display_name: user?.user_metadata?.display_name || user?.email?.split('@')[0] || '',
        avatar_url: null,
        favorite_pokemon: 'Pikachu',
        bio: null,
        twitter_profile: null,
        twitch_channel: null,
      })
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    loadProfile(user.id)
  }, [authLoading, user, loadProfile])

  async function handleSaveProfile() {
    if (!profile || !supabase) return
    setSaving(true)
    try {
      // Upsert profile row
      const { error: dbError } = await supabase.from('user_profiles').upsert({
        user_id: profile.user_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        favorite_pokemon: profile.favorite_pokemon,
        bio: profile.bio,
        twitter_profile: profile.twitter_profile,
        twitch_channel: profile.twitch_channel,
        updated_at: new Date().toISOString(),
      })
      if (dbError) throw dbError

      toast.success('Profile saved!')
    } catch (err) {
      createLogger('SettingsPage').error('Save profile error:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePrefs() {
    if (!supabase || !profile) return
    setSavingPrefs(true)
    await supabase
      .from('user_profiles')
      .update({ preferences: { notifications, privacy }, updated_at: new Date().toISOString() })
      .eq('user_id', profile.user_id)
    setSavingPrefs(false)
    toast.success('Preferences saved')
  }

  if (authLoading || loading) {
    return (
      <SidebarLayout>
        <div className="min-h-full flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </SidebarLayout>
    )
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-full p-8 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader>
              <h2 className="text-xl font-bold">Login Required</h2>
              <p className="text-sm text-muted-foreground">Sign in to manage your settings.</p>
            </CardHeader>
            <CardContent>
              <SignInButton mode="modal">
                <Button variant="brand" className="w-full">
                  Sign In
                </Button>
              </SignInButton>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    )
  }

  if (!profile) return null

  const displayName = profile.display_name || profile.username || 'Trainer'
  const deleteConfirmTarget = profile.username || profile.display_name || 'DELETE'

  return (
    <SidebarLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences.</p>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
            <TabsTrigger value="profile" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Bell className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Alerts</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile" className="mt-6">
            <Card>
              <CardContent className="p-6 space-y-6">
                {/* Avatar row */}
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={profile.avatar_url || ''} />
                    <AvatarFallback className="brand-gradient-bg text-white text-xl font-bold">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="avatar-url">Avatar URL</Label>
                    <Input
                      id="avatar-url"
                      value={profile.avatar_url || ''}
                      onChange={e => setProfile({ ...profile, avatar_url: e.target.value || null })}
                      placeholder="https://example.com/avatar.png"
                    />
                    <p className="text-xs text-muted-foreground">Paste a public image URL to set your avatar.</p>
                  </div>
                </div>

                <Separator />

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="display-name">Display Name</Label>
                    <Input
                      id="display-name"
                      value={profile.display_name || ''}
                      onChange={e => setProfile({ ...profile, display_name: e.target.value })}
                      placeholder="Ash Ketchum"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={profile.username || ''}
                      onChange={e => setProfile({ ...profile, username: e.target.value })}
                      placeholder="ashketchum10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={profile.bio || ''}
                    onChange={e => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="I wanna be the very best, like no one ever was..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="favorite">Favorite Pokémon</Label>
                  <Input
                    id="favorite"
                    value={profile.favorite_pokemon || ''}
                    onChange={e => setProfile({ ...profile, favorite_pokemon: e.target.value })}
                    placeholder="Pikachu"
                  />
                  <p className="text-xs text-muted-foreground">Shown on your public profile with its animated sprite.</p>
                </div>

                <Separator />

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="twitter">Twitter / X</Label>
                    <Input
                      id="twitter"
                      value={profile.twitter_profile || ''}
                      onChange={e => setProfile({ ...profile, twitter_profile: e.target.value })}
                      placeholder="https://twitter.com/username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitch">Twitch</Label>
                    <Input
                      id="twitch"
                      value={profile.twitch_channel || ''}
                      onChange={e => setProfile({ ...profile, twitch_channel: e.target.value })}
                      placeholder="https://twitch.tv/channel"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => router.push('/profile')}>
                    View Profile
                  </Button>
                  <Button variant="brand" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Account / Security Tab ── */}
          <TabsContent value="account" className="mt-6 space-y-4">
            {/* Email info */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold">Account Details</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Email address</Label>
                    <p className="text-sm font-medium mt-1">{user.email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Account created</Label>
                    <p className="text-sm font-medium mt-1">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Security — managed by Clerk */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Security Settings
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Password, two-factor authentication, and connected accounts are managed through your account security settings.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => clerk.openUserProfile()}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage Security
                </Button>
              </CardContent>
            </Card>

            {/* Replay Tour */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Dashboard Tour
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Replay the onboarding tour to rediscover dashboard features.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      localStorage.removeItem('tour:completed')
                      localStorage.removeItem('tour:favoritePokemon')
                      localStorage.setItem('tour:pendingStart', '1')
                      window.location.href = '/dashboard'
                    } catch {}
                  }}
                >
                  Replay Tour
                </Button>
              </CardContent>
            </Card>

            {/* Data Export */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Your Data
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Download all data associated with your account (GDPR).
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/user/export')
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

            {/* Danger Zone */}
            <Card className="border-destructive/40">
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2 text-destructive">
                    <Trash2 className="h-4 w-4" />
                    Danger Zone
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Permanently delete your account and all associated data. This cannot be undone.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm" className="text-sm">
                    Type <strong>{deleteConfirmTarget}</strong> to confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="Type to confirm"
                    className="border-destructive/40 max-w-xs"
                  />
                </div>
                <Button
                  variant="destructive"
                  disabled={isDeleting || deleteConfirmText !== deleteConfirmTarget}
                  onClick={async () => {
                    setIsDeleting(true)
                    try {
                      const res = await fetch('/api/user/delete', {
                        method: 'DELETE',
                      })
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}))
                        throw new Error(data.error || 'Deletion failed')
                      }
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
          </TabsContent>

          {/* ── Notifications Tab ── */}
          <TabsContent value="notifications" className="mt-6 space-y-4">
            {/* Push Notifications Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Push Notifications
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Receive browser push notifications even when the app is in the background.
                  </p>
                </div>

                {!pushSupported ? (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      Push notifications are not supported in your current browser. Try using Chrome, Edge, or Firefox on desktop.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Enable Push Notifications</p>
                        <p className="text-xs text-muted-foreground">
                          {pushPermission === 'denied'
                            ? 'Notifications are blocked. Please enable them in your browser settings.'
                            : pushEnabled
                              ? 'You will receive push notifications for important events.'
                              : 'Turn on to get notified about turns, trades, and matches.'}
                        </p>
                      </div>
                      <Switch
                        checked={pushEnabled}
                        onCheckedChange={handlePushToggle}
                        disabled={pushLoading || pushPermission === 'denied'}
                      />
                    </div>

                    {pushPermission === 'denied' && (
                      <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                        <p className="text-sm text-destructive">
                          Notifications are blocked by your browser. To re-enable, click the lock icon in your address bar and allow notifications for this site.
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div>
                      <p className="text-sm font-medium mb-2">What you will be notified about:</p>
                      <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                        <li>Your turn to pick in a draft</li>
                        <li>Incoming trade proposals and responses</li>
                        <li>Upcoming match reminders</li>
                        <li>Outbid alerts in auction drafts</li>
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* In-App Notification Preferences */}
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-semibold">In-App Alert Preferences</h3>
                  <p className="text-sm text-muted-foreground mt-1">Control which in-app alerts you receive.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'turnAlerts' as const, label: 'Turn Alerts', desc: "Get notified when it's your turn to pick" },
                    { key: 'bidAlerts' as const, label: 'Bid Alerts', desc: 'Notifications for outbids in auctions' },
                    { key: 'matchReminders' as const, label: 'Match Reminders', desc: 'Reminders for upcoming league matches' },
                    { key: 'tradeNotifications' as const, label: 'Trade Notifications', desc: 'Alerts for trade proposals and approvals' },
                  ].map((item, i, arr) => (
                    <div key={item.key}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch
                          checked={notifications[item.key]}
                          onCheckedChange={checked =>
                            setNotifications(prev => ({ ...prev, [item.key]: checked }))
                          }
                        />
                      </div>
                      {i < arr.length - 1 && <Separator className="mt-4" />}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button variant="brand" size="sm" disabled={savingPrefs} onClick={handleSavePrefs}>
                    {savingPrefs ? 'Saving...' : 'Save Preferences'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Privacy Tab ── */}
          <TabsContent value="privacy" className="mt-6">
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-semibold">Privacy Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">Control who can see your profile and activity.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-visibility">Profile Visibility</Label>
                    <select
                      id="profile-visibility"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={privacy.profileVisibility}
                      onChange={e =>
                        setPrivacy(prev => ({
                          ...prev,
                          profileVisibility: e.target.value as 'public' | 'league_only' | 'private',
                        }))
                      }
                    >
                      <option value="public">Public — Anyone can see your profile</option>
                      <option value="league_only">League Only — Only league members can see</option>
                      <option value="private">Private — Only you can see your profile</option>
                    </select>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Show Online Status</p>
                      <p className="text-xs text-muted-foreground">Let others see when you&apos;re active</p>
                    </div>
                    <Switch
                      checked={privacy.showOnlineStatus}
                      onCheckedChange={checked =>
                        setPrivacy(prev => ({ ...prev, showOnlineStatus: checked }))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button variant="brand" size="sm" disabled={savingPrefs} onClick={handleSavePrefs}>
                    {savingPrefs ? 'Saving...' : 'Save Privacy Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SidebarLayout>
  )
}
