'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Zap,
  Users,
  Trophy,
  Shield,
  Clock,
  Smartphone,
  BarChart3,
  Globe,
  Bell,
  Eye,
  Timer,
  Award
} from 'lucide-react'

const features = [
  {
    icon: Zap,
    title: 'Real-Time Synchronization',
    description: 'Instant updates across all devices with WebSocket technology. See picks happen live!',
    color: 'text-yellow-500'
  },
  {
    icon: Users,
    title: 'Multiplayer Support',
    description: 'Host drafts with up to 8 teams. Perfect for tournaments and competitive leagues.',
    color: 'text-blue-500'
  },
  {
    icon: Trophy,
    title: 'VGC Official Formats',
    description: 'Complete VGC 2024 Regulation H compliance with automatic legality checking.',
    color: 'text-purple-500'
  },
  {
    icon: Shield,
    title: 'Smart Validation',
    description: 'Intelligent budget tracking and Species Clause enforcement. No illegal picks allowed.',
    color: 'text-green-500'
  },
  {
    icon: Clock,
    title: 'Turn Timer System',
    description: 'Configurable pick timers with auto-skip functionality. Keep drafts moving!',
    color: 'text-orange-500'
  },
  {
    icon: Smartphone,
    title: 'Mobile Optimized',
    description: 'Fully responsive design. Draft from your phone, tablet, or desktop seamlessly.',
    color: 'text-cyan-500'
  },
  {
    icon: BarChart3,
    title: 'Team Analytics',
    description: 'Detailed team composition analysis, type coverage, and stat breakdowns.',
    color: 'text-pink-500'
  },
  {
    icon: Globe,
    title: 'No Registration Required',
    description: 'Guest user support with shareable links. Start drafting in seconds!',
    color: 'text-indigo-500'
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Browser notifications for your turn, with sound alerts and visual indicators.',
    color: 'text-red-500'
  },
  {
    icon: Eye,
    title: 'Spectator Mode',
    description: 'Watch drafts live without participating. Perfect for streaming and tournaments.',
    color: 'text-teal-500'
  },
  {
    icon: Timer,
    title: 'Auto-Pick Wishlist',
    description: 'Priority-based wishlist with automatic picking when AFK. Never miss a turn!',
    color: 'text-amber-500'
  },
  {
    icon: Award,
    title: 'Draft Formats',
    description: 'Snake draft and Auction modes with customizable rules and budget systems.',
    color: 'text-violet-500'
  }
]

export default function FeaturesSection() {
  return (
    <div className="bg-blue-50 dark:bg-slate-900 py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
            Everything You Need
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Built for competitive Pokémon players, by competitive Pokémon players
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card
                key={index}
                className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-2 hover:border-purple-200 dark:hover:border-purple-800"
              >
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
