# Pokémon Draft League

A comprehensive real-time Pokémon drafting platform with official VGC 2024 Regulation H compliance, supporting competitive snake and auction draft formats for tournament-level play.

## ✨ Key Features

### 🏆 Tournament-Ready Formats
- **VGC 2024 Regulation H**: Official format with complete legendary/mythical/paradox banlist
- **VGC 2024 Regulation G**: Previous regulation with paradox Pokémon allowed
- **Smogon Tiers**: OU, UU, RU formats across multiple generations
- **Custom Formats**: Budget-balanced and unrestricted competitive play

### ⚡ Real-Time Multiplayer
- **Live synchronization** across all participants with Supabase WebSockets
- **Snake draft** format with automatic turn progression and visual indicators
- **Auction draft** format with real-time bidding and countdown timers
- **Guest user support** with shareable draft links - no registration required
- **Auto-pick system** with customizable wishlist and countdown functionality

### 🔍 Advanced Pokémon Tools
- **Comprehensive search** with type, cost, stats, and ability filtering
- **1000+ Pokémon database** with complete move data and official sprites
- **Real-time legality validation** for tournament compliance
- **Team building tools** with budget tracking and composition analysis
- **Mobile-optimized** responsive design with dark/light themes

### 🎯 Strategic Features
- **Wishlist management** with priority-based auto-picking
- **Budget optimization** tools with cost-per-point analysis
- **Team coverage analysis** showing type effectiveness and synergy
- **Draft results comparison** with detailed team breakdowns
- **Export functionality** for team lists and draft summaries

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript
- **Styling**: Tailwind CSS + Shadcn UI
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Pokemon Data**: PokéAPI

## Setup Instructions

### 1. Supabase Configuration

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API
3. Copy your project URL and anon key
4. Update `.env.local` with your credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Database Schema

Run the following SQL in your Supabase SQL editor to create the necessary tables:

```sql
-- Enable RLS
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create tables
CREATE TABLE drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  format TEXT CHECK (format IN ('snake', 'auction')) NOT NULL,
  ruleset TEXT DEFAULT 'regulation-h',
  budget_per_team INTEGER DEFAULT 100,
  max_teams INTEGER DEFAULT 8,
  status TEXT CHECK (status IN ('setup', 'active', 'completed', 'paused')) DEFAULT 'setup',
  current_turn INTEGER,
  current_round INTEGER DEFAULT 1,
  settings JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT,
  budget_remaining INTEGER DEFAULT 100,
  draft_order INTEGER NOT NULL
);

CREATE TABLE picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  pick_order INTEGER NOT NULL,
  round INTEGER NOT NULL
);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  user_id TEXT,
  display_name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  is_host BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pokemon_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  is_legal BOOLEAN DEFAULT TRUE
);

CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  nominated_by UUID REFERENCES teams(id),
  current_bid INTEGER DEFAULT 0,
  current_bidder UUID REFERENCES teams(id),
  auction_end TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active'
);

CREATE TABLE bid_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  bid_amount INTEGER NOT NULL
);

-- Create indexes
CREATE INDEX bid_history_auction_id_idx ON bid_history(auction_id);
CREATE INDEX bid_history_draft_id_idx ON bid_history(draft_id);
CREATE INDEX bid_history_team_id_idx ON bid_history(team_id);

-- Enable RLS on all tables
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now - tighten in production)
CREATE POLICY "Enable all access for drafts" ON drafts FOR ALL USING (true);
CREATE POLICY "Enable all access for teams" ON teams FOR ALL USING (true);
CREATE POLICY "Enable all access for picks" ON picks FOR ALL USING (true);
CREATE POLICY "Enable all access for participants" ON participants FOR ALL USING (true);
CREATE POLICY "Enable all access for pokemon_tiers" ON pokemon_tiers FOR ALL USING (true);
CREATE POLICY "Enable all access for auctions" ON auctions FOR ALL USING (true);
CREATE POLICY "Enable all access for bid_history" ON bid_history FOR ALL USING (true);
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── app/                 # Next.js app router pages
├── components/          # Reusable UI components
│   ├── ui/             # Shadcn UI components
│   ├── draft/          # Draft-specific components
│   ├── pokemon/        # Pokemon-related components
│   └── team/           # Team-related components
├── hooks/              # Custom React hooks
├── lib/                # Library configurations
├── stores/             # Zustand state stores
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## Usage

1. **Create a Draft**: Set up a new draft with your preferred format and rules
2. **Share the Link**: Invite participants using the shareable draft link
3. **Join Teams**: Participants join and create/claim teams
4. **Start Drafting**: Begin the real-time draft process
5. **Make Picks**: Take turns selecting Pokémon (snake) or bid on them (auction)

## 🎯 VGC 2024 Regulation H Rules

The application implements the **official VGC 2024 Regulation H ruleset** with complete accuracy:

### Banned Pokémon Categories
- **ALL Legendary Pokémon** (including previous generations transferable via HOME)
- **ALL Mythical Pokémon** (Mew, Celebi, Jirachi, Pecharunt, etc.)
- **ALL Paradox Pokémon** (Great Tusk, Iron Valiant, Flutter Mane, etc.)
- **Special forms** (Galarian Birds, Therian forms, Origin forms)

### Allowed Pokédex
- **Paldea Pokédex**: #001-375, #388-392
- **Kitakami Pokédex**: #001-196 (The Teal Mask DLC)
- **Blueberry Academy Pokédex**: #001-235 (The Indigo Disk DLC)

### Battle Rules
- Species Clause: No duplicate Pokémon species
- Item Clause: No duplicate held items
- All Pokémon set to Level 50
- Must be obtained in Scarlet/Violet or transferred from HOME

### Cost System
- **Balanced tier system** based on base stat totals
- **30 points**: 600+ BST (Pseudo-legendaries)
- **25 points**: 550-599 BST (Very strong)
- **20 points**: 500-549 BST (Strong)
- **15 points**: 450-499 BST (Above average)
- **10 points**: 400-449 BST (Average)
- **Lower tiers**: 3-8 points for budget options

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for your own Pokémon draft leagues!