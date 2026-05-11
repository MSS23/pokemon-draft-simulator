import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import { ClerkAppearanceProvider } from "@/components/providers/ClerkAppearanceProvider";
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
        <ClerkAppearanceProvider>
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
                      <footer className="border-t border-border/50 py-5 text-center text-xs text-slate-600 dark:text-slate-400 px-4">
                        <div className="flex items-center justify-center gap-5 flex-wrap">
                          <a href="/terms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors duration-150">Terms</a>
                          <a href="/privacy" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors duration-150">Privacy</a>
                          <span>v0.1.1</span>
                          <span>&copy; {new Date().getFullYear()} Pokémon Champions Draft League</span>
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
        </ClerkAppearanceProvider>
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
