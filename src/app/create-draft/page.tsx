'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Users, Clock, Zap, Trophy, Shield, Info, Eye, Tag } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useNotify } from '@/components/providers/NotificationProvider'
import { POKEMON_FORMATS, getFormatById, getPopularFormats, DEFAULT_FORMAT } from '@/lib/formats'
// import { generateRoomCode } from '@/lib/room-utils'
import { useHydrationFix } from '@/lib/hydration-fix'
import CSVUpload from '@/components/draft/CSVUpload'
import type { ParsedCSVResult } from '@/lib/csv-parser'

export default function CreateDraftPage() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const notify = useNotify()
  const [formData, setFormData] = useState({
    userName: '',
    teamName: '',
    maxTeams: '4',
    draftType: 'snake',
    timeLimit: '60',
    pokemonPerTeam: '6',
    formatId: DEFAULT_FORMAT,
    isPublic: false,
    description: '',
    tags: '',
    useCustomFormat: false
  })

  const [customPricing, setCustomPricing] = useState<Record<string, number> | null>(null)
  const [customPricingStats, setCustomPricingStats] = useState<ParsedCSVResult['stats'] | null>(null)

  // Apply hydration fix for browser extensions
  useHydrationFix()

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Room code generation moved to centralized utility

  const formatTimeLimit = (seconds: string): string => {
    const time = parseInt(seconds)
    if (time === 0) return 'No limit'
    if (time < 60) return `${time}s`
    if (time < 3600) return `${Math.floor(time / 60)}m`
    return `${Math.floor(time / 3600)}h`
  }

  const selectedFormat = getFormatById(formData.formatId)
  const popularFormats = getPopularFormats()

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'vgc': return '🏆'
      case 'smogon': return '⚔️'
      case 'custom': return '🎯'
      default: return '📋'
    }
  }

  const getDifficultyColor = (complexity: number) => {
    if (complexity <= 2) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    if (complexity <= 3) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }

  const handleCreateDraft = async () => {
    if (!formData.userName.trim() || !formData.teamName.trim()) {
      notify.warning('Missing Information', 'Please enter both your name and team name')
      return
    }

    if (formData.useCustomFormat && !customPricing) {
      notify.warning('Missing Custom Pricing', 'Please upload a CSV file with custom Pokemon pricing')
      return
    }

    setIsCreating(true)
    try {
      const { DraftService } = await import('@/lib/draft-service')

      const { roomCode } = await DraftService.createDraft({
        name: `${formData.userName}'s Draft`,
        hostName: formData.userName,
        teamName: formData.teamName,
        settings: {
          maxTeams: parseInt(formData.maxTeams),
          draftType: formData.draftType as 'snake' | 'auction',
          timeLimit: parseInt(formData.timeLimit),
          pokemonPerTeam: parseInt(formData.pokemonPerTeam),
          budgetPerTeam: formData.draftType === 'auction' ? 100 : undefined,
          formatId: formData.useCustomFormat ? 'custom' : formData.formatId
        },
        isPublic: formData.isPublic,
        description: formData.description || null,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        customFormat: formData.useCustomFormat && customPricing ? {
          name: `${formData.userName}'s Custom Format`,
          description: formData.description || 'Custom Pokemon pricing format',
          pokemonPricing: customPricing
        } : undefined
      })

      notify.success('Draft Created!', `Room ${roomCode} is ready for players`)
      router.push(`/draft/${roomCode.toLowerCase()}?userName=${encodeURIComponent(formData.userName)}&teamName=${encodeURIComponent(formData.teamName)}&isHost=true`)
    } catch (error) {
      console.error('Failed to create draft:', error)
      notify.error(
        'Failed to Create Draft',
        error instanceof Error ? error.message : 'Failed to create draft room. Please try again.'
      )
    } finally {
      setIsCreating(false)
    }
  }

  const isFormValid = formData.userName.trim() && formData.teamName.trim()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="relative text-center mb-8">
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
            Create Draft Room
          </h1>
          <p className="text-lg text-slate-700 dark:text-slate-300 mb-6">
            Set up a multiplayer Pokémon draft for your team
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-xl border-0">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-slate-800 dark:text-slate-100">
                Draft Configuration
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Configure your draft settings and create a room for teams to join
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* User Identity */}
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Your Identity
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="userName" className="text-sm font-medium">
                      Your Name
                    </Label>
                    <Input
                      id="userName"
                      placeholder="Enter your name"
                      value={formData.userName}
                      onChange={(e) => handleInputChange('userName', e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teamName" className="text-sm font-medium">
                      Team Name
                    </Label>
                    <Input
                      id="teamName"
                      placeholder="Enter team name"
                      value={formData.teamName}
                      onChange={(e) => handleInputChange('teamName', e.target.value)}
                      className="bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Draft Settings */}
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Draft Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxTeams" className="text-sm font-medium">
                      Number of Teams
                    </Label>
                    <Select value={formData.maxTeams} onValueChange={(value) => handleInputChange('maxTeams', value)}>
                      <SelectTrigger className="bg-white dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 Teams</SelectItem>
                        <SelectItem value="4">4 Teams</SelectItem>
                        <SelectItem value="6">6 Teams</SelectItem>
                        <SelectItem value="8">8 Teams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="draftType" className="text-sm font-medium">
                      Draft Format
                    </Label>
                    <Select value={formData.draftType} onValueChange={(value) => handleInputChange('draftType', value)}>
                      <SelectTrigger className="bg-white dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="snake">Snake Draft</SelectItem>
                        <SelectItem value="auction">Auction Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Format/Ruleset Selection */}
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Pokemon Format & Rules
                </h3>

                <div className="space-y-3">
                  {/* Toggle for custom format */}
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
                    <input
                      type="checkbox"
                      id="useCustomFormat"
                      checked={formData.useCustomFormat}
                      onChange={(e) => handleInputChange('useCustomFormat', e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <Label htmlFor="useCustomFormat" className="text-sm font-medium cursor-pointer">
                        Use Custom Pricing (CSV)
                      </Label>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Upload your own Pokemon pricing instead of using a preset format
                      </p>
                    </div>
                  </div>

                  {/* Show CSV upload if custom format is selected */}
                  {formData.useCustomFormat ? (
                    <CSVUpload
                      onPricingParsed={(pricing, stats) => {
                        setCustomPricing(pricing)
                        setCustomPricingStats(stats)
                      }}
                      onClear={() => {
                        setCustomPricing(null)
                        setCustomPricingStats(null)
                      }}
                    />
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="format" className="text-sm font-medium">
                          Competitive Format
                        </Label>
                        <Select value={formData.formatId} onValueChange={(value) => handleInputChange('formatId', value)}>
                          <SelectTrigger className="bg-white dark:bg-slate-800">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-2 text-xs text-slate-600 dark:text-slate-400 border-b">
                              Popular Formats
                            </div>
                            {popularFormats.map((format) => (
                              <SelectItem key={format.id} value={format.id}>
                                <div className="flex items-center gap-2">
                                  <span>{getCategoryIcon(format.category)}</span>
                                  <span>{format.shortName}</span>
                                  {format.meta.isOfficial && (
                                    <Badge variant="outline" className="text-xs">Official</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                            <div className="p-2 text-xs text-slate-600 dark:text-slate-400 border-b border-t">
                              All Formats
                            </div>
                            {POKEMON_FORMATS.filter(f => !popularFormats.some(p => p.id === f.id)).map((format) => (
                              <SelectItem key={format.id} value={format.id}>
                                <div className="flex items-center gap-2">
                                  <span>{getCategoryIcon(format.category)}</span>
                                  <span>{format.shortName}</span>
                                  {format.meta.isOfficial && (
                                    <Badge variant="outline" className="text-xs">Official</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Format Information Display */}
                  {selectedFormat && !formData.useCustomFormat && (
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getCategoryIcon(selectedFormat.category)}</span>
                          <div>
                            <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                              {selectedFormat.name}
                            </h4>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Generation {selectedFormat.generation} • {selectedFormat.gameType}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {selectedFormat.meta.isOfficial && (
                            <Badge variant="outline" className="text-xs">
                              Official
                            </Badge>
                          )}
                          <Badge className={`text-xs ${getDifficultyColor(selectedFormat.meta.complexity)}`}>
                            {selectedFormat.meta.complexity <= 2 ? 'Simple' :
                             selectedFormat.meta.complexity <= 3 ? 'Medium' : 'Complex'}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 mb-3">
                        {selectedFormat.description}
                      </p>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                          <Info className="h-3 w-3" />
                          <span>Cost: {selectedFormat.costConfig.minCost}-{selectedFormat.costConfig.maxCost}</span>
                        </div>
                        {selectedFormat.ruleset.legendaryPolicy === 'banned' && (
                          <div className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                            No Legendaries
                          </div>
                        )}
                        {selectedFormat.ruleset.mythicalPolicy === 'banned' && (
                          <div className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                            No Mythicals
                          </div>
                        )}
                        {selectedFormat.ruleset.paradoxPolicy === 'banned' && (
                          <div className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                            No Paradox
                          </div>
                        )}
                        {selectedFormat.ruleset.bannedTiers.length > 0 && (
                          <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 rounded">
                            Bans: {selectedFormat.ruleset.bannedTiers.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Spectator Mode */}
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Spectator Mode
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={formData.isPublic}
                      onChange={(e) => handleInputChange('isPublic', e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <Label htmlFor="isPublic" className="text-sm font-medium cursor-pointer">
                        Make this draft public
                      </Label>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Allow anyone to watch this draft in real-time as a spectator. They won&apos;t be able to participate, only observe.
                      </p>
                    </div>
                  </div>

                  {formData.isPublic && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium">
                          Description (Optional)
                        </Label>
                        <textarea
                          id="description"
                          placeholder="Describe your draft (e.g., 'High-level VGC tournament draft')"
                          value={formData.description}
                          onChange={(e) => handleInputChange('description', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tags" className="text-sm font-medium flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          Tags (Optional)
                        </Label>
                        <Input
                          id="tags"
                          placeholder="e.g., tournament, competitive, casual (comma-separated)"
                          value={formData.tags}
                          onChange={(e) => handleInputChange('tags', e.target.value)}
                          className="bg-white dark:bg-slate-800"
                        />
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Separate tags with commas to help others find your draft
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Time Settings */}
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Time Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeLimit" className="text-sm font-medium">
                      Pick Time Limit
                    </Label>
                    <Select value={formData.timeLimit} onValueChange={(value) => handleInputChange('timeLimit', value)}>
                      <SelectTrigger className="bg-white dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 seconds</SelectItem>
                        <SelectItem value="60">1 minute</SelectItem>
                        <SelectItem value="90">90 seconds</SelectItem>
                        <SelectItem value="120">2 minutes</SelectItem>
                        <SelectItem value="300">5 minutes</SelectItem>
                        <SelectItem value="600">10 minutes</SelectItem>
                        <SelectItem value="1800">30 minutes</SelectItem>
                        <SelectItem value="3600">1 hour</SelectItem>
                        <SelectItem value="7200">2 hours</SelectItem>
                        <SelectItem value="14400">4 hours</SelectItem>
                        <SelectItem value="0">No limit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pokemonPerTeam" className="text-sm font-medium">
                      Pokémon per Team
                    </Label>
                    <Select value={formData.pokemonPerTeam} onValueChange={(value) => handleInputChange('pokemonPerTeam', value)}>
                      <SelectTrigger className="bg-white dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 Pokémon</SelectItem>
                        <SelectItem value="6">6 Pokémon</SelectItem>
                        <SelectItem value="9">9 Pokémon</SelectItem>
                        <SelectItem value="12">12 Pokémon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-700 dark:to-slate-600 rounded-lg">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">
                  Draft Summary
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {formData.maxTeams} teams
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {formData.draftType === 'snake' ? 'Snake' : 'Auction'} format
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeLimit(formData.timeLimit)} per pick
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    {formData.pokemonPerTeam} Pokémon each
                  </Badge>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDraft}
                disabled={!isFormValid || isCreating}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {isCreating ? 'Creating...' : 'Create Draft Room'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}