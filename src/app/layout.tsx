import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
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

const outfit = Outfit({
  variable: "--font-outfit",
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
        className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}
        suppressHydrationWarning
      >
        <HydrationErrorFilter />
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
                      <footer className="border-t py-4 text-center text-xs text-muted-foreground px-4">
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                          <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
                          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
                          <span className="text-muted-foreground/40">v0.1.1</span>
                          <span className="text-muted-foreground/40">&copy; {new Date().getFullYear()} Poké Draft League</span>
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
        <Analytics />
      </body>
    </html>
  );
}
