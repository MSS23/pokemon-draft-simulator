'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Pokemon } from '@/types'
import { createLogger } from '@/lib/logger'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'

const log = createLogger('AuctionBiddingInterface')
import { DollarSign, Gavel, Trophy, AlertCircle, Crown, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import AuctionBidHistory, { BidHistoryEntry } from './AuctionBidHistory'
import { toast } from 'sonner'
import { auctionService } from '@/lib/auction-service'
import { notificationService } from '@/lib/notification-service'
import { draftSounds } from '@/lib/draft-sounds'
import {
  fadeInUpVariants,
  celebrationVariants,
  useReducedMotion,
  REDUCED_MOTION_VARIANTS,
  getTimerColor,
} from '@/lib/draft-animations'
import { getBestPokemonImageUrl } from '@/utils/pokemon'
import { getTeamColor } from '@/utils/team-colors'

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

// Animated number that counts up/down
function AnimatedBidNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(value)
  const rounded = useTransform(motionValue, (v) => Math.round(v))
  const display = useTransform(rounded, (v) => `$${v}`)
  const prevValue = useRef(value)

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.4,
      ease: 'easeOut',
    })
    prevValue.current = value
    return controls.stop
  }, [value, motionValue])

  return <motion.span>{display}</motion.span>
}

// "SOLD!" overlay animation
function SoldOverlay({
  winnerName,
  pokemonName,
  finalPrice,
  winnerColor,
  onComplete,
}: {
  winnerName: string
  pokemonName: string
  finalPrice: number
  winnerColor: string
  onComplete: () => void
}) {
  useEffect(() => {
    draftSounds.play('auction-sold')
    const timer = setTimeout(onComplete, 3000)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 rounded-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        variants={celebrationVariants}
        initial="initial"
        animate="animate"
        className="text-center"
      >
        <Gavel className="h-12 w-12 mx-auto mb-3 text-amber-400" />
        <h2 className="text-3xl md:text-4xl font-black text-foreground mb-2">SOLD!</h2>
        <p className="text-lg text-muted-foreground mb-1">
          {pokemonName}
        </p>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-sm text-muted-foreground">to</span>
          <Badge
            className="text-sm px-3 py-1"
            style={{ backgroundColor: winnerColor, color: 'white' }}
          >
            {winnerName}
          </Badge>
        </div>
        <motion.div
          className="text-4xl font-black text-emerald-400"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        >
          ${finalPrice}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export default function AuctionBiddingInterface({
  currentAuction,
  pokemon,
  userTeamId,
  teams,
  timeRemaining,
  isUserTurn,
  onPlaceBid,
  onNominatePokemon: _onNominatePokemon,
  draftId,
  className,
}: AuctionBiddingInterfaceProps) {
  const [bidAmount, setBidAmount] = useState('')
  const [isPlacingBid, setIsPlacingBid] = useState(false)
  const [bidHistory, setBidHistory] = useState<BidHistoryEntry[]>([])
  const [showSold, setShowSold] = useState(false)
  const [soldInfo, setSoldInfo] = useState<{
    winnerName: string
    pokemonName: string
    finalPrice: number
    winnerColor: string
  } | null>(null)
  const reducedMotion = useReducedMotion()

  const userTeam = teams.find((team) => team.id === userTeamId)
  const currentBidder = currentAuction?.current_bidder
    ? teams.find((team) => team.id === currentAuction.current_bidder)
    : null
  const isUserWinning = currentAuction?.current_bidder === userTeamId

  // Compute max budget for the timer bar
  const maxBudget = Math.max(...teams.map((t) => t.budgetRemaining), 1)

  // Total duration estimate for color helper
  const totalDuration = useRef(0)
  useEffect(() => {
    if (timeRemaining > 0 && totalDuration.current === 0) {
      totalDuration.current = timeRemaining
    }
    if (!currentAuction) {
      totalDuration.current = 0
    }
  }, [timeRemaining, currentAuction])

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

    auctionService.getBidHistory(currentAuction.id).then(setBidHistory)

    const unsubscribe = auctionService.subscribeToBidHistory(
      currentAuction.id,
      (updatedHistory) => {
        setBidHistory(updatedHistory)

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
  }, [currentAuction, userTeamId])

  // Detect auction completion for SOLD overlay
  useEffect(() => {
    if (currentAuction?.status === 'completed' && currentBidder) {
      const teamIndex = teams.findIndex((t) => t.id === currentBidder.id)
      const color = getTeamColor(teamIndex >= 0 ? teamIndex : 0)
      setSoldInfo({
        winnerName: currentBidder.name,
        pokemonName: currentAuction.pokemon_name,
        finalPrice: currentAuction.current_bid,
        winnerColor: color.hex,
      })
      setShowSold(true)
    }
  }, [currentAuction?.status, currentBidder, currentAuction?.pokemon_name, currentAuction?.current_bid, teams])

  const handlePlaceBid = useCallback(async () => {
    if (!currentAuction || !userTeam || isPlacingBid) return

    const amount = parseInt(bidAmount)
    if (isNaN(amount) || amount <= currentAuction.current_bid) return
    if (amount > userTeam.budgetRemaining) return

    try {
      setIsPlacingBid(true)
      await onPlaceBid(amount)

      // Play bid sound
      draftSounds.play('bid-placed')

      try {
        await auctionService.recordBidHistory({
          auctionId: currentAuction.id,
          teamId: userTeam.id,
          teamName: userTeam.name,
          bidAmount: amount,
          draftId: draftId,
        })
      } catch (historyErr) {
        log.warn('Failed to record bid history:', historyErr)
      }

      notificationService.notifyBidPlaced(
        userTeam.name,
        amount,
        currentAuction.pokemon_name,
        true
      )

      setBidAmount((amount + 1).toString())
    } catch (error) {
      log.error('Error placing bid:', error)
      const msg =
        error instanceof Error ? error.message : 'Failed to place bid'
      toast.error(msg)

      if (
        msg.includes('Current bid is now') ||
        msg.includes('higher than current bid')
      ) {
        const match = msg.match(/\$(\d+)/)
        if (match) {
          setBidAmount((parseInt(match[1]) + 1).toString())
        }
      }
    } finally {
      setIsPlacingBid(false)
    }
  }, [currentAuction, userTeam, isPlacingBid, bidAmount, onPlaceBid, draftId])

  const canBid = useCallback(() => {
    if (
      !currentAuction ||
      !userTeam ||
      currentAuction.status !== 'active'
    )
      return false
    if (currentAuction.current_bidder === userTeamId) return false

    const amount = parseInt(bidAmount)
    if (isNaN(amount) || amount <= currentAuction.current_bid) return false
    if (amount > userTeam.budgetRemaining) return false

    return true
  }, [currentAuction, userTeam, userTeamId, bidAmount])

  const quickBidAmounts = [1, 5, 10]

  // No active auction - waiting for nomination
  if (!currentAuction) {
    return (
      <Card className={cn('w-full bg-card border-border', className)}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Gavel className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-bold text-foreground">Auction Draft</h3>
            <Badge variant="outline" className="text-xs border-border text-muted-foreground">
              Waiting for Nomination
            </Badge>
          </div>

          <div className="text-center py-8 mb-6">
            {isUserTurn ? (
              <motion.div
                variants={reducedMotion ? REDUCED_MOTION_VARIANTS : fadeInUpVariants}
                initial="initial"
                animate="animate"
              >
                <Trophy className="h-14 w-14 mx-auto mb-3 text-amber-400" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Your Turn to Nominate
                </h3>
                <p className="text-sm text-muted-foreground">
                  Select a Pokemon from the grid below to start the auction
                </p>
              </motion.div>
            ) : (
              <div>
                <Gavel className="h-14 w-14 mx-auto mb-3 text-muted-foreground/60" />
                <h3 className="text-xl font-bold text-muted-foreground mb-2">
                  Waiting for Nomination
                </h3>
                <p className="text-sm text-muted-foreground/70">
                  Another team will nominate a Pokemon for auction
                </p>
              </div>
            )}
          </div>

          {/* Team budgets as horizontal bars */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Team Budgets
            </h4>
            {teams
              .sort((a, b) => b.budgetRemaining - a.budgetRemaining)
              .map((team, idx) => {
                const color = getTeamColor(teams.indexOf(team))
                const pct = (team.budgetRemaining / maxBudget) * 100
                return (
                  <div
                    key={team.id}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-lg',
                      team.id === userTeamId
                        ? 'bg-foreground/5 ring-1 ring-foreground/10'
                        : ''
                    )}
                  >
                    <span
                      className="text-sm font-medium w-28 truncate"
                      style={{ color: color.hex }}
                    >
                      {team.name}
                      {team.id === userTeamId && (
                        <span className="text-xs text-muted-foreground ml-1">(you)</span>
                      )}
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color.hex }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.05 }}
                      />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground w-12 text-right">
                      ${team.budgetRemaining}
                    </span>
                  </div>
                )
              })}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Active auction
  const timerColor = getTimerColor(timeRemaining, totalDuration.current || 60)

  return (
    <Card
      className={cn(
        'w-full relative overflow-hidden bg-card border-border',
        className
      )}
    >
      {/* SOLD overlay */}
      <AnimatePresence>
        {showSold && soldInfo && (
          <SoldOverlay
            {...soldInfo}
            onComplete={() => setShowSold(false)}
          />
        )}
      </AnimatePresence>

      <CardContent className="p-0">
        {/* Top bar: timer + live badge */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-foreground">Live Auction</span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <motion.span
              className="text-2xl font-mono font-black"
              style={{ color: timerColor }}
              animate={
                timeRemaining <= 10
                  ? { scale: [1, 1.08, 1] }
                  : { scale: 1 }
              }
              transition={
                timeRemaining <= 10
                  ? { duration: 0.6, repeat: Infinity }
                  : {}
              }
            >
              {Math.floor(timeRemaining / 60)}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </motion.span>
          </div>
        </div>

        {/* Timer progress bar */}
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full"
            style={{ backgroundColor: timerColor }}
            animate={{
              width: `${
                totalDuration.current > 0
                  ? (timeRemaining / totalDuration.current) * 100
                  : 100
              }%`,
            }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        </div>

        {/* Going once / twice / SOLD overlay text */}
        <AnimatePresence mode="wait">
          {timeRemaining <= 5 && timeRemaining > 0 && (
            <motion.div
              key={timeRemaining <= 2 ? 'twice' : 'once'}
              className="absolute top-14 left-0 right-0 z-10 text-center pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-2xl md:text-3xl font-black text-red-400 drop-shadow-lg">
                {timeRemaining <= 2 ? 'Going twice...' : 'Going once...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content: Pokemon + Bid area */}
        <div className="p-4 md:p-6 space-y-5">
          {/* Pokemon being auctioned */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {pokemon && (
              <motion.div
                className="relative flex-shrink-0"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl bg-muted border border-border flex items-center justify-center overflow-hidden">
                  <img
                    src={getBestPokemonImageUrl(pokemon.id, pokemon.name)}
                    alt={pokemon.name}
                    className="w-24 h-24 md:w-32 md:h-32 object-contain"
                    loading="eager"
                  />
                </div>
              </motion.div>
            )}
            <div className="text-center sm:text-left">
              <h2 className="text-2xl md:text-3xl font-black text-foreground capitalize">
                {currentAuction.pokemon_name}
              </h2>
              {pokemon && (
                <div className="flex flex-wrap gap-1.5 mt-2 justify-center sm:justify-start">
                  {pokemon.types.map((type) => (
                    <Badge
                      key={type.name}
                      className="text-xs px-2 py-0.5 text-white border-0"
                      style={{ backgroundColor: type.color }}
                    >
                      {type.name}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                    BST {pokemon.stats.total}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Current bid display - big centered number */}
          <motion.div
            className="text-center py-4 rounded-xl bg-muted/80 border border-border"
            layout
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Current Bid
            </div>
            <div
              className="text-5xl md:text-6xl font-black text-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              <AnimatedBidNumber value={currentAuction.current_bid} />
            </div>
            {currentBidder && (
              <motion.div
                className="mt-2 flex items-center justify-center gap-2"
                key={currentBidder.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-sm text-muted-foreground">
                  {currentBidder.name}
                  {isUserWinning && (
                    <span className="text-emerald-400 ml-1">(You)</span>
                  )}
                </span>
              </motion.div>
            )}
          </motion.div>

          {/* User winning indicator */}
          <AnimatePresence>
            {isUserWinning && (
              <motion.div
                className="flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-900/30 border border-emerald-800"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Trophy className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">
                  You are the highest bidder
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick bid buttons + custom bid */}
          <div className="space-y-3">
            {/* Quick bid row */}
            <div className="grid grid-cols-4 gap-2">
              {quickBidAmounts.map((increment) => {
                const quickBidValue = currentAuction.current_bid + increment
                const canAfford =
                  userTeam && quickBidValue <= userTeam.budgetRemaining
                const disabled =
                  !canAfford || isUserWinning || isPlacingBid

                return (
                  <Button
                    key={increment}
                    variant="outline"
                    onClick={() => {
                      setBidAmount(quickBidValue.toString())
                    }}
                    disabled={disabled}
                    className={cn(
                      'h-12 text-sm font-bold border-border bg-muted hover:bg-muted/80 text-foreground',
                      disabled && 'opacity-40'
                    )}
                    title={`Bid $${quickBidValue}`}
                  >
                    <span className="text-muted-foreground text-xs">+{increment}</span>
                    <span className="ml-1">${quickBidValue}</span>
                  </Button>
                )
              })}
              {/* Match + 1 button */}
              <Button
                variant="outline"
                onClick={() => {
                  const matchPlusOne = currentAuction.current_bid + 1
                  setBidAmount(matchPlusOne.toString())
                }}
                disabled={
                  !userTeam ||
                  currentAuction.current_bid + 1 > userTeam.budgetRemaining ||
                  isUserWinning ||
                  isPlacingBid
                }
                className={cn(
                  'h-12 text-sm font-bold border-amber-700/50 bg-amber-900/20 hover:bg-amber-900/40 text-amber-400',
                  (isUserWinning || isPlacingBid) && 'opacity-40'
                )}
              >
                <Zap className="h-3.5 w-3.5 mr-1" />
                +1
              </Button>
            </div>

            {/* Custom bid row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  placeholder="Custom bid"
                  min={currentAuction.current_bid + 1}
                  max={userTeam?.budgetRemaining || 100}
                  className="pl-9 h-12 text-lg font-semibold text-center bg-background border-border text-foreground"
                />
              </div>
              <Button
                onClick={handlePlaceBid}
                disabled={!canBid() || isPlacingBid}
                className={cn(
                  'h-12 px-8 text-base font-bold',
                  canBid()
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isPlacingBid ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Gavel className="h-4 w-4 mr-2" />
                    BID
                  </>
                )}
              </Button>
            </div>

            {/* Budget info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Min bid: ${currentAuction.current_bid + 1}
              </span>
              <span>
                Your budget: ${userTeam?.budgetRemaining || 0}
              </span>
            </div>

            {/* Validation messages */}
            <AnimatePresence>
              {bidAmount &&
                parseInt(bidAmount) > (userTeam?.budgetRemaining || 0) && (
                  <motion.div
                    className="flex items-center gap-1.5 text-xs text-red-400 bg-red-900/20 p-2 rounded"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <AlertCircle className="h-3 w-3" />
                    Bid exceeds your remaining budget
                  </motion.div>
                )}
            </AnimatePresence>
          </div>

          {/* Budget bars for all teams */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Team Budgets
            </h4>
            {teams
              .sort((a, b) => b.budgetRemaining - a.budgetRemaining)
              .map((team) => {
                const color = getTeamColor(teams.indexOf(team))
                const pct = (team.budgetRemaining / maxBudget) * 100
                const isBidder = team.id === currentAuction.current_bidder
                return (
                  <div
                    key={team.id}
                    className={cn(
                      'flex items-center gap-2 py-1',
                      team.id === userTeamId && 'opacity-100',
                      team.id !== userTeamId && 'opacity-70'
                    )}
                  >
                    <span className="text-xs w-24 truncate flex items-center gap-1" style={{ color: color.hex }}>
                      {isBidder && <Crown className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                      {team.name}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color.hex }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                      ${team.budgetRemaining}
                    </span>
                  </div>
                )
              })}
          </div>

          {/* Bid history feed - always visible */}
          <AuctionBidHistory
            auctionId={currentAuction.id}
            bidHistory={bidHistory}
            currentAuction={{
              pokemonName: currentAuction.pokemon_name,
              currentBid: currentAuction.current_bid,
              currentBidder: currentAuction.current_bidder,
            }}
            userTeamId={userTeamId}
          />
        </div>
      </CardContent>
    </Card>
  )
}
