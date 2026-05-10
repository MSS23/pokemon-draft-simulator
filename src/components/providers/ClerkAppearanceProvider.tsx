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

const sharedElements = {
  rootBox: '',
  cardBox: '',
  formButtonPrimary:
    'bg-[#dc2855] hover:bg-[#c9224d] text-white font-medium shadow-md shadow-[#dc2855]/20',
  formFieldAction: 'text-[#dc2855] hover:text-[#c9224d] font-medium',
  formResendCodeLink: 'text-[#dc2855] hover:text-[#c9224d] font-medium',
  identityPreviewEditButton: 'text-[#dc2855] hover:text-[#c9224d]',
  footerActionLink: 'text-[#dc2855] hover:text-[#c9224d] font-medium',
  socialButtonsProviderIcon: 'opacity-100',
  logoBox: 'opacity-60',
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
    footer: 'bg-transparent text-[#b6bdc7]',
    footerAction: 'text-[#b6bdc7]',
    footerActionText: 'text-[#b6bdc7]',
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
    lastAuthenticationStrategyBadge:
      'bg-[#dc2855]/10 text-[#dc2855] border border-[#dc2855]/30',
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
    footer: 'bg-transparent text-slate-600',
    footerAction: 'text-slate-600',
    footerActionText: 'text-slate-600',
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
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  )
}
