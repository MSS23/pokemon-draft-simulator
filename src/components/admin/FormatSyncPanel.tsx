'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Download, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { getLastSyncTime, isSyncStale, clearShowdownCache } from '@/services/showdown-sync'

export default function FormatSyncPanel() {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    success: boolean
    message: string
    formatsUpdated?: number
  } | null>(null)

  const lastSync = getLastSyncTime()
  const isStale = isSyncStale()

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)

    try {
      const response = await fetch('/api/formats/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      setSyncResult({
        success: data.success,
        message: data.message,
        formatsUpdated: data.data?.formatsUpdated
      })

      // Reload the page to apply new formats
      if (data.success) {
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to sync formats'
      })
    } finally {
      setSyncing(false)
    }
  }

  const handleClearCache = () => {
    if (confirm('Are you sure you want to clear the cached format data? This will revert to default formats.')) {
      clearShowdownCache()
      setSyncResult({
        success: true,
        message: 'Cache cleared successfully'
      })
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Format Data Sync
        </CardTitle>
        <CardDescription>
          Sync format rules and banned Pokémon lists from Pokémon Showdown
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync Status */}
        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-sm font-medium">Last Sync</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {lastSync
                  ? new Date(lastSync).toLocaleString()
                  : 'Never synced'}
              </p>
            </div>
          </div>
          {isStale ? (
            <Badge variant="destructive">Stale</Badge>
          ) : lastSync ? (
            <Badge variant="default" className="bg-green-600">Up to date</Badge>
          ) : (
            <Badge variant="secondary">Not synced</Badge>
          )}
        </div>

        {/* Sync Result */}
        {syncResult && (
          <div
            className={`p-4 rounded-lg border ${
              syncResult.success
                ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
            }`}
          >
            <div className="flex items-start gap-3">
              {syncResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {syncResult.success ? 'Success!' : 'Error'}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {syncResult.message}
                </p>
                {syncResult.formatsUpdated !== undefined && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {syncResult.formatsUpdated} formats synced
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            About Format Sync
          </h4>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Syncs official VGC format rules from Pokémon Showdown</li>
            <li>• Updates banned Pokémon lists and format restrictions</li>
            <li>• Cached data is valid for 7 days</li>
            <li>• Manual formats are preserved and enhanced with Showdown data</li>
            <li>• Source: <a href="https://play.pokemonshowdown.com" target="_blank" rel="noopener noreferrer" className="underline">play.pokemonshowdown.com</a></li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="flex-1"
          >
            {syncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </>
            )}
          </Button>
          <Button
            onClick={handleClearCache}
            variant="outline"
            disabled={syncing || !lastSync}
          >
            Clear Cache
          </Button>
        </div>

        {/* Warning */}
        {isStale && lastSync && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              ⚠️ Your format data is more than 7 days old. Consider syncing to get the latest rules.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
