'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Users, Zap, Plus, LogIn, Shield, ArrowRight, Trophy, UserCheck, Heart, Sparkles, Swords } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { motion, useInView } from 'framer-motion'

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const } },
}

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const cardHover = {
  rest: { y: 0, scale: 1 },
  hover: { y: -4, scale: 1.01, transition: { duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as const } },
}

const TRUST_PROPS = [
  {
    icon: UserCheck,
    title: 'No signup required',
    desc: 'Jump straight into a draft as a guest. Create an account later if you want.',
  },
  {
    icon: Shield,
    title: 'Every format, your rules',
    desc: 'VGC, Smogon, and community-driven formats with automatic ban lists and cost calculation.',
  },
  {
    icon: Heart,
    title: 'Completely free',
    desc: 'No paywalls, no premium tiers. Every feature champions use is available to everyone.',
  },
]

const STEPS = [
  { num: '01', title: 'Pick your format', desc: 'VGC Reg H, Smogon tiers, or fully custom — choose a template or build your own ruleset with custom bans and costs.' },
  { num: '02', title: 'Share the room code', desc: 'Send a 6-character code to your group. No account needed to join as a guest.' },
  { num: '03', title: 'Draft in real-time', desc: 'Snake or auction with turn timer, wishlist queue, and auto-pick. Budget tracking keeps it competitive.' },
]

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-time drafting',
    desc: 'Every pick syncs instantly. No refreshing, no lag — WebSocket-powered so your 8-player VGC draft runs smooth.',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    icon: Trophy,
    title: 'Community-driven formats',
    desc: 'VGC Regulation H, Smogon OU, National Dex, and custom rulesets. Auto-enforced ban lists and cost tiers so nobody sneaks in a restricted legendary.',
    accent: 'from-violet-500 to-purple-600',
  },
  {
    icon: Shield,
    title: 'Full league system',
    desc: 'Standings, round-robin fixtures, trades with commissioner approval, and playoff brackets. Everything a competitive draft league needs.',
    accent: 'from-emerald-500 to-teal-600',
  },
]

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const featuresRef = useRef<HTMLDivElement>(null)
  const featuresInView = useInView(featuresRef, { once: true, margin: '-80px' })
  const trustRef = useRef<HTMLDivElement>(null)
  const trustInView = useInView(trustRef, { once: true, margin: '-80px' })
  const stepsRef = useRef<HTMLDivElement>(null)
  const stepsInView = useInView(stepsRef, { once: true, margin: '-80px' })

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  if (loading || user) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      {/* Hero — Championship Arena */}
      <div className="relative overflow-hidden hero-dark min-h-[90vh] flex items-center">
        {/* Grid pattern */}
        <div className="absolute inset-0 hero-lines" />

        {/* Ambient glows */}
        <div className="absolute top-1/4 left-1/3 -translate-x-1/2 w-[50rem] h-[35rem] bg-primary/[0.06] rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-blue-500/[0.04] rounded-full blur-[120px]" />

        {/* Diagonal accent lines */}
        <div className="absolute top-0 right-0 w-[1px] h-[60%] bg-gradient-to-b from-primary/20 via-primary/5 to-transparent transform rotate-12 translate-x-[20vw]" />
        <div className="absolute top-[10%] right-0 w-[1px] h-[50%] bg-gradient-to-b from-blue-500/15 via-blue-500/5 to-transparent transform rotate-12 translate-x-[25vw]" />

        {/* Pokeball — large, subtle, positioned right */}
        <div className="absolute right-[5%] top-1/2 -translate-y-1/2 w-[36rem] h-[36rem] opacity-[0.025]">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" stroke="white" strokeWidth="0.6" />
            <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="12" stroke="white" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="6" fill="white" fillOpacity="0.2" />
          </svg>
        </div>

        {/* Scan lines */}
        <div className="absolute inset-0 scan-lines opacity-50" />

        {/* Content */}
        <div className="relative z-10 w-full max-w-3xl mx-auto px-6 py-28">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
            {/* Tag */}
            <motion.div variants={fadeIn} className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/[0.06] border border-foreground/[0.08] backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Built for VGC &amp; Draft League Communities
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeIn}
              className="text-4xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-[1.05] tracking-tight"
            >
              Draft leagues for
              <br />
              <span className="bg-gradient-to-r from-primary to-[hsl(var(--brand-to))] bg-clip-text text-transparent">competitive Pokemon</span>.
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeIn}
              className="text-muted-foreground text-base sm:text-lg max-w-md leading-relaxed"
            >
              The free platform your VGC community actually needs. Run snake drafts, auctions,
              and full league seasons — no spreadsheets, no signup walls.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-start gap-3 pt-2">
              <Button
                size="xl"
                variant="glow"
                onClick={() => router.push('/create-draft')}
                className="rounded-2xl font-bold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Start a Draft
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push('/join-draft')}
                className="border-border text-muted-foreground bg-transparent hover:bg-foreground/5 hover:text-foreground hover:border-foreground/30 font-medium rounded-2xl"
              >
                <Users className="h-4 w-4 mr-2" />
                Join a Draft
              </Button>
            </motion.div>

            {/* Sign in link */}
            <motion.div variants={fadeIn} className="flex items-center gap-2 text-sm text-muted-foreground">
              <LogIn className="h-3.5 w-3.5" />
              <span>Already have an account?</span>
              <button
                className="text-foreground/80 hover:text-foreground font-medium transition-colors duration-150"
                onClick={() => router.push('/dashboard')}
              >
                Sign in
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* How It Works — quick 3-step overview */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              icon: Plus,
              title: 'Create a Draft',
              desc: 'Pick VGC Reg H, Smogon, or a custom format. Set budget, team count, and share a 6-character room code.',
              accent: 'from-primary to-[hsl(var(--brand-to))]',
            },
            {
              icon: Swords,
              title: 'Draft Your Squad',
              desc: 'Take turns picking Pokemon in real-time. Snake or auction — with wishlist, auto-pick, and budget tracking built in.',
              accent: 'from-violet-500 to-purple-600',
            },
            {
              icon: Trophy,
              title: 'Run Your League',
              desc: 'Full season with standings, matchups, trades, and playoff brackets. Track KOs per game and crown a champion.',
              accent: 'from-amber-500 to-orange-600',
            },
          ].map((item, i) => (
            <div
              key={item.title}
              className="relative p-5 rounded-2xl border border-border/60 bg-card hover:shadow-md hover:border-border transition-all duration-200 group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.accent} flex items-center justify-center shadow-sm mb-3`}>
                <item.icon className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="absolute top-3 right-4 text-3xl font-black text-foreground/[0.04] select-none">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="font-bold text-sm mb-1.5">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-24 space-y-28">
        {/* Why Poke Draft */}
        <div ref={featuresRef}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-2">
              Built for competitive Pokemon
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              Everything you need to run your draft
            </h2>
          </motion.div>

          <div className="space-y-3">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, x: -16 }}
                animate={featuresInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                variants={cardHover}
                whileHover="hover"
                className="flex gap-4 p-5 rounded-2xl border border-border/60 bg-card hover:shadow-lg hover:border-border transition-all duration-200 cursor-default"
              >
                <div className="mt-0.5 shrink-0">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feat.accent} flex items-center justify-center shadow-sm`}>
                    <feat.icon className="h-4.5 w-4.5 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1">{feat.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Trusted by trainers */}
        <div ref={trustRef}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={trustInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-2">
              Trusted by champions
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              Built by the community, for the community
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TRUST_PROPS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                animate={trustInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.1, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="p-5 rounded-2xl border border-border/60 bg-card hover:shadow-md hover:border-border transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/8 dark:bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors duration-200">
                  <item.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="font-bold text-sm mb-1.5">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div ref={stepsRef}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={stepsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-2">
              How it works
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              Start drafting in 30 seconds
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 16 }}
                animate={stepsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative p-5 rounded-2xl border border-border/60 bg-card group hover:shadow-md hover:border-border transition-all duration-200"
              >
                {/* Step number — large, faded */}
                <span className="absolute top-3 right-4 text-4xl font-black text-foreground/[0.04] select-none">
                  {step.num}
                </span>
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-to))] text-white flex items-center justify-center text-xs font-bold shadow-sm mb-3">
                    {step.num}
                  </div>
                  <h3 className="font-bold text-sm mb-1.5">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA — refined */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pb-24 pt-8 text-center space-y-5">
          <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
            Ready to compete?
          </p>
          <h2 className="text-3xl font-bold tracking-tight">Your next draft league starts here</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Create your first draft in under a minute. Free, no signup required, any format your community plays.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Button
              variant="glow"
              size="lg"
              onClick={() => router.push('/create-draft')}
              className="rounded-2xl font-bold"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Start a Draft
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => router.push('/join-draft')}
              className="rounded-2xl"
            >
              <Users className="h-4 w-4 mr-2" />
              Join a Draft
            </Button>
          </div>
          <div className="flex justify-center gap-5 pt-5 text-xs">
            <a href="/feedback" className="text-muted-foreground/60 hover:text-foreground transition-colors duration-150">Feedback</a>
            <a href="/about" className="text-muted-foreground/60 hover:text-foreground transition-colors duration-150">About</a>
            <a href="/terms" className="text-muted-foreground/60 hover:text-foreground transition-colors duration-150">Terms</a>
            <a href="/privacy" className="text-muted-foreground/60 hover:text-foreground transition-colors duration-150">Privacy</a>
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
