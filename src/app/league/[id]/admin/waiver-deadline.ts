// The <input type="datetime-local"> value has no offset; the claim RPC casts settings.waiverDeadline
// with ::timestamptz in a UTC session, so it is stored as an absolute ISO instant instead.

/** Local datetime-local input value -> ISO string (UTC, ends in Z). Empty stays empty. */
export function waiverDeadlineToIso(localValue: string): string {
  if (!localValue) return ''
  const d = new Date(localValue)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Stored value (ISO, or a legacy offsetless string) -> local 'YYYY-MM-DDTHH:mm' for the input. */
export function waiverDeadlineToLocalInput(stored: string | null | undefined): string {
  if (!stored) return ''
  const d = new Date(stored)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
