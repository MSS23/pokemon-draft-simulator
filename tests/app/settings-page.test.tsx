import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// I-02: the profile upsert must target user_id (PK is id) and the prefs save must surface errors.
const upsert = vi.fn()
const update = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { user_id: 'user_1', username: 'ash', display_name: 'Ash', avatar_url: null, favorite_pokemon: 'Pikachu', bio: null, twitter_profile: null, twitch_channel: null, nationality: null },
            error: null,
          }),
        }),
      }),
      upsert: (...args: unknown[]) => upsert(...args),
      update: (...args: unknown[]) => { update(...args); return { eq: async () => update.mock.results.at(-1)?.value ?? { error: null } } },
    }),
  },
}))
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ signOut: vi.fn() }) }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user_1', email: 'a@b.c', user_metadata: {} }, loading: false }),
}))
vi.mock('@/components/layout/SidebarLayout', () => ({ SidebarLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/lib/push-notifications', () => ({
  isPushSupported: () => false,
  getPushPermissionStatus: () => 'unsupported',
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  hasActiveSubscription: async () => false,
}))
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }))

import SettingsPage from '@/app/settings/page'

describe('SettingsPage saves', () => {
  beforeEach(() => {
    upsert.mockResolvedValue({ error: null })
  })

  it('upserts the profile on user_id so existing rows update instead of failing 23505', async () => {
    render(<SettingsPage />)
    await userEvent.click(await screen.findByRole('button', { name: /save profile/i }))
    await waitFor(() => expect(upsert).toHaveBeenCalled())
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id' })
    expect(toastSuccess).toHaveBeenCalledWith('Profile saved!')
  })

  it('maps a username unique violation to a friendly error', async () => {
    upsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    render(<SettingsPage />)
    await userEvent.click(await screen.findByRole('button', { name: /save profile/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('That username is already taken'))
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('shows an error toast, not success, when saving preferences fails', async () => {
    update.mockReturnValue({ error: { message: 'rls' } })
    render(<SettingsPage />)
    await userEvent.click(await screen.findByRole('tab', { name: /alerts/i }))
    await userEvent.click(await screen.findByRole('button', { name: /save preferences/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to save preferences'))
    expect(toastSuccess).not.toHaveBeenCalledWith('Preferences saved')
  })
})
