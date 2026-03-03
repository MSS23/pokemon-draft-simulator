import { LoadingScreen } from '@/components/ui/loading-states'

export default function RegisterLoading() {
  return <LoadingScreen title="Loading..." description="Preparing registration." showLogo={false} />
}
