-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Custom Draft Formats and Admin Roles
-- Version: 1.1
-- Description: Adds CSV-uploaded custom Pokemon pricing and multi-admin system
-- ═══════════════════════════════════════════════════════════════════════════════

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ TABLE: custom_formats                                                      │
-- │ Purpose: Stores custom Pokemon pricing uploaded via CSV by draft hosts    │
-- └───────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS public.custom_formats (
  -- Primary Key & Timestamps
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Format Metadata
  name TEXT NOT NULL CHECK (length(name) >= 3 AND length(name) <= 100),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  created_by_user_id UUID, -- Optional: references user_profiles(id) if auth enabled
  created_by_display_name TEXT NOT NULL CHECK (length(created_by_display_name) >= 1),

  -- Format Settings
  is_public BOOLEAN DEFAULT FALSE NOT NULL,

  -- Pokemon Pricing Data (JSON format: {"pokemon-name": cost, ...})
  pokemon_pricing JSONB NOT NULL CHECK (jsonb_typeof(pokemon_pricing) = 'object'),

  -- Auto-calculated Metadata (updated by triggers)
  total_pokemon INTEGER CHECK (total_pokemon >= 0),
  min_cost INTEGER CHECK (min_cost >= 0),
  max_cost INTEGER CHECK (max_cost >= 0 AND (min_cost IS NULL OR max_cost >= min_cost)),
  avg_cost NUMERIC(10,2) CHECK (avg_cost >= 0),

  -- Usage Analytics
  times_used INTEGER DEFAULT 0 NOT NULL CHECK (times_used >= 0),
  last_used_at TIMESTAMPTZ,

  -- Soft Delete Support
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_pricing_range CHECK (
    (min_cost IS NULL AND max_cost IS NULL) OR
    (min_cost IS NOT NULL AND max_cost IS NOT NULL)
  )
);

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ SCHEMA MODIFICATIONS: participants & drafts tables                        │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Add admin support to participants
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- Add custom format reference to drafts
ALTER TABLE public.drafts
ADD COLUMN IF NOT EXISTS custom_format_id UUID REFERENCES public.custom_formats(id) ON DELETE SET NULL;

-- Add admin activity tracking
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS promoted_to_admin_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS promoted_by_participant_id UUID REFERENCES public.participants(id);

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ INDEXES: Performance optimization                                         │
-- └───────────────────────────────────────────────────────────────────────────┘

-- custom_formats indexes
CREATE INDEX IF NOT EXISTS idx_custom_formats_created_by
  ON public.custom_formats(created_by_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_custom_formats_public
  ON public.custom_formats(is_public, created_at DESC)
  WHERE is_public = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_custom_formats_name_search
  ON public.custom_formats USING gin(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_custom_formats_usage
  ON public.custom_formats(times_used DESC, last_used_at DESC)
  WHERE deleted_at IS NULL;

-- participants indexes
CREATE INDEX IF NOT EXISTS idx_participants_draft_admin
  ON public.participants(draft_id, is_admin)
  WHERE is_admin = TRUE;

CREATE INDEX IF NOT EXISTS idx_participants_admin_activity
  ON public.participants(promoted_to_admin_at DESC)
  WHERE is_admin = TRUE;

-- drafts indexes
CREATE INDEX IF NOT EXISTS idx_drafts_custom_format
  ON public.drafts(custom_format_id)
  WHERE custom_format_id IS NOT NULL;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ TRIGGERS: Automated calculations and timestamp updates                   │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Function: Update timestamp on record modification
CREATE OR REPLACE FUNCTION public.update_custom_format_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function: Auto-calculate pricing statistics from JSONB data
CREATE OR REPLACE FUNCTION public.update_custom_format_costs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  costs INTEGER[];
  total_cost BIGINT;
BEGIN
  -- Extract all cost values from the JSONB pricing object
  SELECT ARRAY(
    SELECT (value::TEXT)::INTEGER
    FROM jsonb_each(NEW.pokemon_pricing)
  ) INTO costs;

  -- Validate we have data
  IF array_length(costs, 1) IS NULL OR array_length(costs, 1) = 0 THEN
    RAISE EXCEPTION 'Pokemon pricing cannot be empty';
  END IF;

  -- Set min, max, total, and average
  NEW.min_cost := (SELECT MIN(cost) FROM unnest(costs) AS cost);
  NEW.max_cost := (SELECT MAX(cost) FROM unnest(costs) AS cost);
  NEW.total_pokemon := array_length(costs, 1);

  -- Calculate average cost
  SELECT SUM(cost) INTO total_cost FROM unnest(costs) AS cost;
  NEW.avg_cost := ROUND(total_cost::NUMERIC / NEW.total_pokemon, 2);

  RETURN NEW;
END;
$$;

-- Function: Track format usage statistics
CREATE OR REPLACE FUNCTION public.increment_format_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Increment usage counter when draft is created with custom format
  IF NEW.custom_format_id IS NOT NULL THEN
    UPDATE public.custom_formats
    SET
      times_used = times_used + 1,
      last_used_at = NOW()
    WHERE id = NEW.custom_format_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Update timestamp on custom_formats modification
DROP TRIGGER IF EXISTS handle_custom_formats_updated_at ON public.custom_formats;
CREATE TRIGGER handle_custom_formats_updated_at
  BEFORE UPDATE ON public.custom_formats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_custom_format_timestamp();

-- Trigger: Auto-calculate pricing stats when pokemon_pricing changes
DROP TRIGGER IF EXISTS calculate_custom_format_costs ON public.custom_formats;
CREATE TRIGGER calculate_custom_format_costs
  BEFORE INSERT OR UPDATE OF pokemon_pricing ON public.custom_formats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_custom_format_costs();

-- Trigger: Track format usage when draft is created
DROP TRIGGER IF EXISTS track_format_usage ON public.drafts;
CREATE TRIGGER track_format_usage
  AFTER INSERT ON public.drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_format_usage();

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ ROW LEVEL SECURITY (RLS): Access control policies                        │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER TABLE public.custom_formats ENABLE ROW LEVEL SECURITY;

-- Policy: Read access to public formats and own formats
CREATE POLICY "custom_formats_select_policy" ON public.custom_formats
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      is_public = TRUE OR
      created_by_user_id = auth.uid() OR
      created_by_user_id IS NULL -- Allow guest-created formats
    )
  );

-- Policy: Create custom formats
CREATE POLICY "custom_formats_insert_policy" ON public.custom_formats
  FOR INSERT
  WITH CHECK (
    created_by_user_id = auth.uid() OR
    created_by_user_id IS NULL
  );

-- Policy: Update own formats only
CREATE POLICY "custom_formats_update_policy" ON public.custom_formats
  FOR UPDATE
  USING (
    deleted_at IS NULL AND (
      created_by_user_id = auth.uid() OR
      created_by_user_id IS NULL
    )
  )
  WITH CHECK (
    deleted_at IS NULL AND (
      created_by_user_id = auth.uid() OR
      created_by_user_id IS NULL
    )
  );

-- Policy: Soft delete own formats
CREATE POLICY "custom_formats_delete_policy" ON public.custom_formats
  FOR UPDATE
  USING (
    deleted_at IS NULL AND (
      created_by_user_id = auth.uid() OR
      created_by_user_id IS NULL
    )
  );

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ FUNCTIONS: Admin management operations                                    │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Function: Promote participant to admin role
CREATE OR REPLACE FUNCTION public.promote_to_admin(
  p_draft_id UUID,
  p_participant_id UUID,
  p_promoting_user_id TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_authorized BOOLEAN;
  v_is_already_admin BOOLEAN;
  v_participant_name TEXT;
BEGIN
  -- Check if promoting user has authority (host or admin)
  SELECT EXISTS(
    SELECT 1 FROM public.participants
    WHERE draft_id = p_draft_id
      AND id = p_promoting_user_id::UUID
      AND (is_host = TRUE OR is_admin = TRUE)
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN QUERY SELECT FALSE, 'Only hosts and admins can promote participants'::TEXT;
    RETURN;
  END IF;

  -- Check if participant is already admin
  SELECT is_admin, display_name INTO v_is_already_admin, v_participant_name
  FROM public.participants
  WHERE id = p_participant_id AND draft_id = p_draft_id;

  IF v_is_already_admin THEN
    RETURN QUERY SELECT FALSE, format('%s is already an admin', v_participant_name)::TEXT;
    RETURN;
  END IF;

  -- Promote the participant
  UPDATE public.participants
  SET
    is_admin = TRUE,
    promoted_to_admin_at = NOW(),
    promoted_by_participant_id = p_promoting_user_id::UUID
  WHERE id = p_participant_id
    AND draft_id = p_draft_id;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, format('%s promoted to admin', v_participant_name)::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, 'Participant not found'::TEXT;
  END IF;
END;
$$;

-- Function: Demote admin to regular participant
CREATE OR REPLACE FUNCTION public.demote_from_admin(
  p_draft_id UUID,
  p_participant_id UUID,
  p_demoting_user_id TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_authorized BOOLEAN;
  v_is_host BOOLEAN;
  v_is_admin BOOLEAN;
  v_participant_name TEXT;
BEGIN
  -- Get target participant details
  SELECT is_host, is_admin, display_name
  INTO v_is_host, v_is_admin, v_participant_name
  FROM public.participants
  WHERE id = p_participant_id AND draft_id = p_draft_id;

  -- Check if target is host (cannot demote host)
  IF v_is_host THEN
    RETURN QUERY SELECT FALSE, 'Cannot demote the host'::TEXT;
    RETURN;
  END IF;

  -- Check if target is not an admin
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT FALSE, format('%s is not an admin', v_participant_name)::TEXT;
    RETURN;
  END IF;

  -- Check if demoting user has authority (host or admin)
  SELECT EXISTS(
    SELECT 1 FROM public.participants
    WHERE draft_id = p_draft_id
      AND id = p_demoting_user_id::UUID
      AND (is_host = TRUE OR is_admin = TRUE)
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN QUERY SELECT FALSE, 'Only hosts and admins can demote participants'::TEXT;
    RETURN;
  END IF;

  -- Demote the participant
  UPDATE public.participants
  SET
    is_admin = FALSE,
    promoted_to_admin_at = NULL,
    promoted_by_participant_id = NULL
  WHERE id = p_participant_id
    AND draft_id = p_draft_id;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, format('%s demoted from admin', v_participant_name)::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, 'Participant not found'::TEXT;
  END IF;
END;
$$;

-- Function: Get all admins in a draft
CREATE OR REPLACE FUNCTION public.get_draft_admins(p_draft_id UUID)
RETURNS TABLE(
  participant_id UUID,
  display_name TEXT,
  is_host BOOLEAN,
  is_admin BOOLEAN,
  promoted_at TIMESTAMPTZ,
  promoted_by TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.is_host,
    p.is_admin,
    p.promoted_to_admin_at,
    promoter.display_name
  FROM public.participants p
  LEFT JOIN public.participants promoter ON p.promoted_by_participant_id = promoter.id
  WHERE p.draft_id = p_draft_id
    AND (p.is_host = TRUE OR p.is_admin = TRUE)
  ORDER BY p.is_host DESC, p.promoted_to_admin_at ASC;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ DOCUMENTATION: Table and function comments                                │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Table comments
COMMENT ON TABLE public.custom_formats IS
  'Stores custom Pokemon pricing formats uploaded via CSV by draft hosts. '
  'Includes automatic cost calculations and usage tracking.';

-- Column comments - custom_formats
COMMENT ON COLUMN public.custom_formats.id IS 'Unique identifier for the custom format';
COMMENT ON COLUMN public.custom_formats.name IS 'User-defined name for the format (3-100 characters)';
COMMENT ON COLUMN public.custom_formats.description IS 'Optional description (max 500 characters)';
COMMENT ON COLUMN public.custom_formats.pokemon_pricing IS
  'JSONB object mapping Pokemon names to their costs. Format: {"pokemon-name": cost, ...}';
COMMENT ON COLUMN public.custom_formats.total_pokemon IS
  'Auto-calculated: Total number of Pokemon in this format';
COMMENT ON COLUMN public.custom_formats.min_cost IS 'Auto-calculated: Minimum Pokemon cost';
COMMENT ON COLUMN public.custom_formats.max_cost IS 'Auto-calculated: Maximum Pokemon cost';
COMMENT ON COLUMN public.custom_formats.avg_cost IS 'Auto-calculated: Average Pokemon cost';
COMMENT ON COLUMN public.custom_formats.times_used IS
  'Counter: Number of times this format has been used in drafts';
COMMENT ON COLUMN public.custom_formats.last_used_at IS
  'Timestamp: Last time this format was used in a draft';
COMMENT ON COLUMN public.custom_formats.deleted_at IS
  'Soft delete timestamp. NULL = active, NOT NULL = deleted';

-- Column comments - participants
COMMENT ON COLUMN public.participants.is_admin IS
  'Indicates if participant has admin privileges (can manage draft settings)';
COMMENT ON COLUMN public.participants.promoted_to_admin_at IS
  'Timestamp when participant was promoted to admin';
COMMENT ON COLUMN public.participants.promoted_by_participant_id IS
  'ID of the participant who promoted this user to admin';

-- Column comments - drafts
COMMENT ON COLUMN public.drafts.custom_format_id IS
  'Foreign key to custom_formats table. NULL = using default format';

-- Function comments
COMMENT ON FUNCTION public.promote_to_admin(UUID, UUID, TEXT) IS
  'Promotes a participant to admin role. Requires caller to be host or admin. '
  'Returns success status and message. Tracks who promoted whom and when.';

COMMENT ON FUNCTION public.demote_from_admin(UUID, UUID, TEXT) IS
  'Demotes an admin to regular participant. Requires caller to be host or admin. '
  'Cannot demote the host. Returns success status and message.';

COMMENT ON FUNCTION public.get_draft_admins(UUID) IS
  'Returns all admins (including host) for a specific draft. '
  'Includes promotion timestamps and who promoted them.';

COMMENT ON FUNCTION public.increment_format_usage() IS
  'Trigger function: Automatically increments usage counter when a draft uses a custom format';

COMMENT ON FUNCTION public.update_custom_format_costs() IS
  'Trigger function: Auto-calculates min/max/avg costs and total Pokemon count from pricing JSONB';

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 004
-- ═══════════════════════════════════════════════════════════════════════════════
