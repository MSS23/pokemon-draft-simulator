import { SignUp } from '@clerk/nextjs'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SignUp routing="hash" fallbackRedirectUrl="/dashboard" />
    </div>
  )
}
