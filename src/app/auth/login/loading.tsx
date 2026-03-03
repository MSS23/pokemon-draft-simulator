import { LoadingScreen } from '@/components/ui/loading-states'

export default function LoginLoading() {
  return <LoadingScreen title="Loading..." description="Preparing sign in." showLogo={false} />
}
