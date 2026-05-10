'use client'

/**
 * TeamIdentityModal — edit sheet-aligned team identity fields.
 *
 * Mirrors the "Teams" tab from the League of Rage spreadsheet:
 *  logo_url, abbreviation (3 chars), coach_display_name, discord_handle,
 *  division_name.
 *
 * Caller is responsible for gating who sees the trigger: team owners can
 * edit their own team, commissioners can edit any team.
 */

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LeagueService } from '@/lib/league-service'
import { notify } from '@/lib/notifications'
import { validateName } from '@/lib/profanity'
import { Loader2 } from 'lucide-react'
import type { Team } from '@/types'

interface TeamIdentityModalProps {
  isOpen: boolean
  onClose: () => void
  team: Pick<Team, 'id' | 'name'> & {
    logoUrl?: string | null
    abbreviation?: string | null
    coachDisplayName?: string | null
    discordHandle?: string | null
    divisionName?: string | null
  }
  /**
   * Optional list of existing division names in the league for autocomplete.
   * Pass an empty array to allow free-text only.
   */
  knownDivisions?: string[]
  onSaved?: () => void
}

export function TeamIdentityModal({
  isOpen,
  onClose,
  team,
  knownDivisions = [],
  onSaved,
}: TeamIdentityModalProps) {
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? '')
  const [abbreviation, setAbbreviation] = useState(team.abbreviation ?? '')
  const [coach, setCoach] = useState(team.coachDisplayName ?? '')
  const [discord, setDiscord] = useState(team.discordHandle ?? '')
  const [division, setDivision] = useState(team.divisionName ?? '')
  const [saving, setSaving] = useState(false)
  const [logoBroken, setLogoBroken] = useState(false)

  // Re-sync when the underlying team changes
  useEffect(() => {
    setLogoUrl(team.logoUrl ?? '')
    setAbbreviation(team.abbreviation ?? '')
    setCoach(team.coachDisplayName ?? '')
    setDiscord(team.discordHandle ?? '')
    setDivision(team.divisionName ?? '')
    setLogoBroken(false)
  }, [team])

  const trimmedAbbr = abbreviation.trim().toUpperCase()
  const abbrInvalid = trimmedAbbr.length > 0 && !/^[A-Z0-9]{1,5}$/.test(trimmedAbbr)

  async function handleSave() {
    if (abbrInvalid) {
      notify.warning('Invalid abbreviation', 'Use 1-5 letters or digits')
      return
    }
    const coachCheck = validateName(coach, { fieldLabel: 'Coach name', maxLength: 64, allowEmpty: true });
    if (!coachCheck.ok) { notify.warning('Invalid coach name', coachCheck.reason!); return; }
    const divisionCheck = validateName(division, { fieldLabel: 'Division name', maxLength: 64, allowEmpty: true });
    if (!divisionCheck.ok) { notify.warning('Invalid division name', divisionCheck.reason!); return; }
    if (trimmedAbbr) {
      const abbrCheck = validateName(trimmedAbbr, { fieldLabel: 'Abbreviation', maxLength: 5, allowEmpty: true });
      if (!abbrCheck.ok) { notify.warning('Invalid abbreviation', abbrCheck.reason!); return; }
    }
    setSaving(true)
    try {
      await LeagueService.updateTeamIdentity(team.id, {
        logoUrl: logoUrl.trim() || null,
        abbreviation: trimmedAbbr || null,
        coachDisplayName: coach.trim() || null,
        discordHandle: discord.trim() || null,
        divisionName: division.trim() || null,
      })
      notify.success('Team updated', `${team.name} identity saved`)
      onSaved?.()
      onClose()
    } catch (e) {
      notify.error('Save failed', e instanceof Error ? e.message : 'Try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit team identity</DialogTitle>
          <DialogDescription>
            Add a logo, abbreviation, coach name, and division — visible across the league pages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Logo preview */}
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl && !logoBroken ? (
                <Image
                  src={logoUrl}
                  alt={`${team.name} logo`}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-contain"
                  onError={() => setLogoBroken(true)}
                />
              ) : (
                <span className="text-xs text-muted-foreground text-center px-1">
                  {logoUrl ? 'Cannot load' : 'No logo'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <Label htmlFor="team-logo-url" className="text-xs">Logo URL</Label>
              <Input
                id="team-logo-url"
                value={logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setLogoBroken(false) }}
                placeholder="https://i.imgur.com/..."
                className="text-sm"
              />
            </div>
          </div>

          {/* Abbreviation */}
          <div className="space-y-1">
            <Label htmlFor="team-abbr" className="text-xs">Abbreviation</Label>
            <Input
              id="team-abbr"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
              placeholder="TLT"
              maxLength={5}
              className={abbrInvalid ? 'border-destructive' : ''}
            />
            {abbrInvalid && (
              <p className="text-xs text-destructive">1-5 letters or digits only</p>
            )}
          </div>

          {/* Coach */}
          <div className="space-y-1">
            <Label htmlFor="team-coach" className="text-xs">Coach name</Label>
            <Input
              id="team-coach"
              value={coach}
              onChange={(e) => setCoach(e.target.value)}
              placeholder="Display name"
              maxLength={64}
            />
          </div>

          {/* Discord */}
          <div className="space-y-1">
            <Label htmlFor="team-discord" className="text-xs">Discord handle</Label>
            <Input
              id="team-discord"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="username"
              maxLength={64}
            />
          </div>

          {/* Division */}
          <div className="space-y-1">
            <Label htmlFor="team-division" className="text-xs">Division</Label>
            <Input
              id="team-division"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              placeholder="Intimidate Division"
              list="team-division-options"
              maxLength={64}
            />
            {knownDivisions.length > 0 && (
              <datalist id="team-division-options">
                {knownDivisions.map((d) => <option key={d} value={d} />)}
              </datalist>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || abbrInvalid}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TeamIdentityModal
