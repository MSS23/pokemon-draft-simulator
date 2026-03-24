import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const roomCode = id?.toUpperCase() || ''

  return {
    title: `Draft ${roomCode} — Pokemon Draft League`,
    description: `Join or spectate draft room ${roomCode}`,
    openGraph: {
      title: `Draft Room ${roomCode}`,
      description: 'Live Pokemon draft in progress',
      images: [
        {
          url: `/og-image?title=Draft+Room+${encodeURIComponent(roomCode)}&status=Live`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Draft Room ${roomCode}`,
      images: [`/og-image?title=Draft+Room+${encodeURIComponent(roomCode)}&status=Live`],
    },
  }
}

export default function DraftLayout({ children }: Props) {
  return children
}
