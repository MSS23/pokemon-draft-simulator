import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export const metadata = {
  title: 'Sign in — Pokémon Champions Draft League',
  description: 'Sign in to host drafts, join leagues, and run tournaments.',
}

export default function SignInPage() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-[#0a0c0f] via-[#0d1014] to-[#0a0c0f]">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Link href="/" className="flex flex-col items-center gap-2 group">
          <div className="text-3xl font-bold tracking-tight text-white">
            Pokémon <span className="text-[#dc2855]">Champions</span>
          </div>
          <p className="text-sm text-[#808994] group-hover:text-[#a0a8b3] transition-colors">
            Draft League
          </p>
        </Link>

        <div className="w-full">
          {/* The widget inherits the dark appearance configured on the
              ClerkProvider in src/app/layout.tsx — don't re-override
              here or text colors fall out of sync with the card. */}
          <SignIn
            fallbackRedirectUrl="/dashboard"
            signUpUrl="/sign-up"
            forceRedirectUrl={undefined}
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'w-full shadow-2xl shadow-black/40',
              },
            }}
          />
        </div>

        <p className="text-xs text-[#5a626c] text-center max-w-sm">
          By signing in you agree to our{' '}
          <Link href="/terms" className="underline hover:text-[#a0a8b3] transition-colors">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-[#a0a8b3] transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
