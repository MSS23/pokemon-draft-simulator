# Supabase Setup Guide for New Features

## Overview
This guide covers setting up the database for all new features: Custom CSV Pricing, Admin Management, Undo System, Enhanced Chat, Team Analytics, and Export functionality.

---

## 🔧 Step-by-Step Supabase Setup

### Prerequisites
- Supabase account at https://supabase.com
- Your project: `dwqlxyeefzcclqdzteez`

---

## ✅ Migration 004: Custom Formats & Admin Roles

### What It Does
- Adds custom Pokemon pricing via CSV uploads
- Adds admin promotion functionality
- Allows hosts to make other participants admins

### Steps to Run

1. **Go to Supabase SQL Editor**
   - URL: https://supabase.com/dashboard/project/dwqlxyeefzcclqdzteez/sql
   - Click **"New Query"**

2. **Copy the Migration**
   - Open: `database/migrations/004_custom_formats_and_admins.sql`
   - Copy the ENTIRE file contents

3. **Paste and Run**
   - Paste into the SQL Editor
   - Click **"Run"** or press `Ctrl + Enter`
   - ✅ Should see: "Success. No rows returned"

### What Gets Created

**New Tables:**
- `custom_formats` - Stores uploaded CSV pricing data

**New Columns:**
- `participants.is_admin` - Boolean flag for admin status
- `drafts.custom_format_id` - Links draft to custom pricing

**New Functions:**
- `promote_to_admin(draft_id, participant_id, promoting_user_id)` - Makes user admin
- `demote_from_admin(draft_id, participant_id, demoting_user_id)` - Removes admin status

---

## ✅ Migration 005: Draft History & Undo

### What It Does
- Tracks every action in a draft (picks, bids, undos)
- Allows teams to undo their last pick
- Limits undos per team (default: 3)

### Steps to Run

1. **Go to Supabase SQL Editor**
   - Click **"New Query"**

2. **Copy the Migration**
   - Open: `database/migrations/005_draft_history_undo.sql`
   - Copy the ENTIRE file contents

3. **Paste and Run**
   - Paste into the SQL Editor
   - Click **"Run"**
   - ✅ Should see: "Success. No rows returned"

### What Gets Created

**New Tables:**
- `draft_actions` - Records all draft actions (picks, undos, etc.)

**New Columns:**
- `drafts.allow_undos` - Boolean (default: true)
- `drafts.max_undos_per_team` - Integer (default: 3)
- `teams.undos_remaining` - Integer (default: 3)

**New Functions:**
- `undo_last_pick(draft_id, team_id, participant_id)` - Undoes last pick
- `record_draft_action(...)` - Logs draft actions
- `get_draft_history(draft_id)` - Returns action history

---

## ✅ Migration 006: Enhanced Chat System

### What It Does
- Real-time chat with reactions
- Message editing and deletion
- System messages for draft events
- Emoji reactions on messages

### Steps to Run

1. **Go to Supabase SQL Editor**
   - Click **"New Query"**

2. **Copy the Migration**
   - Open: `database/migrations/006_chat_system.sql`
   - Copy the ENTIRE file contents

3. **Paste and Run**
   - Paste into the SQL Editor
   - Click **"Run"**
   - ✅ Should see: "Success. No rows returned"

### What Gets Created

**New Tables:**
- `chat_messages` - Stores all chat messages

**New Functions:**
- `send_chat_message(draft_id, participant_id, message, type)` - Sends message
- `add_message_reaction(message_id, participant_id, emoji)` - Adds reaction
- `remove_message_reaction(message_id, participant_id, emoji)` - Removes reaction
- `get_chat_messages(draft_id, limit, offset)` - Fetches messages

---

## 🔍 Verification Steps

### 1. Check Tables Were Created

Go to: **Table Editor** (left sidebar)

You should see these NEW tables:
- ✅ `custom_formats`
- ✅ `draft_actions`
- ✅ `chat_messages`

### 2. Check New Columns Were Added

Click on existing tables and verify:

**participants** table:
- ✅ `is_admin` (boolean)

**drafts** table:
- ✅ `custom_format_id` (uuid)
- ✅ `allow_undos` (boolean)
- ✅ `max_undos_per_team` (integer)

**teams** table:
- ✅ `undos_remaining` (integer)

### 3. Check Functions Were Created

Go to: **Database** → **Functions** (left sidebar)

You should see these NEW functions:
- ✅ `promote_to_admin`
- ✅ `demote_from_admin`
- ✅ `undo_last_pick`
- ✅ `record_draft_action`
- ✅ `get_draft_history`
- ✅ `send_chat_message`
- ✅ `add_message_reaction`
- ✅ `remove_message_reaction`
- ✅ `get_chat_messages`

---

## 🎯 Testing the Features

### Test 1: Custom CSV Pricing

1. Go to your app: `/create-draft`
2. Fill in your name and team name
3. Check the box: **"Use Custom Pricing (CSV)"**
4. Click **"Download Template"** to get sample CSV
5. Upload a CSV with format:
   ```csv
   pokemon,cost
   Pikachu,10
   Charizard,25
   Mewtwo,30
   Dragonite,28
   ```
6. You should see stats: Total Pokemon, Min/Max/Avg Cost
7. Create the draft
8. ✅ Draft should be created with custom pricing

**Verify in Supabase:**
- Go to **Table Editor** → `custom_formats`
- You should see a new row with your pricing data

---

### Test 2: Admin Promotion

**Backend is ready**, but UI component needs integration.

You can test via SQL:
```sql
-- Promote a participant to admin
SELECT promote_to_admin(
  'your-draft-id'::uuid,
  'participant-id-to-promote'::uuid,
  'host-participant-id'
);
```

**Or wait for UI integration** (AdminManagement component)

---

### Test 3: Undo System

**Backend is ready**, but UI component needs integration.

You can test via SQL:
```sql
-- Undo last pick for a team
SELECT * FROM undo_last_pick(
  'your-draft-id'::uuid,
  'team-id'::uuid,
  'participant-id'::uuid
);
```

**Or wait for UI integration** (UndoPick component)

---

### Test 4: Chat System

The chat backend is ready and the `DraftChat` component already exists.

**Verify in Supabase:**
- Start a draft with multiple participants
- Send messages in the chat
- Go to **Table Editor** → `chat_messages`
- You should see messages being stored

---

### Test 5: Draft History Tracking

Every pick is now being tracked automatically.

**Verify in Supabase:**
```sql
-- View draft history
SELECT * FROM get_draft_history('your-draft-id'::uuid);
```

You'll see all actions: picks, undos, etc.

---

## 🚨 Troubleshooting

### Error: "relation already exists"
**Solution:** Table was already created. Skip that part or ignore the error.

### Error: "column already exists"
**Solution:** Column was already added. This is fine, continue.

### Error: "function already exists"
**Solution:** Run this first:
```sql
DROP FUNCTION IF EXISTS function_name CASCADE;
```
Then re-run the migration.

### Error: "permission denied"
**Solution:** Make sure you're using the SQL Editor as the project owner.

### Migration seems stuck
**Solution:** Check the **Logs** tab in Supabase to see detailed error messages.

---

## 📊 Database Schema Overview

### Tables Created
```
custom_formats
├── id (uuid, primary key)
├── name (text)
├── description (text)
├── created_by_user_id (uuid)
├── created_by_display_name (text)
├── is_public (boolean)
├── pokemon_pricing (jsonb) ← The actual pricing data
├── total_pokemon (integer)
├── min_cost (integer)
├── max_cost (integer)
└── times_used (integer)

draft_actions
├── id (uuid, primary key)
├── draft_id (uuid, foreign key)
├── action_type (text) ← 'pick', 'bid', 'undo', etc.
├── team_id (uuid, foreign key)
├── participant_id (uuid, foreign key)
├── pokemon_id (text)
├── pokemon_name (text)
├── cost (integer)
├── is_undone (boolean)
├── undone_at (timestamptz)
├── round_number (integer)
└── pick_number (integer)

chat_messages
├── id (uuid, primary key)
├── draft_id (uuid, foreign key)
├── participant_id (uuid, foreign key)
├── message (text)
├── message_type (text) ← 'text', 'system', 'pick'
├── sender_name (text)
├── is_edited (boolean)
├── reactions (jsonb) ← {emoji: [participant_ids]}
└── created_at (timestamptz)
```

---

## ✅ Completion Checklist

- [ ] Migration 004 run successfully
- [ ] Migration 005 run successfully
- [ ] Migration 006 run successfully
- [ ] All tables verified in Table Editor
- [ ] All functions verified in Database → Functions
- [ ] Custom CSV pricing tested
- [ ] Chat messages working
- [ ] Ready for UI component integration

---

## 🎉 You're Done!

All database features are now set up and ready to use. The backend functionality is complete.

**Next Steps:**
- Features work via API/database
- UI components exist but need integration into draft pages
- See `FEATURE_INTEGRATION_GUIDE.md` for how to add components to pages
