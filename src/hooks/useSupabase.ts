import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDraftStore } from '@/stores/draftStore'
import { Draft, Team, Participant, Auction } from '@/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('RealtimeDraft')

export const useRealtimeDraft = (draftId: string) => {
  const [isConnected, setIsConnected] = useState(false)
  const { setDraft, setTeams, setParticipants, setCurrentAuction } = useDraftStore()

  useEffect(() => {
    if (!draftId || !supabase) return

    // Subscribe to draft changes
    const draftChannel = supabase
      .channel(`draft:${draftId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drafts',
          filter: `id=eq.${draftId}`,
        },
        (payload) => {
          if (payload.new) {
            setDraft(payload.new as Draft)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `draft_id=eq.${draftId}`,
        },
        async () => {
          try {
            if (!supabase) return
            const { data, error } = await supabase
              .from('teams')
              .select(`
                *,
                picks:picks(*)
              `)
              .eq('draft_id', draftId)
              .order('draft_order')

            if (error) {
              log.error('Failed to refetch teams:', error)
              return
            }
            if (data) {
              setTeams(data as unknown as Team[])
            }
          } catch (err) {
            log.error('Error in teams subscription handler:', err)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `draft_id=eq.${draftId}`,
        },
        async () => {
          try {
            if (!supabase) return
            const { data, error } = await supabase
              .from('participants')
              .select('*')
              .eq('draft_id', draftId)

            if (error) {
              log.error('Failed to refetch participants:', error)
              return
            }
            if (data) {
              setParticipants(data as unknown as Participant[])
            }
          } catch (err) {
            log.error('Error in participants subscription handler:', err)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auctions',
          filter: `draft_id=eq.${draftId}`,
        },
        async () => {
          try {
            if (!supabase) return
            const { data, error } = await supabase
              .from('auctions')
              .select('*')
              .eq('draft_id', draftId)
              .eq('status', 'active')
              .single()

            // PGRST116 = no rows found, which is expected when no active auction
            if (error && error.code !== 'PGRST116') {
              log.error('Failed to refetch auction:', error)
              return
            }
            setCurrentAuction(data ? (data as unknown as Auction) : null)
          } catch (err) {
            log.error('Error in auctions subscription handler:', err)
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      if (supabase) {
        supabase.removeChannel(draftChannel)
      }
    }
  }, [draftId, setDraft, setTeams, setParticipants, setCurrentAuction])

  return { isConnected }
}

export const useDraftActions = () => {
  const makePick = async (
    draftId: string,
    teamId: string,
    pokemonId: string,
    pokemonName: string,
    cost: number
  ) => {
    if (!supabase) throw new Error('Supabase not available')
    const { data: draft } = await supabase
      .from('drafts')
      .select('current_turn, current_round')
      .eq('id', draftId)
      .single()

    if (!draft) throw new Error('Draft not found')

    // Insert the pick
    const { error: pickError } = await supabase
      .from('picks')
      .insert({
        draft_id: draftId,
        team_id: teamId,
        pokemon_id: pokemonId,
        pokemon_name: pokemonName,
        cost,
        pick_order: draft.current_turn || 1,
        round: draft.current_round,
      })

    if (pickError) throw pickError

    // Update team budget
    const { error: teamError } = await supabase.rpc('update_team_budget', {
      team_id: teamId,
      cost_to_subtract: cost,
    })

    if (teamError) throw teamError

    // Advance the draft turn
    const { error: draftError } = await supabase.rpc('advance_draft_turn', {
      draft_id: draftId,
    })

    if (draftError) throw draftError
  }

  const placeBid = async (
    auctionId: string,
    teamId: string,
    bidAmount: number
  ) => {
    if (!supabase) throw new Error('Supabase not available')
    const { error } = await supabase.rpc('place_bid', {
      auction_id: auctionId,
      bidder_team_id: teamId,
      bid_amount: bidAmount,
    })

    if (error) throw error
  }

  const nominatePokemon = async (
    draftId: string,
    pokemonId: string,
    pokemonName: string,
    nominatedBy: string,
    auctionDuration: number = 60
  ) => {
    const auctionEnd = new Date(Date.now() + auctionDuration * 1000).toISOString()

    if (!supabase) throw new Error('Supabase not available')
    const { error } = await supabase
      .from('auctions')
      .insert({
        draft_id: draftId,
        pokemon_id: pokemonId,
        pokemon_name: pokemonName,
        nominated_by: nominatedBy,
        auction_end: auctionEnd,
        current_bid: 0,
        status: 'active',
      })

    if (error) throw error
  }

  const joinDraft = async (
    draftId: string,
    displayName: string,
    userId?: string
  ) => {
    if (!supabase) throw new Error('Supabase not available')
    const { error } = await supabase
      .from('participants')
      .insert({
        draft_id: draftId,
        user_id: userId || null,
        display_name: displayName,
        is_host: false,
      })

    if (error) throw error
  }

  return {
    makePick,
    placeBid,
    nominatePokemon,
    joinDraft,
  }
}
