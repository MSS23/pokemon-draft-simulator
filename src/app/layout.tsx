import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { NotificationProvider } from "@/components/providers/NotificationProvider";
import { HydrationFixProvider } from "@/components/providers/HydrationFixProvider";
import { ErrorBoundaryProvider } from "@/components/providers/ErrorBoundaryProvider";
import { ImagePreferenceProvider } from "@/contexts/ImagePreferenceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/Header";
import { HydrationErrorFilter } from "./hydration-error-filter";
import { PerformanceMonitorProvider } from "@/components/providers/PerformanceMonitorProvider";
import { Toaster } from "sonner";
// import ErrorBoundary from "@/components/ui/error-boundary";

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
  themeColor: "#3b82f6",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
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
                    <NotificationProvider>
                      <Toaster position="top-right" richColors />
                      <QueryProvider>
                        <Header />
                        {children}
                      </QueryProvider>
                    </NotificationProvider>
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
