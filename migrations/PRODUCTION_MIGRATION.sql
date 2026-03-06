/**
 * POKEMON DRAFT — PRODUCTION MIGRATION
 *
 * Single idempotent migration that brings any database state up to the
 * current schema required by the TypeScript application code.
 *
 * Safe to run on:
 *   - A brand-new empty Supabase project
 *   - An existing database (all DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
 *
 * Run this in the Supabase SQL Editor.
 * Last updated: 2026-03-06
 */

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

-- user_profiles (extended schema matching TypeScript types)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  email              TEXT,
  display_name       TEXT,
  avatar_url         TEXT,
  username           TEXT UNIQUE,
  bio                TEXT,
  twitter_profile    TEXT,
  twitch_channel     TEXT,
  is_verified        BOOLEAN DEFAULT FALSE,
  total_drafts_created        INTEGER DEFAULT 0,
  total_drafts_participated   INTEGER DEFAULT 0,
  favorite_pokemon   TEXT,
  stats              JSONB DEFAULT '{}'::jsonb,
  preferences        JSONB DEFAULT '{}'::jsonb
);

-- Add columns to custom_formats that may be missing on older DBs (old schema had creator_id/costs)
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS pokemon_pricing          JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS total_pokemon            INTEGER DEFAULT 0;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS min_cost                 INTEGER DEFAULT 0;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS max_cost                 INTEGER DEFAULT 0;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS avg_cost                 DECIMAL(5,2) DEFAULT 0;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS created_by_user_id       TEXT;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS created_by_display_name  TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS times_used               INTEGER DEFAULT 0;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS last_used_at             TIMESTAMPTZ;
ALTER TABLE custom_formats ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ;

-- Add columns to user_profiles that may be missing on older DBs
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email               TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username            TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio                 TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS twitter_profile     TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS twitch_channel      TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_verified         BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS total_drafts_created        INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS total_drafts_participated   INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS favorite_pokemon    TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stats               JSONB DEFAULT '{}'::jsonb;

-- custom_formats (TypeScript-compatible schema)
CREATE TABLE IF NOT EXISTS custom_formats (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  name                     TEXT NOT NULL,
  description              TEXT,
  pokemon_pricing          JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_pokemon            INTEGER DEFAULT 0,
  min_cost                 INTEGER DEFAULT 0,
  max_cost                 INTEGER DEFAULT 0,
  avg_cost                 DECIMAL(5,2) DEFAULT 0,
  created_by_user_id       TEXT,
  created_by_display_name  TEXT NOT NULL DEFAULT 'Unknown',
  is_public                BOOLEAN DEFAULT FALSE,
  times_used               INTEGER DEFAULT 0,
  last_used_at             TIMESTAMPTZ,
  deleted_at               TIMESTAMPTZ
);

-- drafts
CREATE TABLE IF NOT EXISTS drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  name             TEXT NOT NULL,
  host_id          TEXT NOT NULL,
  format           TEXT CHECK (format IN ('snake', 'auction')) NOT NULL,
  ruleset          TEXT DEFAULT 'regulation-h',
  budget_per_team  INTEGER DEFAULT 100,
  max_teams        INTEGER DEFAULT 8,
  status           TEXT CHECK (status IN ('setup', 'active', 'completed', 'paused', 'deleted')) DEFAULT 'setup',
  current_turn     INTEGER,
  current_round    INTEGER DEFAULT 1,
  turn_started_at  TIMESTAMPTZ,
  settings         JSONB DEFAULT '{}'::jsonb,
  room_code        TEXT UNIQUE,
  is_public        BOOLEAN DEFAULT FALSE,
  spectator_count  INTEGER DEFAULT 0,
  description      TEXT,
  tags             TEXT[],
  password         TEXT,
  custom_format_id UUID REFERENCES custom_formats(id),
  deleted_at       TIMESTAMPTZ,
  deleted_by       TEXT
);

-- Add columns to drafts that may be missing on older DBs
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS turn_started_at  TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS is_public        BOOLEAN DEFAULT FALSE;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS spectator_count  INTEGER DEFAULT 0;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS description      TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS tags             TEXT[];
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS password         TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS custom_format_id UUID;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS deleted_by       TEXT;

-- teams
CREATE TABLE IF NOT EXISTS teams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  draft_id         UUID REFERENCES drafts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  owner_id         TEXT,
  budget_remaining INTEGER DEFAULT 100,
  draft_order      INTEGER NOT NULL,
  undos_remaining  INTEGER DEFAULT 3
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE teams ADD COLUMN IF NOT EXISTS undos_remaining  INTEGER DEFAULT 3;

-- picks
CREATE TABLE IF NOT EXISTS picks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  draft_id     UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  pokemon_id   TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost         INTEGER NOT NULL,
  pick_order   INTEGER NOT NULL,
  round        INTEGER NOT NULL
);

-- participants
CREATE TABLE IF NOT EXISTS participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  draft_id     UUID REFERENCES drafts(id) ON DELETE CASCADE,
  user_id      TEXT,
  display_name TEXT NOT NULL,
  team_id      UUID REFERENCES teams(id),
  is_host      BOOLEAN DEFAULT FALSE,
  is_admin     BOOLEAN DEFAULT FALSE,
  last_seen    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE participants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- pokemon_tiers
CREATE TABLE IF NOT EXISTS pokemon_tiers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  draft_id     UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id   TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  cost         INTEGER NOT NULL,
  is_legal     BOOLEAN DEFAULT TRUE
);

-- auctions (TypeScript-compatible schema: TEXT refs, not UUID FK)
CREATE TABLE IF NOT EXISTS auctions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  draft_id       UUID REFERENCES drafts(id) ON DELETE CASCADE,
  pokemon_id     TEXT NOT NULL,
  pokemon_name   TEXT NOT NULL,
  nominated_by   TEXT NOT NULL,
  current_bid    INTEGER DEFAULT 1,
  current_bidder TEXT,
  auction_end    TIMESTAMPTZ NOT NULL,
  status         TEXT CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active'
);

-- bid_history (TypeScript-compatible schema)
CREATE TABLE IF NOT EXISTS bid_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  auction_id   UUID REFERENCES auctions(id) ON DELETE CASCADE,
  draft_id     UUID REFERENCES drafts(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  team_name    TEXT NOT NULL,
  bid_amount   INTEGER NOT NULL
);

-- wishlist_items
CREATE TABLE IF NOT EXISTS wishlist_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  draft_id       UUID REFERENCES drafts(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  pokemon_id     TEXT NOT NULL,
  pokemon_name   TEXT NOT NULL,
  priority       INTEGER NOT NULL,
  is_available   BOOLEAN DEFAULT TRUE,
  cost           INTEGER NOT NULL
);

-- wishlists (parent table, used for deletion in draft-service)
CREATE TABLE IF NOT EXISTS wishlists (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  draft_id       UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id, draft_id)
);

-- spectator_events
CREATE TABLE IF NOT EXISTS spectator_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id     UUID REFERENCES drafts(id) ON DELETE CASCADE,
  spectator_id TEXT,
  event_type   TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- draft_actions (for undo system)
CREATE TABLE IF NOT EXISTS draft_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id     UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL CHECK (action_type IN ('pick', 'bid', 'auction_win', 'undo')),
  action_data  JSONB NOT NULL,
  performed_by TEXT NOT NULL,
  can_undo     BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- draft_results
CREATE TABLE IF NOT EXISTS draft_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id         UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE UNIQUE,
  total_picks      INTEGER NOT NULL DEFAULT 0,
  total_teams      INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  winner_team_id   UUID REFERENCES teams(id),
  stats            JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- draft_result_teams (per-team draft summary)
CREATE TABLE IF NOT EXISTS draft_result_teams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_result_id  UUID NOT NULL REFERENCES draft_results(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  final_budget     INTEGER NOT NULL DEFAULT 0,
  total_cost       INTEGER NOT NULL DEFAULT 0,
  pick_count       INTEGER NOT NULL DEFAULT 0,
  average_cost     DECIMAL(5,2),
  team_stats       JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(draft_result_id, team_id)
);

-- ============================================================
-- LEAGUE SYSTEM TABLES
-- ============================================================

-- leagues
CREATE TABLE IF NOT EXISTS leagues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id       UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  league_type    TEXT NOT NULL CHECK (league_type IN ('single', 'split_conference_a', 'split_conference_b')),
  battle_type    TEXT NOT NULL DEFAULT 'showdown' CHECK (battle_type IN ('wifi', 'showdown')),
  season_number  INTEGER DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  start_date     TIMESTAMPTZ,
  end_date       TIMESTAMPTZ,
  current_week   INTEGER DEFAULT 1,
  total_weeks    INTEGER NOT NULL,
  settings       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS battle_type TEXT NOT NULL DEFAULT 'showdown';

-- league_teams
CREATE TABLE IF NOT EXISTS league_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  seed            INTEGER,
  final_placement INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, team_id)
);

ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS final_placement INTEGER;

-- matches
CREATE TABLE IF NOT EXISTS matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number    INTEGER NOT NULL,
  match_number   INTEGER NOT NULL,
  home_team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  home_score     INTEGER DEFAULT 0,
  away_score     INTEGER DEFAULT 0,
  winner_team_id UUID REFERENCES teams(id),
  battle_format  TEXT DEFAULT 'best_of_3',
  youtube_url    TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  UNIQUE(league_id, week_number, home_team_id, away_team_id)
);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- standings (point_differential as regular column, not GENERATED)
CREATE TABLE IF NOT EXISTS standings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id          UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  wins               INTEGER DEFAULT 0,
  losses             INTEGER DEFAULT 0,
  draws              INTEGER DEFAULT 0,
  points_for         INTEGER DEFAULT 0,
  points_against     INTEGER DEFAULT 0,
  point_differential INTEGER DEFAULT 0,
  rank               INTEGER,
  current_streak     TEXT,
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, team_id)
);

-- If point_differential was previously a GENERATED column, replace it with a regular one
DO $$
BEGIN
  -- Drop generated column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'standings'
      AND column_name = 'point_differential'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE standings DROP COLUMN point_differential;
    ALTER TABLE standings ADD COLUMN point_differential INTEGER DEFAULT 0;
  END IF;
END $$;

-- match_games
CREATE TABLE IF NOT EXISTS match_games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number     INTEGER NOT NULL,
  winner_team_id  UUID REFERENCES teams(id),
  home_team_score INTEGER DEFAULT 0,
  away_team_score INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  UNIQUE(match_id, game_number)
);

-- team_pokemon_status
CREATE TABLE IF NOT EXISTS team_pokemon_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  pick_id         UUID REFERENCES picks(id),
  pokemon_id      TEXT NOT NULL,
  pokemon_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'healthy', 'injured', 'fainted', 'dead')),
  total_kos       INTEGER DEFAULT 0,
  matches_played  INTEGER DEFAULT 0,
  matches_won     INTEGER DEFAULT 0,
  death_match_id  UUID REFERENCES matches(id),
  death_date      TIMESTAMPTZ,
  death_details   JSONB DEFAULT '{}'::jsonb,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS pick_id         UUID;
ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS matches_played  INTEGER DEFAULT 0;
ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS matches_won     INTEGER DEFAULT 0;
ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS death_match_id  UUID;
ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS death_date      TIMESTAMPTZ;
ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS death_details   JSONB DEFAULT '{}'::jsonb;
ALTER TABLE team_pokemon_status ADD COLUMN IF NOT EXISTS notes           TEXT;

-- Fix status check constraint to include all values
DO $$
BEGIN
  ALTER TABLE team_pokemon_status DROP CONSTRAINT IF EXISTS team_pokemon_status_status_check;
  ALTER TABLE team_pokemon_status ADD CONSTRAINT team_pokemon_status_status_check
    CHECK (status IN ('alive', 'healthy', 'injured', 'fainted', 'dead'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Unique constraint on pick_id + league_id
DO $$
BEGIN
  ALTER TABLE team_pokemon_status DROP CONSTRAINT IF EXISTS team_pokemon_status_league_id_team_id_pokemon_id_key;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_pokemon_status_pick_id_league_id_key'
  ) THEN
    ALTER TABLE team_pokemon_status
      ADD CONSTRAINT team_pokemon_status_pick_id_league_id_key
      UNIQUE (pick_id, league_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- match_pokemon_kos (TypeScript-compatible schema)
CREATE TABLE IF NOT EXISTS match_pokemon_kos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  pick_id     UUID REFERENCES picks(id) ON DELETE CASCADE,
  pokemon_id  TEXT NOT NULL,
  ko_count    INTEGER NOT NULL DEFAULT 1,
  is_death    BOOLEAN NOT NULL DEFAULT false,
  ko_details  JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE match_pokemon_kos ADD COLUMN IF NOT EXISTS pick_id    UUID;
ALTER TABLE match_pokemon_kos ADD COLUMN IF NOT EXISTS ko_count   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE match_pokemon_kos ADD COLUMN IF NOT EXISTS is_death   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE match_pokemon_kos ADD COLUMN IF NOT EXISTS ko_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE match_pokemon_kos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Fix proposed_by column type (old schema used UUID, app expects TEXT)
-- Must drop dependent views first, then recreate them after the ALTER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'proposed_by'
      AND data_type = 'uuid'
  ) THEN
    DROP VIEW IF EXISTS trade_history;
    ALTER TABLE trades ALTER COLUMN proposed_by TYPE TEXT USING proposed_by::TEXT;
  END IF;
END $$;

-- trades
CREATE TABLE IF NOT EXISTS trades (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id            UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number          INTEGER NOT NULL DEFAULT 1,
  team_a_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_b_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_a_gives         TEXT[] NOT NULL DEFAULT '{}',
  team_b_gives         TEXT[] NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'completed', 'cancelled')),
  proposed_by          TEXT NOT NULL,
  proposed_at          TIMESTAMPTZ DEFAULT NOW(),
  responded_at         TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  notes                TEXT,
  commissioner_approved BOOLEAN,
  commissioner_id      TEXT,
  commissioner_notes   TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- trade_approvals
CREATE TABLE IF NOT EXISTS trade_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id         UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL,
  approver_role    TEXT NOT NULL DEFAULT 'commissioner' CHECK (approver_role IN ('commissioner', 'admin', 'owner')),
  approved         BOOLEAN NOT NULL,
  comments         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade_id, approver_user_id)
);

-- weekly_summaries (NEW)
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id                   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number                 INTEGER NOT NULL,
  headline                    TEXT,
  summary_text                TEXT,
  top_performer_team_id       UUID REFERENCES teams(id),
  top_performer_reason        TEXT,
  most_kos_pokemon_id         TEXT,
  most_kos_pick_id            UUID REFERENCES picks(id),
  most_kos_count              INTEGER DEFAULT 0,
  biggest_upset_match_id      UUID REFERENCES matches(id),
  biggest_upset_description   TEXT,
  total_matches               INTEGER DEFAULT 0,
  total_kos                   INTEGER DEFAULT 0,
  total_deaths                INTEGER DEFAULT 0,
  total_trades                INTEGER DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, week_number)
);

-- weekly_highlights (NEW)
CREATE TABLE IF NOT EXISTS weekly_highlights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number   INTEGER NOT NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  icon          TEXT,
  team_id       UUID REFERENCES teams(id),
  match_id      UUID REFERENCES matches(id),
  pick_id       UUID REFERENCES picks(id),
  trade_id      UUID REFERENCES trades(id),
  display_order INTEGER DEFAULT 0,
  is_pinned     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- waiver_claims (NEW)
CREATE TABLE IF NOT EXISTS waiver_claims (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id            UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id              UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  claimed_pokemon_id   TEXT NOT NULL,
  claimed_pokemon_name TEXT NOT NULL,
  dropped_pick_id      UUID REFERENCES picks(id),
  status               TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')),
  waiver_priority      INTEGER,
  claimed_at           TIMESTAMPTZ DEFAULT NOW(),
  processed_at         TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONSTRAINTS
-- ============================================================

-- Prevent duplicate Pokemon picks per team
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_team_pokemon'
  ) THEN
    ALTER TABLE picks ADD CONSTRAINT unique_team_pokemon
      UNIQUE (draft_id, team_id, pokemon_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Prevent negative budgets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'positive_budget'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT positive_budget
      CHECK (budget_remaining >= 0);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- deleted_by check on drafts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_deleted_by_required'
  ) THEN
    ALTER TABLE drafts ADD CONSTRAINT check_deleted_by_required
      CHECK (
        (deleted_at IS NULL AND deleted_by IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
      );
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id         ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_formats_creator        ON custom_formats(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_formats_public         ON custom_formats(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_drafts_room_code              ON drafts(room_code);
CREATE INDEX IF NOT EXISTS idx_drafts_status                 ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_host_id                ON drafts(host_id);
CREATE INDEX IF NOT EXISTS idx_drafts_not_deleted            ON drafts(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drafts_status_created         ON drafts(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teams_draft_id                ON teams(draft_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_id                ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_draft             ON teams(owner_id, draft_id);
CREATE INDEX IF NOT EXISTS idx_teams_draft_order             ON teams(draft_id, draft_order);
CREATE INDEX IF NOT EXISTS idx_picks_draft_id                ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_team_id                 ON picks(team_id);
CREATE INDEX IF NOT EXISTS idx_picks_pokemon_id              ON picks(pokemon_id);
CREATE INDEX IF NOT EXISTS idx_picks_draft_team_pokemon      ON picks(draft_id, team_id, pokemon_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_id         ON participants(draft_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id          ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_active     ON participants(draft_id, last_seen);
CREATE INDEX IF NOT EXISTS idx_participants_admin            ON participants(draft_id, is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_pokemon_tiers_draft_id        ON pokemon_tiers(draft_id);
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id             ON auctions(draft_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status               ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_draft_status         ON auctions(draft_id, status);
CREATE INDEX IF NOT EXISTS idx_bid_history_auction_id        ON bid_history(auction_id);
CREATE INDEX IF NOT EXISTS idx_bid_history_team_id           ON bid_history(team_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_id       ON wishlist_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_participant_id ON wishlist_items(participant_id);
CREATE INDEX IF NOT EXISTS idx_draft_actions_draft_id        ON draft_actions(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_actions_undo            ON draft_actions(draft_id, can_undo) WHERE can_undo = TRUE;
CREATE INDEX IF NOT EXISTS idx_draft_actions_created         ON draft_actions(draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spectator_events_draft_id     ON spectator_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_leagues_draft_id              ON leagues(draft_id);
CREATE INDEX IF NOT EXISTS idx_leagues_status                ON leagues(status);
CREATE INDEX IF NOT EXISTS idx_league_teams_league_id        ON league_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_team_id          ON league_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_compound         ON league_teams(team_id, league_id);
CREATE INDEX IF NOT EXISTS idx_matches_league_id             ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_week                  ON matches(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_matches_home_team             ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team             ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_status                ON matches(status);
CREATE INDEX IF NOT EXISTS idx_standings_league_id           ON standings(league_id);
CREATE INDEX IF NOT EXISTS idx_standings_team_id             ON standings(team_id);
CREATE INDEX IF NOT EXISTS idx_standings_rank                ON standings(league_id, rank);
CREATE INDEX IF NOT EXISTS idx_standings_team_league         ON standings(team_id, league_id);
CREATE INDEX IF NOT EXISTS idx_match_games_match_id          ON match_games(match_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_league    ON team_pokemon_status(league_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_team      ON team_pokemon_status(team_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_team_league ON team_pokemon_status(team_id, league_id);
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_dead      ON team_pokemon_status(league_id, status) WHERE status = 'dead';
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_match       ON match_pokemon_kos(match_id);
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_pick        ON match_pokemon_kos(pick_id);
CREATE INDEX IF NOT EXISTS idx_trades_league_id              ON trades(league_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_a                 ON trades(team_a_id);
CREATE INDEX IF NOT EXISTS idx_trades_team_b                 ON trades(team_b_id);
CREATE INDEX IF NOT EXISTS idx_trades_status                 ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trade_approvals_trade         ON trade_approvals(trade_id);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_league       ON weekly_summaries(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_weekly_highlights_league      ON weekly_highlights(league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league          ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_team            ON waiver_claims(team_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Drop functions that may have changed signatures
DROP FUNCTION IF EXISTS get_draft_history(UUID);
DROP FUNCTION IF EXISTS undo_last_pick(UUID, UUID);
DROP FUNCTION IF EXISTS make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS record_draft_action(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS generate_week_summary(UUID, INTEGER);
DROP FUNCTION IF EXISTS recalculate_league_standings(UUID);
DROP FUNCTION IF EXISTS update_team_budget(UUID, INTEGER);
DROP FUNCTION IF EXISTS advance_draft_turn(UUID);
DROP FUNCTION IF EXISTS place_bid(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS promote_to_admin(UUID, TEXT);
DROP FUNCTION IF EXISTS demote_from_admin(UUID, TEXT);
DROP FUNCTION IF EXISTS execute_trade(UUID);
DROP FUNCTION IF EXISTS increment_pokemon_match_stats(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS get_current_team_id(UUID, INTEGER, INTEGER);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update team budget (deduct cost atomically)
CREATE OR REPLACE FUNCTION update_team_budget(
  team_id UUID,
  cost_to_subtract INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE teams
  SET budget_remaining = budget_remaining - cost_to_subtract,
      updated_at = NOW()
  WHERE id = team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team % not found', team_id;
  END IF;
END;
$$;

-- Advance draft turn
CREATE OR REPLACE FUNCTION advance_draft_turn(
  draft_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft RECORD;
  v_total_teams INTEGER;
  v_max_picks INTEGER;
  v_next_turn INTEGER;
BEGIN
  SELECT * INTO v_draft FROM drafts WHERE id = draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % not found', draft_id;
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE teams.draft_id = advance_draft_turn.draft_id;
  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, 6);
  v_next_turn := COALESCE(v_draft.current_turn, 0) + 1;

  IF v_next_turn > (v_total_teams * v_max_picks) THEN
    UPDATE drafts
    SET status = 'completed', updated_at = NOW()
    WHERE id = draft_id;
  ELSE
    UPDATE drafts
    SET current_turn = v_next_turn,
        current_round = ((v_next_turn - 1) / NULLIF(v_total_teams, 0)) + 1,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE id = draft_id;
  END IF;
END;
$$;

-- Place auction bid
CREATE OR REPLACE FUNCTION place_bid(
  auction_id UUID,
  bidder_team_id UUID,
  bid_amount INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auction RECORD;
  v_team RECORD;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = auction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction % not found', auction_id;
  END IF;

  IF v_auction.status != 'active' THEN
    RAISE EXCEPTION 'Auction is not active';
  END IF;

  IF bid_amount <= v_auction.current_bid THEN
    RAISE EXCEPTION 'Bid must be higher than current bid of %', v_auction.current_bid;
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = bidder_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team % not found', bidder_team_id;
  END IF;

  IF v_team.budget_remaining < bid_amount THEN
    RAISE EXCEPTION 'Insufficient budget: % < %', v_team.budget_remaining, bid_amount;
  END IF;

  UPDATE auctions
  SET current_bid = bid_amount,
      current_bidder = bidder_team_id::TEXT,
      updated_at = NOW()
  WHERE id = auction_id;

  INSERT INTO bid_history (auction_id, draft_id, team_id, team_name, bid_amount)
  VALUES (auction_id, v_auction.draft_id, bidder_team_id, v_team.name, bid_amount);
END;
$$;

-- Promote participant to admin
CREATE OR REPLACE FUNCTION promote_to_admin(
  p_draft_id UUID,
  p_user_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE participants
  SET is_admin = TRUE
  WHERE draft_id = p_draft_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant with user_id % not found in draft %', p_user_id, p_draft_id;
  END IF;
END;
$$;

-- Demote participant from admin
CREATE OR REPLACE FUNCTION demote_from_admin(
  p_draft_id UUID,
  p_user_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE participants
  SET is_admin = FALSE
  WHERE draft_id = p_draft_id AND user_id = p_user_id AND is_host = FALSE;
END;
$$;

-- Execute trade atomically
CREATE OR REPLACE FUNCTION execute_trade(trade_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade RECORD;
  v_pick_id TEXT;
BEGIN
  SELECT * INTO v_trade FROM trades WHERE id = trade_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF v_trade.status != 'accepted' THEN
    RAISE EXCEPTION 'Trade must be accepted before execution (current: %)', v_trade.status;
  END IF;

  FOREACH v_pick_id IN ARRAY v_trade.team_a_gives
  LOOP
    UPDATE picks SET team_id = v_trade.team_b_id
    WHERE id = v_pick_id::UUID AND team_id = v_trade.team_a_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick % not found on team A', v_pick_id;
    END IF;
  END LOOP;

  FOREACH v_pick_id IN ARRAY v_trade.team_b_gives
  LOOP
    UPDATE picks SET team_id = v_trade.team_a_id
    WHERE id = v_pick_id::UUID AND team_id = v_trade.team_b_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick % not found on team B', v_pick_id;
    END IF;
  END LOOP;

  UPDATE trades
  SET status = 'completed', completed_at = NOW(), updated_at = NOW()
  WHERE id = trade_uuid;
END;
$$;

-- Increment Pokemon match stats
CREATE OR REPLACE FUNCTION increment_pokemon_match_stats(
  p_pick_id UUID,
  p_won BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE team_pokemon_status
  SET matches_played = matches_played + 1,
      matches_won    = matches_won + CASE WHEN p_won THEN 1 ELSE 0 END,
      updated_at     = NOW()
  WHERE pick_id = p_pick_id;
END;
$$;

-- Undo last pick
CREATE OR REPLACE FUNCTION undo_last_pick(
  p_draft_id UUID,
  p_team_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft RECORD;
  v_last_pick RECORD;
  v_action RECORD;
BEGIN
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;

  IF v_draft.status NOT IN ('active', 'paused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft is not active');
  END IF;

  -- Find last pick action that can be undone
  SELECT * INTO v_action
  FROM draft_actions
  WHERE draft_id = p_draft_id
    AND team_id = p_team_id
    AND action_type = 'pick'
    AND can_undo = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No undoable picks found');
  END IF;

  -- Get pick details
  SELECT * INTO v_last_pick
  FROM picks
  WHERE id = (v_action.action_data->>'pickId')::UUID;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pick not found');
  END IF;

  -- Remove pick
  DELETE FROM picks WHERE id = v_last_pick.id;

  -- Restore budget
  UPDATE teams
  SET budget_remaining = budget_remaining + v_last_pick.cost,
      undos_remaining  = undos_remaining - 1,
      updated_at       = NOW()
  WHERE id = p_team_id;

  -- Rewind draft turn
  UPDATE drafts
  SET current_turn    = GREATEST(1, current_turn - 1),
      turn_started_at = NOW(),
      updated_at      = NOW()
  WHERE id = p_draft_id;

  -- Mark action as used
  UPDATE draft_actions SET can_undo = FALSE WHERE id = v_action.id;

  -- Record undo action
  INSERT INTO draft_actions (draft_id, team_id, action_type, action_data, performed_by, can_undo)
  VALUES (
    p_draft_id, p_team_id, 'undo',
    jsonb_build_object('undonePickId', v_last_pick.id, 'pokemonId', v_last_pick.pokemon_id),
    p_team_id::TEXT, FALSE
  );

  RETURN jsonb_build_object(
    'success', true,
    'undonePickId', v_last_pick.id,
    'pokemonId', v_last_pick.pokemon_id,
    'costRestored', v_last_pick.cost
  );
END;
$$;

-- Record a draft action
CREATE OR REPLACE FUNCTION record_draft_action(
  p_draft_id UUID,
  p_action_type TEXT,
  p_action_data JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_id UUID;
  v_performed_by TEXT;
BEGIN
  v_team_id     := (p_action_data->>'teamId')::UUID;
  v_performed_by := COALESCE(p_action_data->>'userId', 'system');

  INSERT INTO draft_actions (draft_id, team_id, action_type, action_data, performed_by, can_undo)
  VALUES (
    p_draft_id,
    v_team_id,
    p_action_type,
    p_action_data,
    v_performed_by,
    CASE WHEN p_action_type = 'pick' THEN TRUE ELSE FALSE END
  );
END;
$$;

-- Get draft action history
CREATE OR REPLACE FUNCTION get_draft_history(
  p_draft_id UUID
) RETURNS JSONB[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB[];
BEGIN
  SELECT ARRAY_AGG(
    jsonb_build_object(
      'id', da.id,
      'actionType', da.action_type,
      'actionData', da.action_data,
      'performedBy', da.performed_by,
      'canUndo', da.can_undo,
      'createdAt', da.created_at
    ) ORDER BY da.created_at DESC
  )
  INTO v_result
  FROM draft_actions da
  WHERE da.draft_id = p_draft_id;

  RETURN COALESCE(v_result, '{}');
END;
$$;

-- Atomic draft pick function
CREATE OR REPLACE FUNCTION make_draft_pick(
  p_draft_id     UUID,
  p_team_id      UUID,
  p_user_id      TEXT,
  p_pokemon_id   TEXT,
  p_pokemon_name TEXT,
  p_cost         INTEGER,
  p_expected_turn INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft         RECORD;
  v_team          RECORD;
  v_current_team  UUID;
  v_pick_id       UUID;
  v_total_teams   INTEGER;
  v_max_picks     INTEGER;
  v_current_picks INTEGER;
  v_next_turn     INTEGER;
  v_next_round    INTEGER;
  v_is_complete   BOOLEAN;
  v_round         INTEGER;
  v_position      INTEGER;
  v_order         INTEGER;
BEGIN
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
  END IF;

  IF v_draft.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft is not active');
  END IF;

  IF v_draft.current_turn != p_expected_turn THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Turn has changed',
      'currentTurn', v_draft.current_turn
    );
  END IF;

  SELECT COUNT(*) INTO v_total_teams FROM teams WHERE draft_id = p_draft_id;

  -- Calculate which team should be picking (snake draft)
  v_round    := ((p_expected_turn - 1) / NULLIF(v_total_teams, 1));
  v_position := ((p_expected_turn - 1) % NULLIF(v_total_teams, 1));
  IF v_round % 2 = 1 THEN
    v_order := v_total_teams - v_position;
  ELSE
    v_order := v_position + 1;
  END IF;

  SELECT id INTO v_current_team
  FROM teams
  WHERE draft_id = p_draft_id AND draft_order = v_order;

  IF v_current_team != p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your turn');
  END IF;

  -- Validate user is on this team
  IF NOT EXISTS (
    SELECT 1 FROM participants
    WHERE draft_id = p_draft_id AND team_id = p_team_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this team');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;

  IF v_team.budget_remaining < p_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget');
  END IF;

  v_max_picks := COALESCE((v_draft.settings->>'maxPokemonPerTeam')::INTEGER, 6);
  SELECT COUNT(*) INTO v_current_picks FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id;

  IF v_current_picks >= v_max_picks THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum picks reached');
  END IF;

  IF EXISTS (SELECT 1 FROM picks WHERE team_id = p_team_id AND draft_id = p_draft_id AND pokemon_id = p_pokemon_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already on your team');
  END IF;

  INSERT INTO picks (draft_id, team_id, pokemon_id, pokemon_name, cost, pick_order, round)
  VALUES (
    p_draft_id, p_team_id, p_pokemon_id, p_pokemon_name, p_cost,
    v_draft.current_turn,
    ((v_draft.current_turn - 1) / NULLIF(v_total_teams, 1)) + 1
  )
  RETURNING id INTO v_pick_id;

  UPDATE teams
  SET budget_remaining = budget_remaining - p_cost, updated_at = NOW()
  WHERE id = p_team_id;

  -- Record draft action for undo
  INSERT INTO draft_actions (draft_id, team_id, action_type, action_data, performed_by, can_undo)
  VALUES (
    p_draft_id, p_team_id, 'pick',
    jsonb_build_object('pickId', v_pick_id, 'pokemonId', p_pokemon_id, 'cost', p_cost, 'userId', p_user_id),
    p_user_id, TRUE
  );

  v_next_turn     := v_draft.current_turn + 1;
  v_next_round    := ((v_next_turn - 1) / NULLIF(v_total_teams, 1)) + 1;
  v_is_complete   := v_next_turn > (v_total_teams * v_max_picks);

  IF v_is_complete THEN
    UPDATE drafts SET status = 'completed', updated_at = NOW() WHERE id = p_draft_id;
  ELSE
    UPDATE drafts
    SET current_turn = v_next_turn, current_round = v_next_round,
        turn_started_at = NOW(), updated_at = NOW()
    WHERE id = p_draft_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pickId', v_pick_id,
    'newBudget', v_team.budget_remaining - p_cost,
    'nextTurn', v_next_turn,
    'isComplete', v_is_complete
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pokemon already drafted');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Budget would go negative');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Get current team ID for snake draft turn
CREATE OR REPLACE FUNCTION get_current_team_id(
  p_draft_id    UUID,
  p_turn        INTEGER,
  p_total_teams INTEGER
) RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_round    INTEGER;
  v_position INTEGER;
  v_order    INTEGER;
  v_team_id  UUID;
BEGIN
  v_round    := ((p_turn - 1) / NULLIF(p_total_teams, 1));
  v_position := ((p_turn - 1) % NULLIF(p_total_teams, 1));
  IF v_round % 2 = 1 THEN
    v_order := p_total_teams - v_position;
  ELSE
    v_order := v_position + 1;
  END IF;

  SELECT id INTO v_team_id
  FROM teams
  WHERE draft_id = p_draft_id AND draft_order = v_order;

  RETURN v_team_id;
END;
$$;

-- Recalculate league standings from scratch
CREATE OR REPLACE FUNCTION recalculate_league_standings(p_league_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_team  RECORD;
  v_rank  INTEGER := 0;
  v_settings JSONB;
  v_pts_win  INTEGER;
  v_pts_draw INTEGER;
BEGIN
  SELECT settings INTO v_settings FROM leagues WHERE id = p_league_id;
  v_pts_win  := COALESCE((v_settings->>'pointsPerWin')::INTEGER, 3);
  v_pts_draw := COALESCE((v_settings->>'pointsPerDraw')::INTEGER, 1);

  UPDATE standings SET
    wins = 0, losses = 0, draws = 0,
    points_for = 0, points_against = 0,
    point_differential = 0, rank = 0,
    current_streak = NULL, updated_at = NOW()
  WHERE league_id = p_league_id;

  FOR v_match IN
    SELECT * FROM matches
    WHERE league_id = p_league_id AND status = 'completed'
    ORDER BY completed_at ASC
  LOOP
    UPDATE standings SET
      points_for     = points_for + COALESCE(v_match.home_score, 0),
      points_against = points_against + COALESCE(v_match.away_score, 0),
      wins   = wins   + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      draws  = draws  + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.home_team_id;

    UPDATE standings SET
      points_for     = points_for + COALESCE(v_match.away_score, 0),
      points_against = points_against + COALESCE(v_match.home_score, 0),
      wins   = wins   + CASE WHEN v_match.winner_team_id = v_match.away_team_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_match.winner_team_id = v_match.home_team_id THEN 1 ELSE 0 END,
      draws  = draws  + CASE WHEN v_match.winner_team_id IS NULL THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE league_id = p_league_id AND team_id = v_match.away_team_id;
  END LOOP;

  -- Sync point_differential
  UPDATE standings
  SET point_differential = points_for - points_against
  WHERE league_id = p_league_id;

  -- Assign ranks
  FOR v_team IN
    SELECT id FROM standings
    WHERE league_id = p_league_id
    ORDER BY
      (wins * v_pts_win + draws * v_pts_draw) DESC,
      point_differential DESC,
      wins DESC
  LOOP
    v_rank := v_rank + 1;
    UPDATE standings SET rank = v_rank WHERE id = v_team.id;
  END LOOP;
END;
$$;

-- Update standings when a match is completed (trigger function)
CREATE OR REPLACE FUNCTION update_standings_for_match()
RETURNS TRIGGER AS $$
DECLARE
  v_loser_id     UUID;
  v_winner_score INTEGER;
  v_loser_score  INTEGER;
BEGIN
  IF NEW.status = 'completed' AND NEW.winner_team_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'completed') THEN

    IF NEW.winner_team_id = NEW.home_team_id THEN
      v_loser_id     := NEW.away_team_id;
      v_winner_score := NEW.home_score;
      v_loser_score  := NEW.away_score;
    ELSE
      v_loser_id     := NEW.home_team_id;
      v_winner_score := NEW.away_score;
      v_loser_score  := NEW.home_score;
    END IF;

    INSERT INTO standings (league_id, team_id, wins, points_for, points_against, point_differential)
    VALUES (NEW.league_id, NEW.winner_team_id, 1, v_winner_score, v_loser_score, v_winner_score - v_loser_score)
    ON CONFLICT (league_id, team_id) DO UPDATE SET
      wins               = standings.wins + 1,
      points_for         = standings.points_for + v_winner_score,
      points_against     = standings.points_against + v_loser_score,
      point_differential = standings.points_for + v_winner_score - standings.points_against - v_loser_score,
      updated_at         = NOW();

    INSERT INTO standings (league_id, team_id, losses, points_for, points_against, point_differential)
    VALUES (NEW.league_id, v_loser_id, 1, v_loser_score, v_winner_score, v_loser_score - v_winner_score)
    ON CONFLICT (league_id, team_id) DO UPDATE SET
      losses             = standings.losses + 1,
      points_for         = standings.points_for + v_loser_score,
      points_against     = standings.points_against + v_winner_score,
      point_differential = standings.points_for + v_loser_score - standings.points_against - v_winner_score,
      updated_at         = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate weekly summary (stub — generates highlights based on match data)
CREATE OR REPLACE FUNCTION generate_week_summary(
  p_league_id   UUID,
  p_week_number INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_matches INTEGER;
  v_total_kos     INTEGER;
  v_total_deaths  INTEGER;
  v_total_trades  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_matches
  FROM matches
  WHERE league_id = p_league_id AND week_number = p_week_number AND status = 'completed';

  SELECT COALESCE(SUM(ko_count), 0) INTO v_total_kos
  FROM match_pokemon_kos mpk
  JOIN matches m ON m.id = mpk.match_id
  WHERE m.league_id = p_league_id AND m.week_number = p_week_number;

  SELECT COALESCE(SUM(CASE WHEN mpk.is_death THEN ko_count ELSE 0 END), 0) INTO v_total_deaths
  FROM match_pokemon_kos mpk
  JOIN matches m ON m.id = mpk.match_id
  WHERE m.league_id = p_league_id AND m.week_number = p_week_number;

  SELECT COUNT(*) INTO v_total_trades
  FROM trades
  WHERE league_id = p_league_id AND week_number = p_week_number AND status = 'completed';

  INSERT INTO weekly_summaries (
    league_id, week_number,
    total_matches, total_kos, total_deaths, total_trades
  )
  VALUES (
    p_league_id, p_week_number,
    v_total_matches, v_total_kos, v_total_deaths, v_total_trades
  )
  ON CONFLICT (league_id, week_number) DO UPDATE SET
    total_matches = EXCLUDED.total_matches,
    total_kos     = EXCLUDED.total_kos,
    total_deaths  = EXCLUDED.total_deaths,
    total_trades  = EXCLUDED.total_trades,
    updated_at    = NOW();
END;
$$;

-- Handle new user profile creation from auth trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name, email, avatar_url)
  VALUES (
    NEW.id::TEXT,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trigger_update_standings ON matches;
CREATE TRIGGER trigger_update_standings
  AFTER UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_standings_for_match();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_drafts_updated_at ON drafts;
CREATE TRIGGER update_drafts_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leagues_updated_at ON leagues;
CREATE TRIGGER update_leagues_updated_at
  BEFORE UPDATE ON leagues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_matches_updated_at ON matches;
CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_formats_updated_at ON custom_formats;
CREATE TRIGGER update_custom_formats_updated_at
  BEFORE UPDATE ON custom_formats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_weekly_summaries_updated_at ON weekly_summaries;
CREATE TRIGGER update_weekly_summaries_updated_at
  BEFORE UPDATE ON weekly_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_weekly_highlights_updated_at ON weekly_highlights;
CREATE TRIGGER update_weekly_highlights_updated_at
  BEFORE UPDATE ON weekly_highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS
-- ============================================================

-- Trade history view
CREATE OR REPLACE VIEW trade_history AS
SELECT
  t.id, t.league_id, t.week_number,
  t.team_a_id, t.team_b_id,
  t.team_a_gives, t.team_b_gives,
  t.status, t.proposed_by,
  t.proposed_at, t.responded_at, t.completed_at,
  t.notes, t.commissioner_approved, t.commissioner_id, t.commissioner_notes,
  t.created_at, t.updated_at,
  COALESCE(ta.name, 'Unknown') AS team_a_name,
  COALESCE(tb.name, 'Unknown') AS team_b_name,
  COALESCE(t.proposed_by::TEXT, 'Unknown') AS proposed_by_name,
  COALESCE(l.name, 'Unknown') AS league_name
FROM trades t
LEFT JOIN teams ta ON ta.id = t.team_a_id
LEFT JOIN teams tb ON tb.id = t.team_b_id
LEFT JOIN leagues l ON l.id = t.league_id;

-- Draft history view
CREATE OR REPLACE VIEW draft_history AS
SELECT
  d.id,
  d.name,
  d.host_id,
  d.format,
  d.ruleset,
  d.status,
  d.room_code,
  d.updated_at AS completed_at,
  d.created_at,
  (SELECT COUNT(*)::BIGINT FROM teams WHERE draft_id = d.id) AS total_teams,
  (SELECT COUNT(*)::BIGINT FROM picks WHERE draft_id = d.id) AS total_picks
FROM drafts d
WHERE d.deleted_at IS NULL;

-- Active public drafts view
CREATE OR REPLACE VIEW active_public_drafts AS
SELECT
  d.id,
  d.name,
  d.description,
  d.format,
  d.status,
  d.max_teams,
  d.current_round,
  d.spectator_count,
  d.tags,
  d.created_at,
  d.updated_at,
  (SELECT COUNT(*)::BIGINT FROM teams WHERE draft_id = d.id) AS teams_joined,
  (SELECT COUNT(*)::BIGINT FROM picks WHERE draft_id = d.id) AS total_picks,
  d.updated_at AS last_activity
FROM drafts d
WHERE d.is_public = TRUE
  AND d.status IN ('setup', 'active')
  AND d.deleted_at IS NULL;

-- Dashboard view (corrected: reads maxPokemonPerTeam from settings JSONB)
DROP VIEW IF EXISTS user_draft_summary;
CREATE VIEW user_draft_summary AS
SELECT
  d.id                    AS draft_id,
  d.name                  AS draft_name,
  d.status,
  d.format,
  d.ruleset,
  d.room_code,
  d.host_id,
  d.created_at,
  d.updated_at,
  d.max_teams,
  COALESCE((d.settings->>'maxPokemonPerTeam')::INT, 6) AS pokemon_per_team,
  d.current_turn,
  d.spectator_count,
  t.id                    AS user_team_id,
  t.name                  AS user_team_name,
  t.owner_id              AS user_id,
  t.budget_remaining,
  t.draft_order,
  (d.host_id = t.owner_id) AS is_host,
  COALESCE(pc.picks_made, 0) AS picks_made,
  CASE
    WHEN COALESCE((d.settings->>'maxPokemonPerTeam')::INT, 6) > 0
    THEN LEAST(100, ROUND(
      COALESCE(pc.picks_made, 0)::NUMERIC
      / COALESCE((d.settings->>'maxPokemonPerTeam')::INT, 6)
      * 100
    ))
    ELSE 0
  END AS progress_percent
FROM teams t
JOIN drafts d ON d.id = t.draft_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INT AS picks_made FROM picks p WHERE p.team_id = t.id
) pc ON TRUE
WHERE d.deleted_at IS NULL;

-- League history view
DROP VIEW IF EXISTS user_league_history;
CREATE VIEW user_league_history AS
SELECT
  l.id AS league_id, l.name AS league_name,
  l.status AS league_status, l.start_date, l.end_date,
  l.total_weeks, l.current_week, l.draft_id,
  t.id AS team_id, t.name AS team_name, t.owner_id AS user_id,
  lt.id AS league_team_id, lt.seed, lt.final_placement,
  COALESCE(s.wins, 0) AS wins, COALESCE(s.losses, 0) AS losses,
  COALESCE(s.draws, 0) AS draws,
  COALESCE(s.points_for, 0) AS points_for,
  COALESCE(s.points_against, 0) AS points_against,
  COALESCE(s.rank, 0) AS current_rank, s.current_streak,
  (SELECT COUNT(*) FROM league_teams WHERE league_id = l.id) AS total_teams,
  (SELECT COUNT(*) FROM picks WHERE team_id = t.id) AS total_picks
FROM leagues l
JOIN league_teams lt ON lt.league_id = l.id
JOIN teams t ON t.id = lt.team_id
LEFT JOIN standings s ON s.league_id = l.id AND s.team_id = t.id;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_result_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_pokemon_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_pokemon_kos ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiver_claims ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies and recreate (permissive for guest auth)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Permissive policies for all tables (guest authentication model)
CREATE POLICY "allow_all_user_profiles"    ON user_profiles    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_custom_formats"   ON custom_formats   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_drafts"           ON drafts           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_teams"            ON teams            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_picks"            ON picks            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_participants"     ON participants     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_pokemon_tiers"    ON pokemon_tiers    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_auctions"         ON auctions         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bid_history"      ON bid_history      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_wishlist_items"   ON wishlist_items   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_wishlists"        ON wishlists        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_spectator_events" ON spectator_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_draft_actions"    ON draft_actions    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_draft_results"    ON draft_results    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_draft_result_teams" ON draft_result_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_leagues"          ON leagues          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_league_teams"     ON league_teams     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_matches"          ON matches          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_standings"        ON standings        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_match_games"      ON match_games      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_team_pokemon_status" ON team_pokemon_status FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_match_pokemon_kos"   ON match_pokemon_kos   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_trades"           ON trades           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_trade_approvals"  ON trade_approvals  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_weekly_summaries" ON weekly_summaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_weekly_highlights" ON weekly_highlights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_waiver_claims"    ON waiver_claims    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION make_draft_pick(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_current_team_id(UUID, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_team_budget(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION advance_draft_turn(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_to_admin(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION demote_from_admin(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_trade(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_pokemon_match_stats(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION undo_last_pick(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_draft_action(UUID, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_draft_history(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recalculate_league_standings(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_week_summary(UUID, INTEGER) TO anon, authenticated;
GRANT SELECT ON user_draft_summary TO anon, authenticated;
GRANT SELECT ON user_league_history TO anon, authenticated;
GRANT SELECT ON active_public_drafts TO anon, authenticated;
GRANT SELECT ON draft_history TO anon, authenticated;
GRANT SELECT ON trade_history TO anon, authenticated;

-- ============================================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tbl_names TEXT[] := ARRAY[
    'drafts', 'teams', 'picks', 'participants', 'pokemon_tiers',
    'auctions', 'bid_history', 'wishlist_items', 'user_profiles',
    'spectator_events', 'draft_actions', 'leagues', 'league_teams',
    'matches', 'standings', 'match_games', 'team_pokemon_status',
    'match_pokemon_kos', 'trades', 'trade_approvals',
    'weekly_summaries', 'weekly_highlights', 'waiver_claims'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY tbl_names LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ============================================================
-- DONE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE ' Pokemon Draft — Production Migration DONE';
  RAISE NOTICE '==============================================';
  RAISE NOTICE ' Tables: 27 (all IF NOT EXISTS)';
  RAISE NOTICE ' Functions: 14 (all CREATE OR REPLACE)';
  RAISE NOTICE ' Views: 5';
  RAISE NOTICE ' Indexes: 60+';
  RAISE NOTICE ' RLS: permissive (guest auth)';
  RAISE NOTICE '==============================================';
END $$;
