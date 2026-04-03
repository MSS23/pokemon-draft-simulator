import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create a Draft',
  description: 'Set up a Pokemon draft in under a minute. Choose VGC Reg H, Smogon, or custom formats. Snake draft, auction, or tiered — invite your group with a room code.',
  openGraph: {
    title: 'Create a Draft — Pokemon Draft',
    description: 'Set up a Pokemon draft in under a minute. VGC, Smogon, or custom formats with snake, auction, or tiered drafting.',
    url: 'https://draftpokemon.com/create-draft',
    images: [{ url: 'https://draftpokemon.com/og-image?title=Create%20a%20Draft&subtitle=Snake%20%E2%80%A2%20Auction%20%E2%80%A2%20Any%20Format', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create a Draft — Pokemon Draft',
    description: 'Set up a Pokemon draft in under a minute. VGC, Smogon, or custom formats.',
    images: ['https://draftpokemon.com/og-image?title=Create%20a%20Draft&subtitle=Snake%20%E2%80%A2%20Auction%20%E2%80%A2%20Any%20Format'],
  },
}

export default function CreateDraftLayout({ children }: { children: React.ReactNode }) {
  return children
}
