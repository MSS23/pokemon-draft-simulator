import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Join a Draft',
  description: 'Join a Pokemon draft with a 6-character room code. No account required — jump in as a guest and start picking.',
  openGraph: {
    title: 'Join a Draft — Pokemon Draft',
    description: 'Join a Pokemon draft with a room code. No account required — jump in as a guest.',
    url: 'https://draftpokemon.com/join-draft',
    images: [{ url: 'https://draftpokemon.com/og-image?title=Join%20a%20Draft&subtitle=Enter%20your%20room%20code%20to%20join', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Join a Draft — Pokemon Draft',
    description: 'Join a Pokemon draft with a room code. No account required.',
    images: ['https://draftpokemon.com/og-image?title=Join%20a%20Draft&subtitle=Enter%20your%20room%20code%20to%20join'],
  },
}

export default function JoinDraftLayout({ children }: { children: React.ReactNode }) {
  return children
}
