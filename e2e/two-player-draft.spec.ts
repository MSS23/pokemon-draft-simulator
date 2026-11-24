import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Two real accounts drive a full snake draft on the deployed site:
 * sign in (host + guest) -> host creates room -> guest joins -> host starts ->
 * alternate picks until complete -> host deletes the draft.
 *
 * Auth: Clerk sign-in tokens (single-use) read from E2E_TOKENS_FILE
 * ({ e2e_host: { token }, e2e_guest: { token } }). After a successful sign-in
 * the storage state (live Clerk session cookies) is cached in the git-ignored
 * .auth/e2e/ so re-runs don't need tokens. State cached next to the tokens
 * file by older versions of this spec is not read: sign in again once.
 * Screenshots go to test-results/e2e-two-player/ (also ignored).
 *
 * Run against a preview/staging deployment. Production is refused unless
 * E2E_ALLOW_PROD=1, since each run creates real rows and uses rate limits:
 *   E2E_BASE_URL=https://<preview>.vercel.app E2E_TOKENS_FILE=/path/tokens.json \
 *     node node_modules/@playwright/test/cli.js test e2e/two-player-draft.spec.ts
 */

const TOKENS_FILE = process.env.E2E_TOKENS_FILE
const STATE_DIR = path.resolve('.auth/e2e')
const SHOT_DIR = path.resolve('test-results/e2e-two-player')
const PICKS_PER_TEAM = 6
const IS_PROD = /(^|\.)draftpokemon\.com$/i.test(new URL(process.env.E2E_BASE_URL ?? 'http://localhost').hostname)

test.skip(!TOKENS_FILE, 'E2E_TOKENS_FILE not set')
test.skip(IS_PROD && process.env.E2E_ALLOW_PROD !== '1', 'refusing to run against production without E2E_ALLOW_PROD=1')
test.setTimeout(10 * 60_000)

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) }).catch(() => {})
}

/** Soft-deletes the draft with this room code from the host's dashboard. */
async function deleteDraftFromDashboard(host: Page, code: string) {
  await host.goto('/dashboard')
  // "All" lists the draft whatever its status (a failed run leaves it active or in setup).
  const allTab = host.getByRole('tab', { name: /^All/i })
  if (await allTab.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)) await allTab.click()
  // Scope to this room's card so another draft owned by the host is never hit.
  const card = host.locator('.card-interactive', { hasText: code }).first()
  const del = card.locator('button[title="Delete draft"]')
  await del.waitFor({ state: 'attached', timeout: 30_000 })
  await card.hover()
  await del.click()
  await host.getByRole('button', { name: 'Delete Draft' }).click()
  await expect(host.getByText(/Draft Deleted/i)).toBeVisible({ timeout: 20_000 })
}

async function signIn(ctx: BrowserContext, who: 'e2e_host' | 'e2e_guest'): Promise<Page> {
  const page = await ctx.newPage()
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const stateFile = path.join(STATE_DIR, `${who}-state.json`)
  const isSignedIn = async () => {
    await page.goto('/dashboard')
    return page
      .waitForFunction(() => !!(window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user, null, { timeout: 15_000 })
      .then(() => true, () => false)
  }
  if (fs.existsSync(stateFile)) {
    const cookies = JSON.parse(fs.readFileSync(stateFile, 'utf8')).cookies
    await ctx.addCookies(cookies)
    if (await isSignedIn()) return page
  }
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE!, 'utf8'))
  const token = tokens[who]?.token
  expect(token, `${who} token present`).toBeTruthy()
  await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(token)}`)
  await page
    .waitForFunction(() => !!(window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user, null, { timeout: 30_000 })
    .catch(async () => {
      await shot(page, `${who}-signin-failed`)
      throw new Error(`${who}: ticket sign-in did not produce a Clerk user`)
    })
  fs.writeFileSync(stateFile, JSON.stringify(await ctx.storageState()))
  return page
}

async function dismissOverlays(page: Page) {
  for (const name of [/continue to draft/i, /got it/i]) {
    const b = page.getByRole('button', { name }).first()
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2_000 }).catch(() => {})
  }
}

async function whoseTurn(host: Page, guest: Page): Promise<Page | null> {
  for (const p of [host, guest]) {
    const onClock = p.getByText(/You are on the clock|You — On the Clock/i).first()
    if (await onClock.isVisible().catch(() => false)) return p
  }
  return null
}

async function makePick(page: Page, label: string, host: Page) {
  await dismissOverlays(page)
  await page.locator('[role="article"][aria-label]').first().waitFor({ state: 'visible', timeout: 20_000 })
  // PokemonCard labels unpickable cards "drafted", "unaffordable" or "would bust budget".
  const cards = page.locator(
    '[role="article"][aria-label]:not([aria-label*="drafted"]):not([aria-label*="unaffordable"]):not([aria-label*="would bust budget"])'
  )
  // Cheapest available card: the app budget-locks picks that would strand a later slot.
  const labels = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  const parsed = labels
    .map((l) => ({ l, name: l.split(',')[0], cost: Number((l.match(/(\d+) points/) ?? [])[1] ?? 999) }))
    .sort((x, y) => x.cost - y.cost)
  const skipTurn = async (why: string) => {
    // Skip lives in DraftControls, which only the host/admin sees.
    await host.getByRole('button', { name: /^skip$/i }).first().click()
    await host.getByRole('button', { name: 'Skip Turn' }).click()
    console.log(`[skip] ${label} ${why}: host skipped the turn`)
    return null
  }
  if (parsed.length === 0) return skipTurn('has no affordable card')
  const { l, name } = parsed[0]
  await page.locator(`[role="article"][aria-label="${l}"]`).first().click()
  const confirm = page.getByRole('button', { name: new RegExp(`^Draft ${name}$`) })
  if (!(await confirm.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false))) {
    await page.keyboard.press('Escape')
    return skipTurn(`could not draft ${name}`)
  }
  await confirm.click()
  await confirm.waitFor({ state: 'hidden', timeout: 20_000 })
  console.log(`[pick] ${label} drafted ${name} (${parsed[0].cost})`)
  return name
}

test('two accounts complete a snake draft end to end', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const guestCtx = await browser.newContext()
  // First-login onboarding tour ("Choose Your Guide") is a modal that would block clicks.
  for (const ctx of [hostCtx, guestCtx]) await ctx.addInitScript(() => { localStorage.setItem('tour:completed', '1'); localStorage.setItem('draft-tour-completed', '1') })
  const host = await signIn(hostCtx, 'e2e_host')
  const guest = await signIn(guestCtx, 'e2e_guest')
  console.log('[auth] both accounts signed in')

  // Host creates the room through the same API the wizard uses. Set
  // E2E_ROOM_CODE to resume an existing room instead (create is rate-limited).
  let code = process.env.E2E_ROOM_CODE?.toUpperCase() ?? ''
  // Set while this run owns an undeleted draft; the finally block removes it.
  let createdCode: string | null = null
  if (!code) {
    const created = await host.evaluate(async (picks) => {
      const res = await fetch('/api/draft/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Draft',
          hostName: 'E2E Host',
          teamName: 'E2E Host Team',
          settings: {
            maxTeams: 2,
            draftType: 'points',
            timeLimit: 0,
            pokemonPerTeam: picks,
            budgetPerTeam: 100,
            formatId: 'vgc-reg-mc',
            scoringSystem: 'budget',
          },
          isPublic: false,
        }),
      })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    }, PICKS_PER_TEAM)
    expect(created.status, `create draft: ${JSON.stringify(created.body)}`).toBe(200)
    code = created.body.roomCode
    createdCode = code
    console.log(`[create] room ${code}`)
  }

  try {
    await host.goto(`/draft/${code.toLowerCase()}?userName=E2E%20Host&teamName=E2E%20Host%20Team&isHost=true`)
    await expect(host.getByRole('heading', { name: code })).toBeVisible({ timeout: 30_000 })
    await shot(host, '1-host-lobby')

    if (process.env.E2E_ROOM_CODE) {
      await guest.goto(`/draft/${code.toLowerCase()}`)
      await expect(guest.getByRole('heading', { name: code })).toBeVisible({ timeout: 30_000 })
      console.log('[resume] both in room', code)
    } else {
      // Guest joins through the UI.
      await guest.goto('/join-draft')
      await guest.getByLabel('Room code').fill(code)
      await guest.getByRole('button', { name: /find room/i }).click()
      const teamName = guest.locator('#teamName')
      await teamName.waitFor({ state: 'visible', timeout: 20_000 })
      await teamName.fill('E2E Guest Team')
      const userName = guest.locator('#userName')
      if ((await userName.isVisible().catch(() => false)) && !(await userName.inputValue())) {
        await userName.fill('E2E Guest')
      }
      await shot(guest, '2-guest-join-form')
      await guest.getByRole('button', { name: 'Join Draft' }).click()
      await guest.waitForURL(new RegExp(`/draft/${code.toLowerCase()}`), { timeout: 30_000 })
      await expect(guest.getByText(/Share code/i)).toBeVisible({ timeout: 30_000 })
      console.log('[join] guest in lobby')
      await shot(guest, '3-guest-lobby')
    }

    // Host starts. Give both realtime subscriptions a moment to register first.
    await host.waitForTimeout(8_000)
    const start = host.getByRole('button', { name: /Start Draft/i })
    if (process.env.E2E_ROOM_CODE && !(await start.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false))) {
      console.log('[start] skipped — draft already running')
    } else {
      await expect(start, 'start button appears once guest team is in').toBeVisible({ timeout: 30_000 })
      await start.click()
      console.log('[start] clicked')
    }
    await host.waitForTimeout(3_000)
    await dismissOverlays(host)
    await dismissOverlays(guest)
    await shot(host, '4-host-started')
    await shot(guest, '4-guest-started')

    // Alternate picks until the draft completes.
    const total = PICKS_PER_TEAM * 2
    const isComplete = () => host.getByText(/Draft Complete/i).first().isVisible().catch(() => false)
    for (let i = 1; i <= total; i++) {
      if (await isComplete()) break
      let turn: Page | null = null
      for (let tries = 0; tries < 30 && !turn && !(await isComplete()); tries++) {
        await dismissOverlays(host)
        await dismissOverlays(guest)
        turn = await whoseTurn(host, guest)
        if (!turn) await host.waitForTimeout(1_000)
      }
      if (!turn && (await isComplete())) break
      if (!turn) {
        await shot(host, `err-host-pick${i}`)
        await shot(guest, `err-guest-pick${i}`)
      }
      expect(turn, `pick ${i}: someone should be on the clock`).not.toBeNull()
      await makePick(turn!, `#${i} ${turn === host ? 'host' : 'guest'}`, host).catch(async (e) => {
        await shot(turn!, `err-pick${i}`)
        throw e
      })
    }

    await expect(host.getByText(/Draft Complete/i).first()).toBeVisible({ timeout: 60_000 })
    console.log('[done] draft complete')
    await shot(host, '5-host-complete')

    // Host deletes the draft from the dashboard (regression for the deleted_by grant bug).
    await deleteDraftFromDashboard(host, code)
    createdCode = null
    console.log('[delete] ok')
    await shot(host, '6-host-deleted')
  } finally {
    // A failure anywhere above must not leave this run's draft behind.
    if (createdCode) {
      const leftover = createdCode
      await deleteDraftFromDashboard(host, leftover).then(
        () => console.log(`[cleanup] deleted room ${leftover}`),
        (e) => console.log(`[cleanup] could not delete room ${leftover}: ${e}`)
      )
    }
  }
})
