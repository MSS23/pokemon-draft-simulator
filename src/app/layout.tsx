import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
import { Toaster } from "sonner";
import { validateEnv } from "@/lib/env";
// import ErrorBoundary from "@/components/ui/error-boundary";

// Validate environment variables at startup
validateEnv();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
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
  },
  twitter: {
    card: "summary",
    title: "Pokémon Draft League",
    description: "Real-time Pokémon drafting platform",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#dc2626",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <HydrationErrorFilter />
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
                        <a href="/terms" className="hover:underline">Terms</a>
                        {' · '}
                        <a href="/privacy" className="hover:underline">Privacy</a>
                        {' · '}
                        <span>Pokémon Draft League is a fan project. Pokémon is &copy; Nintendo/Game Freak.</span>
                      </footer>
                    </QueryProvider>
                  </AuthProvider>
                </ImagePreferenceProvider>
              </ThemeProvider>
            </HydrationFixProvider>
          </ErrorBoundaryProvider>
        </PerformanceMonitorProvider>
      </body>
    </html>
  );
}
