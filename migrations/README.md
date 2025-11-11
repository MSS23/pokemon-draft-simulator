# Pokemon Draft - Database Setup Guide

This directory contains SQL migration files to set up your Pokemon Draft database in Supabase.

## Quick Start (Recommended)

If you're experiencing "column 'user_id' does not exist" errors, follow these steps:

### Step 1: Reset Database (Clean Slate)

Run `RESET_DATABASE.sql` in your Supabase SQL Editor:

1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the entire contents of `RESET_DATABASE.sql`
5. Click "Run" button
6. Wait for success message: "Database Cleanup Complete!"

**This will DROP all existing tables, functions, and policies.**

### Step 2: Create Fresh Schema

Run `COMPLETE_SCHEMA.sql` in your Supabase SQL Editor:

1. Still in SQL Editor, click "New Query"
2. Copy and paste the entire contents of `COMPLETE_SCHEMA.sql`
3. Click "Run" button
4. Wait for success message: "Pokemon Draft Database Setup Complete!"

**You're done!** Your database is now set up with all 25 tables, indexes, functions, triggers, and policies.

---

## Troubleshooting

### Error: "column 'user_id' does not exist"

**Cause**: This error occurs when old database objects (tables, policies, triggers, or functions) reference columns that no longer exist or use the wrong column names.

**Solution**: Run `RESET_DATABASE.sql` first to clean up all old objects, then run `COMPLETE_SCHEMA.sql`.

### Error: "relation already exists"

**Cause**: You're trying to create tables that already exist.

**Solution**: Either run `RESET_DATABASE.sql` first, or manually drop the conflicting tables.

### Error: "function does not exist"

**Cause**: A trigger is trying to call a function that hasn't been created yet or was deleted.

**Solution**: Run `RESET_DATABASE.sql` to clean up orphaned triggers, then run `COMPLETE_SCHEMA.sql`.

### Error: "trigger already exists"

**Cause**: The schema already has triggers with the same names.

**Solution**: `COMPLETE_SCHEMA.sql` already includes `DROP TRIGGER IF EXISTS` statements, so this shouldn't happen. If it does, run `RESET_DATABASE.sql` first.

---

## File Descriptions

### `RESET_DATABASE.sql` (76 lines)
Completely cleans your database by dropping all tables, functions, and triggers. Use this when:
- You're experiencing persistent schema errors
- You want a completely fresh start
- You're switching from an old schema version

**Warning**: This will DELETE all data! Only use in development.

### `COMPLETE_SCHEMA.sql` (883 lines)
The complete, production-ready schema for Pokemon Draft. Includes:
- 25 tables (22 Pokemon Draft + 3 League support)
- 60+ indexes for performance
- 4 functions (standings updates, timestamp management, format usage tracking)
- 8 triggers (auto-updates for timestamps and standings)
- 100+ RLS policies (guest authentication support)
- Realtime subscriptions enabled on all tables

---

## Schema Overview

### Core Draft Tables
- `user_profiles` - User accounts (supports guest authentication with TEXT user IDs)
- `custom_formats` - User-created Pokemon pricing templates
- `drafts` - Main draft sessions (snake & auction formats)
- `teams` - Participant teams in drafts
- `picks` - Pokemon selections during draft
- `participants` - Users in draft sessions
- `pokemon_tiers` - Per-draft Pokemon pricing and legality
- `auctions` - Auction-format draft auctions
- `bid_history` - Auction bid tracking
- `wishlists` - Parent table for wishlist items
- `wishlist_items` - Priority-based auto-pick queue
- `draft_actions` - Draft history and undo system
- `draft_results` - Post-draft summary data
- `draft_result_teams` - Per-team draft results
- `chat_messages` - In-draft chat with reactions
- `spectator_events` - Spectator activity tracking

### League System Tables
- `leagues` - League sessions created from completed drafts
- `league_teams` - Maps teams to leagues
- `matches` - Individual matchups between teams (WiFi & Showdown battles)
- `standings` - League standings with auto-calculated stats
- `match_games` - Individual games within best-of-N matches
- `team_pokemon_status` - Pokemon health/death tracking
- `match_pokemon_kos` - Individual KO tracking during matches
- `trades` - Pokemon trading between teams
- `trade_approvals` - Multi-party trade approval workflow

---

## Important Column Names

The schema uses specific column names for user identification:

| Table | Column Name | Type | Purpose |
|-------|-------------|------|---------|
| `user_profiles` | `user_id` | TEXT | Primary user identifier (e.g., "guest-1234567890-abc123") |
| `participants` | `user_id` | TEXT | Links to user_profiles.user_id |
| `teams` | `owner_id` | TEXT | Team owner (NOT user_id!) |
| `drafts` | `host_id` | TEXT | Draft creator (NOT user_id!) |
| `custom_formats` | `creator_id` | TEXT | Format creator (NOT user_id!) |
| `chat_messages` | `sender_id` | TEXT | Message sender (NOT user_id!) |

**Only 2 tables have a `user_id` column**: `user_profiles` and `participants`.

If you see an error about `user_id` on any other table, it means you have old database objects that need to be cleaned up.

---

## Authentication Model

This schema supports **guest authentication** with TEXT-based user IDs:

- Format: `guest-{timestamp}-{random}`
- Example: `guest-1641024000000-abc123def`
- No Supabase Auth required
- User IDs stored in localStorage
- Permissive RLS policies (`USING (true)`) allow guest access

---

## Database Functions

### `update_standings_for_match()`
Automatically updates league standings when a match is completed. Triggered on `matches` table UPDATE.

### `update_custom_format_timestamp()`
Updates the `updated_at` column when a custom format is modified. Triggered on `custom_formats` table UPDATE.

### `increment_format_usage()`
Increments the `usage_count` for a custom format when used in a new draft. Triggered on `drafts` table INSERT.

### `update_updated_at_column()`
Generic timestamp updater for tables with `updated_at` columns. Used by multiple triggers.

---

## Performance Features

- **Indexes**: 60+ indexes for fast queries on common access patterns
- **Foreign Key Cascades**: `ON DELETE CASCADE` for automatic cleanup
- **Generated Columns**: `point_differential` in standings is auto-calculated
- **JSONB Storage**: Flexible data in `settings`, `metadata`, `reactions` columns
- **Realtime Enabled**: All 25 tables support Supabase Realtime subscriptions

---

## Next Steps After Setup

1. **Verify Tables Created**: In Supabase, go to "Table Editor" and verify all 25 tables exist
2. **Check RLS Policies**: In Supabase, go to "Authentication" → "Policies" and verify policies exist
3. **Test Connection**: Run your Next.js app with `npm run dev` and try creating a draft
4. **Monitor Errors**: Check browser console and Supabase logs for any issues

---

## Migration History

- **2025-01-11**: Complete schema rewrite with clean trigger syntax
- Previous versions had unsafe DO $ trigger drop blocks causing misleading errors

---

## Need Help?

If you're still experiencing issues after running both scripts:

1. Check Supabase logs in "Logs" → "Postgres Logs"
2. Run these diagnostic queries in SQL Editor:
   ```sql
   -- Check what tables exist
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

   -- Check existing policies
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

   -- Check existing functions
   SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';
   ```
3. Share the output to help diagnose the issue
