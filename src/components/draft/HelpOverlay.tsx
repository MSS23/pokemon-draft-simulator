'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  Heart,
  History,
  Zap,
  Keyboard,
  Info,
  ChevronRight,
  ChevronLeft,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface HelpOverlayProps {
  isOpen: boolean
  onClose: () => void
}

interface TutorialStep {
  icon: React.ReactNode
  title: string
  description: string
  tips?: string[]
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: <Search className="h-8 w-8 text-blue-500" />,
    title: 'Search Pokemon',
    description: 'Use the search bar to filter Pokemon by name, type, or ability. The grid updates instantly as you type.',
    tips: [
      'Press Ctrl/Cmd + F to focus the search box',
      'Search by type (e.g., "fire", "dragon")',
      'Click any Pokemon card to see detailed stats'
    ]
  },
  {
    icon: <Heart className="h-8 w-8 text-red-500" />,
    title: 'Wishlist System',
    description: 'Add Pokemon to your wishlist to queue them for auto-pick. When your turn comes, the first available Pokemon on your wishlist will be selected automatically.',
    tips: [
      'Drag and drop to reorder wishlist priority',
      'Press Ctrl/Cmd + W to toggle wishlist view',
      'Wishlist items sync across all participants'
    ]
  },
  {
    icon: <History className="h-8 w-8 text-purple-500" />,
    title: 'Activity History',
    description: 'View all draft picks in real-time. Filter by all picks, your team, or opponents. See pick numbers, rounds, and timestamps.',
    tips: [
      'Press Ctrl/Cmd + H to toggle activity sidebar',
      'Click on any pick to see details',
      'Badge shows total pick count'
    ]
  },
  {
    icon: <Zap className="h-8 w-8 text-yellow-500" />,
    title: 'Your Turn',
    description: 'When it\'s your turn, a timer starts counting down. You\'ll receive notifications and the interface will highlight that it\'s your turn to pick.',
    tips: [
      'Turn indicator shows current drafter',
      'Timer shows seconds remaining',
      'Warning notifications at 10 seconds',
      'Press Space to auto-pick from wishlist'
    ]
  },
  {
    icon: <Keyboard className="h-8 w-8 text-green-500" />,
    title: 'Keyboard Shortcuts',
    description: 'Speed up your drafting with keyboard shortcuts. All major actions have keyboard equivalents for faster navigation.',
    tips: [
      'Ctrl/Cmd + F: Focus search',
      'Ctrl/Cmd + W: Toggle wishlist',
      'Ctrl/Cmd + H: Toggle history',
      'Escape: Close modals',
      'Space: Auto-pick (on your turn)',
      'Ctrl/Cmd + ?: Show this help'
    ]
  },
  {
    icon: <Info className="h-8 w-8 text-blue-500" />,
    title: 'Tips & Best Practices',
    description: 'Make the most of your draft experience with these pro tips.',
    tips: [
      'Set up your wishlist before the draft starts',
      'Keep an eye on your budget remaining',
      'Watch the activity feed for opponent picks',
      'Use team analysis to spot weaknesses',
      'Check type coverage before finalizing picks',
      'Enable browser notifications for turn alerts'
    ]
  }
]

/**
 * HelpOverlay - Interactive tutorial for draft interface
 *
 * Features:
 * - Step-by-step guide
 * - Keyboard shortcuts reference
 * - Tips and best practices
 * - Navigation controls
 */
export default function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleClose = () => {
    setCurrentStep(0)
    onClose()
  }

  const step = TUTORIAL_STEPS[currentStep]

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Draft Guide & Tutorial
          </DialogTitle>
          <DialogDescription>
            Learn how to use the draft interface effectively
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Progress Indicator */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {TUTORIAL_STEPS.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      index === currentStep
                        ? 'bg-blue-500 w-8'
                        : index < currentStep
                        ? 'bg-green-500'
                        : 'bg-slate-300 dark:bg-slate-700'
                    )}
                    aria-label={`Go to step ${index + 1}`}
                  />
                ))}
              </div>
              <Badge variant="outline">
                Step {currentStep + 1} of {TUTORIAL_STEPS.length}
              </Badge>
            </div>

            {/* Current Step */}
            <Card className="border-2 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                      {step.title}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      {step.description}
                    </p>
                  </div>
                </div>

                {step.tips && step.tips.length > 0 && (
                  <div className="space-y-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-2">
                      Tips:
                    </h4>
                    {step.tips.map((tip, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* All Steps Overview */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Quick Navigation:
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {TUTORIAL_STEPS.map((tutorialStep, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left transition-all hover:shadow-md',
                      index === currentStep
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-shrink-0">
                        {tutorialStep.icon}
                      </div>
                      <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                        {tutorialStep.title}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <Button variant="ghost" onClick={handleClose}>
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>

          {currentStep < TUTORIAL_STEPS.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleClose} variant="default">
              Got it!
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
