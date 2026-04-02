'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { SignIn } from '@clerk/nextjs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  redirectTo?: string
}

export function AuthModal({ isOpen, onClose, redirectTo }: AuthModalProps) {
  const router = useRouter()
  const { user } = useAuth()

  // Auto-close and redirect when user becomes authenticated
  useEffect(() => {
    if (user && isOpen) {
      onClose()

      if (redirectTo) {
        router.push(redirectTo)
        router.refresh()
      }
    }
  }, [user, isOpen, onClose, redirectTo, router])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Welcome back
          </DialogTitle>
          <DialogDescription className="text-center">
            Sign in to your Pokemon Draft League account
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center mt-4">
          <SignIn
            routing="hash"
            fallbackRedirectUrl={redirectTo || '/dashboard'}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
