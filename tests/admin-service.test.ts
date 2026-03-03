import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminService } from '@/lib/admin-service'
import { supabase } from '@/lib/supabase'

// Mock supabase - use factory function to avoid hoisting issues
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Cast to access mock methods
const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
}

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isAdmin', () => {
    it('should return false when supabase is not available', async () => {
      // Temporarily override supabase to null
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await AdminService.isAdmin('draft-1', 'user-1')
      expect(result).toBe(false)

      // Restore
      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should return false when participant not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const mockEqInner = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqOuter = vi.fn().mockReturnValue({ eq: mockEqInner })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqOuter })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.isAdmin('draft-1', 'user-1')

      expect(result).toBe(false)
      expect(mockSupabase.from).toHaveBeenCalledWith('participants')
      expect(mockSelect).toHaveBeenCalledWith('is_host, is_admin')
      expect(mockEqOuter).toHaveBeenCalledWith('draft_id', 'draft-1')
      expect(mockEqInner).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('should return true when user is host', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { is_host: true, is_admin: false },
        error: null,
      })
      const mockEqInner = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqOuter = vi.fn().mockReturnValue({ eq: mockEqInner })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqOuter })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.isAdmin('draft-1', 'user-1')

      expect(result).toBe(true)
    })

    it('should return true when user is admin', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { is_host: false, is_admin: true },
        error: null,
      })
      const mockEqInner = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqOuter = vi.fn().mockReturnValue({ eq: mockEqInner })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqOuter })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.isAdmin('draft-1', 'user-1')

      expect(result).toBe(true)
    })

    it('should return false when user is neither host nor admin', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { is_host: false, is_admin: false },
        error: null,
      })
      const mockEqInner = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqOuter = vi.fn().mockReturnValue({ eq: mockEqInner })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqOuter })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.isAdmin('draft-1', 'user-1')

      expect(result).toBe(false)
    })

    it('should return false when query throws an exception', async () => {
      const mockSingle = vi.fn().mockRejectedValue(new Error('Network error'))
      const mockEqInner = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEqOuter = vi.fn().mockReturnValue({ eq: mockEqInner })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqOuter })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.isAdmin('draft-1', 'user-1')

      expect(result).toBe(false)
    })
  })

  describe('getDraftAdmins', () => {
    it('should return empty result when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await AdminService.getDraftAdmins('draft-1')
      expect(result).toEqual({ host: null, admins: [] })

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should return host and admins correctly', async () => {
      const hostParticipant = {
        id: 'p-1',
        user_id: 'user-1',
        draft_id: 'draft-1',
        is_host: true,
        is_admin: false,
        display_name: 'Host User',
      }
      const adminParticipant = {
        id: 'p-2',
        user_id: 'user-2',
        draft_id: 'draft-1',
        is_host: false,
        is_admin: true,
        display_name: 'Admin User',
      }

      const mockOr = vi.fn().mockResolvedValue({
        data: [hostParticipant, adminParticipant],
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ or: mockOr })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.getDraftAdmins('draft-1')

      expect(result.host).toEqual(hostParticipant)
      expect(result.admins).toEqual([adminParticipant])
      expect(mockSupabase.from).toHaveBeenCalledWith('participants')
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockEq).toHaveBeenCalledWith('draft_id', 'draft-1')
      expect(mockOr).toHaveBeenCalledWith('is_host.eq.true,is_admin.eq.true')
    })

    it('should return null host when no host in results', async () => {
      const adminParticipant = {
        id: 'p-2',
        user_id: 'user-2',
        draft_id: 'draft-1',
        is_host: false,
        is_admin: true,
        display_name: 'Admin User',
      }

      const mockOr = vi.fn().mockResolvedValue({
        data: [adminParticipant],
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ or: mockOr })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.getDraftAdmins('draft-1')

      expect(result.host).toBeNull()
      expect(result.admins).toEqual([adminParticipant])
    })

    it('should return empty admins when only host exists', async () => {
      const hostParticipant = {
        id: 'p-1',
        user_id: 'user-1',
        draft_id: 'draft-1',
        is_host: true,
        is_admin: false,
        display_name: 'Host User',
      }

      const mockOr = vi.fn().mockResolvedValue({
        data: [hostParticipant],
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ or: mockOr })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.getDraftAdmins('draft-1')

      expect(result.host).toEqual(hostParticipant)
      expect(result.admins).toEqual([])
    })

    it('should return empty result on query error', async () => {
      const mockOr = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })
      const mockEq = vi.fn().mockReturnValue({ or: mockOr })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.getDraftAdmins('draft-1')

      expect(result).toEqual({ host: null, admins: [] })
    })

    it('should return empty result when query throws', async () => {
      const mockOr = vi.fn().mockRejectedValue(new Error('Network error'))
      const mockEq = vi.fn().mockReturnValue({ or: mockOr })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      const result = await AdminService.getDraftAdmins('draft-1')

      expect(result).toEqual({ host: null, admins: [] })
    })
  })

  describe('promoteToAdmin', () => {
    it('should return error when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await AdminService.promoteToAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        promotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: false, error: 'Supabase not available' })

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should call rpc with correct parameters on success', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: null })

      const result = await AdminService.promoteToAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        promotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: true })
      expect(mockSupabase.rpc).toHaveBeenCalledWith('promote_to_admin', {
        p_draft_id: 'draft-1',
        p_user_id: 'user-1',
      })
    })

    it('should return error when rpc returns error', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'Not authorized' } })

      const result = await AdminService.promoteToAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        promotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: false, error: 'Not authorized' })
    })

    it('should return error when rpc throws', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network failure'))

      const result = await AdminService.promoteToAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        promotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: false, error: 'Network failure' })
    })
  })

  describe('demoteFromAdmin', () => {
    it('should return error when supabase is not available', async () => {
      const supabaseModule = await import('@/lib/supabase')
      const original = supabaseModule.supabase
      Object.defineProperty(supabaseModule, 'supabase', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = await AdminService.demoteFromAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        demotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: false, error: 'Supabase not available' })

      Object.defineProperty(supabaseModule, 'supabase', {
        value: original,
        writable: true,
        configurable: true,
      })
    })

    it('should call rpc with correct parameters on success', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: null })

      const result = await AdminService.demoteFromAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        demotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: true })
      expect(mockSupabase.rpc).toHaveBeenCalledWith('demote_from_admin', {
        p_draft_id: 'draft-1',
        p_user_id: 'user-1',
      })
    })

    it('should return error when rpc returns error', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'Cannot demote host' } })

      const result = await AdminService.demoteFromAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        demotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: false, error: 'Cannot demote host' })
    })

    it('should return error when rpc throws', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network failure'))

      const result = await AdminService.demoteFromAdmin({
        draftId: 'draft-1',
        participantId: 'user-1',
        demotingUserId: 'host-1',
      })

      expect(result).toEqual({ success: false, error: 'Network failure' })
    })
  })
})
