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
 * the storage state is cached next to that file so re-runs don't need tokens.
 *
 * Run:
 *   E2E_BASE_URL=https://draftpokemon.com E2E_TOKENS_FILE=/path/tokens.json \
 *     npx playwright test e2e/two-player-draft.spec.ts
 */

const TOKENS_FILE = process.env.E2E_TOKENS_FILE
const OUT_DIR = TOKENS_FILE ? path.dirname(TOKENS_FILE) : '.'
const PICKS_PER_TEAM = 6

test.skip(!TOKENS_FILE, 'E2E_TOKENS_FILE not set')
test.setTimeout(10 * 60_000)

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) }).catch(() => {})
}

async function signIn(ctx: BrowserContext, who: 'e2e_host' | 'e2e_guest'): Promise<Page> {
  const page = await ctx.newPage()
  const stateFile = path.join(OUT_DIR, `${who}-state.json`)
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
  for (const name of [/^skip$/i, /continue to draft/i, /continue/i, /got it/i]) {
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

async function makePick(page: Page, label: string) {
  await dismissOverlays(page)
  const card = page.locator('[role="article"][aria-label]:not([aria-label*="drafted"])').first()
  await card.waitFor({ state: 'visible', timeout: 20_000 })
  const name = (await card.getAttribute('aria-label'))!.split(',')[0]
  await card.click()
  const confirm = page.getByRole('button', { name: new RegExp(`^Draft ${name}$`) })
  await confirm.waitFor({ state: 'visible', timeout: 10_000 })
  await confirm.click()
  await confirm.waitFor({ state: 'hidden', timeout: 20_000 })
  console.log(`[pick] ${label} drafted ${name}`)
  return name
}

test('two accounts complete a snake draft end to end', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const guestCtx = await browser.newContext()
  const host = await signIn(hostCtx, 'e2e_host')
  const guest = await signIn(guestCtx, 'e2e_guest')
  console.log('[auth] both accounts signed in')

  // Host creates the room through the same API the wizard uses.
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
  const code: string = created.body.roomCode
  console.log(`[create] room ${code}`)

  await host.goto(`/draft/${code.toLowerCase()}?userName=E2E%20Host&teamName=E2E%20Host%20Team&isHost=true`)
  await expect(host.getByText(/Share code/i)).toBeVisible({ timeout: 30_000 })
  await shot(host, '1-host-lobby')

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

  // Host starts.
  const start = host.getByRole('button', { name: /Start Draft/i })
  await expect(start, 'start button appears once guest team is in').toBeVisible({ timeout: 30_000 })
  await start.click()
  console.log('[start] clicked')
  await host.waitForTimeout(3_000)
  await dismissOverlays(host)
  await dismissOverlays(guest)
  await shot(host, '4-host-started')
  await shot(guest, '4-guest-started')

  // Alternate picks until the draft completes.
  const total = PICKS_PER_TEAM * 2
  for (let i = 1; i <= total; i++) {
    let turn: Page | null = null
    for (let tries = 0; tries < 30 && !turn; tries++) {
      await dismissOverlays(host)
      await dismissOverlays(guest)
      turn = await whoseTurn(host, guest)
      if (!turn) await host.waitForTimeout(1_000)
    }
    if (!turn) {
      await shot(host, `err-host-pick${i}`)
      await shot(guest, `err-guest-pick${i}`)
    }
    expect(turn, `pick ${i}: someone should be on the clock`).not.toBeNull()
    await makePick(turn!, `#${i} ${turn === host ? 'host' : 'guest'}`).catch(async (e) => {
      await shot(turn!, `err-pick${i}`)
      throw e
    })
  }

  await expect(host.getByText(/Draft Complete/i).first()).toBeVisible({ timeout: 60_000 })
  console.log('[done] draft complete')
  await shot(host, '5-host-complete')

  // Host deletes the draft from the dashboard (regression for the deleted_by grant bug).
  await host.goto('/dashboard')
  const del = host.locator('button[title="Delete draft"]').first()
  await del.waitFor({ state: 'attached', timeout: 30_000 })
  await del.click({ force: true })
  await host.getByRole('button', { name: 'Delete Draft' }).click()
  await expect(host.getByText(/Draft Deleted/i)).toBeVisible({ timeout: 20_000 })
  console.log('[delete] ok')
  await shot(host, '6-host-deleted')
})
