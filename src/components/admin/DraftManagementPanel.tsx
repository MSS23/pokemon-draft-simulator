'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Trash2, Search, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notifications'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Draft {
  id: string
  room_code: string
  name: string
  status: string
  created_at: string
  is_public: boolean
  max_teams: number
  format: string
}

export default function DraftManagementPanel() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; roomCode: string } | null>(null)
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false)
  const [deleteAllFinalConfirmOpen, setDeleteAllFinalConfirmOpen] = useState(false)
  const [deleteAllInput, setDeleteAllInput] = useState('')

  const loadDrafts = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDrafts(data as unknown as Draft[] || [])
    } catch (_err) {
      notify.error('Error', 'Failed to load drafts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDrafts()
  }, [loadDrafts])

  async function executeDeleteDraft(draftId: string, roomCode: string) {
    if (!supabase) return

    setDeleting(draftId)

    try {
      await supabase.from('picks').delete().eq('draft_id', draftId)
      await supabase.from('teams').delete().eq('draft_id', draftId)
      await supabase.from('participants').delete().eq('draft_id', draftId)
      await supabase.from('pokemon_tiers').delete().eq('draft_id', draftId)
      await supabase.from('wishlist_items').delete().eq('draft_id', draftId)
      await supabase.from('auctions').delete().eq('draft_id', draftId)
      await supabase.from('bid_history').delete().eq('draft_id', draftId)

      const { error } = await supabase
        .from('drafts')
        .delete()
        .eq('id', draftId)

      if (error) throw error

      notify.success('Draft Deleted', `Draft ${roomCode} has been removed`)
      setDrafts(prev => prev.filter(d => d.id !== draftId))
    } catch (_err) {
      notify.error('Delete Failed', 'Failed to delete draft')
    } finally {
      setDeleting(null)
    }
  }

  async function executeDeleteAllDrafts() {
    if (!supabase) return

    setLoading(true)
    const count = drafts.length

    try {
      await supabase.from('picks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('participants').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('pokemon_tiers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('wishlist_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('auctions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('bid_history').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      const { error } = await supabase
        .from('drafts')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (error) throw error

      notify.success('All Drafts Deleted', `${count} drafts have been removed`)
      setDrafts([])
    } catch (_err) {
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
              onClick={() => setDeleteAllConfirmOpen(true)}
              disabled={loading || drafts.length === 0}
              className="gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              Delete All ({drafts.length})
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Drafts: {drafts.length}</span>
            <span>Filtered: {filteredDrafts.length}</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading drafts...</p>
          </CardContent>
        </Card>
      ) : filteredDrafts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
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
                      <Badge variant="outline">{draft.format}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {draft.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(draft.created_at).toLocaleString()} &bull; {draft.max_teams} teams
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget({ id: draft.id, roomCode: draft.room_code })}
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

      {/* Single draft delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Draft"
        description={`Are you sure you want to delete draft ${deleteTarget?.roomCode}? This action cannot be undone.`}
        confirmLabel="Delete Draft"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            executeDeleteDraft(deleteTarget.id, deleteTarget.roomCode)
            setDeleteTarget(null)
          }
        }}
      />

      {/* Delete all - first confirmation */}
      <ConfirmDialog
        open={deleteAllConfirmOpen}
        onOpenChange={setDeleteAllConfirmOpen}
        title="Delete All Drafts"
        description={`This will permanently delete ALL ${drafts.length} drafts and their associated data. This cannot be undone.`}
        confirmLabel="Continue"
        variant="destructive"
        onConfirm={() => {
          setDeleteAllConfirmOpen(false)
          setDeleteAllInput('')
          setDeleteAllFinalConfirmOpen(true)
        }}
      />

      {/* Delete all - final confirmation with typed input */}
      {deleteAllFinalConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Final Confirmation
              </CardTitle>
              <CardDescription>
                Type <strong>DELETE ALL</strong> to confirm deletion of all {drafts.length} drafts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Type DELETE ALL"
                value={deleteAllInput}
                onChange={(e) => setDeleteAllInput(e.target.value)}
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteAllFinalConfirmOpen(false)
                    setDeleteAllInput('')
                    notify.info('Cancelled', 'Delete all operation cancelled')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteAllInput !== 'DELETE ALL'}
                  onClick={() => {
                    setDeleteAllFinalConfirmOpen(false)
                    setDeleteAllInput('')
                    executeDeleteAllDrafts()
                  }}
                >
                  Delete All Drafts
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
