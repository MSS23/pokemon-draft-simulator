-- Migration: Custom Draft Formats and Admin Roles
-- Adds support for CSV-uploaded custom Pokemon pricing and multi-admin functionality

-- Create custom_formats table to store uploaded pricing
CREATE TABLE IF NOT EXISTS public.custom_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Format metadata
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID REFERENCES public.user_profiles(id),
  created_by_display_name TEXT NOT NULL, -- For guest users who create drafts

  -- Format settings
  is_public BOOLEAN DEFAULT FALSE, -- Can other users use this format?

  -- Pokemon pricing data (JSON for flexibility)
  pokemon_pricing JSONB NOT NULL, -- { "pokemon-id": cost, ... } or { "pokemon-name": cost, ... }

  -- Metadata
  total_pokemon INTEGER,
  min_cost INTEGER,
  max_cost INTEGER,

  -- Usage tracking
  times_used INTEGER DEFAULT 0
);

-- Add admin support to participants
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add custom format reference to drafts
ALTER TABLE public.drafts
ADD COLUMN IF NOT EXISTS custom_format_id UUID REFERENCES public.custom_formats(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_formats_created_by ON public.custom_formats(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_formats_public ON public.custom_formats(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_participants_draft_admin ON public.participants(draft_id, is_admin);
CREATE INDEX IF NOT EXISTS idx_drafts_custom_format ON public.drafts(custom_format_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_custom_format_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS handle_custom_formats_updated_at ON public.custom_formats;
CREATE TRIGGER handle_custom_formats_updated_at
  BEFORE UPDATE ON public.custom_formats
  FOR EACH ROW EXECUTE FUNCTION public.update_custom_format_timestamp();

-- Function to calculate min/max costs and total pokemon
CREATE OR REPLACE FUNCTION public.update_custom_format_costs()
RETURNS TRIGGER AS $$
DECLARE
  costs INTEGER[];
BEGIN
  -- Extract all cost values from the JSONB pricing object
  SELECT ARRAY(
    SELECT (value::TEXT)::INTEGER
    FROM jsonb_each(NEW.pokemon_pricing)
  ) INTO costs;

  -- Set min, max, and total
  NEW.min_cost := (SELECT MIN(cost) FROM unnest(costs) AS cost);
  NEW.max_cost := (SELECT MAX(cost) FROM unnest(costs) AS cost);
  NEW.total_pokemon := array_length(costs, 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-calculating costs
DROP TRIGGER IF EXISTS calculate_custom_format_costs ON public.custom_formats;
CREATE TRIGGER calculate_custom_format_costs
  BEFORE INSERT OR UPDATE OF pokemon_pricing ON public.custom_formats
  FOR EACH ROW EXECUTE FUNCTION public.update_custom_format_costs();

-- Enable RLS
ALTER TABLE public.custom_formats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_formats

-- Anyone can view public custom formats
CREATE POLICY "Public custom formats are viewable by everyone" ON public.custom_formats
  FOR SELECT USING (is_public = TRUE OR created_by_user_id = auth.uid());

-- Authenticated users can create custom formats
CREATE POLICY "Authenticated users can create custom formats" ON public.custom_formats
  FOR INSERT WITH CHECK (created_by_user_id = auth.uid() OR created_by_user_id IS NULL);

-- Users can update their own custom formats
CREATE POLICY "Users can update their own custom formats" ON public.custom_formats
  FOR UPDATE USING (created_by_user_id = auth.uid() OR created_by_user_id IS NULL);

-- Users can delete their own custom formats
CREATE POLICY "Users can delete their own custom formats" ON public.custom_formats
  FOR DELETE USING (created_by_user_id = auth.uid() OR created_by_user_id IS NULL);

-- Function to promote a participant to admin
CREATE OR REPLACE FUNCTION public.promote_to_admin(
  p_draft_id UUID,
  p_participant_id UUID,
  p_promoting_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_authorized BOOLEAN;
BEGIN
  -- Check if the promoting user is host or admin
  SELECT EXISTS(
    SELECT 1 FROM public.participants
    WHERE draft_id = p_draft_id
      AND id = p_promoting_user_id::UUID
      AND (is_host = TRUE OR is_admin = TRUE)
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Only hosts and admins can promote participants';
  END IF;

  -- Promote the participant
  UPDATE public.participants
  SET is_admin = TRUE
  WHERE id = p_participant_id
    AND draft_id = p_draft_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to demote an admin
CREATE OR REPLACE FUNCTION public.demote_from_admin(
  p_draft_id UUID,
  p_participant_id UUID,
  p_demoting_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_authorized BOOLEAN;
  v_is_host BOOLEAN;
BEGIN
  -- Check if the target is the host (can't demote host)
  SELECT is_host INTO v_is_host
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_is_host THEN
    RAISE EXCEPTION 'Cannot demote the host';
  END IF;

  -- Check if the demoting user is host or admin
  SELECT EXISTS(
    SELECT 1 FROM public.participants
    WHERE draft_id = p_draft_id
      AND id = p_demoting_user_id::UUID
      AND (is_host = TRUE OR is_admin = TRUE)
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Only hosts and admins can demote participants';
  END IF;

  -- Demote the participant
  UPDATE public.participants
  SET is_admin = FALSE
  WHERE id = p_participant_id
    AND draft_id = p_draft_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE public.custom_formats IS 'Stores custom Pokemon pricing uploaded via CSV by draft hosts';
COMMENT ON COLUMN public.custom_formats.pokemon_pricing IS 'JSON object mapping Pokemon identifiers to their costs';
COMMENT ON COLUMN public.participants.is_admin IS 'Indicates if participant has admin privileges (can manage draft settings)';
COMMENT ON FUNCTION public.promote_to_admin IS 'Promotes a participant to admin role (requires host or admin privileges)';
COMMENT ON FUNCTION public.demote_from_admin IS 'Demotes an admin to regular participant (requires host or admin privileges)';
