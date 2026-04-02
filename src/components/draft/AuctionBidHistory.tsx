'use client'

import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trophy, Clock, TrendingUp, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { getTeamColor } from '@/utils/team-colors'

export interface BidHistoryEntry {
  id: string
  auctionId: string
  teamId: string
  teamName: string
  bidAmount: number
  timestamp: string
  isWinning?: boolean
}

interface AuctionBidHistoryProps {
  auctionId: string | null
  bidHistory: BidHistoryEntry[]
  currentAuction: {
    pokemonName: string
    currentBid: number
    currentBidder: string | null
  } | null
  userTeamId: string | null
  className?: string
}

export default function AuctionBidHistory({
  auctionId,
  bidHistory,
  currentAuction,
  userTeamId,
  className,
}: AuctionBidHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to top on new bids (newest at top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [bidHistory.length])

  const sortedBids = [...bidHistory].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor(
      (now.getTime() - date.getTime()) / 1000
    )

    if (diffInSeconds < 5) return 'just now'
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getBidIncrement = (index: number) => {
    if (index === sortedBids.length - 1) return null
    return sortedBids[index].bidAmount - sortedBids[index + 1].bidAmount
  }

  if (!auctionId || !currentAuction) {
    return null
  }

  if (bidHistory.length === 0) {
    return (
      <div className={cn('text-center py-4', className)}>
        <p className="text-xs text-gray-500">No bids yet - be the first!</p>
      </div>
    )
  }

  // Build a team name -> index map for colors
  const teamIndexMap = new Map<string, number>()
  let teamCounter = 0
  for (const bid of bidHistory) {
    if (!teamIndexMap.has(bid.teamId)) {
      teamIndexMap.set(bid.teamId, teamCounter++)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Bid History
        </h4>
        <Badge
          variant="outline"
          className="text-xs border-gray-700 text-gray-400"
        >
          {bidHistory.length} bids
        </Badge>
      </div>

      <ScrollArea className="h-40 md:h-48" ref={scrollRef}>
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {sortedBids.map((bid, index) => {
              const isWinning = index === 0
              const isUserBid = bid.teamId === userTeamId
              const increment = getBidIncrement(index)
              const teamIdx = teamIndexMap.get(bid.teamId) || 0
              const color = getTeamColor(teamIdx)

              return (
                <motion.div
                  key={bid.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm',
                    isWinning
                      ? 'bg-amber-900/20 border border-amber-800/50'
                      : 'bg-gray-900/50'
                  )}
                >
                  {/* Winning crown */}
                  <div className="w-4 flex-shrink-0">
                    {isWinning && (
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>

                  {/* Team name with color */}
                  <span
                    className="font-medium text-xs truncate flex-1 min-w-0"
                    style={{ color: color.hex }}
                  >
                    {bid.teamName}
                    {isUserBid && (
                      <span className="text-gray-500 ml-1">(you)</span>
                    )}
                  </span>

                  {/* Bid increment */}
                  {increment !== null && increment > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-emerald-500 flex-shrink-0">
                      <TrendingUp className="h-3 w-3" />+{increment}
                    </span>
                  )}

                  {/* Bid amount */}
                  <span
                    className={cn(
                      'font-mono font-semibold text-xs flex-shrink-0',
                      isWinning
                        ? 'text-amber-400'
                        : isUserBid
                        ? 'text-blue-400'
                        : 'text-gray-300'
                    )}
                  >
                    ${bid.bidAmount}
                  </span>

                  {/* Timestamp */}
                  <span className="text-xs text-gray-600 flex-shrink-0 flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatTime(bid.timestamp)}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  )
}
