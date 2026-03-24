import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const roomCode = id?.toUpperCase() || ''

  return {
    title: `Results — Draft ${roomCode}`,
    description: `View draft results for room ${roomCode}`,
    openGraph: {
      title: `Draft Results — ${roomCode}`,
      description: 'View the completed draft results',
      images: [
        {
          url: `/og-image?title=Draft+Results+${encodeURIComponent(roomCode)}&status=Completed`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Draft Results — ${roomCode}`,
      images: [`/og-image?title=Draft+Results+${encodeURIComponent(roomCode)}&status=Completed`],
    },
  }
}

export default function DraftResultsLayout({ children }: Props) {
  return children
}
