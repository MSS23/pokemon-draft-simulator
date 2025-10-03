'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pokemon } from '@/types'
import { Gavel, Clock, DollarSign, Zap, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import PokemonCard from '@/components/pokemon/PokemonCard'

interface AuctionNominationProps {
  selectedPokemon: Pokemon | null
  userTeam: {
    id: string
    name: string
    budgetRemaining: number
  } | null
  canNominate: boolean
  onNominate: (pokemon: Pokemon, startingBid: number, duration: number) => Promise<void>
  className?: string
}

export default function AuctionNomination({
  selectedPokemon,
  userTeam,
  canNominate,
  onNominate,
  className
}: AuctionNominationProps) {
  const [startingBid, setStartingBid] = useState('')
  const [auctionDuration, setAuctionDuration] = useState('60')
  const [isNominating, setIsNominating] = useState(false)

  const handleNominate = async () => {
    if (!selectedPokemon || !canNominate || isNominating) return

    const bid = parseInt(startingBid) || 1
    const duration = parseInt(auctionDuration)

    try {
      setIsNominating(true)
      await onNominate(selectedPokemon, bid, duration)
      setStartingBid('')
    } catch (error) {
      console.error('Error nominating Pokemon:', error)
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
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-orange-600" />
          Nominate for Auction
          {canNominate ? (
            <Badge variant="default" className="bg-green-600">
              Ready
            </Badge>
          ) : (
            <Badge variant="outline">
              Waiting
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Selected Pokemon display */}
        {selectedPokemon ? (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-shrink-0">
                <PokemonCard
                  pokemon={selectedPokemon}
                  size="sm"
                  showCost={true}
                  showStats={false}
                  className="w-32"
                />
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                    {selectedPokemon.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>Base Cost: <strong>${selectedPokemon.cost}</strong></span>
                    <span>•</span>
                    <span>BST: <strong>{selectedPokemon.stats.total}</strong></span>
                  </div>
                </div>

                {/* Auction settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Starting Bid
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="number"
                        value={startingBid}
                        onChange={(e) => setStartingBid(e.target.value)}
                        placeholder={getMinimumBid().toString()}
                        min={getMinimumBid()}
                        max={userTeam?.budgetRemaining || 100}
                        className="pl-10"
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      Min: ${getMinimumBid()} | Budget: ${userTeam?.budgetRemaining || 0}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Auction Duration
                    </label>
                    <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 seconds</SelectItem>
                        <SelectItem value="45">45 seconds</SelectItem>
                        <SelectItem value="60">1 minute</SelectItem>
                        <SelectItem value="90">90 seconds</SelectItem>
                        <SelectItem value="120">2 minutes</SelectItem>
                        <SelectItem value="180">3 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Time for bidding
                    </div>
                  </div>
                </div>

                {/* Quick bid presets */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Quick Bid Presets
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStartingBid(getMinimumBid().toString())}
                      className="text-xs"
                    >
                      Min (${getMinimumBid()})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStartingBid((getMinimumBid() + 2).toString())}
                      className="text-xs"
                    >
                      +$2
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStartingBid((getMinimumBid() + 5).toString())}
                      className="text-xs"
                    >
                      +$5
                    </Button>
                    {selectedPokemon.cost >= 10 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStartingBid(Math.ceil(selectedPokemon.cost * 1.5).toString())}
                        className="text-xs"
                      >
                        1.5x Cost (${Math.ceil(selectedPokemon.cost * 1.5)})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Action button */}
                <div className="pt-2">
                  <Button
                    onClick={handleNominate}
                    disabled={!canNominate || !isValidBid() || isNominating}
                    className={cn(
                      'w-full',
                      canNominate && isValidBid()
                        ? 'bg-orange-600 hover:bg-orange-700'
                        : 'bg-gray-400'
                    )}
                  >
                    {isNominating ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Nominating...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Start Auction
                      </div>
                    )}
                  </Button>

                  {/* Validation messages */}
                  {!canNominate && (
                    <div className="flex items-center gap-1 text-xs text-red-600 mt-2">
                      <AlertCircle className="h-3 w-3" />
                      Cannot nominate at this time
                    </div>
                  )}
                  {canNominate && !isValidBid() && startingBid && (
                    <div className="flex items-center gap-1 text-xs text-red-600 mt-2">
                      <AlertCircle className="h-3 w-3" />
                      Starting bid must be at least ${getMinimumBid()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Nomination strategy tips */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                💡 Auction Strategy Tips
              </h4>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Higher starting bids can deter early bidders</li>
                <li>• Longer auctions allow more competitive bidding</li>
                <li>• Consider nominating Pokemon others want to drive up prices</li>
                <li>• Save your budget for Pokemon you really want</li>
              </ul>
            </div>
          </div>
        ) : (
          // No Pokemon selected
          <div className="text-center py-8">
            <Gavel className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Select a Pokémon to Nominate
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose a Pokémon from the grid below to start an auction
            </p>
          </div>
        )}

        {/* Team budget display */}
        {userTeam && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {userTeam.name} Budget
              </span>
              <Badge variant="outline" className="font-mono">
                ${userTeam.budgetRemaining}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}