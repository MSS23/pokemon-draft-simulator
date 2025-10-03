import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDraftStore } from '@/stores/draftStore'
import { Draft, Team, Participant, Auction, Pick } from '@/types'

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
          // Refetch all teams when any team changes
          if (!supabase) return
          const { data } = await supabase
            .from('teams')
            .select(`
              *,
              picks:picks(*)
            `)
            .eq('draft_id', draftId)
            .order('draft_order')

          if (data) {
            setTeams(data as Team[])
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
          if (!supabase) return
          const { data } = await supabase
            .from('participants')
            .select('*')
            .eq('draft_id', draftId)

          if (data) {
            setParticipants(data as Participant[])
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
          if (!supabase) return
          const { data } = await supabase
            .from('auctions')
            .select('*')
            .eq('draft_id', draftId)
            .eq('status', 'active')
            .single()

          setCurrentAuction(data ? (data as Auction) : null)
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
    if (!supabase) throw new Error('Supabase not available')
    const { error: pickError } = await (supabase
      .from('picks') as any)
      .insert({
        draft_id: draftId,
        team_id: teamId,
        pokemon_id: pokemonId,
        pokemon_name: pokemonName,
        cost,
        pick_order: (draft as any).current_turn || 1,
        round: (draft as any).current_round,
      })

    if (pickError) throw pickError

    // Update team budget
    if (!supabase) throw new Error('Supabase not available')
    const { error: teamError } = await (supabase.rpc as any)('update_team_budget', {
      team_id: teamId,
      cost_to_subtract: cost,
    })

    if (teamError) throw teamError

    // Advance the draft turn
    if (!supabase) throw new Error('Supabase not available')
    const { error: draftError } = await (supabase.rpc as any)('advance_draft_turn', {
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
    const { error } = await (supabase.rpc as any)('place_bid', {
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
    const { error } = await (supabase
      .from('auctions') as any)
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
    const { error } = await (supabase
      .from('participants') as any)
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