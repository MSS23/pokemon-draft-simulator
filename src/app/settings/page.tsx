'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Pencil, LogOut } from 'lucide-react'

interface UserProfile {
  id: string
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    if (!supabase) {
      router.push('/auth/login')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/login')
      return
    }

    await loadProfile(user.id)
  }

  async function loadProfile(userId: string) {
    if (!supabase) return

    const response = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single() as any

    if (response?.data) {
      setProfile(response.data)
    } else {
      // Create default profile
      const defaultProfile: Partial<UserProfile> = {
        id: userId,
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

    const updateResponse = await (supabase
      .from('user_profiles') as any)
      .upsert({
        id: profile.id,
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
      alert('Profile saved successfully!')
    }
  }

  async function handleLogout() {
    if (!supabase) return
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-500 rounded flex items-center justify-center">
              <span className="text-slate-900 font-bold">P</span>
            </div>
            <h1 className="text-white text-xl font-bold">Pokémon Draft League</h1>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-white"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Profile Settings</h1>
        </div>

        <Card className="bg-slate-900 border-slate-800 p-8">
          {/* Profile Header */}
          <div className="flex items-start gap-6 mb-8 pb-8 border-b border-slate-800">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile.avatar_url || ''} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl">
                  {profile.username?.[0]?.toUpperCase() || profile.display_name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <button className="absolute bottom-0 right-0 bg-yellow-500 rounded-full p-2 hover:bg-yellow-600 transition">
                <Pencil className="h-3 w-3 text-slate-900" />
              </button>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">
                {profile.display_name || 'Ash Ketchum'}
              </h2>
              <p className="text-slate-400">
                Tell us a bit about yourself. This information will be visible to other trainers.
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-white">Username</Label>
                <Input
                  id="username"
                  value={profile.username || ''}
                  onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                  placeholder="AshKetchum10"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="favorite" className="text-white">Favorite Pokémon</Label>
                <Input
                  id="favorite"
                  value={profile.favorite_pokemon || 'Pikachu'}
                  onChange={(e) => setProfile({ ...profile, favorite_pokemon: e.target.value })}
                  placeholder="Pikachu"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-white">About Me</Label>
              <Textarea
                id="bio"
                value={profile.bio || ''}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="I wanna be the very best, like no one ever was..."
                rows={4}
                className="bg-slate-800 border-slate-700 text-white resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="twitter" className="text-white">Twitter Profile</Label>
                <Input
                  id="twitter"
                  value={profile.twitter_profile || ''}
                  onChange={(e) => setProfile({ ...profile, twitter_profile: e.target.value })}
                  placeholder="https://twitter.com/username"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitch" className="text-white">Twitch Channel</Label>
                <Input
                  id="twitch"
                  value={profile.twitch_channel || ''}
                  onChange={(e) => setProfile({ ...profile, twitch_channel: e.target.value })}
                  placeholder="https://twitch.tv/channel"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-8 pt-8 border-t border-slate-800">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard')}
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-semibold"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
