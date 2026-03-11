'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Eye, Zap, Plus, LogIn, Shield, ChevronRight, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { motion, useInView } from 'framer-motion'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 24, stiffness: 100 } },
}

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-Time Drafting',
    desc: 'Every pick lands live — instant sync powered by WebSockets with no refreshing or waiting.',
    stat: '0ms',
    statLabel: 'Latency',
  },
  {
    icon: Trophy,
    title: 'Official Formats',
    desc: 'VGC Reg H, Smogon, and custom formats with automatic cost calculation built in.',
    stat: '10+',
    statLabel: 'Formats',
  },
  {
    icon: Shield,
    title: 'Full League Support',
    desc: 'Standings, match results, trades, playoffs — a complete competitive ecosystem.',
    stat: '100%',
    statLabel: 'Coverage',
  },
]

const ACTIONS = [
  { href: '/create-draft', icon: Plus,  label: 'Create Draft', desc: 'Set up a new draft room' },
  { href: '/join-draft',   icon: Users, label: 'Join Draft',   desc: 'Enter a room code' },
  { href: '/watch-drafts', icon: Eye,   label: 'Watch Live',   desc: 'Spectate public drafts' },
]

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const featuresRef = useRef<HTMLDivElement>(null)
  const featuresInView = useInView(featuresRef, { once: true, margin: '-80px' })

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
      {/* ── HERO — Dark Athletic Layout ─────────────────────── */}
      <div className="relative overflow-hidden min-h-[92vh] flex items-center hero-dark">
        {/* Diagonal line pattern */}
        <div className="absolute inset-0 hero-lines" />

        {/* Gradient orbs — large, dramatic */}
        <motion.div
          className="absolute top-0 left-1/4 w-[40rem] h-[40rem] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, hsl(160 84% 39% / 0.15), transparent 70%)' }}
          animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-[32rem] h-[32rem] rounded-full blur-[100px]"
          style={{ background: 'radial-gradient(circle, hsl(199 89% 48% / 0.12), transparent 70%)' }}
          animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        {/* Large Pokéball watermark */}
        <motion.div
          className="absolute -right-32 -bottom-32 w-[36rem] h-[36rem] opacity-[0.03]"
          animate={{ rotate: 360 }}
          transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" stroke="white" strokeWidth="1.5" />
            <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="14" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="5" fill="white" />
          </svg>
        </motion.div>

        {/* Hero content */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 py-28 text-center">
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">
            {/* Top accent line */}
            <motion.div variants={fadeUp} className="flex justify-center">
              <div className="w-12 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full" />
            </motion.div>

            {/* Overline */}
            <motion.div variants={fadeUp} className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 text-white/50 text-xs font-medium tracking-widest uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live Multiplayer Drafts
              </div>
            </motion.div>

            {/* Heading — bold condensed feel */}
            <motion.h1
              variants={fadeUp}
              className="text-5xl sm:text-7xl lg:text-[5.5rem] font-black tracking-tight text-white leading-[0.9] uppercase"
            >
              Pokémon{' '}
              <span className="brand-gradient-text">Draft</span>
              <br />
              League
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg text-slate-400 max-w-lg mx-auto leading-relaxed font-light"
            >
              Build your dream team in live competitive drafts.
              <br className="hidden sm:block" />
              Snake or auction format with full VGC support.
            </motion.p>

            {/* CTA buttons */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                size="lg"
                onClick={() => router.push('/join-draft')}
                className="brand-gradient-bg text-white border-0 shadow-glow hover:opacity-90 text-sm font-bold px-8 h-12 w-full sm:w-auto tracking-wide uppercase"
              >
                <Users className="h-4 w-4 mr-2" />
                Join a Draft
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push('/create-draft')}
                className="border-white/15 text-white/80 bg-white/5 hover:bg-white/10 hover:text-white text-sm font-semibold px-8 h-12 w-full sm:w-auto backdrop-blur-sm tracking-wide uppercase"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Draft
              </Button>
            </motion.div>

            {/* Sign in link */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-2 text-sm text-slate-500 pt-2">
              <LogIn className="h-3.5 w-3.5" />
              <span>Already have an account?</span>
              <button
                className="text-primary hover:text-primary/80 font-semibold underline underline-offset-4 decoration-primary/30"
                onClick={() => router.push('/dashboard')}
              >
                Sign in
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom fade into content */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* ── QUICK ACTIONS ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-24">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-2">Get Started</p>
            <div className="w-8 h-0.5 bg-primary/40 rounded-full" />
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ACTIONS.map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4, type: 'spring', damping: 24 }}
                whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                onClick={() => router.push(action.href)}
                className="group cursor-pointer p-5 rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/8 dark:bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <action.icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-bold text-sm tracking-tight">{action.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <div ref={featuresRef}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-2">Why Poké Draft</p>
            <div className="w-8 h-0.5 bg-primary/40 rounded-full" />
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 32 }}
                animate={featuresInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.5, type: 'spring', damping: 24 }}
                className="group p-5 rounded-xl border border-border/60 bg-card hover:shadow-md transition-all duration-200 space-y-4"
              >
                {/* Stat number — bold athletic style */}
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-black tracking-tighter text-foreground/10 group-hover:text-primary/20 transition-colors tabular-nums leading-none">
                    {feat.stat}
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    {feat.statLabel}
                  </span>
                </div>

                <div className="w-full h-px bg-border/60" />

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <feat.icon className="h-4 w-4 text-primary" />
                    <h3 className="font-bold text-sm tracking-tight">{feat.title}</h3>
                  </div>
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
