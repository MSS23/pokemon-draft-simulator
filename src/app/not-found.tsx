import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <p className="text-6xl font-bold text-muted-foreground/30">404</p>
          <h1 className="text-2xl font-black tracking-tight">Page not found</h1>
          <p className="text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Home
            </Link>
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/join-draft">
              <Search className="h-4 w-4" />
              Join a Draft
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
