import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export const metadata = {
  title: 'Sign up — Pokémon Champions Draft League',
  description: 'Create an account to host drafts, join leagues, and run tournaments.',
}

export default function SignUpPage() {
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
          {/* All Clerk v7 sign-up features (CAPTCHA, social proof, profile
              completion, password strength, terms acceptance, MFA enrollment)
              render automatically here — they're toggled in the Clerk
              dashboard, not in code. Page-level appearance overrides have
              been removed because they conflicted with the dark baseTheme
              in src/app/layout.tsx (white card on white text). */}
          <SignUp
            fallbackRedirectUrl="/dashboard"
            signInUrl="/sign-in"
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
          By creating an account you agree to our{' '}
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
