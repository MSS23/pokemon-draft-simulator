import type { Metadata } from 'next'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Zap, Shield, Users, Trophy, Code2, Heart,
  Github, MessageCircle, ExternalLink
} from 'lucide-react'
import Link from 'next/link'

const FEATURES = [
  { icon: Zap, title: 'Real-time Drafting', desc: 'WebSocket-powered live picks. Every participant sees changes instantly.' },
  { icon: Shield, title: 'Community-Driven Formats', desc: 'VGC, Smogon, National Dex, and custom rulesets — the community decides which formats to play.' },
  { icon: Users, title: 'No Signup Required', desc: 'Guest access for quick drafts. Create an account when you\'re ready.' },
  { icon: Trophy, title: 'Full League System', desc: 'Standings, weekly fixtures, trades, playoffs, and KO tracking — everything champions need.' },
]

const TECH_STACK = [
  'Next.js 15', 'React 18', 'TypeScript', 'Supabase',
  'Tailwind CSS', 'Zustand', 'TanStack Query', 'Framer Motion'
]

export const metadata: Metadata = {
  title: 'About Pokémon Champions Draft League — The Free Draft Platform for Competitive Pokemon',
  description: 'Pokémon Champions Draft League is the go-to draft platform for competitive Pokemon communities. Real-time snake drafts, auctions, full league seasons with standings, trades, and playoffs. Free and open source.',
  openGraph: {
    title: 'About Pokémon Champions Draft League',
    description: 'The free draft platform built for Pokemon Champions. Real-time drafting, community-driven formats, full league system.',
  },
}

export default function AboutPage() {
  return (
    <SidebarLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        {/* Hero */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full overflow-hidden relative flex-shrink-0">
              <div className="absolute inset-0 top-0 h-1/2 bg-primary" />
              <div className="absolute inset-0 top-1/2 h-1/2 bg-white dark:bg-gray-200" />
              <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-foreground/60 -translate-y-1/2" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full border-[1.5px] border-foreground/60 bg-background" />
            </div>
            <h1 className="text-3xl font-bold">About Pokémon Champions Draft League</h1>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Pokémon Champions Draft League started because managing a draft league in Google Sheets was a nightmare.
            Turn tracking, budget math, trade records — all scattered across tabs and Discord messages.
            So we built the platform we wished existed: a real-time drafting tool designed specifically
            for competitive Pokemon champions and their communities.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Whether you&apos;re running a casual draft with friends or a full league season with
            playoffs and KO tracking, everything lives in one place. Any format your community plays —
            VGC, Smogon, National Dex, or something completely custom. No spreadsheets, no manual
            score keeping, no &ldquo;whose turn is it?&rdquo; arguments.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">What it does</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map((feat) => (
              <Card key={feat.title}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <feat.icon className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{feat.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Draft formats */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Supported draft formats</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-5 pb-4 text-center">
                <div className="text-2xl mb-2">&#x1F40D;</div>
                <h3 className="font-semibold text-sm">Snake Draft</h3>
                <p className="text-xs text-muted-foreground mt-1">Classic alternating order. Budget-based with configurable costs.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4 text-center">
                <div className="text-2xl mb-2">&#x1F528;</div>
                <h3 className="font-semibold text-sm">Auction Draft</h3>
                <p className="text-xs text-muted-foreground mt-1">Bid on Pokemon in real-time. Strategic budget management.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4 text-center">
                <div className="text-2xl mb-2">&#x1F4CA;</div>
                <h3 className="font-semibold text-sm">Tiered Draft</h3>
                <p className="text-xs text-muted-foreground mt-1">S/A/B/C/D tier picks. Usage-based or custom pricing.</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tech */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Built with
          </h2>
          <div className="flex flex-wrap gap-2">
            {TECH_STACK.map((tech) => (
              <Badge key={tech} variant="secondary" className="text-xs">
                {tech}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Open source and free to use. No premium tiers, no paywalls.
          </p>
        </div>

        {/* Links */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Get involved</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border hover:border-primary/50 transition-colors"
            >
              <Github className="h-5 w-5" />
              <div>
                <div className="font-semibold text-sm">GitHub</div>
                <div className="text-xs text-muted-foreground">Source code, issues, and contributions</div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </a>
            <a
              href="https://discord.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border hover:border-primary/50 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              <div>
                <div className="font-semibold text-sm">Discord</div>
                <div className="text-xs text-muted-foreground">Community chat, support, and feature requests</div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8 space-y-2">
          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            Made with <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" /> for the Pokemon community
          </div>
          <p className="text-xs text-muted-foreground">
            Pokemon and all related properties are trademarks of Nintendo, Game Freak, and The Pokemon Company.
            This is a fan-made tool and is not affiliated with or endorsed by them.
          </p>
          <div className="flex justify-center gap-4 pt-2 text-xs">
            <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
