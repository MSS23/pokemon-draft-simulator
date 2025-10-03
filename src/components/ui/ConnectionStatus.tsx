'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Signal,
  Activity,
  Info,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionManager } from '@/hooks/useConnectionManager'

interface ConnectionStatusProps {
  showDetails?: boolean
  className?: string
}

export default function ConnectionStatus({ 
  showDetails = false, 
  className 
}: ConnectionStatusProps) {
  const {
    connectionState,
    networkQuality,
    isOnline,
    isOffline,
    isReconnecting,
    isDegraded,
    forceReconnect,
    offlineQueueLength,
    isSlowConnection,
    shouldOptimizeForBandwidth
  } = useConnectionManager()

  const [showDetailedInfo, setShowDetailedInfo] = useState(showDetails)

  const getStatusIcon = () => {
    if (isOffline) return <WifiOff className="h-4 w-4" />
    if (isReconnecting) return <RefreshCw className="h-4 w-4 animate-spin" />
    if (isDegraded) return <AlertTriangle className="h-4 w-4" />
    return <Wifi className="h-4 w-4" />
  }

  const getStatusColor = () => {
    if (isOffline) return 'text-red-600 bg-red-100 border-red-200'
    if (isReconnecting) return 'text-yellow-600 bg-yellow-100 border-yellow-200'
    if (isDegraded) return 'text-orange-600 bg-orange-100 border-orange-200'
    return 'text-green-600 bg-green-100 border-green-200'
  }

  const getStatusText = () => {
    if (isOffline) return 'Offline'
    if (isReconnecting) return 'Reconnecting...'
    if (isDegraded) return 'Poor Connection'
    return 'Online'
  }

  const formatLatency = (latency: number | null) => {
    if (latency === null) return 'Unknown'
    if (latency < 50) return `${latency.toFixed(0)}ms (Excellent)`
    if (latency < 100) return `${latency.toFixed(0)}ms (Good)`
    if (latency < 200) return `${latency.toFixed(0)}ms (Fair)`
    return `${latency.toFixed(0)}ms (Poor)`
  }

  const getNetworkTypeDisplay = () => {
    if (!networkQuality?.effectiveType) return 'Unknown'
    
    const typeMap = {
      '4g': '4G',
      '3g': '3G', 
      '2g': '2G',
      'slow-2g': 'Slow 2G'
    }
    
    return typeMap[networkQuality.effectiveType] || networkQuality.effectiveType
  }

  const getSignalStrength = () => {
    if (!networkQuality?.downlink) return 0
    
    // Convert downlink (Mbps) to signal strength percentage
    if (networkQuality.downlink >= 10) return 100
    if (networkQuality.downlink >= 5) return 75
    if (networkQuality.downlink >= 1) return 50
    if (networkQuality.downlink >= 0.5) return 25
    return 10
  }

  // Simple status indicator
  if (!showDetailedInfo) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDetailedInfo(true)}
        className={cn('relative', className)}
        title={`Connection: ${getStatusText()}`}
      >
        <div className={cn('flex items-center gap-2', getStatusColor().split(' ')[0])}>
          {getStatusIcon()}
          <span className="text-xs font-medium hidden sm:inline">
            {getStatusText()}
          </span>
        </div>
        
        {offlineQueueLength > 0 && (
          <Badge 
            variant="secondary" 
            className="absolute -top-2 -right-2 h-5 w-5 text-xs p-0 flex items-center justify-center"
          >
            {offlineQueueLength}
          </Badge>
        )}
      </Button>
    )
  }

  // Detailed status card
  return (
    <Card className={cn('w-full max-w-md', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            {getStatusIcon()}
            Connection Status
            <Badge className={cn('text-xs', getStatusColor())}>
              {getStatusText()}
            </Badge>
          </CardTitle>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetailedInfo(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection Health */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Connection Health</span>
            <div className="flex items-center gap-2">
              {isOnline ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              )}
              <span className={cn(
                'font-medium',
                isOnline ? 'text-green-600' : 'text-red-600'
              )}>
                {connectionState.isSupabaseConnected ? 'Fully Connected' : 'Limited'}
              </span>
            </div>
          </div>
          
          {connectionState.latency !== null && (
            <div className="flex items-center justify-between text-sm">
              <span>Latency</span>
              <span className="font-medium">{formatLatency(connectionState.latency)}</span>
            </div>
          )}
          
          {connectionState.lastConnected && (
            <div className="flex items-center justify-between text-sm">
              <span>Last Connected</span>
              <span className="font-medium">
                {new Date(connectionState.lastConnected).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        {/* Network Quality */}
        {networkQuality && (
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Signal className="h-4 w-4" />
              Network Quality
            </h4>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Type</span>
                <span className="font-medium">{getNetworkTypeDisplay()}</span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span>Signal Strength</span>
                <div className="flex items-center gap-2">
                  <Progress value={getSignalStrength()} className="w-16 h-2" />
                  <span className="font-medium">{getSignalStrength()}%</span>
                </div>
              </div>
              
              {networkQuality.downlink && (
                <div className="flex items-center justify-between text-sm">
                  <span>Download Speed</span>
                  <span className="font-medium">{networkQuality.downlink} Mbps</span>
                </div>
              )}
              
              {networkQuality.rtt && (
                <div className="flex items-center justify-between text-sm">
                  <span>Round Trip Time</span>
                  <span className="font-medium">{networkQuality.rtt}ms</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Adaptive Features */}
        <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Adaptive Features
          </h4>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded',
              isSlowConnection ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
            )}>
              <div className={cn(
                'w-2 h-2 rounded-full',
                isSlowConnection ? 'bg-orange-500' : 'bg-green-500'
              )} />
              <span>{isSlowConnection ? 'Data Saver' : 'Full Quality'}</span>
            </div>
            
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded',
              shouldOptimizeForBandwidth ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
            )}>
              <div className={cn(
                'w-2 h-2 rounded-full',
                shouldOptimizeForBandwidth ? 'bg-blue-500' : 'bg-gray-500'
              )} />
              <span>{shouldOptimizeForBandwidth ? 'Optimized' : 'Standard'}</span>
            </div>
          </div>
        </div>

        {/* Offline Queue */}
        {offlineQueueLength > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Actions
            </h4>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2">
              <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
                <Info className="h-4 w-4" />
                <span>{offlineQueueLength} actions queued for sync</span>
              </div>
            </div>
          </div>
        )}

        {/* Retry Count */}
        {connectionState.retryCount > 0 && (
          <div className="text-center text-xs text-gray-500">
            Reconnection attempts: {connectionState.retryCount}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            size="sm"
            onClick={forceReconnect}
            disabled={isReconnecting}
            className="flex-1 text-xs"
          >
            {isReconnecting ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Reconnecting...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry Connection
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
