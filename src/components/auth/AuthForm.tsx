'use client'

import { useState, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { createLogger } from '@/lib/logger'
import { Eye, EyeOff, Mail, Lock, User, Loader2 } from 'lucide-react'

const log = createLogger('AuthForm')

interface AuthFormProps {
  mode: 'login' | 'register'
  onSuccess?: () => void
}

function AuthFormContent({ mode, onSuccess }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  const isLogin = mode === 'login'
  const isRegister = mode === 'register'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!supabase) {
      setError('Authentication service is not available')
      return
    }

    startTransition(async () => {
      try {
        if (isRegister) {
          // Register new user
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                display_name: displayName || email.split('@')[0],
              },
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          })

          if (error) throw error

          if (data.user) {
            // Create user profile in database
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert({
                user_id: data.user.id,
                display_name: displayName || email.split('@')[0],
              })

            if (profileError) {
              log.error('Failed to create user profile:', profileError)
              // Don't throw - profile creation is not critical for signup
            }

            setSuccess('Registration successful! Redirecting to homepage...')
            onSuccess?.()
            // Redirect to homepage after successful registration
            setTimeout(() => {
              router.push('/')
              router.refresh()
            }, 1000)
          }
        } else {
          // Sign in existing user
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (error) throw error

          if (data.user) {
            setSuccess('Login successful!')
            onSuccess?.()
            router.push(redirectTo)
            router.refresh()
          }
        }
      } catch (err) {
        const error = err as Error
        log.error('Auth error:', error)

        // Parse common Supabase error messages to user-friendly ones
        let errorMessage = error.message || 'An unexpected error occurred'

        if (errorMessage.includes('User already registered')) {
          errorMessage = 'This email is already registered. Please sign in instead.'
        } else if (errorMessage.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please try again.'
        } else if (errorMessage.includes('Email not confirmed')) {
          errorMessage = 'Please check your email and verify your account before signing in.'
        } else if (errorMessage.includes('Password should be at least')) {
          errorMessage = 'Password must be at least 6 characters long.'
        }

        setError(errorMessage)
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pokeball-bg pointer-events-none opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-info/5 pointer-events-none" />

      <div className="relative w-full max-w-md space-y-5">
        {/* Brand */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-primary/50 relative">
              <div className="absolute inset-0 top-0 h-1/2 bg-primary" />
              <div className="absolute inset-0 top-1/2 h-1/2 bg-white dark:bg-gray-200" />
              <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-foreground/60 -translate-y-1/2" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full border-[1.5px] border-foreground/60 bg-background" />
            </div>
            <span className="text-xl font-bold brand-gradient-text">Poké Draft</span>
          </div>
          <h1 className="text-2xl font-bold">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLogin
              ? 'Sign in to your Pokémon Draft League account'
              : 'Join the Pokémon Draft League community'
            }
          </p>
        </div>

      <Card className="w-full shadow-lg border-border/60">
        <CardContent className="space-y-4 pt-6">
          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    placeholder="Enter your display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10"
                    disabled={isPending}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isPending}
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'auth-error' : undefined}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  minLength={6}
                  disabled={isPending}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  aria-required="true"
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={isRegister ? 'password-hint' : undefined}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isPending}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </Button>
              </div>
              {isRegister && (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  Password must be at least 6 characters long
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive" role="alert" id="auth-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert role="status">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {/* Switch between login/register */}
          <div className="text-center text-sm">
            {isLogin ? (
              <p>
                Don&apos;t have an account?{' '}
                <Link
                  href={`/auth/register${redirectTo !== '/dashboard' ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`}
                  className="font-medium text-primary hover:underline"
                >
                  Sign up
                </Link>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <Link
                  href={`/auth/login${redirectTo !== '/dashboard' ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`}
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            )}
          </div>

          {isLogin && (
            <div className="text-center">
              <Link
                href="/auth/reset-password"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Forgot your password?
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

export default function AuthForm(props: AuthFormProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <AuthFormContent {...props} />
    </Suspense>
  )
}