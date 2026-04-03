import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export interface MonitoringResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  // Number of active Realtime channels on this Node.js server instance
  // Note: this reflects channels on the current instance, not the global Supabase server
  realtimeConnections: number
  avgQueryLatencyMs: number
  dbStatus: 'up' | 'down' | 'unconfigured'
}

export async function GET() {
  // Supabase not configured
  if (!supabase) {
    const response: MonitoringResponse = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      realtimeConnections: 0,
      avgQueryLatencyMs: -1,
      dbStatus: 'unconfigured',
    }
    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  // Realtime connection count — channels active on this server instance
  const realtimeConnections = supabase.getChannels().length

  // DB query latency — average of 3 lightweight SELECT probes
  let avgQueryLatencyMs = -1
  let dbStatus: MonitoringResponse['dbStatus'] = 'down'

  try {
    const probes = 3
    const times: number[] = []
    for (let i = 0; i < probes; i++) {
      const t0 = Date.now()
      await supabase.from('drafts').select('id').limit(1)
      times.push(Date.now() - t0)
    }
    avgQueryLatencyMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    dbStatus = 'up'
  } catch {
    dbStatus = 'down'
  }

  const status: MonitoringResponse['status'] = dbStatus === 'up' ? 'ok' : 'degraded'

  const response: MonitoringResponse = {
    status,
    timestamp: new Date().toISOString(),
    realtimeConnections,
    avgQueryLatencyMs,
    dbStatus,
  }

  return NextResponse.json(response, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
