# Database Migrations

## ⚠️ IMPORTANT: Which Security Migration to Use

**RECOMMENDED:** `APPLY_SECURITY_SIMPLE.sql` ✅✅✅

**Why SIMPLE is Best:**
- ✅ No type casting errors
- ✅ Participant-based access (secure)
- ✅ Works with guest IDs
- ✅ Easy to understand
- ✅ Good balance of security vs. complexity

### Migration Options

| File | Status | Notes |
|------|--------|-------|
| `APPLY_SECURITY_SIMPLE.sql` | ✅ **USE THIS** | Recommended, tested, works |
| `APPLY_SECURITY_FIXED.sql` | ⚠️ May have issues | UUID/TEXT casting errors |
| `APPLY_SECURITY.sql` | ❌ Don't use | Missing `is_public` column |

## How to Apply Security Policies

1. **Backup your database first!**

2. Open Supabase SQL Editor

3. Copy entire contents of `APPLY_SECURITY_SIMPLE.sql`

4. Paste and run

5. Verify with:
   ```sql
   SELECT tablename, COUNT(*) as policy_count
   FROM pg_policies
   WHERE schemaname = 'public'
   GROUP BY tablename;
   ```

## Migration Files

### Active Migrations
- ✅ `APPLY_SECURITY_SIMPLE.sql` - **RECOMMENDED for production**

### Reference/Archive
- `APPLY_SECURITY_FIXED.sql` - Complex version (may have UUID casting issues)
- `APPLY_SECURITY.sql` - Original (has `is_public` references, won't work)
- `004_proper_rls_policies.sql` - Earlier attempt
- `006_guest_compatible_rls.sql` - Earlier guest-compatible version

### Other Migrations
- `001_add_bid_history.sql` - Bid history table
- `001_user_authentication.sql` - Authentication setup
- `002_spectator_mode.sql` - Spectator features
- `003_draft_history.sql` - Draft history tracking
- `005_performance_indexes.sql` - Performance optimization
- `000_disable_rls_temp.sql` - Emergency RLS disable (use with caution)

## Need Help?

See `SECURITY_QUICKSTART.md` in the project root for step-by-step instructions.
