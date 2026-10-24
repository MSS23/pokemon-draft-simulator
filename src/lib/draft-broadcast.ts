import { supabase } from './supabase'

/**
 * Send a broadcast on a draft's realtime topic.
 *
 * `supabase.channel(topic)` returns the EXISTING channel when one with that
 * topic is already registered, so the old "create a throwaway channel, send,
 * removeChannel()" pattern tore down the page's live DraftRealtimeManager
 * subscription after every pick (host then missed all later events). Reuse the
 * live channel when present; only fall back to a one-shot channel otherwise.
 */
export async function broadcastOnDraftChannel(
  draftId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!supabase) return
  const topic = `draft:${draftId}`
  const live = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`)
  if (live) {
    await live.send({ type: 'broadcast', event, payload })
    return
  }
  // private: true — realtime.messages RLS gates this topic to participants.
  const oneShot = supabase.channel(topic, { config: { private: true } })
  try {
    await oneShot.send({ type: 'broadcast', event, payload })
  } finally {
    supabase.removeChannel(oneShot)
  }
}
