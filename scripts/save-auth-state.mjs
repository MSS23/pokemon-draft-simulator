#!/usr/bin/env node
// Opens draftpokemon.com in a real Chromium window, polls for a Clerk
// session cookie, and writes the browser session (cookies + localStorage)
// to .auth/draftpokemon-user.json. That file is gitignored.
//
// Usage:
//   node scripts/save-auth-state.mjs
//
// The saved state can then be fed to a Playwright test via:
//   browser.newContext({ storageState: '.auth/draftpokemon-user.json' })

import { chromium } from '@playwright/test'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const AUTH_DIR = resolve(process.cwd(), '.auth')
const STATE_PATH = resolve(AUTH_DIR, 'draftpokemon-user.json')
const SITE = 'https://draftpokemon.com'
const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true })

console.log('Opening Chromium against', SITE)
console.log('Sign in with your Clerk account in the window that pops up.')
console.log('The script will auto-detect when you are signed in.')
console.log('')

let browser
try {
  browser = await chromium.launch({ headless: false, args: ['--start-maximized'] })
} catch (err) {
  console.error('❌ Failed to launch Chromium.')
  console.error('   Run this first: npx playwright install chromium')
  console.error('   Error:', err.message)
  process.exit(1)
}

const context = await browser.newContext({
  viewport: null, // use the full window
})
const page = await context.newPage()

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 30_000 })
} catch (err) {
  console.error('❌ Could not load', SITE, '-', err.message)
  await browser.close()
  process.exit(1)
}

console.log('Browser opened. Sign in now.')
process.stdout.write('Waiting for Clerk session')

const start = Date.now()
let signedIn = false
let lastCookieCount = 0

while (Date.now() - start < TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

  // Detection: look for a Clerk-set cookie whose value is JWT-shaped.
  // Clerk writes __session (a JWT) and several __clerk_* cookies on sign-in.
  const cookies = await context.cookies()
  const clerkSession = cookies.find(
    (c) =>
      c.name === '__session' &&
      typeof c.value === 'string' &&
      c.value.length > 50 &&
      c.value.split('.').length === 3 // looks like a JWT
  )

  if (clerkSession) {
    signedIn = true
    break
  }

  // Progress indicator
  if (cookies.length !== lastCookieCount) {
    process.stdout.write(` (${cookies.length} cookies)`)
    lastCookieCount = cookies.length
  } else {
    process.stdout.write('.')
  }
}

console.log('')

if (!signedIn) {
  console.error('❌ Timed out waiting for sign-in after 5 minutes.')
  console.error('   Did Clerk sign-in actually complete? You should see your avatar in the header.')
  console.error('   Run the script again when ready.')
  await browser.close()
  process.exit(1)
}

console.log('✅ Detected Clerk session. Letting the page settle for 2s before saving...')
await new Promise((r) => setTimeout(r, 2000))

// Capture final state
const finalCookies = await context.cookies()
const lsKeys = await page.evaluate(() => {
  const keys = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }
  } catch {
    /* may throw in some contexts */
  }
  return keys
})

await context.storageState({ path: STATE_PATH })
await browser.close()

console.log('')
console.log(`✅ Saved auth state to ${STATE_PATH}`)
console.log(`   Total cookies: ${finalCookies.length}`)
console.log(`   Clerk session cookie: present`)
console.log(`   localStorage keys: ${lsKeys.length}`)
console.log('')
console.log('This file is gitignored. Tell Claude "saved" in chat to start autonomous testing.')
