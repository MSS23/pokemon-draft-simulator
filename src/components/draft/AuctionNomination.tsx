'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pokemon } from '@/types'
import { createLogger } from '@/lib/logger'
import { motion, AnimatePresence } from 'framer-motion'

const log = createLogger('AuctionNomination')
import { Gavel, Clock, DollarSign, Zap, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBestPokemonImageUrl } from '@/utils/pokemon'
import { draftSounds } from '@/lib/draft-sounds'
import {
  fadeInUpVariants,
  pulseVariants,
  useReducedMotion,
  REDUCED_MOTION_VARIANTS,
} from '@/lib/draft-animations'

interface AuctionNominationProps {
  selectedPokemon: Pokemon | null
  userTeam: {
    id: string
    name: string
    budgetRemaining: number
  } | null
  currentNominatingTeam: {
    id: string
    name: string
    draftOrder: number
  } | null
  canNominate: boolean
  onNominate: (
    pokemon: Pokemon,
    startingBid: number,
    duration: number
  ) => Promise<void>
  defaultAuctionDuration?: number
  className?: string
}

export default function AuctionNomination({
  selectedPokemon,
  userTeam,
  currentNominatingTeam,
  canNominate,
  onNominate,
  defaultAuctionDuration = 60,
  className,
}: AuctionNominationProps) {
  const [startingBid, setStartingBid] = useState('')
  const [auctionDuration, setAuctionDuration] = useState(
    defaultAuctionDuration.toString()
  )
  const [isNominating, setIsNominating] = useState(false)
  const reducedMotion = useReducedMotion()

  // Play your-turn sound when it becomes the user's turn
  useEffect(() => {
    if (canNominate) {
      draftSounds.play('your-turn')
    }
  }, [canNominate])

  // Auto-suggest starting bid based on Pokemon BST tier
  useEffect(() => {
    if (selectedPokemon && !startingBid) {
      const bst = selectedPokemon.stats.total
      let suggested = selectedPokemon.cost || 1
      // Suggest a slight premium for high-BST picks
      if (bst >= 580) suggested = Math.max(suggested, 8)
      else if (bst >= 500) suggested = Math.max(suggested, 5)
      else if (bst >= 450) suggested = Math.max(suggested, 3)
      setStartingBid(suggested.toString())
    }
  }, [selectedPokemon, startingBid])

  const handleNominate = async () => {
    if (!selectedPokemon || !canNominate || isNominating) return

    const bid = parseInt(startingBid) || 1
    const duration = parseInt(auctionDuration)

    try {
      setIsNominating(true)
      await onNominate(selectedPokemon, bid, duration)
      setStartingBid('')
    } catch (error) {
      log.error('Error nominating Pokemon:', error)
    } finally {
      setIsNominating(false)
    }
  }

  const getMinimumBid = () => {
    return selectedPokemon?.cost || 1
  }

  const isValidBid = () => {
    const bid = parseInt(startingBid)
    return !isNaN(bid) && bid >= getMinimumBid()
  }

  return (
    <Card className={cn('w-full bg-card border-border', className)}>
      <CardContent className="p-4 md:p-6 space-y-4">
        {/* Header with status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-bold text-foreground">Nominate</h3>
          </div>
          {canNominate ? (
            <Badge className="bg-emerald-600 text-white border-0">
              Your Turn
            </Badge>
          ) : currentNominatingTeam ? (
            <Badge
              variant="outline"
              className="border-border text-muted-foreground"
            >
              <Clock className="h-3 w-3 mr-1" />
              {currentNominatingTeam.name}&apos;s Turn
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-border text-muted-foreground"
            >
              Waiting
            </Badge>
          )}
        </div>

        {/* "Your Turn" banner */}
        <AnimatePresence>
          {canNominate && !selectedPokemon && (
            <motion.div
              variants={
                reducedMotion ? REDUCED_MOTION_VARIANTS : pulseVariants
              }
              initial="initial"
              animate="animate"
              exit="exit"
              className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 text-center"
            >
              <Gavel className="h-10 w-10 mx-auto mb-2 text-amber-400" />
              <h3 className="text-lg font-bold text-amber-300">
                Your Turn to Nominate!
              </h3>
              <p className="text-sm text-amber-400/70 mt-1">
                Select a Pokemon from the grid to put it up for auction
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waiting for other team */}
        {!canNominate && currentNominatingTeam && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Waiting for{' '}
              <span className="font-semibold text-amber-400">
                {currentNominatingTeam.name}
              </span>{' '}
              to nominate...
            </p>
          </div>
        )}

        {/* Selected Pokemon display */}
        <AnimatePresence mode="wait">
          {selectedPokemon && canNominate && (
            <motion.div
              key={selectedPokemon.id}
              variants={
                reducedMotion ? REDUCED_MOTION_VARIANTS : fadeInUpVariants
              }
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {/* Pokemon preview */}
              <div className="flex items-center gap-4 bg-muted rounded-xl p-3">
                <div className="w-20 h-20 rounded-xl bg-muted/80 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={getBestPokemonImageUrl(
                      selectedPokemon.id,
                      selectedPokemon.name
                    )}
                    alt={selectedPokemon.name}
                    className="w-16 h-16 object-contain"
                    loading="eager"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-foreground capitalize truncate">
                    {selectedPokemon.name}
                  </h4>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedPokemon.types.map((type) => (
                      <Badge
                        key={type.name}
                        className="text-xs px-2 py-0 text-white border-0"
                        style={{ backgroundColor: type.color }}
                      >
                        {type.name}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>Cost: ${selectedPokemon.cost}</span>
                    <span>BST: {selectedPokemon.stats.total}</span>
                  </div>
                </div>
              </div>

              {/* Auction settings */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Starting Bid
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={startingBid}
                      onChange={(e) => setStartingBid(e.target.value)}
                      placeholder={getMinimumBid().toString()}
                      min={getMinimumBid()}
                      max={userTeam?.budgetRemaining || 100}
                      className="pl-8 h-10 bg-background border-border text-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Min: ${getMinimumBid()} | Budget: $
                    {userTeam?.budgetRemaining || 0}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Duration
                  </label>
                  <Select
                    value={auctionDuration}
                    onValueChange={setAuctionDuration}
                  >
                    <SelectTrigger className="h-10 bg-background border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="45">45s</SelectItem>
                      <SelectItem value="60">1 min</SelectItem>
                      <SelectItem value="90">90s</SelectItem>
                      <SelectItem value="120">2 min</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Bidding time
                  </p>
                </div>
              </div>

              {/* Quick bid presets */}
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStartingBid(getMinimumBid().toString())
                  }
                  className="text-xs h-7 border-border bg-muted text-muted-foreground"
                >
                  Min (${getMinimumBid()})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStartingBid((getMinimumBid() + 2).toString())
                  }
                  className="text-xs h-7 border-border bg-muted text-muted-foreground"
                >
                  +$2
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStartingBid((getMinimumBid() + 5).toString())
                  }
                  className="text-xs h-7 border-border bg-muted text-muted-foreground"
                >
                  +$5
                </Button>
                {selectedPokemon.cost >= 10 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setStartingBid(
                        Math.ceil(selectedPokemon.cost * 1.5).toString()
                      )
                    }
                    className="text-xs h-7 border-border bg-muted text-muted-foreground"
                  >
                    1.5x (${Math.ceil(selectedPokemon.cost * 1.5)})
                  </Button>
                )}
              </div>

              {/* Nominate button */}
              <Button
                onClick={handleNominate}
                disabled={!canNominate || !isValidBid() || isNominating}
                className={cn(
                  'w-full h-12 text-base font-bold',
                  canNominate && isValidBid()
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isNominating ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    Nominating...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Start Auction for{' '}
                    <span className="capitalize">
                      {selectedPokemon.name}
                    </span>
                  </div>
                )}
              </Button>

              {/* Validation */}
              {canNominate && !isValidBid() && startingBid && (
                <div className="flex items-center gap-1 text-xs text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Starting bid must be at least ${getMinimumBid()}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* No Pokemon selected + can nominate */}
        {!selectedPokemon && canNominate && (
          <div className="text-center py-2 text-muted-foreground text-sm">
            Pick a Pokemon from the grid below
          </div>
        )}

        {/* User budget */}
        {userTeam && (
          <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 border border-border">
            <span className="text-xs font-medium text-muted-foreground">
              {userTeam.name} Budget
            </span>
            <span className="text-sm font-mono font-semibold text-foreground">
              ${userTeam.budgetRemaining}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
