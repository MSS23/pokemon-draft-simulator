import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { HydrationFixProvider } from "@/components/providers/HydrationFixProvider";
import { ErrorBoundaryProvider } from "@/components/providers/ErrorBoundaryProvider";
import { ImagePreferenceProvider } from "@/contexts/ImagePreferenceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/Header";
import { TourProvider } from "@/components/tour/TourProvider";
import { HydrationErrorFilter } from "./hydration-error-filter";
import { PerformanceMonitorProvider } from "@/components/providers/PerformanceMonitorProvider";
import { AnalyticsProvider } from "@/components/providers/AnalyticsProvider";
import { FloatingFeedbackButton } from "@/components/feedback/FloatingFeedbackButton";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { validateEnv } from "@/lib/env";

// Validate environment variables at startup
validateEnv();

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://draftpokemon.com"),
  title: {
    default: "Pokémon Champions Draft League — The #1 Draft Platform for Competitive Pokemon",
    template: "%s | Pokémon Champions Draft League",
  },
  description: "The go-to draft platform for Pokémon Champions. Run snake drafts, auctions, and full league seasons with real-time picks, budget tracking, and community-driven formats. Free, no signup required.",
  applicationName: "Pokémon Champions Draft League",
  keywords: [
    "Pokemon Champions", "Pokemon draft league", "Pokemon draft", "competitive Pokemon",
    "VGC draft", "Smogon draft", "Pokemon snake draft", "Pokemon auction draft",
    "draft league tool", "Pokemon league manager", "Pokemon team draft",
    "Pokemon Champions league", "draft Pokemon online", "Pokemon draft app",
    "Pokemon draft platform", "competitive draft league",
  ],
  authors: [{ name: "Poke Draft League" }],
  creator: "Poke Draft League",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Champions Draft",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Pokémon Champions Draft League",
    title: "Pokémon Champions Draft League — Draft Like a Champion",
    description: "The free drafting platform built for Pokémon Champions. Snake drafts, auctions, full league seasons with standings, trades, and playoffs. No spreadsheets, no signup required.",
    images: [{ url: "https://draftpokemon.com/og-image", width: 1200, height: 630, alt: "Pokémon Champions Draft League — Real-time competitive drafting" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pokémon Champions Draft League",
    description: "The #1 draft platform for competitive Pokémon. Snake drafts, auctions, full leagues — free and real-time.",
    images: ["https://draftpokemon.com/og-image"],
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: "https://draftpokemon.com",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#dc2855",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SEC-02: Read per-request nonce set by middleware for CSP compliance
  const headersList = await headers()
  const nonce = headersList.get('x-nonce') ?? ''
  // nonce is available for <Script nonce={nonce}> or <script nonce={nonce}> tags

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="/hydration-fix.js"
          strategy="beforeInteractive"
          nonce={nonce}
        />
      </head>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        style={{ fontFamily: 'var(--font-sora), system-ui, sans-serif' }}
        suppressHydrationWarning
      >
        <HydrationErrorFilter />
        <ClerkProvider
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          appearance={{
            baseTheme: dark,
            variables: {
              colorPrimary: '#dc2855',
              colorBackground: '#141619',
              colorText: '#e8edf3',
              // Bumped from #808994 (~4.7:1 on card bg) to #b6bdc7 (~7.3:1) so
              // labels, descriptions, and footer text are comfortably readable.
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
              card: 'bg-[#141619] border border-[#1f2328] shadow-xl shadow-black/40',
              headerTitle: 'text-[#e8edf3] font-semibold',
              headerSubtitle: 'text-[#b6bdc7]',
              // Social buttons previously shared bg-[#141619] with the card,
              // so they had no visible surface. Distinct fill + brighter border.
              socialButtonsBlockButton: 'bg-[#1a1e23] border border-[#2a2f36] text-[#e8edf3] hover:bg-[#23282e] hover:border-[#3a4049]',
              socialButtonsBlockButtonText: 'text-[#e8edf3] font-medium',
              socialButtonsProviderIcon: 'opacity-100',
              dividerLine: 'bg-[#2a2f36]',
              dividerText: 'text-[#b6bdc7]',
              formFieldLabel: 'text-[#e8edf3] font-medium',
              formFieldInput: 'bg-[#0d0f11] border-[#2a2f36] text-[#e8edf3] focus:border-[#dc2855] focus:ring-[#dc2855]/30',
              formFieldHintText: 'text-[#b6bdc7]',
              formFieldErrorText: 'text-[#f87171]',
              formFieldAction: 'text-[#dc2855] hover:text-[#e8395f]',
              formButtonPrimary: 'bg-[#dc2855] hover:bg-[#c9224d] text-white font-medium shadow-md shadow-[#dc2855]/20',
              formButtonReset: 'text-[#b6bdc7] hover:text-[#e8edf3]',
              formResendCodeLink: 'text-[#dc2855] hover:text-[#e8395f]',
              identityPreview: 'bg-[#0d0f11] border border-[#2a2f36]',
              identityPreviewText: 'text-[#e8edf3]',
              identityPreviewEditButton: 'text-[#dc2855] hover:text-[#e8395f]',
              otpCodeFieldInput: 'bg-[#0d0f11] border-[#2a2f36] text-[#e8edf3] focus:border-[#dc2855]',
              alert: 'bg-[#0d0f11] border border-[#2a2f36] text-[#e8edf3]',
              alertText: 'text-[#e8edf3]',
              alertIcon: 'text-[#f87171]',
              footer: 'bg-transparent text-[#b6bdc7]',
              footerAction: 'text-[#b6bdc7]',
              footerActionText: 'text-[#b6bdc7]',
              footerActionLink: 'text-[#dc2855] hover:text-[#e8395f] font-medium',
              footerPages: 'text-[#b6bdc7]',
              footerPagesLink: 'text-[#b6bdc7] hover:text-[#e8edf3]',
              // "Secured by Clerk" branding line — was nearly invisible.
              logoBox: 'opacity-70',
            }
          }}
        >
        <AnalyticsProvider>
        <PerformanceMonitorProvider>
          <ErrorBoundaryProvider>
            <HydrationFixProvider>
              <ThemeProvider
                defaultTheme="system"
                storageKey="pokemon-draft-theme"
              >
                <ImagePreferenceProvider>
                  <AuthProvider>
                    <Toaster position="top-center" richColors />
                    <QueryProvider>
                      <Header />
                      <TourProvider />
                      <main className="min-h-[calc(100vh-3rem)]">{children}</main>
                      <footer className="border-t border-border/50 py-5 text-center text-xs text-muted-foreground/60 px-4">
                        <div className="flex items-center justify-center gap-5 flex-wrap">
                          <a href="/terms" className="hover:text-foreground transition-colors duration-150">Terms</a>
                          <a href="/privacy" className="hover:text-foreground transition-colors duration-150">Privacy</a>
                          <span className="text-muted-foreground/30">v0.1.1</span>
                          <span className="text-muted-foreground/30">&copy; {new Date().getFullYear()} Pokémon Champions Draft League</span>
                        </div>
                      </footer>
                    </QueryProvider>
                  </AuthProvider>
                </ImagePreferenceProvider>
              </ThemeProvider>
            </HydrationFixProvider>
          </ErrorBoundaryProvider>
        </PerformanceMonitorProvider>
        </AnalyticsProvider>
        </ClerkProvider>
        <FloatingFeedbackButton />
        <Analytics />
      </body>
    </html>
  );
}
