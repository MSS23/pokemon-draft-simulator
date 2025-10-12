# Database Migration Guide

## Problem: "column user_profiles.user_id does not exist"

If you're seeing this error, it means your database was created with an older schema. Follow these steps to fix it.

## Solution: Run Migrations in Order

### Step 1: Fix user_profiles Schema
Run [5-fix-user-profiles-schema.sql](5-fix-user-profiles-schema.sql) in your Supabase SQL Editor.

This will:
- Add the `user_id` column to `user_profiles` table
- Add UNIQUE constraint
- Create index for performance

### Step 2: Add Auto-Profile Creation Trigger
Run [4-add-user-profile-trigger.sql](4-add-user-profile-trigger.sql) in your Supabase SQL Editor.

This will:
- Create `handle_new_user()` function
- Add trigger to auto-create profiles on signup
- Backfill profiles for existing users

### Step 3: Verify Fix

1. Go to Supabase Dashboard → Table Editor → `user_profiles`
2. Check that you see these columns:
   - `id` (UUID)
   - `user_id` (TEXT) ← Should now exist!
   - `display_name` (TEXT)
   - `avatar_url` (TEXT)
   - `preferences` (JSONB)
   - `created_at` (TIMESTAMPTZ)
   - `updated_at` (TIMESTAMPTZ)

3. Try signing up with a new account or joining a draft
4. The error should be gone!

## Alternative: Fresh Database Setup

If you want to start fresh with the correct schema:

1. **Backup any existing drafts** (if you have important data)
2. Drop all tables in Supabase
3. Run [SUPABASE-ALL-IN-ONE.sql](SUPABASE-ALL-IN-ONE.sql)

This creates everything from scratch with the correct schema.

## Troubleshooting

### Error: "relation 'user_profiles' does not exist"
- Run [1-core-schema.sql](1-core-schema.sql) first to create tables

### Error: "user_id still showing as missing"
- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- Check Supabase Table Editor to verify column exists
- Verify you ran Step 1 migration successfully

### Error: "User profile not found" after running migrations
- Run Step 2 to backfill existing users
- Sign out and sign back in
- Check that your user appears in `user_profiles` table

### Still having issues?
Check the [SUPABASE-SETUP-GUIDE.md](SUPABASE-SETUP-GUIDE.md) for detailed setup instructions.
