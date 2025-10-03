'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Pokemon } from '@/types'
import { Clock, DollarSign, Gavel, Trophy, AlertCircle, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import PokemonCard from '@/components/pokemon/PokemonCard'
import AuctionBidHistory, { BidHistoryEntry } from './AuctionBidHistory'
import { auctionService } from '@/lib/auction-service'
import { notificationService } from '@/lib/notification-service'

interface AuctionBiddingInterfaceProps {
  currentAuction: {
    id: string
    pokemon_id: string
    pokemon_name: string
    nominated_by: string
    current_bid: number
    current_bidder: string | null
    auction_end: string
    status: 'active' | 'completed' | 'cancelled'
  } | null
  pokemon: Pokemon | null
  userTeamId: string | null
  teams: Array<{
    id: string
    name: string
    userName: string
    budgetRemaining: number
    draftOrder: number
  }>
  timeRemaining: number
  isUserTurn: boolean
  onPlaceBid: (amount: number) => Promise<void>
  onNominatePokemon: (pokemon: Pokemon) => Promise<void>
  draftId: string
  className?: string
}

export default function AuctionBiddingInterface({
  currentAuction,
  pokemon,
  userTeamId,
  teams,
  timeRemaining,
  isUserTurn,
  onPlaceBid,
  onNominatePokemon,
  draftId,
  className
}: AuctionBiddingInterfaceProps) {
  const [bidAmount, setBidAmount] = useState('')
  const [isPlacingBid, setIsPlacingBid] = useState(false)
  const [showBidHistory, setShowBidHistory] = useState(false)
  const [bidHistory, setBidHistory] = useState<BidHistoryEntry[]>([])

  const userTeam = teams.find(team => team.id === userTeamId)
  const currentBidder = currentAuction?.current_bidder
    ? teams.find(team => team.id === currentAuction.current_bidder)
    : null
  const nominator = currentAuction?.nominated_by
    ? teams.find(team => team.id === currentAuction.nominated_by)
    : null

  // Auto-set bid amount to minimum valid bid
  useEffect(() => {
    if (currentAuction && !bidAmount) {
      const minBid = currentAuction.current_bid + 1
      setBidAmount(minBid.toString())
    }
  }, [currentAuction, bidAmount])

  // Load and subscribe to bid history
  useEffect(() => {
    if (!currentAuction) {
      setBidHistory([])
      return
    }

    // Load initial bid history
    auctionService.getBidHistory(currentAuction.id).then(setBidHistory)

    // Subscribe to real-time updates
    const unsubscribe = auctionService.subscribeToBidHistory(
      currentAuction.id,
      (updatedHistory) => {
        setBidHistory(updatedHistory)
        
        // Notify if someone else placed a bid
        if (updatedHistory.length > 0) {
          const latestBid = updatedHistory[updatedHistory.length - 1]
          const isUserBid = latestBid.teamId === userTeamId
          
          if (!isUserBid) {
            notificationService.notifyBidPlaced(
              latestBid.teamName,
              latestBid.bidAmount,
              currentAuction.pokemon_name,
              false
            )
          }
        }
      }
    )

    return unsubscribe
  }, [currentAuction?.id, userTeamId])

  const handlePlaceBid = async () => {
    if (!currentAuction || !userTeam || isPlacingBid) return

    const amount = parseInt(bidAmount)
    if (isNaN(amount) || amount <= currentAuction.current_bid) {
      return
    }

    if (amount > userTeam.budgetRemaining) {
      return
    }

    try {
      setIsPlacingBid(true)
      
      // Use auction service to place bid and record history
      await auctionService.placeBid({
        auctionId: currentAuction.id,
        teamId: userTeam.id,
        teamName: userTeam.name,
        bidAmount: amount,
        draftId: draftId,
      })

      // Also call the original onPlaceBid for compatibility
      await onPlaceBid(amount)

      // Notify user of successful bid
      notificationService.notifyBidPlaced(
        userTeam.name,
        amount,
        currentAuction.pokemon_name,
        true
      )

      // Auto-increment for next potential bid
      setBidAmount((amount + 1).toString())
    } catch (error) {
      console.error('Error placing bid:', error)
      // Could add error notification here
    } finally {
      setIsPlacingBid(false)
    }
  }

  const canBid = () => {
    if (!currentAuction || !userTeam || currentAuction.status !== 'active') return false
    if (currentAuction.current_bidder === userTeamId) return false // Already highest bidder

    const amount = parseInt(bidAmount)
    if (isNaN(amount) || amount <= currentAuction.current_bid) return false
    if (amount > userTeam.budgetRemaining) return false

    return true
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // No active auction - waiting for nomination
  if (!currentAuction) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-orange-600" />
            Auction Draft
            <Badge variant="outline" className="text-xs">
              Waiting for Nomination
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400 mb-4">
              {isUserTurn ? (
                <>
                  <Trophy className="h-12 w-12 mx-auto mb-2 text-yellow-500" />
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Your Turn to Nominate
                  </h3>
                  <p className="text-sm">
                    Select a Pokémon from the grid below to start the auction
                  </p>
                </>
              ) : (
                <>
                  <Clock className="h-12 w-12 mx-auto mb-2 text-blue-500" />
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Waiting for Nomination
                  </h3>
                  <p className="text-sm">
                    Another team will nominate a Pokémon for auction
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Team budgets overview */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">Team Budgets</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {teams.map(team => (
                <div
                  key={team.id}
                  className={cn(
                    'flex justify-between items-center p-2 rounded',
                    team.id === userTeamId
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-800'
                  )}
                >
                  <span className="text-sm font-medium">{team.name}</span>
                  <Badge variant="outline" className="text-xs">
                    ${team.budgetRemaining}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Active auction
  return (
    <Card className={cn('w-full border-orange-200 shadow-lg', className)}>
      <CardHeader className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-orange-600" />
            Live Auction
            <Badge
              variant="default"
              className="bg-red-500 hover:bg-red-600 animate-pulse"
            >
              LIVE
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-lg font-mono">
            <Clock className="h-4 w-4" />
            <span className={cn(
              'font-bold',
              timeRemaining <= 10 ? 'text-red-600 animate-pulse' : 'text-orange-600'
            )}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Pokemon being auctioned */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-shrink-0">
            {pokemon && (
              <PokemonCard
                pokemon={pokemon}
                size="md"
                showCost={true}
                showStats={true}
                className="w-48"
              />
            )}
          </div>

          <div className="flex-1 space-y-4">
            {/* Auction details */}
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                {currentAuction.pokemon_name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>Nominated by: <strong>{nominator?.name || 'Unknown'}</strong></span>
                <span>Base Cost: <strong>${pokemon?.cost || 1}</strong></span>
              </div>
            </div>

            {/* Current bid info */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Current Bid
                </span>
                {currentBidder && (
                  <Badge variant="outline" className="text-xs">
                    {currentBidder.name}
                  </Badge>
                )}
              </div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                ${currentAuction.current_bid}
              </div>
            </div>

            {/* Bidding interface */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="Enter bid amount"
                    min={currentAuction.current_bid + 1}
                    max={userTeam?.budgetRemaining || 100}
                    className="text-lg font-semibold text-center"
                  />
                  <div className="text-xs text-gray-500 mt-1 text-center">
                    Min: ${currentAuction.current_bid + 1} |
                    Budget: ${userTeam?.budgetRemaining || 0}
                  </div>
                </div>
                <Button
                  onClick={handlePlaceBid}
                  disabled={!canBid() || isPlacingBid}
                  className={cn(
                    'px-6 min-w-[100px]',
                    canBid()
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-400'
                  )}
                >
                  {isPlacingBid ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <>
                      <DollarSign className="h-4 w-4 mr-1" />
                      Bid
                    </>
                  )}
                </Button>
              </div>

              {/* Quick bid buttons */}
              <div className="flex gap-1 flex-wrap">
                {[1, 5, 10].map(increment => {
                  const quickBid = currentAuction.current_bid + increment
                  const canAfford = userTeam && quickBid <= userTeam.budgetRemaining

                  return (
                    <Button
                      key={increment}
                      variant="outline"
                      size="sm"
                      onClick={() => setBidAmount(quickBid.toString())}
                      disabled={!canAfford}
                      className="text-xs"
                    >
                      +${increment}
                    </Button>
                  )
                })}
                {userTeam && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBidAmount(userTeam.budgetRemaining.toString())}
                    disabled={userTeam.budgetRemaining <= currentAuction.current_bid}
                    className="text-xs font-semibold text-red-600 border-red-200"
                  >
                    ALL IN (${userTeam.budgetRemaining})
                  </Button>
                )}
              </div>

              {/* Bid validation messages */}
              {bidAmount && (
                <div className="text-xs">
                  {parseInt(bidAmount) <= currentAuction.current_bid && (
                    <div className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      Bid must be higher than current bid
                    </div>
                  )}
                  {userTeam && parseInt(bidAmount) > userTeam.budgetRemaining && (
                    <div className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      Bid exceeds your remaining budget
                    </div>
                  )}
                  {currentAuction.current_bidder === userTeamId && (
                    <div className="flex items-center gap-1 text-green-600">
                      <Trophy className="h-3 w-3" />
                      You are the current highest bidder
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bid History Toggle */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBidHistory(!showBidHistory)}
            className="text-xs"
          >
            <History className="h-3 w-3 mr-1" />
            {showBidHistory ? 'Hide' : 'Show'} Bid History ({bidHistory.length})
          </Button>
          
          {bidHistory.length > 0 && (
            <div className="text-xs text-gray-500">
              Last bid: ${bidHistory[bidHistory.length - 1]?.bidAmount || 0}
            </div>
          )}
        </div>

        {/* Bid History Component */}
        {showBidHistory && (
          <AuctionBidHistory
            auctionId={currentAuction.id}
            bidHistory={bidHistory}
            currentAuction={{
              pokemonName: currentAuction.pokemon_name,
              currentBid: currentAuction.current_bid,
              currentBidder: currentAuction.current_bidder,
            }}
            userTeamId={userTeamId}
            className="mt-4"
          />
        )}

        {/* Action status */}
        {timeRemaining <= 10 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Final seconds! Place your bid now!
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}