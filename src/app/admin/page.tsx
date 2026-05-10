'use client'

import { useEffect, useState } from 'react'
import FormatSyncPanel from '@/components/admin/FormatSyncPanel'
import DraftManagementPanel from '@/components/admin/DraftManagementPanel'
import { Shield, Database, Settings, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function AdminPage() {
  const { user, loading } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  // Verify admin role against user_profiles.is_admin. Default-deny on any
  // failure (missing client, query error, no profile) — admin access must
  // never fall open.
  useEffect(() => {
    if (loading) return
    if (!user) { setIsAdmin(false); return }
    if (!supabase) { setIsAdmin(false); return }

    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase!
          .from('user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .maybeSingle()
        if (cancelled) return
        const profile = data as { is_admin?: boolean } | null
        setIsAdmin(!!profile?.is_admin && !error)
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, loading])

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Access Required
            </CardTitle>
            <CardDescription>
              {user
                ? 'Your account does not have admin privileges.'
                : 'You must be signed in as an admin to access this page.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-4xl font-bold brand-gradient-text">
              Admin Panel
            </h1>
          </div>
          <p className="text-muted-foreground">
            Manage format data, settings, and system configuration
          </p>
        </div>

        {/* Content */}
        <Tabs defaultValue="drafts" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 mb-6">
            <TabsTrigger value="drafts" className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Draft Management
            </TabsTrigger>
            <TabsTrigger value="formats" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Format Data
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Draft Management Tab */}
          <TabsContent value="drafts" className="space-y-6">
            <DraftManagementPanel />
          </TabsContent>

          {/* Format Data Tab */}
          <TabsContent value="formats" className="space-y-6">
            <FormatSyncPanel />

            {/* Format Info Card */}
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Current Formats</CardTitle>
                <CardDescription>
                  The app uses a hybrid approach combining manual formats with Pokémon Showdown data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                    <div>
                      <p className="font-medium text-sm">VGC 2024 Regulation H</p>
                      <p className="text-xs text-muted-foreground">
                        Official VGC format - Paldea, Kitakami, Blueberry Academy Pokédex
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                    <div>
                      <p className="font-medium text-sm">VGC Doubles</p>
                      <p className="text-xs text-muted-foreground">
                        Standard VGC doubles format
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-purple-500" />
                    <div>
                      <p className="font-medium text-sm">Gen 9 OU</p>
                      <p className="text-xs text-muted-foreground">
                        Smogon Gen 9 Overused tier
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  System configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-8 text-center text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No additional settings configured</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
