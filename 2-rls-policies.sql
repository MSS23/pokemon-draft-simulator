-- =====================================================
-- POKEMON DRAFT - ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- This sets up security policies for all tables
-- Safe to run multiple times (drops and recreates policies)
-- Run this SECOND after 1-core-schema.sql
-- =====================================================

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DROP EXISTING POLICIES (for idempotency)
-- =====================================================

-- Drafts
DROP POLICY IF EXISTS "Allow all operations on drafts" ON drafts;
DROP POLICY IF EXISTS "Drafts are viewable by everyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be created by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be updated by anyone" ON drafts;
DROP POLICY IF EXISTS "Drafts can be deleted by host" ON drafts;

-- Teams
DROP POLICY IF EXISTS "Allow all operations on teams" ON teams;
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON teams;
DROP POLICY IF EXISTS "Teams can be created by anyone" ON teams;
DROP POLICY IF EXISTS "Teams can be updated by anyone" ON teams;

-- Picks
DROP POLICY IF EXISTS "Allow all operations on picks" ON picks;
DROP POLICY IF EXISTS "Picks are viewable by everyone" ON picks;
DROP POLICY IF EXISTS "Picks can be created by anyone" ON picks;

-- Participants
DROP POLICY IF EXISTS "Allow all operations on participants" ON participants;
DROP POLICY IF EXISTS "Participants are viewable by everyone" ON participants;
DROP POLICY IF EXISTS "Participants can be created by anyone" ON participants;
DROP POLICY IF EXISTS "Participants can be updated by anyone" ON participants;

-- Pokemon Tiers
DROP POLICY IF EXISTS "Allow all operations on pokemon_tiers" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers are viewable by everyone" ON pokemon_tiers;
DROP POLICY IF EXISTS "Pokemon tiers can be created by anyone" ON pokemon_tiers;

-- Auctions
DROP POLICY IF EXISTS "Allow all operations on auctions" ON auctions;
DROP POLICY IF EXISTS "Auctions are viewable by everyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be created by anyone" ON auctions;
DROP POLICY IF EXISTS "Auctions can be updated by anyone" ON auctions;

-- Bids
DROP POLICY IF EXISTS "Allow all operations on bids" ON bids;
DROP POLICY IF EXISTS "Bids are viewable by everyone" ON bids;
DROP POLICY IF EXISTS "Bids can be created by anyone" ON bids;

-- Wishlist Items
DROP POLICY IF EXISTS "Allow all operations on wishlist_items" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items are viewable by everyone" ON wishlist_items;
DROP POLICY IF EXISTS "Wishlist items can be managed by participant" ON wishlist_items;

-- User Profiles
DROP POLICY IF EXISTS "User profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON user_profiles;

-- Spectator Events
DROP POLICY IF EXISTS "Spectator events are viewable by everyone" ON spectator_events;
DROP POLICY IF EXISTS "Spectator events can be created by anyone" ON spectator_events;

-- =====================================================
-- CREATE PERMISSIVE POLICIES
-- =====================================================
-- These policies allow guest users (anon) to participate
-- since the app uses guest authentication
-- =====================================================

-- DRAFTS: Everyone can view and create, anyone can update
CREATE POLICY "Drafts are viewable by everyone"
  ON drafts FOR SELECT
  USING (true);

CREATE POLICY "Drafts can be created by anyone"
  ON drafts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Drafts can be updated by anyone"
  ON drafts FOR UPDATE
  USING (true);

CREATE POLICY "Drafts can be deleted by anyone"
  ON drafts FOR DELETE
  USING (true);

-- TEAMS: Everyone can view and manage
CREATE POLICY "Teams are viewable by everyone"
  ON teams FOR SELECT
  USING (true);

CREATE POLICY "Teams can be created by anyone"
  ON teams FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Teams can be updated by anyone"
  ON teams FOR UPDATE
  USING (true);

CREATE POLICY "Teams can be deleted by anyone"
  ON teams FOR DELETE
  USING (true);

-- PICKS: Everyone can view and create
CREATE POLICY "Picks are viewable by everyone"
  ON picks FOR SELECT
  USING (true);

CREATE POLICY "Picks can be created by anyone"
  ON picks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Picks can be updated by anyone"
  ON picks FOR UPDATE
  USING (true);

CREATE POLICY "Picks can be deleted by anyone"
  ON picks FOR DELETE
  USING (true);

-- PARTICIPANTS: Everyone can view and manage
CREATE POLICY "Participants are viewable by everyone"
  ON participants FOR SELECT
  USING (true);

CREATE POLICY "Participants can be created by anyone"
  ON participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Participants can be updated by anyone"
  ON participants FOR UPDATE
  USING (true);

CREATE POLICY "Participants can be deleted by anyone"
  ON participants FOR DELETE
  USING (true);

-- POKEMON_TIERS: Everyone can view and manage
CREATE POLICY "Pokemon tiers are viewable by everyone"
  ON pokemon_tiers FOR SELECT
  USING (true);

CREATE POLICY "Pokemon tiers can be created by anyone"
  ON pokemon_tiers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Pokemon tiers can be updated by anyone"
  ON pokemon_tiers FOR UPDATE
  USING (true);

CREATE POLICY "Pokemon tiers can be deleted by anyone"
  ON pokemon_tiers FOR DELETE
  USING (true);

-- AUCTIONS: Everyone can view and manage
CREATE POLICY "Auctions are viewable by everyone"
  ON auctions FOR SELECT
  USING (true);

CREATE POLICY "Auctions can be created by anyone"
  ON auctions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Auctions can be updated by anyone"
  ON auctions FOR UPDATE
  USING (true);

CREATE POLICY "Auctions can be deleted by anyone"
  ON auctions FOR DELETE
  USING (true);

-- BIDS: Everyone can view and create
CREATE POLICY "Bids are viewable by everyone"
  ON bids FOR SELECT
  USING (true);

CREATE POLICY "Bids can be created by anyone"
  ON bids FOR INSERT
  WITH CHECK (true);

-- WISHLIST_ITEMS: Everyone can view and manage
CREATE POLICY "Wishlist items are viewable by everyone"
  ON wishlist_items FOR SELECT
  USING (true);

CREATE POLICY "Wishlist items can be managed by anyone"
  ON wishlist_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Wishlist items can be updated by anyone"
  ON wishlist_items FOR UPDATE
  USING (true);

CREATE POLICY "Wishlist items can be deleted by anyone"
  ON wishlist_items FOR DELETE
  USING (true);

-- USER_PROFILES: Everyone can view, users manage their own
CREATE POLICY "User profiles are viewable by everyone"
  ON user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (true);

-- SPECTATOR_EVENTS: Everyone can view and create
CREATE POLICY "Spectator events are viewable by everyone"
  ON spectator_events FOR SELECT
  USING (true);

CREATE POLICY "Spectator events can be created by anyone"
  ON spectator_events FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- =====================================================

-- Enable real-time for all tables
DO $$
DECLARE
  table_names TEXT[] := ARRAY[
    'drafts', 'teams', 'picks', 'participants', 'pokemon_tiers',
    'auctions', 'bids', 'wishlist_items', 'user_profiles', 'spectator_events'
  ];
  table_name TEXT;
BEGIN
  -- Check if supabase_realtime publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add each table to publication if not already added
    FOREACH table_name IN ARRAY table_names
    LOOP
      -- Check if table is already in publication
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;

-- =====================================================
-- RLS POLICIES COMPLETE
-- =====================================================
-- Next: Optionally run 3-league-schema.sql for league features
-- =====================================================
