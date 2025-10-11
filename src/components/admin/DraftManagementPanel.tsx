'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Trash2, Search, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNotify } from '@/components/providers/NotificationProvider'

interface Draft {
  id: string
  room_code: string
  name: string
  status: string
  created_at: string
  is_public: boolean
  max_teams: number
  draft_type: string
}

export default function DraftManagementPanel() {
  const notify = useNotify()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadDrafts()
  }, [])

  async function loadDrafts() {
    if (!supabase) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDrafts(data || [])
    } catch (error) {
      console.error('Error loading drafts:', error)
      notify.error('Error', 'Failed to load drafts')
    } finally {
      setLoading(false)
    }
  }

  async function deleteDraft(draftId: string, roomCode: string) {
    if (!supabase) return
    if (!confirm(`Are you sure you want to delete draft ${roomCode}? This action cannot be undone.`)) {
      return
    }

    setDeleting(draftId)

    try {
      // Delete related data first
      await supabase.from('picks').delete().eq('draft_id', draftId)
      await supabase.from('teams').delete().eq('draft_id', draftId)
      await supabase.from('participants').delete().eq('draft_id', draftId)
      await supabase.from('pokemon_tiers').delete().eq('draft_id', draftId)
      await supabase.from('wishlist_items').delete().eq('draft_id', draftId)
      await supabase.from('auctions').delete().eq('draft_id', draftId)
      await supabase.from('bid_history').delete().eq('draft_id', draftId)

      // Delete the draft itself
      const { error } = await supabase
        .from('drafts')
        .delete()
        .eq('id', draftId)

      if (error) throw error

      notify.success('Draft Deleted', `Draft ${roomCode} has been removed`)
      setDrafts(prev => prev.filter(d => d.id !== draftId))
    } catch (error) {
      console.error('Error deleting draft:', error)
      notify.error('Delete Failed', 'Failed to delete draft')
    } finally {
      setDeleting(null)
    }
  }

  async function deleteAllDrafts() {
    if (!supabase) return
    if (!confirm(`⚠️ WARNING: Delete ALL ${drafts.length} drafts? This cannot be undone!`)) {
      return
    }
    if (!confirm('Type "DELETE ALL" to confirm:') || prompt('Type "DELETE ALL" to confirm:') !== 'DELETE ALL') {
      notify.info('Cancelled', 'Delete all operation cancelled')
      return
    }

    setLoading(true)

    try {
      // Delete all related data
      await supabase.from('picks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('participants').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('pokemon_tiers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('wishlist_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('auctions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('bid_history').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      // Delete all drafts
      const { error } = await supabase
        .from('drafts')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (error) throw error

      notify.success('All Drafts Deleted', `${drafts.length} drafts have been removed`)
      setDrafts([])
    } catch (error) {
      console.error('Error deleting all drafts:', error)
      notify.error('Delete Failed', 'Failed to delete all drafts')
    } finally {
      setLoading(false)
    }
  }

  const filteredDrafts = drafts.filter(draft =>
    draft.room_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    draft.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-700 dark:text-red-400">Draft Management</CardTitle>
          <CardDescription>
            View and delete draft rooms. <strong>Use with caution.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by room code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={loadDrafts}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="destructive"
              onClick={deleteAllDrafts}
              disabled={loading || drafts.length === 0}
              className="gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              Delete All ({drafts.length})
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>Total Drafts: {drafts.length}</span>
            <span>Filtered: {filteredDrafts.length}</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading drafts...</p>
          </CardContent>
        </Card>
      ) : filteredDrafts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600 dark:text-slate-400">
              {searchTerm ? 'No drafts match your search' : 'No drafts in the system'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredDrafts.map((draft) => (
            <Card key={draft.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{draft.room_code}</h3>
                      <Badge variant={
                        draft.status === 'active' || draft.status === 'drafting' ? 'default' :
                        draft.status === 'completed' ? 'secondary' :
                        'outline'
                      }>
                        {draft.status}
                      </Badge>
                      {draft.is_public && <Badge variant="outline">Public</Badge>}
                      <Badge variant="outline">{draft.draft_type}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                      {draft.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Created: {new Date(draft.created_at).toLocaleString()} • {draft.max_teams} teams
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteDraft(draft.id, draft.room_code)}
                    disabled={deleting === draft.id}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting === draft.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
