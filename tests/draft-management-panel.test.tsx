import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The admin panel used to offer a table-wide client-side "Delete ALL drafts".
// It was removed (production footgun); guard against it coming back.
vi.mock('@/lib/supabase', () => ({ supabase: null }))
vi.mock('@/lib/notifications', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import DraftManagementPanel from '@/components/admin/DraftManagementPanel'

describe('DraftManagementPanel', () => {
  it('has no "Delete All" action', () => {
    render(<DraftManagementPanel />)
    expect(screen.getByText('Draft Management')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /delete all/i })).toBeNull()
  })
})
