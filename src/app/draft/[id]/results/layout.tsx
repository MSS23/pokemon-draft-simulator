import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const shortId = id.slice(0, 8)

  return {
    title: 'Draft Results',
    description: `View the results of Pokemon draft ${shortId}. See team rosters, pick order, and league standings.`,
    openGraph: {
      title: 'Draft Results — Pokemon Draft',
      description: 'View the completed draft results. Team rosters, pick timeline, and stats.',
      url: `https://draftpokemon.com/draft/${id}/results`,
      images: [{ url: 'https://draftpokemon.com/og-image?title=Draft%20Results&status=completed', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Draft Results — Pokemon Draft',
      description: 'View the completed draft results and team rosters.',
      images: ['https://draftpokemon.com/og-image?title=Draft%20Results&status=completed'],
    },
  }
}

export default function DraftResultsLayout({ children }: Props) {
  return children
}
