import { NextResponse } from 'next/server'

/**
 * Clerk handles OAuth callbacks automatically.
 * This route is kept for backward compatibility — it simply redirects to the dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const rawRedirect = requestUrl.searchParams.get('redirectTo') || '/dashboard'
  // Prevent open redirect: only allow relative paths, reject absolute URLs and protocol-relative URLs
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'

  return NextResponse.redirect(new URL(redirectTo, request.url))
}
