import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface ServiceCheck {
  status: 'up' | 'down' | 'unconfigured'
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
  checks: {
    database: ServiceCheck
    pokeapi: ServiceCheck
  }
}

const startTime = Date.now()

async function checkPokeAPI(): Promise<ServiceCheck> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://pokeapi.co/api/v2/pokemon/1', {
      signal: controller.signal,
      method: 'HEAD',
    })
    clearTimeout(timeout)
    return { status: res.ok ? 'up' : 'down' }
  } catch {
    return { status: 'down' }
  }
}

export async function GET() {
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.2',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: { status: 'unconfigured' },
      pokeapi: { status: 'unconfigured' },
    },
  }

  // Check database
  if (!supabase) {
    health.status = 'degraded'
  } else {
    try {
      const { error } = await supabase.from('drafts').select('id').limit(1)

      if (error) {
        health.status = 'degraded'
        health.checks.database = { status: 'down' }
      } else {
        health.checks.database = { status: 'up' }
      }
    } catch {
      health.status = 'unhealthy'
      health.checks.database = { status: 'down' }
    }
  }

  // Check PokeAPI
  health.checks.pokeapi = await checkPokeAPI()
  if (health.checks.pokeapi.status === 'down' && health.status === 'healthy') {
    health.status = 'degraded'
  }

  const httpStatus = health.status === 'unhealthy' ? 503 : 200
  return NextResponse.json(health, { status: httpStatus })
}
