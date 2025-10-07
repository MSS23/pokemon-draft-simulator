# 🗄️ Database Setup Instructions

## Quick Setup (5 minutes)

Your Vercel environment variables are already configured! You just need to set up the database tables.

### Step 1: Go to Supabase Dashboard

1. Open your browser and go to: **https://supabase.com/dashboard**
2. Sign in to your account
3. Select your project: **dwqlxyeefzcclqdzteez**

### Step 2: Open SQL Editor

1. In the left sidebar, click on **"SQL Editor"**
2. Click **"New query"** button

### Step 3: Run Setup Script

1. Open the file: `SETUP_SUPABASE.sql` (in your project root)
2. **Copy ALL the contents** (Ctrl+A, then Ctrl+C)
3. **Paste** into the Supabase SQL Editor
4. Click **"Run"** button (or press Ctrl+Enter)

### Step 4: Verify Success

You should see a success message like:
```
✅ Pokemon Draft League database setup complete!
📊 All tables created successfully
🔧 Indexes added for performance
🔓 RLS disabled for guest access
👁️ Views created for public drafts
```

### Step 5: Test Your App

1. Go to: **https://pokemon-draft-simulator.vercel.app**
2. Clear your browser cache (Ctrl+Shift+Delete)
3. Click **"Create Draft"**
4. Fill in your details
5. Click **"Create Draft Room"**
6. ✅ **It should work now!**

## What This Script Does

- ✅ Creates all 10 required tables
- ✅ Adds performance indexes
- ✅ Sets up views for public drafts
- ✅ Configures guest access (no authentication required)
- ✅ Includes spectator mode support
- ✅ Includes custom formats support

## Tables Created

1. **drafts** - Main draft room data
2. **teams** - Team information
3. **picks** - Pokemon selections
4. **participants** - Users in drafts
5. **pokemon_tiers** - Custom pricing
6. **auctions** - Auction draft data
7. **bid_history** - Auction bids
8. **wishlist_items** - Player wishlists
9. **spectator_events** - Spectator tracking
10. **custom_formats** - User-uploaded formats

## Troubleshooting

### "Table already exists" errors
This is fine! The script uses `CREATE TABLE IF NOT EXISTS`, so it won't break if tables already exist.

### Still getting database errors?
1. Make sure you're using the correct Supabase project
2. Check that the script completed without errors
3. Try running just the base tables (first section of the script)
4. Clear your browser cache and cookies

### Need help?
Check the main README.md for more detailed documentation or create an issue on GitHub.

## Environment Variables (Already Set!)

Your Vercel deployment already has these configured:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

---

**Once you complete these steps, your Pokemon Draft League will be fully functional!** 🎮🎉
