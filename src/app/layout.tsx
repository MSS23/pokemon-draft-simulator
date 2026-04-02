import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pokemondraftleague.com"),
  title: "Pokémon Draft League",
  description: "Real-time Pokémon drafting platform with VGC 2024 Regulation H compliance, supporting competitive snake and auction formats",
  applicationName: "Pokémon Draft League",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Draft League",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Pokémon Draft League",
    title: "Pokémon Draft League",
    description: "Real-time Pokémon drafting platform with VGC 2024 compliance",
    images: [{ url: "/og-image", width: 1200, height: 630, alt: "Pokémon Draft League" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pokémon Draft League",
    description: "Real-time Pokémon drafting platform",
    images: ["/og-image"],
  },
  manifest: "/manifest.json",
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
          appearance={{
            variables: {
              colorPrimary: '#dc2855',
            },
            elements: {
              formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
              card: 'bg-card border border-border shadow-lg',
              headerTitle: 'text-foreground',
              headerSubtitle: 'text-muted-foreground',
              socialButtonsBlockButton: 'bg-card border border-border text-foreground hover:bg-muted',
              formFieldInput: 'bg-background border-border text-foreground',
              footerActionLink: 'text-primary hover:text-primary/80',
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
        <Analytics />
      </body>
    </html>
  );
}
