import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  checks: {
    database: {
      status: 'up' | 'down' | 'unconfigured'
      latencyMs: number | null
    }
  }
}

export async function GET() {
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.1',
    checks: {
      database: { status: 'unconfigured', latencyMs: null },
    },
  }

  if (!supabase) {
    health.status = 'degraded'
    return NextResponse.json(health)
  }

  const start = Date.now()
  try {
    const { error } = await supabase.from('drafts').select('id').limit(1)
    const latencyMs = Date.now() - start

    if (error) {
      health.status = 'degraded'
      health.checks.database = { status: 'down', latencyMs }
    } else {
      health.checks.database = { status: 'up', latencyMs }
    }
  } catch {
    health.status = 'unhealthy'
    health.checks.database = { status: 'down', latencyMs: Date.now() - start }
  }

  const httpStatus = health.status === 'unhealthy' ? 503 : 200
  return NextResponse.json(health, { status: httpStatus })
}
