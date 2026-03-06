'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Eye, Zap, Plus, LogIn, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { motion, useInView } from 'framer-motion'

const TYPE_BADGES = [
  { label: '🔥 Fire',     float: { x: ['2%',  '2%'],  top: '18%' }, delay: 0 },
  { label: '💧 Water',    float: { x: ['3%',  '3%'],  top: '38%' }, delay: 0.4 },
  { label: '🌿 Grass',    float: { x: ['2%',  '2%'],  top: '58%' }, delay: 0.8 },
  { label: '⚡ Electric', float: { x: ['2%',  '2%'],  top: '76%' }, delay: 1.2 },
  { label: '🔮 Psychic',  float: { x: ['94%', '94%'], top: '22%' }, delay: 0.2 },
  { label: '🐲 Dragon',   float: { x: ['93%', '93%'], top: '42%' }, delay: 0.6 },
  { label: '👻 Ghost',    float: { x: ['94%', '94%'], top: '62%' }, delay: 1.0 },
  { label: '🧊 Ice',      float: { x: ['93%', '93%'], top: '79%' }, delay: 1.4 },
]

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 22, stiffness: 120 } },
}

const FEATURES = [
  {
    icon: Zap,
    color: 'text-primary',
    bg: 'bg-primary/10',
    title: 'Real-Time Drafting',
    desc: 'Instant sync across all participants powered by WebSockets. No refreshing, no waiting — every pick lands live.',
  },
  {
    icon: Trophy,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    title: 'Official Formats',
    desc: 'VGC Reg H, Smogon, and custom formats with automatic Pokémon cost calculation built right in.',
  },
  {
    icon: Shield,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    title: 'Full League Support',
    desc: 'Create leagues, track standings, record match results, run playoffs — a complete competitive ecosystem.',
  },
]

const ACTIONS = [
  { href: '/create-draft', icon: Plus,  title: 'Create Draft', desc: 'Set up a new draft room for your group',    accent: 'group-hover:border-primary/40 border-primary/10 group-hover:bg-primary/5' },
  { href: '/join-draft',   icon: Users, title: 'Join Draft',   desc: 'Enter a room code to join a live draft',    accent: 'group-hover:border-sky-500/40 border-sky-500/10 group-hover:bg-sky-500/5' },
  { href: '/watch-drafts', icon: Eye,   title: 'Watch Live',   desc: 'Spectate public drafts in real time',        accent: 'group-hover:border-amber-500/40 border-amber-500/10 group-hover:bg-amber-500/5' },
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
      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden min-h-[88vh] flex items-center">
        {/* Dark base */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950" />

        {/* Gradient orbs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-[28rem] h-[28rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(355 85% 52% / 0.22), transparent 70%)' }}
          animate={{ x: [0, 50, 0], y: [0, -40, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(199 89% 48% / 0.18), transparent 70%)' }}
          animate={{ x: [0, -35, 0], y: [0, 45, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute top-1/2 right-1/4 w-72 h-72 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, hsl(43 96% 56% / 0.14), transparent 70%)' }}
          animate={{ x: [0, 25, 0], y: [0, 25, 0], scale: [1, 0.9, 1] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Spinning Pokéball watermark */}
        <motion.div
          className="absolute -right-20 -bottom-20 w-[26rem] h-[26rem] opacity-[0.04]"
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" stroke="white" strokeWidth="2" />
            <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="2" />
            <circle cx="50" cy="50" r="14" stroke="white" strokeWidth="2" />
            <circle cx="50" cy="50" r="5" fill="white" />
          </svg>
        </motion.div>

        {/* Floating type badges */}
        {TYPE_BADGES.map((badge) => (
          <motion.div
            key={badge.label}
            className="absolute hidden xl:flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/60 backdrop-blur-sm"
            style={{ top: badge.float.top, left: badge.float.x[0] }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 0.65, scale: 1, y: [0, -10, 0] }}
            transition={{
              opacity: { delay: 0.6 + badge.delay, duration: 0.5 },
              scale:   { delay: 0.6 + badge.delay, duration: 0.5 },
              y: { duration: 3.5 + badge.delay, repeat: Infinity, ease: 'easeInOut', delay: badge.delay },
            }}
          >
            {badge.label}
          </motion.div>
        ))}

        {/* Hero text */}
        <div className="relative z-10 w-full max-w-3xl mx-auto px-6 py-24 text-center">
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-7">
            {/* Pill badge */}
            <motion.div variants={fadeUp} className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-semibold backdrop-blur-sm">
                <Zap className="h-3 w-3" />
                Real-time multiplayer drafts
              </div>
            </motion.div>

            {/* Heading */}
            <motion.h1
              variants={fadeUp}
              className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white leading-[0.88]"
            >
              Pokémon{' '}
              <span className="brand-gradient-text">Draft</span>
              <br />
              League
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeUp}
              className="text-lg sm:text-xl text-slate-400 max-w-xl mx-auto leading-relaxed"
            >
              Build your dream team in live competitive drafts. Snake or auction format with full VGC support.
            </motion.p>

            {/* CTA buttons */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <Button
                size="lg"
                onClick={() => router.push('/join-draft')}
                className="brand-gradient-bg text-white border-0 shadow-glow hover:opacity-90 text-base px-8 h-12 w-full sm:w-auto"
              >
                <Users className="h-4 w-4 mr-2" />
                Join a Draft
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push('/create-draft')}
                className="border-white/20 text-white bg-transparent hover:bg-white/10 hover:text-white text-base px-8 h-12 w-full sm:w-auto backdrop-blur-sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Draft
              </Button>
            </motion.div>

            {/* Sign in */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-2 text-sm text-slate-500 pt-1">
              <LogIn className="h-3.5 w-3.5" />
              Already have an account?{' '}
              <button
                className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
                onClick={() => router.push('/dashboard')}
              >
                Sign in
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-20">
        <div>
          <motion.h2
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6"
          >
            Get Started
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ACTIONS.map((action, i) => (
              <motion.div
                key={action.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45, type: 'spring', damping: 22 }}
                whileHover={{ y: -5, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                onClick={() => router.push(action.href)}
                className={`group cursor-pointer p-6 rounded-2xl border bg-card transition-colors space-y-4 ${action.accent}`}
              >
                <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                  <action.icon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">{action.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <div ref={featuresRef}>
          <motion.h2
            initial={{ opacity: 0, x: -10 }}
            animate={featuresInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6"
          >
            Why Poké Draft
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 32 }}
                animate={featuresInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.15, duration: 0.5, type: 'spring', damping: 22 }}
                className="p-6 rounded-2xl border bg-card hover:shadow-md transition-shadow space-y-4 group"
              >
                <motion.div
                  className={`h-12 w-12 rounded-2xl ${feat.bg} flex items-center justify-center`}
                  whileHover={{ rotate: [0, -8, 8, 0], transition: { duration: 0.4 } }}
                >
                  <feat.icon className={`h-6 w-6 ${feat.color}`} />
                </motion.div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-sm">{feat.title}</h3>
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
