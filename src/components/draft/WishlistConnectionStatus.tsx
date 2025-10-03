'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, AlertTriangle, CheckCircle } from 'lucide-react'

interface WishlistConnectionStatusProps {
  isConnected: boolean
  className?: string
  showLabel?: boolean
}

export default function WishlistConnectionStatus({
  isConnected,
  className,
  showLabel = false
}: WishlistConnectionStatusProps) {
  const getStatusIcon = () => {
    if (isConnected) {
      return <CheckCircle className="h-3 w-3" />
    } else {
      return <WifiOff className="h-3 w-3" />
    }
  }

  const getStatusColor = () => {
    if (isConnected) {
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700"
    } else {
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700"
    }
  }

  const getStatusText = () => {
    if (isConnected) {
      return showLabel ? "Synced" : ""
    } else {
      return showLabel ? "Offline" : ""
    }
  }

  const getTitle = () => {
    if (isConnected) {
      return "Real-time sync active - changes will appear instantly"
    } else {
      return "Connection lost - some changes may not sync immediately"
    }
  }

  return (
    <Badge
      className={cn(
        "flex items-center gap-1 text-xs font-medium transition-all duration-300",
        getStatusColor(),
        !isConnected && "animate-pulse",
        className
      )}
      title={getTitle()}
    >
      {getStatusIcon()}
      {showLabel && (
        <span className="font-medium">
          {getStatusText()}
        </span>
      )}
    </Badge>
  )
}