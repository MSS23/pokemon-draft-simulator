# Migration Setup Guide

## Overview
This guide shows you how to set up the complete database schema for the Pokemon Draft application, including the new league system features.

## Database Migration Order

**IMPORTANT**: Migrations must be run in the correct order to avoid "relation does not exist" errors.

### Base Schema (Required First)
These files are in the project root and must be run before any migrations in the `migrations/` folder:

1. **1-core-schema.sql** - Core draft tables (drafts, teams, picks, etc.)
2. **2-rls-policies.sql** - Row Level Security policies (not in repo, may need to create)
3. **3-league-schema.sql** - League system tables (leagues, matches, standings)
4. **5-fix-user-profiles-schema.sql** - User profiles fixes

### Incremental Migrations (Run After Base Schema)
These files are in the `migrations/` folder and add features/fixes:

5. **001_add_missing_columns.sql** - Adds missing columns to existing tables
6. **002_helper_functions.sql** - Helper functions for draft logic
7. **002_add_current_team_id.sql** - Adds current_team_id tracking
8. **009_disconnect_handling.sql** - Adds disconnect grace period handling
9. **010_league_pokemon_tracking.sql** - Pokemon KO/death tracking (NEW)
10. **011_league_trades.sql** - Pokemon trading system (NEW)

---

## Step-by-Step Setup Instructions

### Option 1: Fresh Database Setup

If you're starting from scratch or want to reset your database:

#### Step 1: Run Base Schema Files

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy the entire contents of `1-core-schema.sql` from the project root
5. Click **Run** (or press Ctrl+Enter)
6. Wait for confirmation message

#### Step 2: Run League Schema

1. Create a new query in SQL Editor
2. Copy the entire contents of `3-league-schema.sql` from the project root
3. Click **Run**
4. Wait for confirmation message

#### Step 3: Run User Profiles Fix

1. Create a new query
2. Copy the entire contents of `5-fix-user-profiles-schema.sql`
3. Click **Run**

#### Step 4: Run Incremental Migrations

Now run each file in the `migrations/` folder in order:

1. **migrations/001_add_missing_columns.sql**
2. **migrations/002_helper_functions.sql**
3. **migrations/002_add_current_team_id.sql**
4. **migrations/009_disconnect_handling.sql**
5. **migrations/010_league_pokemon_tracking.sql** (Pokemon tracking)
6. **migrations/011_league_trades.sql** (Trade system)

For each file:
- Create a new query in SQL Editor
- Copy the file contents
- Click **Run**
- Verify no errors

---

### Option 2: Existing Database (Add New Features Only)

If you already have the base schema and just want to add the new league features:

#### Step 1: Verify Base Tables Exist

Run this query in SQL Editor to check what tables you have:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'drafts', 'teams', 'picks', 'leagues', 'matches', 'standings'
)
ORDER BY table_name;
```

Expected output should show all 6 tables. If any are missing, you need to run the base schema files first (see Option 1).

#### Step 2: Check Which Migrations Are Applied

There's no built-in migration tracking, so you'll need to manually check if certain features exist:

**Check for disconnect handling:**
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'participants'
AND column_name IN ('disconnected_at', 'reconnected_at');
```

If these columns don't exist, you need to run `009_disconnect_handling.sql`.

**Check for Pokemon tracking tables:**
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('match_pokemon_kos', 'team_pokemon_status');
```

If these tables don't exist, you can safely run `010_league_pokemon_tracking.sql`.

**Check for trade tables:**
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('trades', 'trade_approvals');
```

If these tables don't exist, you can safely run `011_league_trades.sql`.

#### Step 3: Run Missing Migrations

Based on what's missing, run the appropriate migration files from the `migrations/` folder in SQL Editor.

---

## Verification After Setup

After running all migrations, verify everything is set up correctly:

### 1. Check All Tables Exist

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see at least these tables:
- auctions
- bids
- drafts
- leagues
- league_teams
- matches
- match_games
- match_pokemon_kos ✅ (NEW)
- participants
- picks
- pokemon_tiers
- spectator_events
- standings
- team_pokemon_status ✅ (NEW)
- teams
- trades ✅ (NEW)
- trade_approvals ✅ (NEW)
- user_profiles
- wishlist_items

### 2. Check RLS Is Enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'match_pokemon_kos',
  'team_pokemon_status',
  'trades',
  'trade_approvals'
)
ORDER BY tablename;
```

All tables should show `rowsecurity = true`.

### 3. Check Functions Exist

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'execute_trade',
  'validate_trade_pokemon',
  'update_standings_for_match'
)
ORDER BY routine_name;
```

Should return all 3 functions.

### 4. Test Execute Trade Function

```sql
-- Should see function signature without errors
\df execute_trade
```

---

## Troubleshooting Common Errors

### Error: "relation 'drafts' does not exist"

**Cause**: You're trying to run a migration before the base schema is set up.

**Solution**: Run the base schema files first:
1. `1-core-schema.sql`
2. `3-league-schema.sql`
3. Then run the migration that failed

### Error: "relation 'matches' does not exist"

**Cause**: The league schema (3-league-schema.sql) hasn't been run yet.

**Solution**: Run `3-league-schema.sql` before running migrations 010 or 011.

### Error: "column already exists"

**Cause**: You're trying to run a migration that's already been applied.

**Solution**: Skip this migration - it's already applied. Use the verification queries above to check what's already installed.

### Error: "function already exists"

**Cause**: The migration includes `CREATE FUNCTION` without `CREATE OR REPLACE`.

**Solution**: The migrations use `CREATE OR REPLACE`, so this shouldn't happen. If it does, you can either:
1. Skip the migration (it's already applied)
2. Or drop the function first: `DROP FUNCTION function_name CASCADE;`

### Error: "constraint already exists"

**Cause**: You're running a migration that's already been applied.

**Solution**: Migrations use `IF NOT EXISTS` where possible, so this is rare. Skip the migration if you see this.

---

## What Each Migration Does

### Base Schema

**1-core-schema.sql**:
- Creates core tables: drafts, teams, picks, participants
- Auction system: auctions, bids
- Wishlist system
- User profiles
- Spectator events
- Basic indexes and RLS setup

**3-league-schema.sql**:
- Creates league tables: leagues, league_teams
- Match system: matches, match_games
- Standings with auto-update triggers
- Round-robin scheduling support
- Tournament brackets

### Incremental Migrations

**010_league_pokemon_tracking.sql** (NEW):
- **match_pokemon_kos** table - Tracks which Pokemon fainted in each match/game
- **team_pokemon_status** table - Overall Pokemon health status (alive/fainted/dead)
- Nuzlocke support (permanent deaths)
- Triggers for auto-updating timestamps
- RLS policies for security

**011_league_trades.sql** (NEW):
- **trades** table - Pokemon swaps between teams
- **trade_approvals** table - Commissioner approval workflow
- **trade_history** view - Audit log with team names
- **execute_trade()** function - Automated ownership transfer
- **validate_trade_pokemon()** trigger - Prevents trading dead Pokemon
- RLS policies

---

## Next Steps After Migration

Once all migrations are complete:

1. **Update TypeScript types** - Types are already in `src/types/index.ts`
2. **Create services** - Implement MatchKOService and TradeService
3. **Build UI** - Create league creation and match recording components
4. **Test** - Verify Pokemon tracking and trades work end-to-end

See [LEAGUE_SYSTEM_IMPLEMENTATION.md](LEAGUE_SYSTEM_IMPLEMENTATION.md) for the complete implementation roadmap.

---

## Quick Reference: File Locations

### Base Schema (Project Root)
```
Pokemon Draft/
├── 1-core-schema.sql (REQUIRED FIRST)
├── 3-league-schema.sql (REQUIRED SECOND)
└── 5-fix-user-profiles-schema.sql (REQUIRED THIRD)
```

### Migrations (migrations/ folder)
```
Pokemon Draft/migrations/
├── 001_add_missing_columns.sql
├── 002_helper_functions.sql
├── 002_add_current_team_id.sql
├── 009_disconnect_handling.sql
├── 010_league_pokemon_tracking.sql (NEW - Pokemon KOs/deaths)
└── 011_league_trades.sql (NEW - Trading system)
```

---

## Support

If you encounter errors not covered in this guide:

1. Check the Supabase SQL Editor error message carefully
2. Verify you ran migrations in the correct order
3. Use the verification queries above to see what's already installed
4. Check the [Supabase documentation](https://supabase.com/docs) for database-specific issues

---

**Last Updated**: January 10, 2025
**Version**: 1.0.0
