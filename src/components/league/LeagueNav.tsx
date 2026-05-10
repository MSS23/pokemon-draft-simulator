'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, CalendarDays, BarChart3, ArrowLeftRight,
  UserPlus, ShieldCheck, Trophy, TrendingUp, Copy, Check, Settings, Eye,
} from 'lucide-react'
import { useState, useCallback } from 'react'

interface LeagueNavProps {
  leagueName: string
  currentWeek?: number
  totalWeeks?: number
  teamCount?: number
  isCommissioner?: boolean
  /** True when the viewer owns a team in this league. Non-members see a
   *  trimmed nav (no Trades, no Free Agents) and a "Viewing only" pill. */
  isMember?: boolean
  enableWaivers?: boolean
  enableTrades?: boolean
  hasMatchResults?: boolean
  onSettingsClick?: () => void
}

// Base tabs (trades conditionally added based on settings)
const ALWAYS_TABS = [
  { id: 'overview', label: 'Overview', path: '', icon: TrendingUp },
  { id: 'schedule', label: 'Schedule', path: '/schedule', icon: CalendarDays },
]

const TRADE_TAB = { id: 'trades', label: 'Trades', path: '/trades', icon: ArrowLeftRight }

// Tabs that only appear once matches have been played
const MATCH_TABS = [
  { id: 'rankings', label: 'Rankings', path: '/rankings', icon: Trophy },
  { id: 'stats', label: 'Stats', path: '/stats', icon: BarChart3 },
]

export function LeagueNav({
  leagueName,
  currentWeek,
  totalWeeks,
  teamCount,
  isCommissioner = false,
  isMember = false,
  enableWaivers = true,
  enableTrades = true,
  hasMatchResults = false,
  onSettingsClick,
}: LeagueNavProps) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const leagueId = params.id as string
  const [copied, setCopied] = useState(false)

  const basePath = `/league/${leagueId}`

  // Participation-only tabs — guests don't see Trades or Free Agents
  const showParticipantTabs = isMember || isCommissioner

  // Build tab list based on league state — hide trades & free agents when trades are banned
  const allTabs = [
    ...ALWAYS_TABS,
    ...(enableTrades && showParticipantTabs ? [TRADE_TAB] : []),
    ...(hasMatchResults ? MATCH_TABS : []),
    ...(enableTrades && enableWaivers && showParticipantTabs ? [{ id: 'free-agents', label: 'Free Agents', path: '/free-agents', icon: UserPlus }] : []),
    ...(isCommissioner ? [{ id: 'admin', label: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ]

  // Determine active tab from current pathname
  const getActiveTab = () => {
    const sub = pathname.replace(basePath, '')
    if (sub === '' || sub === '/') return 'overview'
    for (const tab of [...allTabs, { id: 'free-agents', path: '/free-agents' }, { id: 'admin', path: '/admin' }]) {
      if (sub.startsWith(tab.path) && tab.path !== '') return tab.id
    }
    return 'overview'
  }

  const activeTab = getActiveTab()

  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}/league/${leagueId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [leagueId])

  return (
    <div className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header row */}
        <div className="flex items-center gap-3 py-3">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">{leagueName}</h1>
              {!isMember && !isCommissioner && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border shrink-0"
                  title="You're not a member of this league — you're viewing in read-only mode."
                >
                  <Eye className="h-3 w-3" />
                  Viewing only
                </span>
              )}
            </div>
            {(currentWeek || teamCount) && (
              <p className="text-xs text-muted-foreground">
                {currentWeek && totalWeeks && `Week ${currentWeek}/${totalWeeks}`}
                {currentWeek && teamCount && ' · '}
                {teamCount && `${teamCount} teams`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isCommissioner && onSettingsClick && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettingsClick} title="League Settings">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
              title={copied ? 'Copied!' : isMember || isCommissioner ? 'Copy invite link' : 'Copy share link'}
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex items-center gap-0.5 overflow-x-auto pb-px -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => router.push(tab.path ? `${basePath}${tab.path}` : basePath)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
