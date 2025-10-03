# Database Migrations

This folder contains SQL migration scripts for your Pokemon Draft League Supabase database.

## How to Apply Migrations

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the content of each migration file **in order**
5. Click **Run**

## Migration Files

### `001_add_missing_columns.sql`
**Purpose**: Updates existing schema to match TypeScript types

**What it does**:
- Adds missing columns to existing tables (`is_public`, `spectator_count`, `description`, `tags`)
- Renames `bids` table to `bid_history` to match your code
- Renames columns in `auctions` and `bid_history` tables
- Creates `spectator_events` and `draft_results` tables
- Adds proper indexes and constraints
- Sets up triggers for `updated_at` columns
- Enables RLS and realtime subscriptions

**Run this first** to update your existing schema.

### `002_helper_functions.sql`
**Purpose**: Adds useful database functions and triggers

**What it does**:
- `get_draft_state(draft_id)` - Get complete draft state with all related data
- `generate_room_code()` - Generate unique 6-character room codes
- `cleanup_old_drafts(days_old)` - Clean up completed drafts older than X days
- `get_team_roster(team_id)` - Get team with all picks
- `is_pokemon_picked(draft_id, pokemon_id)` - Check if Pokemon is already picked
- `get_team_available_budget(team_id)` - Calculate remaining budget
- `update_spectator_count(draft_id, increment)` - Track spectators
- `get_draft_analytics(draft_id)` - Get comprehensive draft statistics
- Auto-update team budget when picks are made
- Auto-update wishlist availability when Pokemon is picked

**Run this second** after the schema updates.

## Usage Examples

After applying migrations, you can use these functions in your code:

### Get Draft State
```typescript
const { data } = await supabase.rpc('get_draft_state', { p_draft_id: draftId })
```

### Generate Room Code
```typescript
const { data: roomCode } = await supabase.rpc('generate_room_code')
```

### Check if Pokemon is Picked
```typescript
const { data: isPicked } = await supabase.rpc('is_pokemon_picked', {
  p_draft_id: draftId,
  p_pokemon_id: 'charizard'
})
```

### Get Team Budget
```typescript
const { data: budget } = await supabase.rpc('get_team_available_budget', {
  p_team_id: teamId
})
```

### Get Draft Analytics
```typescript
const { data: analytics } = await supabase.rpc('get_draft_analytics', {
  p_draft_id: draftId
})
```

## Important Notes

1. **Backup First**: Always backup your database before running migrations in production
2. **Test in Dev**: Test migrations in a development environment first
3. **Order Matters**: Run migrations in numerical order (001, 002, etc.)
4. **Idempotent**: These migrations use `IF NOT EXISTS` checks and are safe to run multiple times
5. **RLS Policies**: Current policies allow all operations - tighten them for production

## Rollback

If you need to rollback changes, you can:

1. Restore from backup, or
2. Manually reverse changes using SQL commands

## Future Migrations

When adding new migrations:
- Name them with incrementing numbers: `003_description.sql`
- Add entry to this README
- Test thoroughly before applying to production
