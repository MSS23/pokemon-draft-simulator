# Authentication Implementation Plan

## Current State

The app currently uses **guest-based authentication** with temporary IDs:
- User IDs: `guest-${timestamp}-${random}`
- No persistent user identity across sessions
- Admin/host status lost on browser refresh/close
- Cannot reliably transfer admin rights between users

## Why Add Authentication?

### Critical Issues Solved:
1. **Persistent Admin Status** - Admin role survives browser close/refresh
2. **Reliable User Identity** - Same user recognized across sessions
3. **Admin Transfer** - Host can promote others to admin, and it persists
4. **Security** - Server-side verification of admin actions
5. **User Experience** - Users can return to drafts later, view history

### Current Limitations:
- ❌ Admin status doesn't persist across sessions
- ❌ Can't verify who created a draft after refresh
- ❌ No way to reliably grant admin to another user
- ❌ Users lose access to their drafts if browser closes
- ❌ No draft history or saved preferences

## Implementation Plan

### Phase 1: Setup Supabase Authentication

#### 1.1 Enable Supabase Auth
```sql
-- Already available in Supabase, just need to configure
-- Email/Password provider enabled by default
-- Optional: Enable social providers (Google, GitHub, Discord)
```

#### 1.2 Update Database Schema

**Add users table reference:**
```sql
-- Create a profile table for additional user data
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
```

**Update existing tables:**
```sql
-- Add nullable user_id to participants (for migration)
ALTER TABLE public.participants
  ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Add index for performance
CREATE INDEX idx_participants_user_id ON public.participants(user_id);

-- Add is_admin field
ALTER TABLE public.participants
  ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

-- Update drafts table to reference auth users
ALTER TABLE public.drafts
  ADD COLUMN host_user_id UUID REFERENCES auth.users(id);
```

#### 1.3 Create Auth Components

**Files to create:**

1. **`src/lib/auth.ts`** - Auth helper functions
```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from './supabase'

export const supabaseAuth = createClientComponentClient<Database>()

export async function signUp(email: string, password: string, displayName: string) {
  // Sign up logic
}

export async function signIn(email: string, password: string) {
  // Sign in logic
}

export async function signOut() {
  // Sign out logic
}

export async function getCurrentUser() {
  // Get current user
}

export async function continueAsGuest(displayName: string) {
  // Generate guest user session (temporary)
}
```

2. **`src/components/auth/AuthModal.tsx`** - Sign in/up modal
```typescript
// Modal with tabs:
// - Sign In
// - Sign Up
// - Continue as Guest
```

3. **`src/components/auth/AuthProvider.tsx`** - Auth context provider
```typescript
// Provides auth state throughout app
// - currentUser
// - isAuthenticated
// - isGuest
// - loading
```

4. **`src/hooks/useAuth.ts`** - Auth hook
```typescript
export function useAuth() {
  // Access auth context
  // Returns user, auth methods, loading state
}
```

#### 1.4 Update Create Draft Flow

**Before (current):**
```typescript
const hostId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
```

**After:**
```typescript
const { user } = useAuth()

// If authenticated user
const hostId = user.id
const hostUserId = user.id

// If guest
const hostId = `guest-${sessionId}`
const hostUserId = null // Can upgrade later
```

#### 1.5 Update Join Draft Flow

**Changes needed:**
1. Check if user is authenticated
2. If yes, use `user.id` as participant ID
3. If no, offer "Sign in" or "Continue as Guest"
4. Store user_id in participants table

#### 1.6 Migration Strategy

**For existing drafts:**
1. Keep current guest system working
2. New drafts can use auth or guest
3. Allow users to "claim" guest drafts by signing up
4. Gradually deprecate guest-only mode

```typescript
// Migration helper
async function claimGuestDraft(guestId: string, userId: string) {
  // Transfer ownership from guest ID to user ID
  await supabase
    .from('participants')
    .update({ user_id: userId })
    .eq('user_id', null)
    .eq('id', guestId)
}
```

---

### Phase 2: Admin Management System

#### 2.1 Update Participants Table

**Already added in Phase 1:**
```sql
ALTER TABLE public.participants
  ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
```

**Set host as admin by default:**
```sql
-- In draft creation
UPDATE participants
SET is_admin = TRUE
WHERE draft_id = ? AND is_host = TRUE;
```

#### 2.2 Create Admin Management UI

**`src/components/draft/AdminManagement.tsx`**
```typescript
interface AdminManagementProps {
  draftId: string
  participants: Participant[]
  currentUserId: string
  isCurrentUserAdmin: boolean
}

// Features:
// - List all participants
// - Show admin badges
// - Promote/demote admin (admin-only)
// - Remove participant (admin-only)
// - Transfer host (host-only)
```

#### 2.3 Add Admin Service Methods

**`src/lib/admin-service.ts`** (update existing or create):
```typescript
class AdminService {
  // Promote user to admin
  static async promoteToAdmin(draftId: string, participantId: string) {
    // Verify caller is admin
    // Set is_admin = true
  }

  // Demote admin to regular user
  static async demoteFromAdmin(draftId: string, participantId: string) {
    // Verify caller is admin
    // Ensure not removing last admin
    // Set is_admin = false
  }

  // Transfer host status
  static async transferHost(draftId: string, newHostId: string) {
    // Verify caller is current host
    // Update host_id in drafts
    // Update is_host in participants
  }

  // Check if user is admin
  static async isUserAdmin(draftId: string, userId: string): Promise<boolean> {
    // Query participants table
    // Return is_admin OR is_host
  }
}
```

#### 2.4 Add Authorization Checks

**Server-side validation:**
```typescript
// Before any admin action
async function verifyAdmin(draftId: string, userId: string) {
  const { data } = await supabase
    .from('participants')
    .select('is_admin, is_host')
    .eq('draft_id', draftId)
    .eq('user_id', userId)
    .single()

  if (!data?.is_admin && !data?.is_host) {
    throw new Error('Unauthorized: Admin access required')
  }
}

// Usage
await verifyAdmin(draftId, user.id)
await DraftService.resetDraft(draftId)
```

#### 2.5 Update UI to Show Admin Status

**Changes to existing components:**

1. **Participant List**
   - Show admin badge next to names
   - Show crown for host

2. **Draft Controls**
   - Check `isAdmin` instead of just `isHost`
   - Show admin management button

3. **Activity Feed**
   - Tag admin actions differently
   - Show who promoted whom

---

### Phase 3: Enhanced Features (Future)

#### 3.1 User Profiles
- Display name, username, avatar
- Stats (drafts hosted, drafts joined)
- Preferences (theme, notifications)

#### 3.2 Draft History
- List of all drafts user participated in
- Filter by role (host, admin, participant)
- View past results

#### 3.3 Social Features
- Friend system
- Invite friends to drafts
- Private drafts (invite-only)

#### 3.4 Email Notifications
- Draft starting soon
- Your turn to pick
- Draft completed
- Admin promoted you

---

## Implementation Checklist

### Phase 1: Authentication (Week 1-2)
- [ ] Enable Supabase Auth providers
- [ ] Create database schema updates
- [ ] Build auth components (SignIn, SignUp, Modal)
- [ ] Create AuthProvider and useAuth hook
- [ ] Update create draft flow
- [ ] Update join draft flow
- [ ] Test guest vs authenticated flows
- [ ] Add "Continue as Guest" option
- [ ] Migration plan for existing drafts

### Phase 2: Admin System (Week 2-3)
- [ ] Add is_admin field to participants
- [ ] Build AdminManagement component
- [ ] Create admin service methods
- [ ] Add server-side authorization checks
- [ ] Update DraftControls for admin checks
- [ ] Add promote/demote UI
- [ ] Add transfer host UI
- [ ] Test admin persistence across sessions
- [ ] Add admin activity logging

### Phase 3: Polish (Week 3-4)
- [ ] Add user profiles
- [ ] Build draft history page
- [ ] Add email notifications
- [ ] Social features (optional)
- [ ] Admin audit log
- [ ] Cleanup guest migration path

---

## Technical Details

### Supabase Auth Setup

**Environment Variables (already have these):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://dwqlxyeefzcclqdzteez.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Auth Providers to Enable:**
1. Email/Password (default) ✅
2. Google OAuth (recommended)
3. GitHub OAuth (recommended)
4. Discord OAuth (optional)

**Auth Configuration in Supabase Dashboard:**
```
Authentication > Providers
- Email: Enabled
  - Confirm email: Optional (disable for testing)
  - Secure email change: Enabled

- Google: Enable and add credentials
  - Client ID: (from Google Cloud Console)
  - Client Secret: (from Google Cloud Console)
```

### Database Row Level Security (RLS)

**Important security policies to add:**

```sql
-- Drafts: Anyone can read public drafts, only host can modify
CREATE POLICY "Public drafts are viewable by everyone"
  ON public.drafts FOR SELECT
  USING (is_public = true OR host_user_id = auth.uid());

CREATE POLICY "Only host can update draft"
  ON public.drafts FOR UPDATE
  USING (host_user_id = auth.uid());

-- Participants: Only admins can modify
CREATE POLICY "Anyone can view participants"
  ON public.participants FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert participants"
  ON public.participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.draft_id = draft_id
      AND p.user_id = auth.uid()
      AND (p.is_admin = true OR p.is_host = true)
    )
  );
```

---

## Code Examples

### Example: Using Auth in Create Draft

```typescript
'use client'

import { useAuth } from '@/hooks/useAuth'
import { DraftService } from '@/lib/draft-service'

export default function CreateDraftPage() {
  const { user, isAuthenticated, isGuest } = useAuth()

  const handleCreate = async () => {
    const { roomCode } = await DraftService.createDraft({
      name: formData.draftName,
      hostName: user?.displayName || formData.userName,
      hostUserId: isAuthenticated ? user.id : null, // null for guests
      teamName: formData.teamName,
      settings: { /* ... */ }
    })

    router.push(`/draft/${roomCode}`)
  }

  return (
    <div>
      {isGuest && (
        <div className="bg-blue-50 p-4 rounded mb-4">
          <p>You're playing as a guest. Sign up to save your draft history!</p>
          <button onClick={() => openAuthModal()}>Create Account</button>
        </div>
      )}
      {/* form */}
    </div>
  )
}
```

### Example: Admin Check Middleware

```typescript
// src/lib/admin-middleware.ts
export async function requireAdmin(
  draftId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('participants')
    .select('is_admin, is_host')
    .eq('draft_id', draftId)
    .eq('user_id', userId)
    .single()

  if (error || (!data?.is_admin && !data?.is_host)) {
    throw new Error('Unauthorized: Admin privileges required')
  }
}

// Usage in draft-service.ts
static async resetDraft(draftId: string, userId: string): Promise<void> {
  await requireAdmin(draftId, userId)

  // ... rest of reset logic
}
```

---

## Testing Plan

### Phase 1 Testing:
1. ✅ Sign up new user
2. ✅ Sign in existing user
3. ✅ Create draft as authenticated user
4. ✅ Create draft as guest
5. ✅ Join draft as authenticated user
6. ✅ Join draft as guest
7. ✅ Close browser and return (auth persists)
8. ✅ Close browser and return (guest gets new session)

### Phase 2 Testing:
1. ✅ Host creates draft (is admin by default)
2. ✅ Host promotes another user to admin
3. ✅ New admin closes browser and returns (still admin)
4. ✅ Admin uses admin controls (reset, delete)
5. ✅ Non-admin cannot access admin controls
6. ✅ Host transfers host status
7. ✅ Cannot remove last admin
8. ✅ Admin activity is logged

---

## Migration Notes

**Backward Compatibility:**
- Existing guest drafts continue to work
- New auth system is opt-in initially
- Can mix authenticated and guest users in same draft
- Eventually deprecate guest-only mode

**Data Migration:**
```sql
-- One-time migration to set existing hosts as admins
UPDATE participants p
SET is_admin = true
WHERE is_host = true;

-- Add user_id for any authenticated users (manual or via script)
-- This would need custom logic based on your user tracking
```

---

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Next.js + Supabase Auth](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Social Login Setup](https://supabase.com/docs/guides/auth/social-login)

---

## Estimated Timeline

- **Phase 1 (Auth Setup)**: 1-2 weeks
  - Basic auth: 3-5 days
  - UI components: 2-3 days
  - Testing & polish: 2-3 days

- **Phase 2 (Admin System)**: 1 week
  - Database changes: 1 day
  - Admin UI: 2-3 days
  - Authorization checks: 2 days
  - Testing: 2 days

- **Phase 3 (Enhanced Features)**: 2-3 weeks
  - User profiles: 3-4 days
  - Draft history: 3-4 days
  - Notifications: 3-5 days
  - Social features: 5-7 days

**Total: 4-6 weeks for complete implementation**

---

## Immediate Next Steps (When Ready)

1. Enable email auth in Supabase dashboard
2. Create `profiles` table
3. Add `user_id` and `is_admin` to participants
4. Build basic AuthModal component
5. Update create draft to support auth users
6. Test authentication flow

**Note:** For now, continue with guest system. When you're ready to implement auth, this document provides the complete roadmap.
