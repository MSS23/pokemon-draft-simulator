import { LoadingScreen } from '@/components/ui/loading-states'

export default function ResetPasswordLoading() {
  return <LoadingScreen title="Loading..." description="Preparing password reset." showLogo={false} />
}
