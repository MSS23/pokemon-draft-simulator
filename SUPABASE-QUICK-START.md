# Supabase Quick Start - TL;DR

**Quick reference for setting up your Pokemon Draft database**

---

## 🚀 1-Minute Setup (Easiest!)

### Step 1: Open Supabase SQL Editor
1. Go to [supabase.com](https://supabase.com) → Your Project
2. Click **SQL Editor** in sidebar
3. Click **New Query**

### Step 2: Copy/Paste ONE File

**⭐ All-in-One Script (RECOMMENDED)**
```
Copy entire contents of: SUPABASE-ALL-IN-ONE.sql
Paste into SQL Editor → Run → Done!
```

✅ This single file includes:
- All core tables (10 tables)
- Security policies (RLS)
- Real-time subscriptions
- Performance indexes

❌ Does NOT include:
- League/tournament features (run `3-league-schema.sql` separately if needed)

---

## 🔧 Alternative: 3-File Method (Modular)

If you prefer to run scripts separately:

**File 1: Core Schema** (REQUIRED)
```
Copy: 1-core-schema.sql → Paste → Run
```

**File 2: Security Policies** (REQUIRED)
```
Copy: 2-rls-policies.sql → Paste → Run
```

**File 3: League System** (OPTIONAL)
```
Copy: 3-league-schema.sql → Paste → Run
```

---

## ✅ Verify Setup

Run this query in Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

**You should see 10 tables:**
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

**(+5 more if you ran league schema)**
- league_teams
- leagues
- match_games
- matches
- standings

---

## 🔑 Next: Add Environment Variables

1. Copy your Supabase credentials:
   - Dashboard → Project Settings → API

2. Add to `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Deploy your app!

---

## ❓ Troubleshooting

**"relation already exists" error?**
→ **Ignore it!** The scripts use `IF NOT EXISTS` and are safe to re-run.

**"column user_id does not exist" error?**
→ **Fixed!** Use the latest `1-core-schema.sql` or `SUPABASE-ALL-IN-ONE.sql`

**Tables not showing up?**
→ Make sure you ran the complete script (all the way to the end)

**App can't connect?**
→ Double-check your `.env.local` has the correct URL and anon key

**Need more help?**
→ See [SUPABASE-SETUP-GUIDE.md](SUPABASE-SETUP-GUIDE.md) for detailed instructions

---

## 📁 Available SQL Files

**Easy (Choose One):**
- `SUPABASE-ALL-IN-ONE.sql` ⭐ **RECOMMENDED** - Everything in one file

**Modular (Run in Order):**
- `1-core-schema.sql` - Core tables
- `2-rls-policies.sql` - Security
- `3-league-schema.sql` - League features (optional)

**Documentation:**
- `SUPABASE-SETUP-GUIDE.md` - Full setup guide with troubleshooting
