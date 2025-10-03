'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { History, Trophy, Clock, DollarSign, TrendingUp, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  className
}: AuctionBidHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAnimation, setShowAnimation] = useState('')

  // Animate new bids
  useEffect(() => {
    if (bidHistory.length > 0) {
      const latestBid = bidHistory[bidHistory.length - 1]
      setShowAnimation(latestBid.id)
      
      const timer = setTimeout(() => {
        setShowAnimation('')
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [bidHistory])

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) {
      return `${diffInSeconds}s ago`
    } else if (diffInSeconds < 3600) {
      return `${Math.floor(diffInSeconds / 60)}m ago`
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const sortedBids = [...bidHistory].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const getBidTrend = (index: number) => {
    if (index === sortedBids.length - 1) return null // First bid has no trend
    
    const currentBid = sortedBids[index]
    const previousBid = sortedBids[index + 1]
    const increase = currentBid.bidAmount - previousBid.bidAmount
    
    return {
      increase,
      percentage: ((increase / previousBid.bidAmount) * 100).toFixed(1)
    }
  }

  const getHighestBidder = () => {
    if (sortedBids.length === 0) return null
    return sortedBids[0] // First in sorted array is the highest
  }

  const getUserBidStats = () => {
    const userBids = bidHistory.filter(bid => bid.teamId === userTeamId)
    if (userBids.length === 0) return null

    const totalBids = userBids.length
    const highestBid = Math.max(...userBids.map(bid => bid.bidAmount))
    const isWinning = getHighestBidder()?.teamId === userTeamId

    return { totalBids, highestBid, isWinning }
  }

  if (!auctionId || !currentAuction) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-gray-500" />
            Bid History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500 text-sm">
            No active auction
          </div>
        </CardContent>
      </Card>
    )
  }

  const userStats = getUserBidStats()
  const highestBidder = getHighestBidder()

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-blue-600" />
            Bid History
            <Badge variant="outline" className="text-xs">
              {bidHistory.length} bids
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs"
          >
            {isExpanded ? (
              <>
                <EyeOff className="h-3 w-3 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <Eye className="h-3 w-3 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span>Current: ${currentAuction.currentBid}</span>
          </div>
          {highestBidder && (
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 text-yellow-500" />
              <span>{highestBidder.teamName}</span>
            </div>
          )}
          {userStats && (
            <div className="flex items-center gap-1">
              <span className={cn(
                'font-medium',
                userStats.isWinning ? 'text-green-600' : 'text-blue-600'
              )}>
                {userStats.isWinning ? 'Winning!' : `${userStats.totalBids} bids`}
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {bidHistory.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No bids yet</p>
            <p className="text-xs mt-1">Be the first to bid on {currentAuction.pokemonName}!</p>
          </div>
        ) : (
          <ScrollArea className={cn(
            'transition-all duration-300',
            isExpanded ? 'h-64' : 'h-32'
          )}>
            <div className="space-y-2">
              {sortedBids.map((bid, index) => {
                const trend = getBidTrend(index)
                const isUserBid = bid.teamId === userTeamId
                const isWinning = index === 0
                const isAnimating = showAnimation === bid.id

                return (
                  <div
                    key={bid.id}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg border transition-all duration-500',
                      isAnimating && 'ring-2 ring-green-400 bg-green-50 dark:bg-green-900/20',
                      isWinning && !isAnimating && 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
                      isUserBid && !isWinning && !isAnimating && 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
                      !isUserBid && !isWinning && !isAnimating && 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {isWinning && <Trophy className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                        <span className={cn(
                          'text-sm font-medium truncate',
                          isUserBid && 'text-blue-700 dark:text-blue-300'
                        )}>
                          {bid.teamName}
                        </span>
                        {isUserBid && (
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            You
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {trend && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <TrendingUp className="h-3 w-3" />
                          <span>+${trend.increase}</span>
                        </div>
                      )}
                      
                      <div className="text-right">
                        <div className={cn(
                          'text-sm font-semibold',
                          isWinning && 'text-yellow-700 dark:text-yellow-300',
                          isUserBid && !isWinning && 'text-blue-700 dark:text-blue-300'
                        )}>
                          ${bid.bidAmount}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-2 w-2" />
                          {formatTime(bid.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        {/* User bid summary */}
        {userStats && bidHistory.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">Your bidding summary:</span>
              <div className="flex items-center gap-3">
                <span>{userStats.totalBids} bids</span>
                <span>Highest: ${userStats.highestBid}</span>
                <Badge 
                  variant={userStats.isWinning ? "default" : "outline"}
                  className={cn(
                    'text-xs',
                    userStats.isWinning && 'bg-green-600 text-white'
                  )}
                >
                  {userStats.isWinning ? 'Winning' : 'Outbid'}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
