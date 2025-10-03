'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Activity, 
  Database, 
  Zap, 
  AlertTriangle, 
  CheckCircle, 
  BarChart3,
  RefreshCw,
  Trash2,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCachePerformanceMonitor } from '@/hooks/useEnhancedPokemonCache'

interface CachePerformanceDashboardProps {
  isVisible?: boolean
  onToggle?: () => void
  className?: string
}

export default function CachePerformanceDashboard({
  isVisible = false,
  onToggle,
  className
}: CachePerformanceDashboardProps) {
  const {
    cacheStats,
    healthMetrics,
    getCacheHealth,
    performanceLog,
    getAverageResponseTime,
    getSuccessRate,
    clearPerformanceLog,
    clearCache,
    optimizeCache
  } = useCachePerformanceMonitor()

  const [showDetails, setShowDetails] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Auto refresh stats
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      // Trigger re-render to get fresh stats
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const cacheHealth = getCacheHealth()
  const avgResponseTime = getAverageResponseTime()
  const successRate = getSuccessRate()

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'text-green-600 bg-green-100'
      case 'degraded':
        return 'text-yellow-600 bg-yellow-100'
      case 'critical':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="relative"
        title="Show Cache Performance Dashboard"
      >
        <Database className="h-4 w-4" />
        <Badge 
          variant={cacheHealth === 'healthy' ? 'default' : 'destructive'}
          className="absolute -top-2 -right-2 h-3 w-3 p-0"
        />
      </Button>
    )
  }

  return (
    <Card className={cn('w-full max-w-4xl', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-blue-600" />
            Cache Performance Dashboard
            <Badge className={cn('text-xs', getHealthColor(cacheHealth))}>
              {cacheHealth.toUpperCase()}
            </Badge>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs"
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', autoRefresh && 'animate-spin')} />
              Auto Refresh
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs"
            >
              {showDetails ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              Details
            </Button>

            {onToggle && (
              <Button variant="ghost" size="sm" onClick={onToggle}>
                ✕
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Hit Rate</span>
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {(cacheStats.hitRate * 100).toFixed(1)}%
            </div>
            <Progress value={cacheStats.hitRate * 100} className="mt-2 h-2" />
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">Success Rate</span>
            </div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {(successRate * 100).toFixed(1)}%
            </div>
            <Progress value={successRate * 100} className="mt-2 h-2" />
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-800 dark:text-purple-200">Avg Response</span>
            </div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {formatDuration(avgResponseTime)}
            </div>
            <div className="text-xs text-purple-600 mt-1">
              {avgResponseTime < 100 ? 'Excellent' : avgResponseTime < 500 ? 'Good' : 'Slow'}
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-800 dark:text-orange-200">Memory Usage</span>
            </div>
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
              {formatBytes(cacheStats.memoryUsage)}
            </div>
            <Progress value={healthMetrics.memoryUsage * 100} className="mt-2 h-2" />
          </div>
        </div>

        {/* Cache Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cache Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Total Entries:</span>
                <span className="font-medium">{cacheStats.entries}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Cache Hits:</span>
                <span className="font-medium">{cacheStats.hits}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Cache Misses:</span>
                <span className="font-medium">{cacheStats.misses}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Background Refreshes:</span>
                <span className="font-medium">{healthMetrics.backgroundRefreshes}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Errors:</span>
                <span className={cn(
                  'font-medium',
                  healthMetrics.errors > 5 ? 'text-red-600' : 'text-green-600'
                )}>
                  {healthMetrics.errors}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Performance Log
                <Badge variant="outline" className="text-xs">
                  {performanceLog.length} entries
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {performanceLog.slice(-5).reverse().map((log, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="font-medium">{log.action}</span>
                      </div>
                      <div className="text-gray-500">
                        {formatDuration(log.duration)}
                      </div>
                    </div>
                  ))}
                  {performanceLog.length === 0 && (
                    <div className="text-gray-500 text-xs text-center py-4">
                      No performance data yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Cache Management Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            size="sm"
            onClick={optimizeCache}
            className="text-xs"
          >
            <Settings className="h-3 w-3 mr-1" />
            Optimize Cache
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={clearPerformanceLog}
            className="text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear Performance Log
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={clearCache}
            className="text-xs text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear Cache
          </Button>
        </div>

        {/* Detailed View */}
        {showDetails && (
          <Card className="bg-gray-50 dark:bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Detailed Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <h4 className="font-medium mb-2">Cache Operations</h4>
                  <div className="space-y-1">
                    <div>Fetch: {formatDuration(getAverageResponseTime('fetch'))}</div>
                    <div>Store: {formatDuration(getAverageResponseTime('store'))}</div>
                    <div>Evict: {formatDuration(getAverageResponseTime('evict'))}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Health Indicators</h4>
                  <div className="space-y-1">
                    <div>Staleness Rate: {(healthMetrics.stalenessRate * 100).toFixed(1)}%</div>
                    <div>Memory Efficiency: {((1 - healthMetrics.memoryUsage) * 100).toFixed(1)}%</div>
                    <div>Error Rate: {((healthMetrics.errors / (cacheStats.hits + cacheStats.misses || 1)) * 100).toFixed(2)}%</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Recommendations</h4>
                  <div className="space-y-1 text-gray-600 dark:text-gray-400">
                    {cacheStats.hitRate < 0.7 && <div>• Consider preloading popular items</div>}
                    {healthMetrics.memoryUsage > 0.8 && <div>• Memory usage high, consider cleanup</div>}
                    {healthMetrics.errors > 5 && <div>• Error rate elevated, check network</div>}
                    {avgResponseTime > 500 && <div>• Response time slow, optimize queries</div>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}
