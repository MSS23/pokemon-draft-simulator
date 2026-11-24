import fs from 'node:fs'

const r = JSON.parse(fs.readFileSync('scripts/broadcast-results.json', 'utf8'))
const sent = new Set((r.sentEmails || []).map((e) => e.toLowerCase()))

const caseMap = new Map()
const rows = fs.readFileSync('clerk-users-export.csv', 'utf8').trim().split(/\r?\n/).slice(1)
for (const line of rows) {
  const e = line.split(',')[0].trim()
  if (e) caseMap.set(e.toLowerCase(), e)
}

const pending = [...caseMap.keys()]
  .filter((e) => !sent.has(e))
  .sort()
  .map((e) => caseMap.get(e))

const b1 = pending.slice(0, 500)
const b2 = pending.slice(500)

fs.writeFileSync('scripts/broadcast-pending-emails.txt', pending.join('; ') + '\n')
fs.writeFileSync('scripts/broadcast-pending-batch1.txt', b1.join('; ') + '\n')
fs.writeFileSync('scripts/broadcast-pending-batch2.txt', b2.join('; ') + '\n')

fs.writeFileSync(
  'scripts/broadcast-pending-README.txt',
  `DraftPokemon broadcast — pending recipients (pick up here)
============================================================

Status (2026-08-27 evening):
  - Sent via Resend (day 1): 195
  - Sent via Resend (day 2): 194
  - Total sent:              ${sent.size} / 901
  - Still pending:           ${pending.length} / 901
  - Stopped at:              daily_quota_exceeded on test_manraj API key

Files:
  broadcast-pending-emails.txt   All ${pending.length} pending (semicolon-separated)
  broadcast-pending-batch1.txt   First ${b1.length} — BCC send #1
  broadcast-pending-batch2.txt   Remaining ${b2.length} — BCC send #2

Resume via Resend (after quota resets / with production key):
  $env:RESEND_API_KEY = "re_your_key"
  node scripts/send-resend-broadcast.mjs --send --resume

Email copy: scripts/email-templates.mjs
Subject: A question about DraftPokemon
`,
)

console.log({ totalSent: sent.size, pending: pending.length, batch1: b1.length, batch2: b2.length })
