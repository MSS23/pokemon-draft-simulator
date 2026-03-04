import { LoadingScreen } from '@/components/ui/loading-states'

export default function ScheduleLoading() {
  return (
    <LoadingScreen
      title="Loading Schedule..."
      description="Fetching season fixtures."
    />
  )
}
