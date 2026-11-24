/**
 * Send one test email via Resend (single recipient only).
 *
 * Usage:
 *   $env:RESEND_API_KEY="re_..." ; node scripts/send-resend-test.mjs
 *
 * Optional env:
 *   RESEND_FROM   default: Manraj <hello@draftpokemon.com>
 *   RESEND_TO     default: contact@manrajssidhu.com
 *   RESEND_NAME   first name for greeting (default: Manraj)
 */

import { SUBJECT, buildEmail } from './email-templates.mjs'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('Missing RESEND_API_KEY. Create one at https://resend.com/api-keys')
  process.exit(1)
}

const from = process.env.RESEND_FROM ?? 'Manraj <hello@draftpokemon.com>'
const to = process.env.RESEND_TO ?? 'contact@manrajssidhu.com'
const firstName = process.env.RESEND_NAME ?? 'Manraj'
const testPrefix = process.env.RESEND_LIVE === '1' ? '' : '[TEST] '

const { text, html } = buildEmail({ firstName })

const payload = {
  from,
  to: [to],
  subject: `${testPrefix}${SUBJECT}`,
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
  console.error('Send failed:', res.status, parsed)
  process.exit(1)
}

console.log('Sent successfully:', parsed)
