'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Clerk handles password reset through its own UI.
 * Redirect users to the sign-in page where they can use "Forgot password".
 */
export default function ResetPasswordPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/auth/login')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-white dark:bg-card p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-4">
          Password Reset
        </h1>
        <p className="text-muted-foreground mb-4">
          Password reset is now handled through the sign-in page. Redirecting...
        </p>
      </div>
    </div>
  )
}
