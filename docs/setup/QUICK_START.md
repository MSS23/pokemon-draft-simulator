# Pokemon Draft Platform - Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Prerequisites
- Node.js 18+ installed
- Supabase account (or use demo mode)

---

## Step 1: Install Dependencies

```bash
cd pokemon-draft
npm install
npm install tsx vitest --save-dev
```

---

## Step 2: Database Setup

### Option A: Use Demo Mode (No Setup Required)
Your `.env.local` already has:
```
NEXT_PUBLIC_DEMO_MODE=true
```

Skip to Step 3!

### Option B: Use Supabase (Full Features)

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard)

2. Run the base schema:
   ```sql
   -- Copy from: supabase-schema.sql
   ```

3. Run the spectator migration:
   ```sql
   -- Copy from: database/migrations/002_spectator_mode.sql
   ```

4. Update `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_DEMO_MODE=false
   ```

---

## Step 3: Build Format Packs

This compiles Regulation H rules and Pokemon data:

```bash
npm run build:formats
```

⏱️ **Takes ~5 minutes** (fetches 1000+ Pokemon from PokeAPI)

**Output**:
```
✓ Built Pokemon index with 1025 entries
✓ Compiled VGC 2024 Regulation H: 450 legal Pokemon
✓ Saved: format_vgc-reg-h_abc12345.json
✅ Build complete!
```

---

## Step 4: Run Tests (Optional)

Verify everything works:

```bash
npm test
```

**Expected**: All tests pass ✅

---

## Step 5: Start Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## ✨ Try It Out!

### Test Spectator Mode

1. **Create a public draft**:
   - Go to `/create-draft`
   - Fill in your name & team
   - ✅ Check "Make this draft public"
   - Add description: "Test draft"
   - Add tags: "test, demo"
   - Click "Create Draft Room"

2. **View as spectator**:
   - Open **new incognito window**
   - Go to `/spectate`
   - See your draft in the list
   - Click "Watch Live"
   - 👁️ You're now spectating!

### Test Format Rules

1. **Try to pick a Paradox Pokemon**:
   - In draft room, search for "Iron Valiant"
   - Try to pick it
   - ❌ Should be blocked (not legal in Reg H)

2. **Pick a legal Pokemon**:
   - Search for "Amoonguss"
   - Pick it
   - ✅ Should work (cost: 19)

3. **Check costs**:
   - Amoonguss: 19
   - Archaludon: 20
   - Incineroar: 21

---

## 📁 Key Files

```
pokemon-draft/
├── src/app/
│   ├── create-draft/page.tsx    # Create drafts (with public toggle)
│   ├── spectate/page.tsx        # Browse public drafts
│   └── spectate/[id]/page.tsx   # Watch a specific draft
│
├── data/formats/
│   └── reg_h.json               # Regulation H definition
│
├── public/data/                 # Generated format packs
│   ├── pokemon_index_*.json
│   └── format_vgc-reg-h_*.json
│
└── tests/
    └── format-reg-h.test.ts     # Validation tests
```

---

## 🧪 Verify Installation

Run this checklist:

- [ ] `npm run dev` starts without errors
- [ ] Can create a draft at `/create-draft`
- [ ] Can see "Make this draft public" checkbox
- [ ] `/spectate` page loads
- [ ] `npm test` passes all tests
- [ ] `public/data/` folder contains JSON files

If all checked ✅, you're ready!

---

## 🐛 Troubleshooting

### "Format data not available" Error

**Fix**: Run `npm run build:formats`

### Tests Failing

**Fix**:
1. Run `npm run build:formats` first
2. Check that `public/data/` has JSON files
3. Run `npm test` again

### Supabase Connection Errors

**Fix**:
1. Check `.env.local` has correct URL & key
2. Verify migrations are run in Supabase
3. Or switch to demo mode: `NEXT_PUBLIC_DEMO_MODE=true`

### PokeAPI Rate Limiting

**Fix**:
- The compiler has built-in rate limiting (100ms between batches)
- If it fails, wait a minute and try again
- Or reduce the ID range in `build-format.ts`

---

## 🎯 What to Test

### ✅ Spectator Mode Checklist

- [ ] Create a public draft
- [ ] See it in `/spectate` page
- [ ] Join as spectator via room code
- [ ] See "Spectator Mode (Read-only)" banner
- [ ] Watch picks happen in real-time
- [ ] Spectator count increments
- [ ] Can't make picks as spectator

### ✅ Format Rules Checklist

- [ ] Paradox Pokemon are banned (Iron Valiant, Great Tusk, etc.)
- [ ] Legendaries are banned (Koraidon, Miraidon, etc.)
- [ ] Normal Pokemon are legal (Amoonguss, Incineroar, etc.)
- [ ] Costs match overrides (Amoonguss: 19, Archaludon: 20)
- [ ] Tests pass: `npm test`

---

## 📚 Next Steps

1. **Read the full docs**: `IMPLEMENTATION_SUMMARY.md`
2. **Customize formats**: Edit `data/formats/reg_h.json`
3. **Add new formats**: Create `data/formats/your_format.json`
4. **Deploy**:
   ```bash
   npm run build
   npm start
   ```

---

## 🤝 Need Help?

- Check `IMPLEMENTATION_SUMMARY.md` for detailed docs
- Review test files in `tests/` for examples
- Check the migration files in `database/migrations/`

---

**Happy Drafting! 🎮**