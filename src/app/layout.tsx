import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { NotificationProvider } from "@/components/providers/NotificationProvider";
import { HydrationFixProvider } from "@/components/providers/HydrationFixProvider";
import { ErrorBoundaryProvider } from "@/components/providers/ErrorBoundaryProvider";
import { HydrationErrorFilter } from "./hydration-error-filter";
// import ErrorBoundary from "@/components/ui/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pokémon Draft App",
  description: "Real-time Pokémon draft application with snake and auction formats",
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
        <ErrorBoundaryProvider>
          <HydrationFixProvider>
            <ThemeProvider
              defaultTheme="system"
              storageKey="pokemon-draft-theme"
            >
              <NotificationProvider>
                <QueryProvider>
                  {children}
                </QueryProvider>
              </NotificationProvider>
            </ThemeProvider>
          </HydrationFixProvider>
        </ErrorBoundaryProvider>
      </body>
    </html>
  );
}
