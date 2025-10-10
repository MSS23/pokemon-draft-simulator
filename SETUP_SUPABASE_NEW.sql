-- =====================================================
-- POKEMON DRAFT SIMULATOR - COMPLETE DATABASE SETUP
-- Run this in your Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. ENABLE REQUIRED EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 2. CREATE USER PROFILES TABLE (NEW - FOR AUTH)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  email text,
  display_name text,
  avatar_url text,
  is_verified boolean DEFAULT false,
  total_drafts_created integer DEFAULT 0,
  total_drafts_participated integer DEFAULT 0,
  favorite_pokemon jsonb DEFAULT '[]'::jsonb,
  stats jsonb DEFAULT '{}'::jsonb,
  preferences jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- =====================================================
-- 3. AUTO-CREATE USER PROFILE ON SIGNUP
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 4. ENABLE RLS AND CREATE POLICIES
-- =====================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pokemon_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spectator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_formats ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER PROFILES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view user profiles" ON public.user_profiles;
CREATE POLICY "Anyone can view user profiles"
  ON public.user_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;
CREATE POLICY "Users can create their own profile"
  ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.user_profiles;
CREATE POLICY "Users can delete their own profile"
  ON public.user_profiles FOR DELETE USING (auth.uid() = id);

-- =====================================================
-- DRAFTS POLICIES (UPDATED - REQUIRE AUTH)
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view drafts" ON public.drafts;
CREATE POLICY "Anyone can view drafts"
  ON public.drafts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create drafts" ON public.drafts;
CREATE POLICY "Anyone can create drafts"
  ON public.drafts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Draft host can update their draft" ON public.drafts;
CREATE POLICY "Draft host can update their draft"
  ON public.drafts FOR UPDATE USING (host_id = auth.uid()::text);

DROP POLICY IF EXISTS "Draft host can delete their draft" ON public.drafts;
CREATE POLICY "Draft host can delete their draft"
  ON public.drafts FOR DELETE USING (host_id = auth.uid()::text);

-- =====================================================
-- TEAMS POLICIES (UPDATED - REQUIRE AUTH)
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view teams" ON public.teams;
CREATE POLICY "Anyone can view teams"
  ON public.teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create teams" ON public.teams;
CREATE POLICY "Anyone can create teams"
  ON public.teams FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Team owners can update their teams" ON public.teams;
CREATE POLICY "Team owners can update their teams"
  ON public.teams FOR UPDATE USING (owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "Team owners can delete their teams" ON public.teams;
CREATE POLICY "Team owners can delete their teams"
  ON public.teams FOR DELETE USING (
    owner_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.drafts
      WHERE drafts.id = teams.draft_id
      AND drafts.host_id = auth.uid()::text
    )
  );

-- =====================================================
-- OTHER TABLE POLICIES (PERMISSIVE FOR MVP)
-- =====================================================

-- Participants
DROP POLICY IF EXISTS "Anyone can view participants" ON public.participants;
CREATE POLICY "Anyone can view participants" ON public.participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage participants" ON public.participants;
CREATE POLICY "Anyone can manage participants" ON public.participants FOR ALL USING (true);

-- Picks
DROP POLICY IF EXISTS "Anyone can view picks" ON public.picks;
CREATE POLICY "Anyone can view picks" ON public.picks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can manage picks" ON public.picks;
CREATE POLICY "Anyone can manage picks" ON public.picks FOR ALL USING (true);

-- Pokemon Tiers
DROP POLICY IF EXISTS "Anyone can manage pokemon tiers" ON public.pokemon_tiers;
CREATE POLICY "Anyone can manage pokemon tiers" ON public.pokemon_tiers FOR ALL USING (true);

-- Wishlist Items
DROP POLICY IF EXISTS "Anyone can manage wishlist items" ON public.wishlist_items;
CREATE POLICY "Anyone can manage wishlist items" ON public.wishlist_items FOR ALL USING (true);

-- Auctions
DROP POLICY IF EXISTS "Anyone can manage auctions" ON public.auctions;
CREATE POLICY "Anyone can manage auctions" ON public.auctions FOR ALL USING (true);

-- Bid History
DROP POLICY IF EXISTS "Anyone can manage bid history" ON public.bid_history;
CREATE POLICY "Anyone can manage bid history" ON public.bid_history FOR ALL USING (true);

-- Bids
DROP POLICY IF EXISTS "Anyone can manage bids" ON public.bids;
CREATE POLICY "Anyone can manage bids" ON public.bids FOR ALL USING (true);

-- Chat Messages
DROP POLICY IF EXISTS "Anyone can manage chat messages" ON public.chat_messages;
CREATE POLICY "Anyone can manage chat messages" ON public.chat_messages FOR ALL USING (true);

-- Draft Actions
DROP POLICY IF EXISTS "Anyone can manage draft actions" ON public.draft_actions;
CREATE POLICY "Anyone can manage draft actions" ON public.draft_actions FOR ALL USING (true);

-- Spectator Events
DROP POLICY IF EXISTS "Anyone can manage spectator events" ON public.spectator_events;
CREATE POLICY "Anyone can manage spectator events" ON public.spectator_events FOR ALL USING (true);

-- Custom Formats
DROP POLICY IF EXISTS "Anyone can view custom formats" ON public.custom_formats;
CREATE POLICY "Anyone can view custom formats" ON public.custom_formats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can create custom formats" ON public.custom_formats;
CREATE POLICY "Anyone can create custom formats" ON public.custom_formats FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can manage custom formats" ON public.custom_formats;
CREATE POLICY "Anyone can manage custom formats" ON public.custom_formats FOR ALL USING (true);

-- =====================================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON public.drafts(host_id);
CREATE INDEX IF NOT EXISTS idx_drafts_room_code ON public.drafts(room_code);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON public.drafts(status);
CREATE INDEX IF NOT EXISTS idx_teams_draft_id ON public.teams(draft_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_participants_draft_id ON public.participants(draft_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.participants(user_id);
CREATE INDEX IF NOT EXISTS idx_picks_draft_id ON public.picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_team_id ON public.picks(team_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_draft_id ON public.wishlist_items(draft_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_participant_id ON public.wishlist_items(participant_id);
CREATE INDEX IF NOT EXISTS idx_auctions_draft_id ON public.auctions(draft_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_draft_id ON public.chat_messages(draft_id);

-- =====================================================
-- 6. HELPFUL VIEWS
-- =====================================================

CREATE OR REPLACE VIEW public.drafts_with_host_info AS
SELECT
  d.*,
  up.display_name as host_display_name,
  up.email as host_email,
  up.avatar_url as host_avatar_url
FROM public.drafts d
LEFT JOIN public.user_profiles up ON up.id::text = d.host_id;

CREATE OR REPLACE VIEW public.user_stats AS
SELECT
  up.id,
  up.display_name,
  up.email,
  up.total_drafts_created,
  up.total_drafts_participated,
  COUNT(DISTINCT d.id) FILTER (WHERE d.host_id = up.id::text) as active_drafts_hosted,
  COUNT(DISTINCT p.draft_id) as active_drafts_participating
FROM public.user_profiles up
LEFT JOIN public.drafts d ON d.host_id = up.id::text
LEFT JOIN public.participants p ON p.user_id = up.id::text
GROUP BY up.id, up.display_name, up.email, up.total_drafts_created, up.total_drafts_participated;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
--
-- Next steps:
-- 1. In Supabase Dashboard, go to Authentication > Providers
-- 2. Enable Email authentication
-- 3. (Optional) Enable Google/GitHub OAuth
-- 4. Configure email templates in Authentication > Email Templates
-- 5. Update your .env.local with:
--    NEXT_PUBLIC_SUPABASE_URL=your-project-url
--    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
-- 6. Test by creating an account and creating a draft!
