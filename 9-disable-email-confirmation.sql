-- =====================================================
-- DISABLE EMAIL CONFIRMATION REQUIREMENT
-- =====================================================
-- This removes the "Check your email for confirmation link" requirement
-- Users can sign in immediately after signup
-- =====================================================

-- NOTE: This SQL won't work directly because email confirmation
-- is controlled by Supabase Dashboard settings, not database settings.
--
-- YOU MUST CHANGE THIS IN SUPABASE DASHBOARD INSTEAD:
--
-- 1. Go to: https://app.supabase.com/project/YOUR_PROJECT/auth/providers
-- 2. Click on "Email" provider
-- 3. Scroll to "Email confirmation"
-- 4. UNCHECK "Enable email confirmations"
-- 5. Click "Save"
--
-- This will allow users to sign in immediately without email verification.

-- =====================================================
-- ALTERNATIVE: Auto-confirm existing users via SQL
-- =====================================================
-- If you want to auto-confirm users who are stuck waiting for confirmation:

-- View users pending confirmation:
-- SELECT id, email, email_confirmed_at, created_at
-- FROM auth.users
-- WHERE email_confirmed_at IS NULL;

-- Auto-confirm all pending users (CAUTION: Run this only once):
-- UPDATE auth.users
-- SET email_confirmed_at = NOW(),
--     updated_at = NOW()
-- WHERE email_confirmed_at IS NULL;

-- Auto-confirm a specific user:
-- UPDATE auth.users
-- SET email_confirmed_at = NOW(),
--     updated_at = NOW()
-- WHERE email = 'user@example.com';

-- =====================================================
-- VERIFICATION
-- =====================================================
-- After disabling email confirmation in dashboard:
-- 1. Sign up with a new test email
-- 2. You should be automatically signed in
-- 3. No email confirmation required
-- 4. Check user is confirmed:
--    SELECT email, email_confirmed_at FROM auth.users WHERE email = 'test@example.com';

-- =====================================================
-- IMPORTANT SECURITY NOTE
-- =====================================================
-- Disabling email confirmation means:
-- - Users can sign up with any email (even fake ones)
-- - No email validation required
-- - Faster signup process
-- - Good for draft apps where email validation isn't critical
--
-- If you need email validation later, you can re-enable it in dashboard
-- and existing users will remain confirmed.
-- =====================================================
