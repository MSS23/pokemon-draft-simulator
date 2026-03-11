'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Eye, Zap, Plus, LogIn, Shield, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { motion, useInView } from 'framer-motion'

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
}

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-time drafting',
    desc: 'Every pick syncs instantly across all participants. WebSocket-powered with zero refresh needed.',
  },
  {
    icon: Trophy,
    title: 'Official formats',
    desc: 'VGC Reg H, Smogon tiers, and custom rulesets with automatic cost calculation.',
  },
  {
    icon: Shield,
    title: 'Full league system',
    desc: 'Standings, matchups, trades, playoffs, and KO tracking in one place.',
  },
]

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const featuresRef = useRef<HTMLDivElement>(null)
  const featuresInView = useInView(featuresRef, { once: true, margin: '-60px' })

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  if (loading || user) {
    return (
      <SidebarLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      {/* Hero */}
      <div className="relative overflow-hidden hero-dark min-h-[88vh] flex items-center">
        {/* Grid */}
        <div className="absolute inset-0 hero-lines" />

        {/* Ambient glow — warm primary accent */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[60rem] h-[40rem] bg-primary/[0.04] rounded-full blur-[120px]" />

        {/* Pokéball — single, subtle */}
        <div className="absolute right-[8%] top-1/2 -translate-y-1/2 w-[32rem] h-[32rem] opacity-[0.03]">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" stroke="white" strokeWidth="0.8" />
            <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="0.8" />
            <circle cx="50" cy="50" r="12" stroke="white" strokeWidth="0.8" />
            <circle cx="50" cy="50" r="6" fill="white" fillOpacity="0.3" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-3xl mx-auto px-6 py-24">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
            <motion.div variants={fadeIn} className="flex items-center gap-2">
              <div className="h-px w-8 bg-primary/60" />
              <p className="text-primary text-sm font-semibold tracking-wide uppercase">
                Draft League
              </p>
            </motion.div>

            <motion.h1
              variants={fadeIn}
              className="text-4xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight"
            >
              Draft your team.
              <br />
              <span className="text-zinc-500">Win your league.</span>
            </motion.h1>

            <motion.p
              variants={fadeIn}
              className="text-zinc-400 text-base sm:text-lg max-w-md leading-relaxed"
            >
              Live multiplayer drafts with snake and auction formats.
              Full VGC regulation support out of the box.
            </motion.p>

            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-start gap-3 pt-2">
              <Button
                size="lg"
                onClick={() => router.push('/join-draft')}
                className="bg-primary text-white hover:bg-primary/90 font-semibold h-12 px-7 rounded-xl shadow-[0_0_20px_-4px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_28px_-4px_hsl(var(--primary)/0.5)] transition-all"
              >
                <Users className="h-4 w-4 mr-2" />
                Join a Draft
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push('/create-draft')}
                className="border-zinc-700 text-zinc-300 bg-transparent hover:bg-white/5 hover:text-white font-medium h-12 px-7 rounded-xl"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Draft
              </Button>
            </motion.div>

            <motion.div variants={fadeIn} className="flex items-center gap-2 text-sm text-zinc-500">
              <LogIn className="h-3.5 w-3.5" />
              <span>Already have an account?</span>
              <button
                className="text-zinc-300 hover:text-white font-medium transition-colors"
                onClick={() => router.push('/dashboard')}
              >
                Sign in
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 space-y-20">
        {/* Quick actions */}
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6"
          >
            Get started
          </motion.p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { href: '/create-draft', icon: Plus, label: 'Create Draft', desc: 'Set up a new draft room' },
              { href: '/join-draft', icon: Users, label: 'Join Draft', desc: 'Enter a room code' },
              { href: '/watch-drafts', icon: Eye, label: 'Watch Live', desc: 'Spectate public drafts' },
            ].map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={() => router.push(action.href)}
                className="group cursor-pointer p-5 rounded-xl border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/8 dark:bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h3 className="font-semibold text-sm">{action.label}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pl-11">{action.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Why Poké Draft */}
        <div ref={featuresRef}>
          <motion.p
            initial={{ opacity: 0 }}
            animate={featuresInView ? { opacity: 1 } : {}}
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6"
          >
            Built for competitive play
          </motion.p>

          <div className="space-y-3">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 12 }}
                animate={featuresInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.1, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex gap-4 p-5 rounded-xl border bg-card hover:shadow-sm transition-shadow"
              >
                <div className="mt-0.5 shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/8 dark:bg-primary/10 flex items-center justify-center">
                    <feat.icon className="h-4 w-4 text-primary/70" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{feat.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
