'use client'

import { createContext, useContext, useMemo, useCallback } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'

interface AuthUser {
  id: string
  email?: string | null
  created_at?: string
  // Using Record<string, any> to match the Supabase User type that consumers expect.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_metadata: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app_metadata: Record<string, any>
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Map Clerk's user object to the AuthUser shape that the rest of the app expects.
 * This keeps the migration transparent to all consumers of useAuth().
 */
function mapClerkUser(clerkUser: NonNullable<ReturnType<typeof useUser>['user']>): AuthUser {
  return {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || null,
    created_at: clerkUser.createdAt
      ? new Date(clerkUser.createdAt).toISOString()
      : undefined,
    user_metadata: {
      display_name:
        clerkUser.fullName ||
        clerkUser.firstName ||
        clerkUser.username ||
        undefined,
      avatar_url: clerkUser.imageUrl || undefined,
    },
    app_metadata: {
      // Clerk identifies the primary auth strategy; map to a simple provider string
      provider: clerkUser.primaryEmailAddress ? 'email' : 'oauth',
    },
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, user: clerkUser } = useUser()
  const clerk = useClerk()

  const user: AuthUser | null = useMemo(() => {
    if (!isLoaded || !clerkUser) return null
    return mapClerkUser(clerkUser)
  }, [isLoaded, clerkUser])

  const loading = !isLoaded

  // Clerk handles sign-in UI — redirect to its hosted/embedded sign-in page.
  // The email/password params are kept for interface compatibility but not used directly;
  // Clerk's own form collects credentials.
  const signIn = useCallback(
    async (_email: string, _password: string): Promise<{ error: Error | null }> => {
      try {
        clerk.redirectToSignIn()
        return { error: null }
      } catch (err) {
        return { error: err instanceof Error ? err : new Error('Sign in failed') }
      }
    },
    [clerk]
  )

  const signUp = useCallback(
    async (_email: string, _password: string): Promise<{ error: Error | null }> => {
      try {
        clerk.redirectToSignUp()
        return { error: null }
      } catch (err) {
        return { error: err instanceof Error ? err : new Error('Sign up failed') }
      }
    },
    [clerk]
  )

  const signOut = useCallback(async () => {
    await clerk.signOut()

    // Clear draft participation data from localStorage (same as before)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pokemon-draft-participation')
      localStorage.removeItem('pokemon-draft-user-session')
      localStorage.removeItem('guestUserId')
    }
  }, [clerk])

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
