'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Shortcut {
  key: string
  description: string
  category: 'navigation' | 'action' | 'view'
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { key: 'Ctrl/Cmd + F', description: 'Focus search', category: 'navigation' },
  { key: 'Escape', description: 'Close modals', category: 'navigation' },

  // Views
  { key: 'Ctrl/Cmd + W', description: 'Toggle wishlist', category: 'view' },
  { key: 'Ctrl/Cmd + H', description: 'Toggle activity history', category: 'view' },
  { key: 'Ctrl/Cmd + ?', description: 'Show help', category: 'view' },

  // Actions
  { key: 'Space', description: 'Auto-pick from wishlist', category: 'action' }
]

interface KeyboardShortcutsCardProps {
  className?: string
  compact?: boolean
}

/**
 * KeyboardShortcutsCard - Quick reference for keyboard shortcuts
 *
 * Display as a card in the draft interface or in help documentation
 */
export default function KeyboardShortcutsCard({
  className,
  compact = false
}: KeyboardShortcutsCardProps) {
  if (compact) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Keyboard Shortcuts
            </span>
          </div>
          <div className="space-y-2">
            {SHORTCUTS.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-600 dark:text-slate-400">
                  {shortcut.description}
                </span>
                <Badge variant="outline" className="font-mono text-xs">
                  {shortcut.key}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const categories = {
    navigation: SHORTCUTS.filter(s => s.category === 'navigation'),
    view: SHORTCUTS.filter(s => s.category === 'view'),
    action: SHORTCUTS.filter(s => s.category === 'action')
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="h-5 w-5" />
          Keyboard Shortcuts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Navigation Shortcuts */}
        {categories.navigation.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Navigation
            </h4>
            <div className="space-y-2">
              {categories.navigation.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {shortcut.description}
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View Shortcuts */}
        {categories.view.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Views
            </h4>
            <div className="space-y-2">
              {categories.view.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {shortcut.description}
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Shortcuts */}
        {categories.action.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Actions
            </h4>
            <div className="space-y-2">
              {categories.action.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {shortcut.description}
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform Note */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Use <span className="font-semibold">Cmd</span> on Mac or{' '}
            <span className="font-semibold">Ctrl</span> on Windows/Linux
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
