# Feature Usage Guide

## 📚 Complete Guide to All New Features

This guide explains how to use each new feature in your Pokemon Draft application.

---

## 1. 📊 Custom CSV Pricing

### What It Does
Allows draft hosts to upload their own custom Pokemon pricing instead of using preset formats.

### How to Use

1. **Create a Draft**
   - Go to `/create-draft`
   - Fill in your name and team name

2. **Enable Custom Pricing**
   - Check the box: **"Use Custom Pricing (CSV)"**
   - The standard format dropdown will be replaced with CSV upload

3. **Download Template (Optional)**
   - Click **"Template"** button to download a sample CSV
   - Opens a file: `pokemon-pricing-template.csv`

4. **Prepare Your CSV File**
   ```csv
   pokemon,cost
   Pikachu,10
   Charizard,25
   Mewtwo,30
   Dragonite,28
   Garchomp,26
   Tyranitar,24
   ```

   **Requirements:**
   - First row must be headers: `pokemon,cost` (or `name,cost` or `pokemon_name,points`)
   - Each row: Pokemon name, comma, cost value
   - Costs must be positive integers
   - No duplicate Pokemon

5. **Upload CSV**
   - Click **"Upload CSV File"**
   - Select your file
   - You'll see validation results:
     - ✅ Success: Shows total Pokemon, min/max/avg cost
     - ❌ Error: Shows what's wrong with your file

6. **Create Draft**
   - Once CSV is validated, click **"Create Draft Room"**
   - Your draft will use the custom pricing from your CSV

### Supported CSV Formats

All these work:
```csv
pokemon,cost          ✅
name,cost             ✅
pokemon_name,points   ✅
pokemon,price         ✅
name,value            ✅
```

### CSV Validation Rules

- ✅ File must be .csv format
- ✅ File size under 5MB
- ✅ At least one Pokemon
- ✅ Costs between 0-1000
- ✅ No duplicates
- ⚠️ Warnings shown but still accepted if fixable
- ❌ Critical errors prevent upload

### Example CSVs

**Simple Draft:**
```csv
pokemon,cost
Bulbasaur,5
Charmander,5
Squirtle,5
Pikachu,8
Mewtwo,30
```

**Balanced Tier System:**
```csv
pokemon,cost
Rattata,1
Pidgey,1
Magikarp,1
Charizard,15
Blastoise,15
Venusaur,15
Mewtwo,25
Mew,25
Rayquaza,25
```

---

## 2. 👥 Multi-Admin Support

### What It Does
Allows the draft host to promote other participants to admin, giving them the same permissions as the host.

### Admin Permissions
Admins can:
- ✅ Start/pause/stop the draft
- ✅ Modify draft settings
- ✅ Promote/demote other participants (if host)
- ✅ Manage draft flow
- ✅ Access all host controls

### How to Use (When UI is Integrated)

**As Host:**
1. During a draft, open the Admin Management panel
2. See all participants listed
3. Click **"Make Admin"** next to a participant's name
4. They are immediately promoted
5. Click **"Remove Admin"** to demote them

**As Admin:**
- You have all host permissions except promoting/demoting others
- You cannot demote the host
- You can be demoted by the host

### Current Status
- ✅ Backend fully functional
- ⏳ UI component exists: `AdminManagement.tsx`
- ⏳ Needs integration into draft room page

### Test via API (Advanced)
```typescript
import { AdminService } from '@/lib/admin-service'

// Promote a participant
await AdminService.promoteToAdmin({
  draftId: 'draft-id',
  participantId: 'participant-to-promote',
  promotingUserId: 'your-participant-id'
})

// Demote an admin
await AdminService.demoteFromAdmin({
  draftId: 'draft-id',
  participantId: 'admin-to-demote',
  demotingUserId: 'your-participant-id'
})
```

---

## 3. ⏪ Undo Last Pick

### What It Does
Teams can undo their most recent pick during the draft, with a limited number of undos per team.

### Rules
- Each team gets **3 undos** by default
- Can only undo during your turn
- Undoes the LAST pick only
- Restores the Pokemon to the available pool
- Returns budget to your team
- Uses one undo from your remaining count

### How to Use (When UI is Integrated)

1. **During Your Turn**
   - See the "Undo Last Pick" button
   - Shows how many undos remaining (e.g., "2 left")

2. **Click Undo**
   - Your last pick is reversed
   - Pokemon becomes available again
   - Budget is restored
   - Undo counter decreases

3. **Undo Counter**
   - Green: 2-3 undos left
   - Yellow: 1 undo left
   - Red: 0 undos left (disabled)

### When You CAN'T Undo
- ❌ Not your turn
- ❌ No undos remaining
- ❌ Haven't made any picks yet
- ❌ Draft hasn't started

### Strategy Tips
💡 Save undos for important decisions
💡 Use early if you made a mistake
💡 Coordinate with your team
💡 Don't waste on minor picks

### Current Status
- ✅ Backend fully functional
- ✅ Tracks all draft actions
- ⏳ UI component exists: `UndoPick.tsx`
- ⏳ Needs integration into draft room page

### Test via API (Advanced)
```typescript
import { UndoService } from '@/lib/undo-service'

// Undo last pick
const result = await UndoService.undoLastPick({
  draftId: 'draft-id',
  teamId: 'your-team-id',
  participantId: 'your-participant-id'
})

// Check undos remaining
const remaining = await UndoService.getUndosRemaining('team-id')
```

---

## 4. 💾 Export Draft Results

### What It Does
Export your completed draft in multiple formats for sharing, analysis, or record-keeping.

### Export Formats

**1. JSON Export**
- Complete draft data
- All teams, picks, and stats
- Machine-readable format
- Perfect for importing into other tools

**2. CSV Export**
- Pick history as spreadsheet
- Columns: Round, Pick, Team, Pokemon, Cost, Types, BST, Abilities
- Easy to open in Excel/Google Sheets
- Great for analysis

**3. Text Summary**
- Beautiful formatted report
- Team rosters and statistics
- Type coverage
- Performance ratings
- Ready to copy-paste into Discord/Slack

**4. Copy to Clipboard**
- Instantly copies text summary
- Quick sharing
- No file download needed

### How to Use (When UI is Integrated)

1. **After Draft Completes**
   - Go to draft results page
   - See "Export Draft" section

2. **Choose Format**
   - Click **JSON** for complete data
   - Click **CSV** for spreadsheet
   - Click **Text Summary** for formatted report
   - Click **Copy Summary** for quick sharing

3. **File Downloads**
   - JSON: `draft-name-draft-id.json`
   - CSV: `draft-name-picks.csv`
   - Text: `draft-name-summary.txt`

### Example Text Summary Output
```
╔════════════════════════════════════════════════════════════╗
║           POKEMON DRAFT SUMMARY                            ║
╚════════════════════════════════════════════════════════════╝

Draft Name: My Awesome Draft
Format: SNAKE
Status: COMPLETED
Date: 1/15/2025
Participants: 4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEAM 1: TEAM ROCKET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pokemon (6):
  1. Charizard          | Cost:  25 | BST: 534 | Fire/Flying
  2. Mewtwo             | Cost:  30 | BST: 680 | Psychic
  ...
```

### Current Status
- ✅ Backend fully functional
- ✅ All export formats working
- ⏳ UI component exists: `ExportDraft.tsx`
- ⏳ Needs integration into results page

### Test via API (Advanced)
```typescript
import { downloadDraftJSON, downloadDraftCSV, downloadDraftSummary } from '@/lib/draft-export'

const exportData = {
  draft,
  teams,
  picks,
  participants,
  pokemon
}

// Download JSON
downloadDraftJSON(exportData)

// Download CSV
downloadDraftCSV(exportData)

// Download Text Summary
downloadDraftSummary(exportData)

// Copy to clipboard
await copyDraftSummaryToClipboard(exportData)
```

---

## 5. 📊 Team Analytics & Performance

### What It Does
Provides comprehensive statistics and performance analysis for each team during and after the draft.

### Metrics Tracked

**Overall Rating (0-100)**
- Composite score based on all factors
- Color-coded: Green (80+), Blue (60+), Yellow (40+), Red (<40)

**Rating Breakdown:**
- ⚔️ **Offense** - Attack + Special Attack power
- 🛡️ **Defense** - Defense + Special Defense + HP
- ⚡ **Speed** - Average speed stat
- 🎯 **Diversity** - Type coverage (more types = better)
- 💰 **Value** - Budget efficiency (BST per cost point)

**Team Statistics:**
- Average stats (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed)
- Total Base Stat Total (BST)
- Average BST
- Type distribution and coverage
- Most expensive pick
- Best value pick
- Legendary/Mythical count
- Unique abilities count

### How to Use (When UI is Integrated)

1. **During Draft**
   - View team analytics panel
   - See real-time updates as you pick
   - Compare your team to others

2. **After Draft**
   - Detailed breakdown of all teams
   - Side-by-side comparisons
   - Identify strengths and weaknesses

### Understanding Ratings

**90-100: Exceptional** 🌟
- Tournament-level team
- Well-balanced and powerful

**70-89: Strong** ⭐
- Competitive team
- Good balance

**50-69: Average** ⚖️
- Decent team
- Room for improvement

**30-49: Weak** ⚠️
- Unbalanced or low-power
- Strategic disadvantages

**0-29: Poor** ❌
- Major issues
- Needs rework

### Current Status
- ✅ Backend fully functional
- ✅ Complex calculations working
- ⏳ UI component exists: `TeamAnalytics.tsx`
- ⏳ Needs integration into draft/results pages

### Test via API (Advanced)
```typescript
import { calculateTeamStats, rateTeam } from '@/lib/team-analytics'

// Get team statistics
const stats = calculateTeamStats(team, picks, allPokemon)

// Get team rating
const rating = rateTeam(stats)

console.log(`Overall Rating: ${rating.overall}/100`)
console.log(`Offense: ${rating.breakdown.offense}`)
console.log(`Defense: ${rating.breakdown.defense}`)
```

---

## 6. 💬 Enhanced Chat System

### What It Does
Real-time chat for draft participants with reactions, system messages, and message management.

### Features

**Message Types:**
- 💬 **Text Messages** - Regular chat
- 🤖 **System Messages** - Draft events (picks, undos, etc.)
- 📢 **Pick Announcements** - Automatic when someone picks

**Reactions:**
- Add emoji reactions to messages
- See who reacted
- Multiple reactions per message
- Available emojis: 👍 ❤️ 😂 😮 😢 ⚡ 🔥 💯

**Message Features:**
- Edit your own messages
- Delete your own messages
- Message history
- Real-time updates

### How to Use

1. **During Draft**
   - Chat panel visible on screen
   - Type message and press Enter or click Send
   - Messages appear in real-time for all participants

2. **React to Messages**
   - Hover over a message
   - Click the smile icon
   - Select an emoji
   - See reaction counter update

3. **System Messages**
   - Automatically posted when:
     - Someone joins
     - Someone picks a Pokemon
     - Someone undos a pick
     - Draft starts/pauses/completes

### Current Status
- ✅ Database fully set up
- ✅ Real-time subscriptions working
- ✅ UI component exists: `DraftChat.tsx`
- ⚠️ May already be integrated (check your draft page)

---

## 7. 📜 Draft History Tracking

### What It Does
Records every action taken during a draft for replay, analysis, and undo functionality.

### Actions Tracked
- ✅ Pokemon picks
- ✅ Auction bids
- ✅ Undos
- ✅ Draft start/pause/complete
- ✅ Admin actions

### Each Action Records
- Who performed it
- When it happened
- Which Pokemon (if applicable)
- Cost/bid amount
- Round and pick number
- Whether it was undone

### How to Use (Backend Only - No UI Yet)

**View Draft History:**
```sql
-- In Supabase SQL Editor
SELECT * FROM get_draft_history('your-draft-id'::uuid)
ORDER BY created_at DESC;
```

**Query Specific Actions:**
```sql
-- All picks
SELECT * FROM draft_actions
WHERE draft_id = 'your-draft-id'
AND action_type = 'pick'
AND is_undone = FALSE;

-- All undos
SELECT * FROM draft_actions
WHERE draft_id = 'your-draft-id'
AND action_type = 'undo';
```

### Future Uses
- Draft replay feature
- Action timeline
- Statistics and analysis
- Dispute resolution
- Learning from past drafts

---

## 🎯 Quick Reference

| Feature | Status | Component | Integration Needed |
|---------|--------|-----------|-------------------|
| Custom CSV Pricing | ✅ Working | CSVUpload.tsx | ✅ Already integrated |
| Admin Management | ✅ Backend Ready | AdminManagement.tsx | ⏳ Needs integration |
| Undo System | ✅ Backend Ready | UndoPick.tsx | ⏳ Needs integration |
| Export | ✅ Backend Ready | ExportDraft.tsx | ⏳ Needs integration |
| Team Analytics | ✅ Backend Ready | TeamAnalytics.tsx | ⏳ Needs integration |
| Enhanced Chat | ✅ Backend Ready | DraftChat.tsx | ⚠️ Check if integrated |
| Draft History | ✅ Backend Ready | None yet | Future feature |

---

## 📝 Notes

- All backend functionality is complete and tested
- Database migrations must be run (see SUPABASE_SETUP_GUIDE.md)
- UI components exist and are ready to use
- Integration into draft pages is optional but recommended
- Features work via API even without UI components

---

## 🆘 Support

If you have questions about any feature:
1. Check this guide first
2. Check SUPABASE_SETUP_GUIDE.md for database setup
3. Check component files for implementation details
4. Test features via API to verify they work

---

## ✅ Testing Checklist

- [ ] Custom CSV pricing works
- [ ] Can upload valid CSV
- [ ] Invalid CSV shows errors
- [ ] Draft uses custom pricing
- [ ] Admin promotion works (via API or UI)
- [ ] Undo system works (via API or UI)
- [ ] Export generates files
- [ ] Analytics shows correct stats
- [ ] Chat messages save to database
- [ ] Draft history records actions
