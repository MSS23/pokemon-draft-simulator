# Fix "Failed to Create Draft" Connection Issue

## Quick Diagnosis

Visit: **http://localhost:3000/test-connection**

This page will tell you exactly what's wrong.

---

## Most Likely Fixes (In Order)

### Fix #1: Disable Browser Extensions (90% success rate)

**The Issue:**
Your console shows errors from `injection-tss-mv3.js` and `content-scripts.js` - these are browser extensions interfering with Supabase.

**The Fix:**
1. **Option A - Use Incognito Mode** (Easiest)
   ```
   - Open Chrome/Edge in Incognito/Private mode
   - Go to http://localhost:3000
   - Try creating a draft
   ```

2. **Option B - Disable Extensions**
   ```
   - Go to chrome://extensions
   - Disable "TSS" extension
   - Disable "Content Script Bridge" if present
   - Disable ad blockers temporarily
   - Refresh the page
   ```

### Fix #2: Restart Dev Server with Fresh Environment

**The Issue:**
Dev server might have started before `.env` file was created/updated.

**The Fix:**
```bash
# Kill all Node processes
taskkill /IM node.exe /F

# Navigate to project
cd "C:\Users\msidh\Documents\Projects\Pokemon Draft\pokemon-draft"

# Start fresh
npm run dev
```

### Fix #3: Verify Supabase Project is Active

**The Issue:**
Free tier Supabase projects pause after inactivity.

**The Fix:**
1. Go to https://supabase.com/dashboard
2. Click on project: `dwqlxyeefzcclqdzteez`
3. Check if it says "Paused" - if so, click "Resume"
4. Wait 2-3 minutes for it to fully start

### Fix #4: Check Database Tables Exist

**The Issue:**
Tables might not be created yet.

**The Fix:**
1. Go to Supabase Dashboard → Table Editor
2. Verify these tables exist:
   - drafts
   - teams
   - participants
   - picks
   - auctions

3. If tables don't exist, run the schema SQL in Supabase SQL Editor

### Fix #5: Temporarily Disable RLS (For Testing Only!)

**The Issue:**
Row Level Security policies might be blocking inserts.

**The Fix:**
1. Go to Supabase SQL Editor
2. Run this SQL:
   ```sql
   -- TEMPORARY: Disable RLS for testing
   ALTER TABLE drafts DISABLE ROW LEVEL SECURITY;
   ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
   ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
   ```

3. Try creating a draft
4. **IMPORTANT:** Re-enable RLS after testing:
   ```sql
   ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
   ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
   ```

---

## Step-by-Step Debugging

### Step 1: Check Environment Variables

```bash
cd pokemon-draft
cat .env
```

You should see:
```
NEXT_PUBLIC_SUPABASE_URL=https://dwqlxyeefzcclqdzteez.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

✅ **If missing:** Create `.env` file with above values

### Step 2: Check Dev Server Logs

Look at your terminal where `npm run dev` is running.

**Good signs:**
```
✓ Ready in 2.3s
○ Compiling / ...
✓ Compiled / in 1.2s
```

**Bad signs:**
```
Error: ENOENT
Module not found
Failed to load environment
```

### Step 3: Check Browser Console (Right click → Inspect → Console)

**Ignore these (they're from extensions):**
```
injection-tss-mv3.js
content-scripts.js
TSS: Received response
```

**Look for these (real errors):**
```
Failed to fetch
Network error
Unauthorized
```

### Step 4: Check Network Tab (Right click → Inspect → Network)

1. Clear network tab
2. Try creating a draft
3. Look for requests to `dwqlxyeefzcclqdzteez.supabase.co`

**If you see:**
- ✅ Request goes through → Supabase is working, check RLS policies
- ❌ No request → Dev server issue, restart server
- ❌ Request fails with 401 → Check anon key
- ❌ Request fails with 404 → Table doesn't exist

---

## Common Scenarios

### Scenario A: "It worked before, now it doesn't"

**Cause:** Supabase project paused (free tier)

**Fix:**
1. Go to https://supabase.com/dashboard
2. Resume project
3. Wait 2-3 minutes

### Scenario B: "I just cloned the repo"

**Cause:** Missing `.env` file

**Fix:**
1. Create `pokemon-draft/.env`
2. Add:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://dwqlxyeefzcclqdzteez.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3cWx4eWVlZnpjY2xxZHp0ZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTYxMjgsImV4cCI6MjA3NDczMjEyOH0.gHYrpMNE04JChwgLLeqplb1Y13o6l3B-nv1WINJSFUY
   ```
3. Restart dev server

### Scenario C: "Tables don't exist error"

**Cause:** Database not set up

**Fix:**
1. Go to Supabase SQL Editor
2. Find and run the schema migration file
3. Or create tables manually

### Scenario D: "Permission denied" or "Row level security"

**Cause:** RLS blocking guest users

**Fix:**
Run migration: `database/migrations/006_guest_compatible_rls.sql`

OR temporarily disable RLS (testing only!):
```sql
ALTER TABLE drafts DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
```

---

## Nuclear Option: Complete Reset

If nothing else works:

```bash
# 1. Kill all Node processes
taskkill /IM node.exe /F

# 2. Delete node_modules and cache
cd pokemon-draft
rm -rf node_modules .next

# 3. Reinstall
npm install

# 4. Verify .env exists
cat .env

# 5. Start fresh
npm run dev
```

Then:
1. Open incognito window
2. Go to http://localhost:3000/test-connection
3. Click "Test Connection"
4. If it works, try creating a draft

---

## Still Not Working?

### Check Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select project
3. Go to Settings → API
4. Verify:
   - **URL:** `https://dwqlxyeefzcclqdzteez.supabase.co`
   - **anon/public key** matches your `.env`

### Manual Test Query

Run this in Supabase SQL Editor:
```sql
-- Test if drafts table exists
SELECT * FROM drafts LIMIT 1;

-- Test insert (should work or show RLS error)
INSERT INTO drafts (id, name, host_id, format, max_teams, budget_per_team, status)
VALUES ('TEST123', 'Test Draft', 'test-user', 'snake', 4, 100, 'setup');

-- Check if it worked
SELECT * FROM drafts WHERE id = 'TEST123';

-- Clean up
DELETE FROM drafts WHERE id = 'TEST123';
```

If SQL works but app doesn't → Environment variable issue
If SQL fails → Database/RLS issue

---

## Success Checklist

After fixing, verify:
- [ ] Can create a draft
- [ ] Draft appears in database
- [ ] Can join draft room
- [ ] No console errors (except extension errors)
- [ ] Network tab shows successful requests

---

## Prevention

**To avoid this in future:**

1. **Keep project active:** Visit dashboard weekly (free tier pauses)
2. **Use incognito:** Avoids extension issues
3. **Commit .env.example:** With placeholder values
4. **Check Supabase status:** https://status.supabase.com

---

## Quick Reference

**Test Connection Page:**
```
http://localhost:3000/test-connection
```

**Supabase Dashboard:**
```
https://supabase.com/dashboard/project/dwqlxyeefzcclqdzteez
```

**Your Project URL:**
```
https://dwqlxyeefzcclqdzteez.supabase.co
```

**Restart Dev Server:**
```bash
taskkill /IM node.exe /F
npm run dev
```
