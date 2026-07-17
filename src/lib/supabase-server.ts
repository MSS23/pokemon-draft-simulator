/**
 * Server-side Supabase factory for Clerk-authenticated requests.
 *
 * Use this in route handlers, server actions, and server components where
 * you want PostgREST to see the calling user's Clerk JWT.
 *
 *   import { createClerkSupabaseClientServer } from '@/lib/supabase-server'
 *
 *   export async function POST(req: Request) {
 *     const supabase = await createClerkSupabaseClientServer()
 *     // RLS now sees auth.jwt() ->> 'sub' = clerk_user_id
 *   }
 *
 * For privileged server work that needs to bypass RLS (cron jobs, admin
 * tasks), use `createServiceRoleClient()` instead. NEVER expose the
 * service role key to the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import type { Database } from './supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw at import time — let consumers fail loudly when used.
  if (typeof window !== 'undefined') {
    throw new Error('supabase-server.ts must only be imported on the server')
  }
}

/**
 * Build a Supabase client that forwards the current Clerk session token on
 * every request. Returns an anon-keyed client if the caller is signed out —
 * the same behaviour as the browser client.
 */
export async function createClerkSupabaseClientServer(): Promise<SupabaseClient<Database>> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing — cannot create server client')
  }

  let cachedToken: string | null = null
  try {
    const { getToken } = await auth()
    cachedToken = await getToken()
  } catch {
    cachedToken = null
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'pokemon-draft-app-server',
      },
    },
    // Cached for the lifetime of this client. Each request handler
    // creates a fresh client, so the token won't go stale within a
    // single request.
    accessToken: async () => cachedToken,
  } as Parameters<typeof createClient<Database>>[2])
}

/**
 * Service-role client. Bypasses RLS. Use ONLY for trusted server work
 * (admin scripts, scheduled jobs, internal API routes that have already
 * authenticated the caller through some other means).
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — cannot create service-role client')
  }
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
