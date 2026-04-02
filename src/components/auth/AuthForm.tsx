'use client'

import { SignIn, SignUp } from '@clerk/nextjs'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface AuthFormProps {
  mode: 'login' | 'register'
  onSuccess?: () => void
}

function AuthFormContent({ mode }: AuthFormProps) {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pokeball-bg pointer-events-none opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-info/5 pointer-events-none" />

      <div className="relative w-full max-w-md flex justify-center">
        {mode === 'login' ? (
          <SignIn routing="hash" fallbackRedirectUrl={redirectTo} />
        ) : (
          <SignUp routing="hash" fallbackRedirectUrl={redirectTo} />
        )}
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
