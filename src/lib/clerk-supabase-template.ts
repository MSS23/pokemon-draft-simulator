/**
 * Clerk JWT template that adds `role: authenticated` to the token we hand to
 * Supabase. PostgREST only assumes the `authenticated` Postgres role (and all
 * grants/RLS built on it) when that claim is present; the plain session token
 * does not carry it until Clerk's Supabase integration is active in the
 * dashboard. The template exists on both the dev and prod Clerk instances and
 * is signed with the same key, so Supabase's Clerk third-party provider
 * accepts it unchanged.
 */
export const CLERK_SUPABASE_JWT_TEMPLATE = 'supabase-authenticated'
