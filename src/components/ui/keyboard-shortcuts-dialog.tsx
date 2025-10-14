'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Keyboard } from 'lucide-react'

interface Shortcut {
  keys: string[]
  description: string
  category: 'Navigation' | 'Draft' | 'General'
}

const shortcuts: Shortcut[] = [
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'General' },
  { keys: ['Esc'], description: 'Close dialogs', category: 'General' },
  { keys: ['Ctrl', 'K'], description: 'Focus search', category: 'Navigation' },
  { keys: ['G', 'H'], description: 'Go to home', category: 'Navigation' },
  { keys: ['G', 'D'], description: 'Go to drafts', category: 'Navigation' },
  { keys: ['C', 'D'], description: 'Create draft', category: 'Draft' },
  { keys: ['J', 'D'], description: 'Join draft', category: 'Draft' },
  { keys: ['Space'], description: 'Select Pokémon', category: 'Draft' },
  { keys: ['Enter'], description: 'Confirm selection', category: 'Draft' },
]

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show shortcuts dialog with ?
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setOpen(true)
      }

      // Close with Escape
      if (e.key === 'Escape') {
        setOpen(false)
      }

      // Navigation shortcuts
      if (e.key === 'g') {
        const nextKey = new Promise<string>((resolve) => {
          const handler = (e: KeyboardEvent) => {
            window.removeEventListener('keydown', handler)
            resolve(e.key)
          }
          window.addEventListener('keydown', handler)
        })

        nextKey.then((key) => {
          if (key === 'h') window.location.href = '/'
          if (key === 'd') window.location.href = '/watch-drafts'
        })
      }

      // Create draft shortcut
      if (e.key === 'c') {
        const nextKey = new Promise<string>((resolve) => {
          const handler = (e: KeyboardEvent) => {
            window.removeEventListener('keydown', handler)
            resolve(e.key)
          }
          window.addEventListener('keydown', handler)
        })

        nextKey.then((key) => {
          if (key === 'd') window.location.href = '/create-draft'
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)))

  return (
    <>
      {/* Keyboard shortcut indicator */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg hover:shadow-xl transition-all text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        title="Keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" />
        <span className="hidden sm:inline">Press</span>
        <Badge variant="outline" className="text-xs">?</Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Boost your productivity with these keyboard shortcuts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {shortcuts
                    .filter((s) => s.category === category)
                    .map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <span key={i} className="flex items-center">
                              <kbd className="px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded">
                                {key}
                              </kbd>
                              {i < shortcut.keys.length - 1 && (
                                <span className="mx-1 text-slate-400">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
