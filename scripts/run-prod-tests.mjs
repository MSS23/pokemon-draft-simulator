#!/usr/bin/env node
// Drives an end-to-end test pass against draftpokemon.com using a previously-
// saved Clerk session (.auth/draftpokemon-user.json). Captures step-by-step
// state to .auth/test-results.json and screenshots to .auth/screenshots/.
//
// Usage:
//   node scripts/run-prod-tests.mjs               # full run
//   node scripts/run-prod-tests.mjs --step=1      # only step 1
//
// The runner is intentionally lenient — every step writes results regardless
// of pass/fail, so Claude can read the partial output and triage.

import { chromium } from '@playwright/test'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const AUTH_DIR = resolve(process.cwd(), '.auth')
const STATE_PATH = resolve(AUTH_DIR, 'draftpokemon-user.json')
const SHOT_DIR = resolve(AUTH_DIR, 'screenshots')
const RESULTS_PATH = resolve(AUTH_DIR, 'test-results.json')
const SITE = 'https://draftpokemon.com'

if (!existsSync(STATE_PATH)) {
  console.error('❌ No saved auth state at', STATE_PATH)
  console.error('   Run `node scripts/save-auth-state.mjs` first.')
  process.exit(1)
}
if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const teamName = `TEST-ROCKET-${Date.now().toString(36)}`
const userName = `TEST-${Date.now().toString(36)}`

const results = {
  startedAt: new Date().toISOString(),
  site: SITE,
  teamName,
  userName,
  steps: [],
  errors: [],
}

const persist = () => writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
const step = async (name, fn) => {
  console.log(`\n▶ ${name}`)
  const t0 = Date.now()
  const entry = { name, startedAt: new Date().toISOString(), ok: false, details: {} }
  results.steps.push(entry)
  try {
    await fn(entry)
    entry.ok = true
    console.log(`✅ ${name} (${Date.now() - t0}ms)`)
  } catch (err) {
    entry.error = { message: err.message, stack: String(err.stack || '').split('\n').slice(0, 8).join('\n') }
    results.errors.push({ step: name, error: entry.error.message })
    console.error(`❌ ${name}: ${err.message}`)
  } finally {
    entry.finishedAt = new Date().toISOString()
    persist()
  }
}

const screenshot = async (page, label) => {
  const path = resolve(SHOT_DIR, `${stamp}_${label}.png`)
  await page.screenshot({ path, fullPage: true }).catch(() => {})
  return path
}

let browser, context, page

try {
  console.log('Launching Chromium (headless) with saved auth state')
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ storageState: STATE_PATH })
  page = await context.newPage()

  // ──────────────────────────────────────────────────────────────────
  // Step 1: signed-in sanity check
  // ──────────────────────────────────────────────────────────────────
  await step('1_signed_in_check', async (entry) => {
    const resp = await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    entry.details.status = resp?.status() ?? null
    entry.details.url = page.url()
    entry.details.shot = await screenshot(page, '01_home')

    // If we got redirected to /sign-in the auth state is dead.
    if (page.url().includes('/sign-in') || page.url().includes('/auth/login')) {
      throw new Error(`Auth state failed — redirected to ${page.url()}. Re-run save-auth-state.mjs.`)
    }

    // Decode the __session cookie (Clerk JWT) for sub claim.
    const cookies = await context.cookies()
    const session = cookies.find((c) => c.name === '__session')
    if (session && session.value.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(session.value.split('.')[1], 'base64url').toString())
        entry.details.clerk = {
          sub: payload.sub,
          iss: payload.iss,
          aud: payload.aud,
          exp: payload.exp,
          expiresInSec: payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : null,
        }
      } catch (e) {
        entry.details.jwtDecodeError = e.message
      }
    } else {
      entry.details.clerkSessionCookie = 'missing'
    }
  })

  // Bail early if not signed in.
  if (!results.steps[0].ok) {
    throw new Error('Aborting: not signed in. See step 1.')
  }

  // ──────────────────────────────────────────────────────────────────
  // Step 2: open /create-draft and inspect the form
  // ──────────────────────────────────────────────────────────────────
  await step('2_open_create_draft', async (entry) => {
    const resp = await page.goto(`${SITE}/create-draft`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    entry.details.status = resp?.status() ?? null
    entry.details.url = page.url()
    entry.details.shot = await screenshot(page, '02_create_draft')

    // If we get the "Sign In to Create" gate, something is wrong.
    const text = await page.textContent('body').catch(() => '')
    if (text && /sign in to create/i.test(text)) {
      throw new Error('Create-draft is showing the sign-in gate despite saved auth state.')
    }
  })

  // ──────────────────────────────────────────────────────────────────
  // Step 3: step 1 of wizard — pick snake draft
  // ──────────────────────────────────────────────────────────────────
  await step('3_select_draft_type', async (entry) => {
    // The first wizard step asks Draft Type. There are buttons; look for "Snake".
    const snake = page.getByRole('button', { name: /snake/i })
    if ((await snake.count()) === 0) {
      throw new Error('No Snake-draft button visible')
    }
    await snake.first().click()
    entry.details.shot = await screenshot(page, '03_draft_type_chosen')

    // Then click Next.
    const next = page.getByRole('button', { name: /^next$/i })
    if ((await next.count()) > 0) await next.first().click()
    await page.waitForLoadState('domcontentloaded').catch(() => {})
  })

  // ──────────────────────────────────────────────────────────────────
  // Step 4: step 2 of wizard — fill names + counts
  // ──────────────────────────────────────────────────────────────────
  await step('4_fill_setup_step', async (entry) => {
    await page.locator('#userName').fill(userName)
    await page.locator('#teamName').fill(teamName)

    // maxTeams quick-pick button "2" if present, else type into input
    const qp2 = page.getByRole('button', { name: /^2$/ }).first()
    if ((await qp2.count()) > 0) {
      await qp2.click().catch(async () => { await page.locator('#maxTeams').fill('2') })
    } else {
      await page.locator('#maxTeams').fill('2')
    }

    // pokemonPerTeam = 6
    await page.locator('#pokemonPerTeam').fill('6')

    entry.details.shot = await screenshot(page, '04_setup_filled')

    const next = page.getByRole('button', { name: /^next$/i })
    if ((await next.count()) > 0) await next.first().click()
    await page.waitForTimeout(500)
  })

  // ──────────────────────────────────────────────────────────────────
  // Step 5: step 3 of wizard — rules (format + budget)
  // ──────────────────────────────────────────────────────────────────
  await step('5_fill_rules_step', async (entry) => {
    // Format dropdown — default is VGC Reg H so we just leave it.
    // Budget = 100 (default)
    entry.details.shot = await screenshot(page, '05_rules_step')

    const next = page.getByRole('button', { name: /^next$/i })
    if ((await next.count()) > 0) await next.first().click()
    await page.waitForTimeout(500)
  })

  // ──────────────────────────────────────────────────────────────────
  // Step 6: step 4 (Review) — toggle is_public off, submit
  // ──────────────────────────────────────────────────────────────────
  await step('6_review_and_submit', async (entry) => {
    // Turn OFF is_public so the draft doesn't show in the public lobby.
    const isPublic = page.locator('#isPublic')
    if ((await isPublic.count()) > 0) {
      const isChecked = await isPublic.isChecked().catch(() => false)
      if (isChecked) await isPublic.click()
    }

    entry.details.shot = await screenshot(page, '06_review_before_submit')

    // Submit.
    const submit = page.getByRole('button', { name: /create draft room/i })
    if ((await submit.count()) === 0) throw new Error('Create Draft Room button not visible')
    await submit.first().click()

    // Wait for redirect to /draft/<uuid>
    await page.waitForURL(/\/draft\/[0-9a-f-]{8,}/, { timeout: 30_000 })
    entry.details.draftUrl = page.url()
    const m = page.url().match(/\/draft\/([0-9a-f-]+)/)
    entry.details.draftId = m ? m[1] : null

    entry.details.shot2 = await screenshot(page, '06_draft_lobby')
  })

  // ──────────────────────────────────────────────────────────────────
  // Step 7: harvest lobby state — read room code, status, team count from DOM
  // ──────────────────────────────────────────────────────────────────
  await step('7_capture_lobby_state', async (entry) => {
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    const text = await page.textContent('body').catch(() => '')
    // Room code is 6 uppercase chars displayed somewhere; capture first match.
    const codeMatch = text?.match(/[A-Z0-9]{6}/g) || []
    entry.details.candidateRoomCodes = codeMatch.slice(0, 5)
    entry.details.shot = await screenshot(page, '07_lobby_settled')
  })
} catch (err) {
  results.fatal = { message: err.message, stack: String(err.stack || '').split('\n').slice(0, 10).join('\n') }
  console.error('\n❌ FATAL:', err.message)
} finally {
  results.finishedAt = new Date().toISOString()
  persist()
  if (browser) await browser.close().catch(() => {})

  const okCount = results.steps.filter((s) => s.ok).length
  console.log(`\n──── Test pass complete: ${okCount}/${results.steps.length} steps ok ────`)
  console.log(`Results: ${RESULTS_PATH}`)
  console.log(`Screenshots: ${SHOT_DIR}`)
  if (results.errors.length) {
    console.log(`\nErrors:`)
    for (const e of results.errors) console.log(`  - [${e.step}] ${e.error}`)
  }
}
