-- User Authentication and Profile System Migration
-- Run this in Supabase SQL Editor after setting up auth

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user profiles table (extends Supabase auth.users)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Basic Profile Info
  display_name TEXT NOT NULL,
  username TEXT UNIQUE, -- Optional unique username
  avatar_url TEXT,
  bio TEXT,

  -- Preferences
  timezone TEXT DEFAULT 'UTC',
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  notifications_enabled BOOLEAN DEFAULT TRUE,

  -- Privacy Settings
  profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends', 'private')),
  stats_visibility TEXT DEFAULT 'public' CHECK (stats_visibility IN ('public', 'friends', 'private')),

  -- Pokemon Preferences
  favorite_pokemon TEXT[], -- Array of Pokemon names/IDs
  preferred_formats TEXT[], -- Array of format IDs they prefer

  -- Verification and Status
  is_verified BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  ban_expires_at TIMESTAMPTZ,

  -- Statistics (calculated fields)
  total_drafts INTEGER DEFAULT 0,
  total_leagues INTEGER DEFAULT 0,
  leagues_won INTEGER DEFAULT 0,
  favorite_types TEXT[], -- Most used Pokemon types

  CONSTRAINT valid_username CHECK (username ~* '^[a-zA-Z0-9_-]{3,20}$')
);

-- Create user achievements table
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,

  achievement_type TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- Icon name or emoji
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),

  -- Achievement metadata
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  progress_current INTEGER DEFAULT 0,
  progress_required INTEGER DEFAULT 1,
  is_completed BOOLEAN GENERATED ALWAYS AS (progress_current >= progress_required) STORED,

  -- Additional data for achievement context
  metadata JSONB DEFAULT '{}'::jsonb,

  UNIQUE(user_id, achievement_type, achievement_name)
);

-- Create user friends/relationships table
CREATE TABLE public.user_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  requester_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  addressee_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),

  -- Prevent duplicate relationships and self-friending
  CONSTRAINT no_self_friend CHECK (requester_id != addressee_id),
  CONSTRAINT unique_relationship UNIQUE(requester_id, addressee_id)
);

-- Create user sessions tracking (for analytics and security)
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ DEFAULT NOW(),
  session_end TIMESTAMPTZ,

  -- Session metadata
  ip_address INET,
  user_agent TEXT,
  device_type TEXT,

  -- Activity tracking
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  pages_visited TEXT[],
  drafts_participated INTEGER DEFAULT 0,

  is_active BOOLEAN GENERATED ALWAYS AS (session_end IS NULL) STORED
);

-- Create user notifications table
CREATE TABLE public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,

  -- Notification content
  type TEXT NOT NULL, -- 'draft_invitation', 'match_result', 'friend_request', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Notification metadata
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  -- Action data (for clickable notifications)
  action_type TEXT, -- 'navigate', 'modal', 'external'
  action_data JSONB, -- URL, modal data, etc.

  -- Priority and expiration
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  expires_at TIMESTAMPTZ
);

-- Update existing tables to link with users

-- Add user_id to participants table (gradual migration from guest system)
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS authenticated_user_id UUID REFERENCES public.user_profiles(id);

-- Add user tracking to drafts table
ALTER TABLE public.drafts
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id);

-- Create indexes for performance
CREATE INDEX idx_user_profiles_username ON public.user_profiles(username);
CREATE INDEX idx_user_profiles_display_name ON public.user_profiles(display_name);
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX idx_user_achievements_type ON public.user_achievements(achievement_type);
CREATE INDEX idx_user_relationships_requester ON public.user_relationships(requester_id);
CREATE INDEX idx_user_relationships_addressee ON public.user_relationships(addressee_id);
CREATE INDEX idx_user_relationships_status ON public.user_relationships(status);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(is_active);
CREATE INDEX idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX idx_user_notifications_unread ON public.user_notifications(user_id, is_read);

-- Create functions for user management

-- Function to create user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    -- Generate username from email (can be changed later)
    LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '', 'g'))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to accept friend request
CREATE OR REPLACE FUNCTION public.accept_friend_request(requester_uuid UUID, addressee_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.user_relationships
  SET status = 'accepted', updated_at = NOW()
  WHERE requester_id = requester_uuid
    AND addressee_id = addressee_uuid
    AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER handle_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_user_relationships_updated_at
  BEFORE UPDATE ON public.user_relationships
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS on all new tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- User Profiles: Users can read public profiles, edit their own
CREATE POLICY "Public profiles are viewable by everyone" ON public.user_profiles
  FOR SELECT USING (profile_visibility = 'public' OR id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.user_profiles
  FOR UPDATE USING (id = auth.uid());

-- User Achievements: Users can view their own achievements, others can view if profile is public
CREATE POLICY "Users can view achievements" ON public.user_achievements
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = user_achievements.user_id
        AND profile_visibility = 'public'
    )
  );

CREATE POLICY "System can insert achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (TRUE); -- Will be handled by server-side functions

-- User Relationships: Users can manage their own relationships
CREATE POLICY "Users can view their relationships" ON public.user_relationships
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "Users can create relationships" ON public.user_relationships
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update their relationships" ON public.user_relationships
  FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- User Sessions: Users can only view their own sessions
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can manage sessions" ON public.user_sessions
  FOR ALL WITH CHECK (TRUE); -- Managed by server-side functions

-- User Notifications: Users can only access their own notifications
CREATE POLICY "Users can view their own notifications" ON public.user_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.user_notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "System can send notifications" ON public.user_notifications
  FOR INSERT WITH CHECK (TRUE); -- Managed by server-side functions

-- Initial achievement types (can be extended)
INSERT INTO public.user_achievements (user_id, achievement_type, achievement_name, description, icon, rarity, progress_required)
VALUES
  -- These are templates - actual achievements will be created per-user
  (NULL, 'first_draft', 'First Draft', 'Complete your first Pokemon draft', '🎯', 'common', 1),
  (NULL, 'draft_veteran', 'Draft Veteran', 'Complete 10 Pokemon drafts', '🏆', 'uncommon', 10),
  (NULL, 'league_champion', 'League Champion', 'Win your first league season', '👑', 'rare', 1),
  (NULL, 'pokemon_master', 'Pokemon Master', 'Draft 100 different Pokemon', '⭐', 'epic', 100)
ON CONFLICT DO NOTHING;

-- Clean up the template achievements (they were just for reference)
DELETE FROM public.user_achievements WHERE user_id IS NULL;