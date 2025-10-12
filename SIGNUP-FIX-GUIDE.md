# Signup Fix Guide

## Problem
Users getting "Database error saving new user" when trying to sign up.

## Root Cause
The user profile trigger is likely failing due to:
1. RLS policies blocking the trigger from inserting
2. Trigger function not handling edge cases properly
3. Missing columns or constraints

## Solution: Run These SQL Files in Order

### Step 1: Fix the Trigger Function
Run [7-fix-signup-trigger.sql](7-fix-signup-trigger.sql) in Supabase SQL Editor

This will:
- Replace the trigger with a more robust version
- Handle all edge cases (missing email, duplicate profiles, etc.)
- Ensure signup never fails due to profile creation errors
- Add multiple fallbacks for display name

### Step 2: Fix RLS Policies
Run [8-fix-user-profiles-rls.sql](8-fix-user-profiles-rls.sql) in Supabase SQL Editor

This will:
- Set up proper RLS policies for user_profiles table
- Allow the trigger (SECURITY DEFINER) to insert profiles
- Allow users to view and update their own profiles
- Allow authenticated users to create profiles

### Step 3: Verify the Fix

1. **Check the trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

2. **Check RLS policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'user_profiles';
   ```

   You should see 4 policies:
   - User profiles are viewable by everyone (SELECT)
   - Allow trigger to insert profiles (INSERT)
   - Users can update their own profile (UPDATE)
   - Users can create profiles (INSERT)

3. **Test signup:**
   - Try signing up with a new email (e.g., `test123@example.com`)
   - Should complete without errors
   - Check profile was created:
     ```sql
     SELECT * FROM user_profiles ORDER BY created_at DESC LIMIT 5;
     ```

## Alternative: Disable the Trigger Temporarily

If you need signups to work immediately while debugging, you can temporarily disable the trigger:

```sql
-- Disable trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Users can sign up, but profiles won't be auto-created
-- You'll need to create profiles manually or via application code
```

Then create profiles in your application code instead:

```typescript
// After successful signup
const { data: authData, error: authError } = await supabase.auth.signUp({
  email,
  password
})

if (authData.user && !authError) {
  // Manually create profile
  await supabase.from('user_profiles').insert({
    user_id: authData.user.id,
    display_name: email.split('@')[0],
    avatar_url: null
  })
}
```

## Common Issues

### Issue: "permission denied for table user_profiles"
**Fix:** Run [8-fix-user-profiles-rls.sql](8-fix-user-profiles-rls.sql) to fix RLS policies

### Issue: "column 'created_at' does not have a default value"
**Fix:** The trigger now explicitly sets created_at and updated_at

### Issue: "duplicate key value violates unique constraint"
**Fix:** The improved trigger now handles duplicates with UPDATE instead of failing

### Issue: Signups work but profiles aren't created
**Fix:**
1. Check if trigger exists (query above)
2. Check Supabase logs for trigger errors
3. Run [7-fix-signup-trigger.sql](7-fix-signup-trigger.sql) again

## Prevention

To prevent this issue in the future:
1. Always test signup flow after database changes
2. Check Supabase logs for trigger errors
3. Use SECURITY DEFINER on trigger functions
4. Set permissive RLS policies for system operations
5. Add proper error handling in trigger functions

### Step 4: Disable Email Confirmation (Recommended)

To remove the "Check your email for confirmation link" requirement:

#### Via Supabase Dashboard (EASIEST):
1. Go to https://app.supabase.com/project/YOUR_PROJECT/auth/providers
2. Click on **"Email"** provider
3. Scroll to **"Email confirmation"** section
4. **UNCHECK** "Enable email confirmations"
5. Click **"Save"**

Now users can sign in immediately after signup!

#### Auto-Confirm Existing Users (Optional):
If users are stuck waiting for confirmation, run this in SQL Editor:

```sql
-- Auto-confirm all pending users
UPDATE auth.users
SET email_confirmed_at = NOW(),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;
```

See [9-disable-email-confirmation.sql](9-disable-email-confirmation.sql) for more details.

## Need Help?

If signup still doesn't work after running both SQL files:
1. Check Supabase Dashboard → Database → Logs
2. Look for errors related to `handle_new_user` function
3. Verify the `user_profiles` table has all required columns
4. Check that `id` column in `user_profiles` has a default value (gen_random_uuid())
5. Verify email confirmation is disabled (see Step 4 above)
