'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TestConnectionPage() {
  const [envCheck, setEnvCheck] = useState({
    url: '',
    keyPresent: false,
    urlValid: false
  })
  const [connectionTest, setConnectionTest] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error'
    message: string
  }>({ status: 'idle', message: '' })

  useEffect(() => {
    // Check environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    setEnvCheck({
      url: url,
      keyPresent: !!key && key.length > 20,
      urlValid: url.includes('supabase.co')
    })
  }, [])

  const testConnection = async () => {
    setConnectionTest({ status: 'testing', message: 'Testing connection...' })

    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      // Try to query a table
      const { data, error } = await supabase
        .from('drafts')
        .select('id')
        .limit(1)

      if (error) {
        setConnectionTest({
          status: 'error',
          message: `Connection failed: ${error.message}`
        })
      } else {
        setConnectionTest({
          status: 'success',
          message: 'Connection successful! Supabase is working.'
        })
      }
    } catch (error) {
      setConnectionTest({
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    }
  }

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Supabase Connection Test</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Environment Variables Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <span className="font-medium">Supabase URL:</span>
            <span className={envCheck.url ? 'text-green-600' : 'text-red-600'}>
              {envCheck.url || '❌ Not found'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <span className="font-medium">Anon Key Present:</span>
            <span className={envCheck.keyPresent ? 'text-green-600' : 'text-red-600'}>
              {envCheck.keyPresent ? '✅ Yes' : '❌ No'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <span className="font-medium">URL Valid:</span>
            <span className={envCheck.urlValid ? 'text-green-600' : 'text-red-600'}>
              {envCheck.urlValid ? '✅ Yes' : '❌ No'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Connection Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={testConnection} disabled={connectionTest.status === 'testing'}>
            {connectionTest.status === 'testing' ? 'Testing...' : 'Test Connection'}
          </Button>

          {connectionTest.status !== 'idle' && (
            <div
              className={`p-4 rounded ${
                connectionTest.status === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : connectionTest.status === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}
            >
              {connectionTest.message}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>1. Browser Extension Issue:</strong>
            <p className="text-gray-600">
              The error "dwqlxyeefzcclqdzteez.supabase.conext_public..." is caused by a browser
              extension (TSS). Disable browser extensions or use incognito mode.
            </p>
          </div>

          <div>
            <strong>2. Restart Dev Server:</strong>
            <p className="text-gray-600">
              Stop the dev server (Ctrl+C) and restart with: <code>npm run dev</code>
            </p>
          </div>

          <div>
            <strong>3. Check Supabase Project:</strong>
            <p className="text-gray-600">
              Verify your Supabase project is active at: https://supabase.com/dashboard
            </p>
          </div>

          <div>
            <strong>4. Verify Tables Exist:</strong>
            <p className="text-gray-600">
              Make sure the 'drafts' table exists in your Supabase database.
            </p>
          </div>

          <div>
            <strong>5. Check RLS Policies:</strong>
            <p className="text-gray-600">
              You may need to disable RLS temporarily or apply the migration:
              database/migrations/006_guest_compatible_rls.sql
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-sm text-yellow-800">
          <strong>Quick Fix:</strong> If everything above looks correct, try opening this app in
          an incognito/private window to bypass browser extension interference.
        </p>
      </div>
    </div>
  )
}
