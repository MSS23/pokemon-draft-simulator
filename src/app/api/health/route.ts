import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return NextResponse.json({
    status: 'ok',
    supabaseConfigured: !!supabaseUrl && hasAnonKey,
    supabaseUrl: supabaseUrl || 'NOT_SET',
    hasAnonKey: hasAnonKey,
    timestamp: new Date().toISOString()
  })
}
