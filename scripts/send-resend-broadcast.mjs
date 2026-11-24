/**
 * Send the DraftPokemon update to every row in clerk-users-export.csv.
 *
 * Privacy: one API call per recipient — no shared To/CC/BCC lists.
 *
 * Usage (dry run — default):
 *   $env:RESEND_API_KEY="re_..." ; node scripts/send-resend-broadcast.mjs
 *
 * Live send:
 *   $env:RESEND_API_KEY="re_..." ; node scripts/send-resend-broadcast.mjs --send
 *
 * Resume after quota / interruption (skips already-sent addresses):
 *   $env:RESEND_API_KEY="re_..." ; node scripts/send-resend-broadcast.mjs --send --resume
 *
 * Optional env:
 *   RESEND_FROM          default: Manraj <hello@draftpokemon.com>
 *   RESEND_REPLY_TO      default: contact@manrajssidhu.com
 *   RESEND_CSV           default: clerk-users-export.csv
 *   RESEND_LIMIT         max recipients (for pilot batches)
 *   RESEND_DELAY_MS      pause between sends (default: 600)
 *   RESEND_RESULTS       default: scripts/broadcast-results.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { SUBJECT, buildEmail } from './email-templates.mjs'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('Missing RESEND_API_KEY')
  process.exit(1)
}

const live = process.argv.includes('--send')
const resume = process.argv.includes('--resume')
const from = process.env.RESEND_FROM ?? 'Manraj <hello@draftpokemon.com>'
const replyTo = process.env.RESEND_REPLY_TO ?? 'contact@manrajssidhu.com'
const csvPath = path.resolve(process.env.RESEND_CSV ?? 'clerk-users-export.csv')
const limit = process.env.RESEND_LIMIT ? Number(process.env.RESEND_LIMIT) : undefined
const delayMs = Number(process.env.RESEND_DELAY_MS ?? 600)
const resultsPath = path.resolve(process.env.RESEND_RESULTS ?? 'scripts/broadcast-results.json')

function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/)
  const header = lines.shift()?.split(',') ?? []
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    const values = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    values.push(current)
    const row = Object.fromEntries(header.map((key, idx) => [key, values[idx] ?? '']))
    rows.push(row)
  }
  return rows
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadPreviousResults() {
  if (!fs.existsSync(resultsPath)) return null
  try {
    return JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  } catch {
    return null
  }
}

function isQuotaError(message) {
  return message.includes('daily_quota_exceeded') || message.includes('"statusCode":429')
}

async function sendOne(recipient) {
  const { text, html } = buildEmail({ firstName: recipient.first_name })
  const payload = {
    from,
    to: [recipient.email],
    reply_to: replyTo,
    subject: SUBJECT,
    text,
    html,
    tags: [{ name: 'category', value: 'draftpokemon_update' }],
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = await res.text()
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = body
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(parsed)}`)
  }

  return parsed
}

function saveResults(summary) {
  fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2))
}

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`)
  process.exit(1)
}

const allRows = parseCsv(fs.readFileSync(csvPath, 'utf8')).filter((row) => row.email?.trim())
const seen = new Set()
const uniqueRows = []
for (const row of allRows) {
  const email = row.email.trim().toLowerCase()
  if (seen.has(email)) continue
  seen.add(email)
  uniqueRows.push({ ...row, email: row.email.trim() })
}

const previous = resume ? loadPreviousResults() : null
const alreadySent = new Set(
  (previous?.sentEmails ?? []).map((email) => email.toLowerCase()),
)

if (resume && previous?.sentEmails?.length) {
  console.log(`Resume mode — skipping ${alreadySent.size} already sent`)
} else if (resume && previous?.failures?.length && !previous?.sentEmails?.length) {
  // Back-compat: infer sent from first run where failures were all quota errors
  const failureEmails = new Set(previous.failures.map((f) => f.email.toLowerCase()))
  for (const row of uniqueRows) {
    if (!failureEmails.has(row.email.toLowerCase())) {
      alreadySent.add(row.email.toLowerCase())
    }
  }
  console.log(`Resume mode — inferred ${alreadySent.size} already sent from prior results`)
}

let recipients = uniqueRows.filter((row) => !alreadySent.has(row.email.toLowerCase()))
if (limit) recipients = recipients.slice(0, limit)

console.log(
  `${live ? 'LIVE SEND' : 'DRY RUN'} — ${recipients.length} pending recipients (one email each, private)`,
)

if (!live) {
  console.log('Sample pending recipients:')
  for (const row of recipients.slice(0, 5)) {
    console.log(`  ${row.email} (${row.first_name || 'no name'})`)
  }
  if (alreadySent.size) {
    console.log(`\n${alreadySent.size} already sent (will be skipped with --resume).`)
  }
  console.log('\nAdd --send to deliver for real.')
  process.exit(0)
}

const sentEmails = [...alreadySent]
const failures = []
let sentThisRun = 0
let failedThisRun = 0
const startedAt = previous?.startedAt ?? new Date().toISOString()

for (const recipient of recipients) {
  try {
    const result = await sendOne(recipient)
    sentThisRun++
    sentEmails.push(recipient.email.toLowerCase())
    if (sentThisRun % 25 === 0) {
      console.log(`Sent ${sentThisRun}/${recipients.length} this run… latest id ${result.id}`)
      saveResults({
        startedAt,
        updatedAt: new Date().toISOString(),
        subject: SUBJECT,
        from,
        replyTo,
        total: uniqueRows.length,
        sentEmails: [...sentEmails],
        sent: sentEmails.length,
        pending: uniqueRows.length - sentEmails.length,
        failures: [...failures],
        failed: failures.length,
        status: 'in_progress',
      })
    }
    await sleep(delayMs)
  } catch (err) {
    failedThisRun++
    failures.push({ email: recipient.email, error: err.message })
    console.error(`Failed ${recipient.email}:`, err.message)

    if (isQuotaError(err.message)) {
      console.error('\nDaily quota reached — stopping early. Re-run with --send --resume after quota resets.')
      break
    }
  }
}

const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  subject: SUBJECT,
  from,
  replyTo,
  total: uniqueRows.length,
  sentEmails: [...sentEmails],
  sent: sentEmails.length,
  pending: uniqueRows.length - sentEmails.length,
  sentThisRun,
  failedThisRun,
  failures,
  failed: failures.length,
  status: sentEmails.length >= uniqueRows.length ? 'complete' : 'partial',
}

saveResults(summary)
console.log(
  `Done. Sent this run: ${sentThisRun}, total sent: ${summary.sent}/${summary.total}, pending: ${summary.pending}. Results: ${resultsPath}`,
)
