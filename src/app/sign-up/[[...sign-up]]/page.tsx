import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export const metadata = {
  title: 'Sign up — Pokémon Champions Draft League',
  description: 'Create an account to host drafts, join leagues, and run tournaments.',
}

export default function SignUpPage() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-[#0d1014] dark:via-[#11151a] dark:to-[#0d1014]">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Link href="/" className="flex flex-col items-center gap-2 group">
          <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pokémon <span className="text-[#dc2855]">Champions</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-[#b6bdc7] group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
            Draft League
          </p>
        </Link>

        <div className="w-full">
          {/* Visual styling lives in ClerkAppearanceProvider, which swaps
              between light and dark configs based on the html `dark` class.
              Sign-up flow features (CAPTCHA, social proof, profile
              completion, password strength, terms acceptance, MFA enrollment)
              are toggled in the Clerk dashboard, not in code. */}
          <SignUp
            fallbackRedirectUrl="/dashboard"
            signInUrl="/sign-in"
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'w-full',
              },
            }}
          />
        </div>

        <p className="text-xs text-slate-600 dark:text-[#b6bdc7] text-center max-w-sm leading-relaxed">
          By creating an account you agree to our{' '}
          <Link
            href="/terms"
            className="text-slate-900 dark:text-white underline underline-offset-2 hover:text-[#dc2855] dark:hover:text-[#dc2855] transition-colors"
          >
            Terms
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="text-slate-900 dark:text-white underline underline-offset-2 hover:text-[#dc2855] dark:hover:text-[#dc2855] transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
