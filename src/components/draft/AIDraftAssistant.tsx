'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkles, TrendingUp, Shield, Zap, Target, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { generateAssistantAnalysis, type PickRecommendation, type AssistantAnalysis } from '@/lib/ai-draft-assistant'
import type { Pokemon, Team, Draft, Format } from '@/types'

interface AIDraftAssistantProps {
  availablePokemon: Pokemon[]
  currentTeam: Pokemon[]
  opponentTeams: Team[]
  remainingBudget: number
  remainingPicks: number
  format: Format
  onSelectPokemon?: (pokemon: Pokemon) => void
  isYourTurn?: boolean
}

export function AIDraftAssistant({
  availablePokemon,
  currentTeam,
  opponentTeams,
  remainingBudget,
  remainingPicks,
  format,
  onSelectPokemon,
  isYourTurn = false,
}: AIDraftAssistantProps) {
  const [analysis, setAnalysis] = useState<AssistantAnalysis | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const isAnalyzingRef = useRef(false)
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const analyzeNow = useCallback(() => {
    // Prevent overlapping analysis calls
    if (isAnalyzingRef.current) {
      return
    }

    // Clear any pending analysis
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
    }

    isAnalyzingRef.current = true
    setIsAnalyzing(true)

    analysisTimeoutRef.current = setTimeout(() => {
      const result = generateAssistantAnalysis(
        availablePokemon,
        currentTeam,
        opponentTeams,
        remainingBudget,
        remainingPicks,
        format
      )
      setAnalysis(result)
      setIsAnalyzing(false)
      isAnalyzingRef.current = false
    }, 500)
  }, [
    availablePokemon.length,
    currentTeam.length,
    opponentTeams.length,
    remainingBudget,
    remainingPicks,
    format.id
  ])

  useEffect(() => {
    if (availablePokemon.length > 0 && isYourTurn && !isAnalyzingRef.current) {
      analyzeNow()
    }

    // Cleanup timeout on unmount
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Note: analyzeNow is intentionally omitted to prevent infinite re-render loop
    // The callback is recreated when its dependencies change (via useCallback deps),
    // which triggers re-analysis through availablePokemon.length changes
  }, [availablePokemon.length, isYourTurn])

  if (!isExpanded) {
    return (
      <Card className="border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-blue-500/10">
        <CardHeader className="cursor-pointer py-3" onClick={() => setIsExpanded(true)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-base">AI Draft Assistant</CardTitle>
            </div>
            <ChevronDown className="h-4 w-4" />
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-blue-500/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            <div>
              <CardTitle>AI Draft Assistant</CardTitle>
              <CardDescription>
                Intelligent pick recommendations powered by advanced analysis
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!analysis && (
          <Button
            onClick={analyzeNow}
            disabled={isAnalyzing}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isAnalyzing ? 'Analyzing...' : 'Analyze Draft Situation'}
          </Button>
        )}

        {analysis && (
          <Tabs defaultValue="recommendations" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="recommendations">
                <Sparkles className="mr-1 h-3 w-3" />
                Picks
              </TabsTrigger>
              <TabsTrigger value="needs">
                <Target className="mr-1 h-3 w-3" />
                Needs
              </TabsTrigger>
              <TabsTrigger value="opponents">
                <Shield className="mr-1 h-3 w-3" />
                Counter
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recommendations" className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Top {analysis.recommendations.length} Recommendations
                </span>
                <Button variant="ghost" size="sm" onClick={analyzeNow}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  Refresh
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {analysis.recommendations.map((rec, index) => (
                    <RecommendationCard
                      key={rec.pokemon.name}
                      recommendation={rec}
                      rank={index + 1}
                      onSelect={() => onSelectPokemon?.(rec.pokemon)}
                      isYourTurn={isYourTurn}
                    />
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="needs" className="space-y-4">
              <TeamNeeds analysis={analysis} />
            </TabsContent>

            <TabsContent value="opponents" className="space-y-4">
              <OpponentAnalysis analysis={analysis} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

function RecommendationCard({
  recommendation,
  rank,
  onSelect,
  isYourTurn,
}: {
  recommendation: PickRecommendation
  rank: number
  onSelect: () => void
  isYourTurn: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const { pokemon, score, reasoning, tags } = recommendation

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-blue-500'
    if (score >= 40) return 'text-yellow-500'
    return 'text-gray-500'
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500">Best Pick</Badge>
    if (rank <= 3) return <Badge className="bg-blue-500">Top {rank}</Badge>
    return <Badge variant="secondary">#{rank}</Badge>
  }

  return (
    <Card className="hover:border-purple-500/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <img
              src={pokemon.sprite}
              alt={pokemon.name}
              className="w-16 h-16 object-contain"
            />
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{pokemon.name}</h4>
                  {getRankBadge(rank)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {pokemon.types.map(type => (
                    <Badge key={typeof type === 'string' ? type : type.name} variant="outline" className="text-xs">
                      {typeof type === 'string' ? type : type.name}
                    </Badge>
                  ))}
                  <span className="text-sm text-muted-foreground">
                    Cost: {pokemon.cost || 0}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
                  {score}
                </div>
                <div className="text-xs text-muted-foreground">Score</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">{reasoning.primary}</p>

            {!expanded && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(true)}
                className="text-xs"
              >
                Show Details
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            )}

            {expanded && (
              <>
                <div className="space-y-2 pt-2">
                  <FactorBar
                    label="Type Coverage"
                    value={reasoning.factors.typeCoverage}
                    icon={<Shield className="h-3 w-3" />}
                  />
                  <FactorBar
                    label="Budget Value"
                    value={reasoning.factors.budgetValue}
                    icon={<TrendingUp className="h-3 w-3" />}
                  />
                  <FactorBar
                    label="Stat Balance"
                    value={reasoning.factors.statBalance}
                    icon={<Zap className="h-3 w-3" />}
                  />
                  <FactorBar
                    label="Team Synergy"
                    value={reasoning.factors.synergy}
                    icon={<Sparkles className="h-3 w-3" />}
                  />
                  <FactorBar
                    label="Counter Picks"
                    value={reasoning.factors.counterPicks}
                    icon={<Target className="h-3 w-3" />}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(false)}
                  className="text-xs"
                >
                  Hide Details
                  <ChevronUp className="ml-1 h-3 w-3" />
                </Button>
              </>
            )}

            {isYourTurn && (
              <Button
                onClick={onSelect}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                size="sm"
              >
                <Sparkles className="mr-2 h-3 w-3" />
                Pick {pokemon.name}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FactorBar({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  const getColor = (value: number) => {
    if (value >= 70) return 'bg-green-500'
    if (value >= 50) return 'bg-blue-500'
    if (value >= 30) return 'bg-yellow-500'
    return 'bg-gray-500'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-semibold">{value}/100</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(value)} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

function TeamNeeds({ analysis }: { analysis: AssistantAnalysis }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Target className="h-4 w-4" />
          Budget Strategy
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining Budget:</span>
            <span className="font-semibold">{analysis.budgetStrategy.remainingBudget}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining Picks:</span>
            <span className="font-semibold">{analysis.budgetStrategy.remainingPicks}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Suggested Per Pick:</span>
            <span className="font-semibold">
              ~{Math.round(analysis.budgetStrategy.suggestedBudgetPerPick)}
            </span>
          </div>
          {analysis.budgetStrategy.canAffordExpensive && (
            <Badge className="bg-green-500 w-full justify-center">
              Can afford high-cost Pokemon
            </Badge>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Missing Roles
        </h4>
        <div className="flex flex-wrap gap-2">
          {analysis.teamNeeds.roleGaps.length > 0 ? (
            analysis.teamNeeds.roleGaps.map(role => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">All roles covered!</span>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Stat Gaps
        </h4>
        <div className="space-y-2">
          {analysis.teamNeeds.statGaps.length > 0 ? (
            analysis.teamNeeds.statGaps.map(gap => (
              <div key={gap.stat} className="flex items-center justify-between text-sm">
                <span className="capitalize">{gap.stat.replace('_', ' ')}</span>
                <Badge
                  variant={
                    gap.priority === 'high'
                      ? 'destructive'
                      : gap.priority === 'medium'
                        ? 'default'
                        : 'secondary'
                  }
                >
                  {gap.priority} priority
                </Badge>
              </div>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Well-balanced stats!</span>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Needed Type Coverage</h4>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Offensive:</div>
            <div className="flex flex-wrap gap-1">
              {analysis.teamNeeds.offensiveTypes.slice(0, 3).map(type => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Defensive:</div>
            <div className="flex flex-wrap gap-1">
              {analysis.teamNeeds.defensiveTypes.slice(0, 3).map(type => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OpponentAnalysis({ analysis }: { analysis: AssistantAnalysis }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Target className="h-4 w-4" />
          Common Opponent Weaknesses
        </h4>
        <div className="flex flex-wrap gap-2">
          {analysis.opponentAnalysis.commonWeaknesses.length > 0 ? (
            analysis.opponentAnalysis.commonWeaknesses.map(type => (
              <Badge key={type} className="bg-green-500">
                {type}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              Not enough opponent data yet
            </span>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Suggested Counter Types
        </h4>
        <div className="flex flex-wrap gap-2">
          {analysis.opponentAnalysis.suggectedCounters.map(type => (
            <Badge key={type} variant="outline">
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Top Threats</h4>
        <div className="space-y-2">
          {analysis.opponentAnalysis.threatPokemon.length > 0 ? (
            analysis.opponentAnalysis.threatPokemon.map((threat, index) => (
              <div
                key={threat.name}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {index + 1}. {threat.name}
                </span>
                <div className="flex items-center gap-2">
                  <Progress value={threat.threat} className="w-20" />
                  <span className="text-xs text-muted-foreground w-8">
                    {threat.threat}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              No significant threats identified yet
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
