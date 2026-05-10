'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { useEffect, useState } from 'react'

// Reads the `dark` class that ThemeProvider writes onto <html>. Using a
// MutationObserver lets us stay outside the ThemeProvider in the tree —
// avoids reordering every other provider just to plumb theme through.
function useHtmlTheme(): 'light' | 'dark' {
  // SSR has no DOM; default to light because :root in globals.css is light.
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = document.documentElement
    const read = () =>
      setTheme(root.classList.contains('dark') ? 'dark' : 'light')

    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

// Brand crimson #dc2855 sits at ~4.2:1 against both light and dark surfaces,
// which fails WCAG AA for normal text. For text-only contexts (inline links)
// we substitute a darker shade on light bg and a lighter shade on dark bg
// — same hue, higher contrast. Solid bg buttons keep #dc2855 because white
// text on it has plenty of headroom regardless.
const sharedElements = {
  rootBox: '',
  cardBox: '',
  formButtonPrimary:
    'bg-[#dc2855] hover:bg-[#c9224d] text-white font-semibold shadow-md shadow-[#dc2855]/20',
  socialButtonsProviderIcon: 'opacity-100',
  // "Secured by Clerk" — was opacity-60 (effectively ~3:1 on dark, similar
  // on light). Bumped so the wordmark is legible without competing visually
  // with primary content.
  logoBox: 'opacity-80',
}

const darkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#dc2855',
    colorBackground: '#141619',
    colorText: '#e8edf3',
    colorTextSecondary: '#b6bdc7',
    colorInputBackground: '#0d0f11',
    colorInputText: '#e8edf3',
    colorDanger: '#f87171',
    colorSuccess: '#34d399',
    colorWarning: '#fbbf24',
    colorNeutral: '#e8edf3',
    borderRadius: '0.625rem',
  },
  elements: {
    ...sharedElements,
    card: 'bg-[#141619] border border-[#1f2328] shadow-2xl shadow-black/50',
    headerTitle: 'text-[#e8edf3] font-semibold',
    headerSubtitle: 'text-[#b6bdc7]',
    socialButtonsBlockButton:
      'bg-[#1a1e23] border border-[#2a2f36] text-[#e8edf3] hover:bg-[#23282e] hover:border-[#3a4049]',
    socialButtonsBlockButtonText: 'text-[#e8edf3] font-medium',
    socialButtonsIconButton:
      'bg-[#1a1e23] border border-[#2a2f36] text-[#e8edf3] hover:bg-[#23282e] hover:border-[#3a4049]',
    lastAuthenticationStrategyBadge:
      'bg-[#dc2855]/15 text-[#f59ab1] border border-[#dc2855]/30',
    dividerLine: 'bg-[#2a2f36]',
    dividerText: 'text-[#b6bdc7]',
    formFieldLabel: 'text-[#e8edf3] font-medium',
    formFieldInput:
      'bg-[#0d0f11] border-[#2a2f36] text-[#e8edf3] placeholder:text-[#6b7480] focus:border-[#dc2855] focus:ring-[#dc2855]/30',
    formFieldHintText: 'text-[#b6bdc7]',
    formFieldErrorText: 'text-[#f87171]',
    formButtonReset: 'text-[#b6bdc7] hover:text-[#e8edf3]',
    identityPreview: 'bg-[#0d0f11] border border-[#2a2f36]',
    identityPreviewText: 'text-[#e8edf3]',
    otpCodeFieldInput:
      'bg-[#0d0f11] border-[#2a2f36] text-[#e8edf3] focus:border-[#dc2855]',
    alert: 'bg-[#0d0f11] border border-[#2a2f36] text-[#e8edf3]',
    alertText: 'text-[#e8edf3]',
    alertIcon: 'text-[#f87171]',
    // Action links on dark bg: lighter pink (#f59ab1 = ~8.7:1 on #141619)
    // is the same color we use for the "Last used" badge — visually
    // harmonious and well above AA threshold.
    formFieldAction: 'text-[#f59ab1] hover:text-[#fab2c5] font-semibold',
    formResendCodeLink: 'text-[#f59ab1] hover:text-[#fab2c5] font-semibold',
    identityPreviewEditButton: 'text-[#f59ab1] hover:text-[#fab2c5] font-semibold',
    footer: 'bg-transparent text-[#b6bdc7]',
    footerAction: 'text-[#b6bdc7]',
    footerActionText: 'text-[#b6bdc7]',
    footerActionLink: 'text-[#f59ab1] hover:text-[#fab2c5] font-semibold',
    footerPages: 'text-[#b6bdc7]',
    footerPagesLink: 'text-[#b6bdc7] hover:text-[#e8edf3]',
  },
}

const lightAppearance = {
  variables: {
    colorPrimary: '#dc2855',
    colorBackground: '#ffffff',
    colorText: '#0f172a',
    colorTextSecondary: '#475569',
    colorInputBackground: '#ffffff',
    colorInputText: '#0f172a',
    colorDanger: '#dc2626',
    colorSuccess: '#059669',
    colorWarning: '#d97706',
    colorNeutral: '#0f172a',
    borderRadius: '0.625rem',
  },
  elements: {
    ...sharedElements,
    card: 'bg-white border border-slate-200 shadow-xl shadow-slate-900/10',
    headerTitle: 'text-slate-900 font-semibold',
    headerSubtitle: 'text-slate-600',
    socialButtonsBlockButton:
      'bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400',
    socialButtonsBlockButtonText: 'text-slate-900 font-medium',
    socialButtonsIconButton:
      'bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400',
    // Badge uses the darker crimson too for AA on light bg.
    lastAuthenticationStrategyBadge:
      'bg-[#dc2855]/10 text-[#a01a3a] border border-[#dc2855]/30',
    dividerLine: 'bg-slate-200',
    dividerText: 'text-slate-600',
    formFieldLabel: 'text-slate-900 font-medium',
    formFieldInput:
      'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-[#dc2855] focus:ring-[#dc2855]/30',
    formFieldHintText: 'text-slate-600',
    formFieldErrorText: 'text-red-600',
    formButtonReset: 'text-slate-600 hover:text-slate-900',
    identityPreview: 'bg-slate-50 border border-slate-200',
    identityPreviewText: 'text-slate-900',
    otpCodeFieldInput:
      'bg-white border-slate-300 text-slate-900 focus:border-[#dc2855]',
    alert: 'bg-slate-50 border border-slate-200 text-slate-900',
    alertText: 'text-slate-900',
    alertIcon: 'text-red-600',
    // Action links on light bg: darker crimson (#b91d44 = ~6.0:1 on white,
    // ~5.7:1 on slate-50) keeps the brand identity while clearing AA.
    formFieldAction: 'text-[#b91d44] hover:text-[#a01a3a] font-semibold',
    formResendCodeLink: 'text-[#b91d44] hover:text-[#a01a3a] font-semibold',
    identityPreviewEditButton: 'text-[#b91d44] hover:text-[#a01a3a] font-semibold',
    footer: 'bg-transparent text-slate-600',
    footerAction: 'text-slate-600',
    footerActionText: 'text-slate-600',
    footerActionLink: 'text-[#b91d44] hover:text-[#a01a3a] font-semibold',
    footerPages: 'text-slate-600',
    footerPagesLink: 'text-slate-600 hover:text-slate-900',
  },
}

export function ClerkAppearanceProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const htmlTheme = useHtmlTheme()
  const appearance = htmlTheme === 'dark' ? darkAppearance : lightAppearance

  return (
    <ClerkProvider
      // Force all internal redirects (SignInButton, RedirectToSignIn,
      // middleware re-routes, etc.) to use the styled embedded pages on
      // the application domain instead of accounts.draftpokemon.com
      // (the Clerk-hosted Account Portal). Setting these here overrides
      // the dashboard's "Component paths" radio regardless of which
      // option is selected there — the only source of truth is this
      // codebase.
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  )
}
