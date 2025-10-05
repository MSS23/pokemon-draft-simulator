# Troubleshooting Guide

## "Cannot Start a Draft" Error

### The Error You're Seeing

```
dwqlxyeefzcclqdzteez.supabase.conext_public_supabase_anon_key=...
Failed to load resource: net::ERR_NAME_NOT_RESOLVED
Error creating draft: Failed to fetch
```

### What's Actually Happening

This error is **NOT a bug in your code**. It's caused by a **browser extension** (likely "TSS" or "Content Script Bridge") trying to parse error messages as URLs.

Your actual Supabase URL is correct:
```
https://dwqlxyeefzcclqdzteez.supabase.co
```

### How to Fix

#### Option 1: Disable Browser Extensions (Recommended)

1. Open Chrome/Edge DevTools (F12)
2. Go to Extensions
3. Temporarily disable these extensions:
   - TSS
   - Content Script Bridge
   - Any ad blockers or privacy tools

4. Refresh the page
5. Try creating a draft again

#### Option 2: Use Incognito/Private Mode

1. Open an incognito/private window
2. Go to your app: `http://localhost:3000`
3. Extensions are disabled by default
4. Try creating a draft

#### Option 3: Restart Dev Server

Sometimes environment variables don't load correctly:

```bash
# Kill the dev server
taskkill /F /IM node.exe

# Start fresh
cd pokemon-draft
npm run dev
```

### Verify Supabase Connection

To test if Supabase is actually working:

1. Open DevTools Console
2. Run this:

```javascript
console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)
// Should show: https://dwqlxyeefzcclqdzteez.supabase.co
```

3. Check Network tab when creating draft:
   - Look for requests to `dwqlxyeefzcclqdzteez.supabase.co`
   - If you see them, Supabase IS working (ignore the extension errors)

### Real vs Fake Errors

**Fake Error (Browser Extension):**
```
dwqlxyeefzcclqdzteez.supabase.conext_public_supabase_anon_key=...
```
↑ Notice the URL is malformed - this is the extension, not your code

**Real Error (Would look like):**
```
Failed to fetch from https://dwqlxyeefzcclqdzteez.supabase.co/rest/v1/drafts
Unauthorized
```

### Check Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project: `dwqlxyeefzcclqdzteez`
3. Check:
   - ✅ Project is active (not paused)
   - ✅ Database is running
   - ✅ Tables exist (drafts, teams, participants, etc.)

### Still Not Working?

If you've tried the above and it still fails:

1. **Check if tables exist:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public';
   ```

2. **Check RLS policies:**
   ```sql
   -- If you see errors about permissions
   -- You may need to apply the RLS migration
   -- Run: database/migrations/006_guest_compatible_rls.sql
   ```

3. **Verify API keys:**
   - Make sure `.env` file exists in `pokemon-draft/` folder
   - Keys should start with `eyJ...`
   - No quotes around the values

4. **Clear Next.js cache:**
   ```bash
   cd pokemon-draft
   rm -rf .next
   npm run dev
   ```

## Changes Made

### Removed Auto-Start Feature

As requested, the auto-start option has been removed:

- ❌ **Removed:** Auto-start checkbox from create draft form
- ✅ **New Behavior:** Drafts always start manually
- ✅ **Host controls:** Admin must click "Start Draft" when ready
- ✅ **Order shuffling:** Draft order is set before starting

**Why this is better:**
- Gives host time to shuffle draft order
- Ensures all participants are ready
- Prevents accidental early starts
- More control over draft setup

## Common Issues

### 1. Draft doesn't start

**Cause:** Draft is in "setup" status
**Solution:** Host must click "Start Draft" button

### 2. Can't see other participants

**Cause:** Real-time subscriptions not connected
**Solution:** Refresh the page, check network tab for websocket connection

### 3. Pokemon not loading

**Cause:** Format data not loaded
**Solution:** Wait for "Loading Pokemon..." to finish

### 4. Budget/cost issues

**Cause:** RLS policies blocking access
**Solution:** Apply migration `006_guest_compatible_rls.sql`

## Need More Help?

1. Check browser console for actual errors
2. Check Network tab for failed requests
3. Ignore errors from "injection-tss-mv3.js" or "content-scripts.js"
4. Look for errors from your actual code files
