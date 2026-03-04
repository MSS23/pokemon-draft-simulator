import { TEAM_COLORS } from '@/utils/team-colors'

interface TeamIconProps {
  teamName: string
  teamIndex: number
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
} as const

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function TeamIcon({ teamName, teamIndex, size = 'md' }: TeamIconProps) {
  const color = TEAM_COLORS[teamIndex % TEAM_COLORS.length]
  const initials = getInitials(teamName)

  return (
    <div
      className={`${SIZES[size]} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: color.hex }}
    >
      {initials}
    </div>
  )
}
