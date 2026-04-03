import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
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
// import ErrorBoundary from "@/components/ui/error-boundary";

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
    images: [{ url: "/og-image", width: 1200, height: 630, alt: "Pokémon Champions Draft League — Real-time competitive drafting" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pokémon Champions Draft League",
    description: "The #1 draft platform for competitive Pokémon. Snake drafts, auctions, full leagues — free and real-time.",
    images: ["/og-image"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="/hydration-fix.js"
          strategy="beforeInteractive"
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
              colorBackground: 'hsl(var(--card))',
              colorText: 'hsl(var(--foreground))',
              colorTextSecondary: 'hsl(var(--muted-foreground))',
              colorInputBackground: 'hsl(var(--background))',
              colorInputText: 'hsl(var(--foreground))',
            },
            elements: {
              formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
              card: 'bg-card border border-border shadow-lg',
              headerTitle: 'text-foreground',
              headerSubtitle: 'text-muted-foreground',
              socialButtonsBlockButton: 'bg-card border border-border text-foreground hover:bg-muted',
              formFieldInput: 'bg-background border-border text-foreground',
              footerActionLink: 'text-primary hover:text-primary/80',
              footer: 'text-muted-foreground',
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
                          <span className="text-muted-foreground/30">&copy; {new Date().getFullYear()} Poke Draft League</span>
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
