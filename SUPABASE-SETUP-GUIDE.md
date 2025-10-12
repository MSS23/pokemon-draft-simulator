# Supabase Database Setup Guide

Complete guide for setting up your Pokemon Draft database in Supabase.

---

## 📋 Overview

The database is split into 3 SQL files that you'll run in order:

1. **1-core-schema.sql** - Core draft tables (REQUIRED)
2. **2-rls-policies.sql** - Security policies (REQUIRED)
3. **3-league-schema.sql** - League features (OPTIONAL)

All scripts are **idempotent** (safe to run multiple times) and use `IF NOT EXISTS` checks.

---

## 🚀 Quick Start

### Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run Core Schema

1. Copy the entire contents of `1-core-schema.sql`
2. Paste into the SQL editor
3. Click **Run** (or press Ctrl/Cmd + Enter)
4. ✅ You should see "Success. No rows returned"

### Step 3: Run RLS Policies

1. Copy the entire contents of `2-rls-policies.sql`
2. Paste into the SQL editor
3. Click **Run**
4. ✅ You should see "Success. No rows returned"

### Step 4: Run League Schema (Optional)

**Only run this if you want league/tournament features:**

1. Copy the entire contents of `3-league-schema.sql`
2. Paste into the SQL editor
3. Click **Run**
4. ✅ You should see "Success. No rows returned"

---

## 📊 What Gets Created

### Core Schema (1-core-schema.sql)

**Tables:**
- `drafts` - Main draft information and settings
- `teams` - Teams participating in drafts
- `picks` - Pokemon selections during drafts
- `participants` - Users/guests in drafts
- `pokemon_tiers` - Custom pricing per draft
- `auctions` - Auction draft state
- `bids` - Bid history for auctions
- `wishlist_items` - Auto-pick wishlist
- `user_profiles` - User display names and preferences
- `spectator_events` - Spectator activity tracking

**Indexes:** 20+ performance indexes on frequently queried columns

### RLS Policies (2-rls-policies.sql)

**Security:**
- Row Level Security enabled on all tables
- Permissive policies for guest authentication
- Real-time subscriptions enabled

**Access Model:**
- All users (including guests) can read all data
- All users can create/update their own data
- Supports the guest authentication system

### League Schema (3-league-schema.sql)

**Tables:**
- `leagues` - League/tournament metadata
- `league_teams` - Team assignments to leagues
- `matches` - Individual matchups
- `standings` - Win/loss records and rankings
- `match_games` - Game-by-game results

**Triggers:**
- Auto-update standings when matches complete
- Real-time standings calculations

---

## 🔍 Verification Steps

After running the scripts, verify your setup:

### 1. Check Tables Exist

In Supabase SQL Editor, run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Expected core tables:**
- auctions
- bids
- drafts
- participants
- picks
- pokemon_tiers
- spectator_events
- teams
- user_profiles
- wishlist_items

**Expected league tables (if you ran 3-league-schema.sql):**
- league_teams
- leagues
- match_games
- matches
- standings

### 2. Check RLS is Enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All tables should have `rowsecurity = true`

### 3. Check Indexes

```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

Should see multiple indexes per table (e.g., `idx_drafts_room_code`, `idx_teams_draft_id`, etc.)

### 4. Check Real-time is Enabled

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

All tables should be listed here.

---

## 🔧 Troubleshooting

### Error: "relation already exists"

**This is fine!** The scripts use `CREATE TABLE IF NOT EXISTS`, so this just means the table was already created. The script will continue and update any missing columns.

### Error: "permission denied"

**Solution:** Make sure you're logged into Supabase as the project owner or have admin permissions.

### Error: "function update_standings_for_match already exists"

**This is fine!** The league schema drops and recreates the function, so this is expected if you're re-running the script.

### Tables Created but App Can't Access Them

**Check RLS Policies:**
1. Go to Supabase Dashboard → Authentication → Policies
2. Verify policies exist for all tables
3. Ensure policies allow `anon` role (for guest users)

**If policies are missing, re-run `2-rls-policies.sql`**

### Real-time Not Working

**Enable Real-time:**
1. Go to Supabase Dashboard → Database → Replication
2. Ensure all tables are toggled ON
3. Or re-run the real-time section of `2-rls-policies.sql`

---

## 🔄 Updating Your Schema

If you need to modify the schema later:

### Adding a New Column

```sql
-- Safe to run multiple times
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS my_new_column TEXT;
```

### Adding a New Index

```sql
-- Safe to run multiple times
CREATE INDEX IF NOT EXISTS idx_my_new_index
ON my_table(my_column);
```

### Modifying RLS Policies

Just re-run `2-rls-policies.sql` - it drops and recreates all policies.

---

## 🗑️ Resetting Your Database

**⚠️ WARNING: This will delete ALL data!**

If you need to start fresh:

```sql
-- Drop all tables (cascades to delete all data)
DROP TABLE IF EXISTS match_games CASCADE;
DROP TABLE IF EXISTS standings CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS league_teams CASCADE;
DROP TABLE IF EXISTS leagues CASCADE;
DROP TABLE IF EXISTS spectator_events CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS wishlist_items CASCADE;
DROP TABLE IF EXISTS bids CASCADE;
DROP TABLE IF EXISTS auctions CASCADE;
DROP TABLE IF EXISTS pokemon_tiers CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS picks CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS drafts CASCADE;
```

Then re-run all 3 SQL files in order.

---

## 📚 Schema Documentation

### Key Relationships

```
drafts (1) ──> (many) teams
drafts (1) ──> (many) picks
drafts (1) ──> (many) participants
drafts (1) ──> (many) pokemon_tiers
drafts (1) ──> (many) auctions
drafts (1) ──> (many) wishlist_items
drafts (1) ──> (1) leagues [optional]

teams (1) ──> (many) picks
teams (1) ──> (many) participants

auctions (1) ──> (many) bids

leagues (1) ──> (many) matches
leagues (1) ──> (many) standings
```

### Important Constraints

**Drafts:**
- `room_code` must be unique
- `format` must be 'snake' or 'auction'
- `status` must be 'setup', 'active', 'completed', or 'paused'

**Teams:**
- Deleting a draft cascades to delete all teams
- `draft_order` determines turn order in snake drafts

**Picks:**
- Each pick records the Pokemon ID, name, cost, and round
- `pick_order` is globally sequential across all teams

**RLS Policies:**
- All policies are permissive to support guest authentication
- Both authenticated and anonymous users have full access
- Consider tightening policies for production if needed

---

## 🔐 Security Considerations

### Current Setup (Permissive)

The current RLS policies allow **anyone** to read/write data. This works because:

1. The app uses guest authentication (no user accounts)
2. Draft rooms are protected by unique room codes
3. Malicious users would need to guess a 6-character room code

### Tightening Security (Optional)

If you want stricter security:

**Option 1: Require authentication for writes**

```sql
-- Allow only authenticated users to create drafts
DROP POLICY "Drafts can be created by anyone" ON drafts;
CREATE POLICY "Authenticated users can create drafts"
  ON drafts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
```

**Option 2: Owner-based access**

```sql
-- Only draft host can modify draft
DROP POLICY "Drafts can be updated by anyone" ON drafts;
CREATE POLICY "Host can update draft"
  ON drafts FOR UPDATE
  USING (host_id = current_setting('request.jwt.claims', true)::json->>'sub');
```

**Note:** Tightening security may break guest authentication features.

---

## 📞 Support

If you encounter issues:

1. **Check Supabase Logs:** Dashboard → Logs → Postgres Logs
2. **Review Error Messages:** SQL Editor shows detailed error messages
3. **Verify Environment Variables:** Ensure your app has correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Test Connection:** Use the app's test connection feature (if enabled)

---

## ✅ Completion Checklist

- [ ] Ran `1-core-schema.sql` successfully
- [ ] Ran `2-rls-policies.sql` successfully
- [ ] (Optional) Ran `3-league-schema.sql` if using leagues
- [ ] Verified all tables exist (see Verification Steps)
- [ ] Verified RLS is enabled on all tables
- [ ] Verified indexes are created
- [ ] Verified real-time is enabled
- [ ] Tested app connection to database
- [ ] Created a test draft to verify schema works

---

**Last Updated:** 2025-01-12
**Schema Version:** 1.0.0
**Compatible With:** Pokemon Draft v0.1.2+
