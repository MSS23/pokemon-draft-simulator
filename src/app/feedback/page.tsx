'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { Bug, Sparkles, Lightbulb, MessageSquare, Send, CheckCircle2, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const CATEGORIES = [
  { id: 'bug', label: 'Bug Report', description: 'Something is broken or not working as expected', icon: Bug, color: 'text-red-500 bg-red-500/10 border-red-500/20' },
  { id: 'feature', label: 'Feature Request', description: 'An idea for something new', icon: Sparkles, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  { id: 'improvement', label: 'Improvement', description: 'Something that could work better', icon: Lightbulb, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { id: 'other', label: 'Other', description: 'General feedback or question', icon: MessageSquare, color: 'text-muted-foreground bg-muted border-border' },
] as const

type Category = typeof CATEGORIES[number]['id']

export default function FeedbackPage() {
  const [category, setCategory] = useState<Category | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contact, setContact] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = category && title.trim().length >= 3 && description.trim().length >= 10

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || isSubmitting) return

    setIsSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title: title.trim(),
          description: description.trim(),
          contact: contact.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit')
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleReset() {
    setCategory(null)
    setTitle('')
    setDescription('')
    setContact('')
    setIsSubmitted(false)
    setError('')
  }

  if (isSubmitted) {
    return (
      <SidebarLayout>
        <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold">Thanks for your feedback!</h1>
          <p className="text-muted-foreground">
            Your {category === 'bug' ? 'bug report' : category === 'feature' ? 'feature request' : 'feedback'} has been submitted.
            We review every submission and use it to improve the platform.
          </p>
          <div className="flex gap-3 justify-center pt-4">
            <Button variant="outline" onClick={handleReset}>
              Submit Another
            </Button>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Send Feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Help us make Pokemon Draft better. Report bugs, request features, or suggest improvements.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">What kind of feedback?</label>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all duration-150',
                    category === cat.id
                      ? cat.color + ' border-current shadow-sm'
                      : 'border-border/60 hover:border-border hover:bg-muted/50'
                  )}
                >
                  <cat.icon className={cn('h-5 w-5 mt-0.5 shrink-0', category === cat.id ? '' : 'text-muted-foreground')} />
                  <div>
                    <p className="text-sm font-medium">{cat.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label htmlFor="feedback-title" className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              id="feedback-title"
              placeholder={
                category === 'bug' ? 'e.g., Pick not showing after confirming'
                : category === 'feature' ? 'e.g., Add team chat during draft'
                : category === 'improvement' ? 'e.g., Make timer more visible on mobile'
                : 'Brief summary of your feedback'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">{title.length}/200</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="feedback-desc" className="text-sm font-medium">
              Description <span className="text-destructive">*</span>
            </label>
            <textarea
              id="feedback-desc"
              placeholder={
                category === 'bug'
                  ? 'What happened? What did you expect? Steps to reproduce...'
                  : 'Describe your idea or feedback in detail...'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              required
              rows={5}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">{description.length}/2000</p>
          </div>

          {/* Contact (optional) */}
          <div className="space-y-2">
            <label htmlFor="feedback-contact" className="text-sm font-medium">
              Discord / Email <Badge variant="secondary" className="ml-2 text-[10px]">Optional</Badge>
            </label>
            <Input
              id="feedback-contact"
              placeholder="So we can follow up if needed"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={100}
              className="h-11"
            />
          </div>

          {/* Error */}
          {error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-4">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            size="lg"
            className="w-full rounded-xl font-semibold"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Feedback
              </>
            )}
          </Button>
        </form>
      </div>
    </SidebarLayout>
  )
}
