-- =====================================================
-- USER PROFILES TABLE
-- Stores authenticated user information from Supabase Auth
-- =====================================================

-- Create user_profiles table
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

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES FOR USER_PROFILES
-- =====================================================

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view all profiles (for displaying user info in drafts)
CREATE POLICY "Anyone can view user profiles"
  ON public.user_profiles FOR SELECT
  USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can create their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Only users can delete their own profile
CREATE POLICY "Users can delete their own profile"
  ON public.user_profiles FOR DELETE
  USING (auth.uid() = id);

-- =====================================================
-- TRIGGER TO AUTO-CREATE USER PROFILE ON SIGNUP
-- =====================================================

-- Function to create user profile automatically
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- UPDATE EXISTING TABLES TO REFERENCE USER_PROFILES
-- =====================================================

-- Add user_id column to custom_formats if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'custom_formats'
    AND column_name = 'created_by_user_id'
  ) THEN
    -- Column already exists from previous migrations
    NULL;
  END IF;
END $$;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for draft lookups by host
CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON public.drafts(host_id);

-- Index for participants by user_id
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.participants(user_id);

-- Index for teams by owner_id
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);

-- =====================================================
-- HELPFUL VIEWS
-- =====================================================

-- View to see all drafts with host information
CREATE OR REPLACE VIEW public.drafts_with_host_info AS
SELECT
  d.*,
  up.display_name as host_display_name,
  up.email as host_email,
  up.avatar_url as host_avatar_url
FROM public.drafts d
LEFT JOIN public.user_profiles up ON up.id::text = d.host_id;

-- View to see user statistics
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
-- GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.drafts_with_host_info TO authenticated;
GRANT SELECT ON public.user_stats TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.user_profiles IS 'Stores authenticated user profile information';
COMMENT ON COLUMN public.user_profiles.is_verified IS 'True if user is a verified/admin user';
COMMENT ON COLUMN public.user_profiles.total_drafts_created IS 'Total number of drafts created by this user';
COMMENT ON COLUMN public.user_profiles.total_drafts_participated IS 'Total number of drafts participated in';
COMMENT ON COLUMN public.user_profiles.favorite_pokemon IS 'Array of favorite Pokemon IDs';
COMMENT ON COLUMN public.user_profiles.stats IS 'JSON object containing user statistics';
COMMENT ON COLUMN public.user_profiles.preferences IS 'JSON object containing user preferences';
