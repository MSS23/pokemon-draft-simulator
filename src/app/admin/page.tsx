'use client'

import { useState } from 'react'
import FormatSyncPanel from '@/components/admin/FormatSyncPanel'
import { Shield, Database, Settings } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              Admin Panel
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Manage format data, settings, and system configuration
          </p>
        </div>

        {/* Content */}
        <Tabs defaultValue="formats" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="formats" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Format Data
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

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
                  <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                    <div>
                      <p className="font-medium text-sm">VGC 2024 Regulation H</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Official VGC format - Paldea, Kitakami, Blueberry Academy Pokédex
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                    <div>
                      <p className="font-medium text-sm">VGC Doubles</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Standard VGC doubles format
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-purple-500" />
                    <div>
                      <p className="font-medium text-sm">Gen 9 OU</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
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
                  Additional configuration options coming soon
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">More settings will be available here in future updates</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
