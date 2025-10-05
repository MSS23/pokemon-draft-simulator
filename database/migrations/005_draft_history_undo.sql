-- Migration: Draft History and Undo Functionality
-- Adds support for tracking pick history and allowing undos

-- Create draft_actions table for tracking all draft actions
CREATE TABLE IF NOT EXISTS public.draft_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  draft_id UUID REFERENCES public.drafts(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'pick', 'bid', 'undo', 'start', 'pause', 'complete'

  -- Action details
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
  pokemon_id TEXT,
  pokemon_name TEXT,
  cost INTEGER,

  -- Undo tracking
  is_undone BOOLEAN DEFAULT FALSE,
  undone_at TIMESTAMPTZ,
  undone_by UUID REFERENCES public.participants(id),

  -- Additional metadata
  round_number INTEGER,
  pick_number INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Add undo settings to drafts
ALTER TABLE public.drafts
ADD COLUMN IF NOT EXISTS allow_undos BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS max_undos_per_team INTEGER DEFAULT 3;

-- Add undo tracking to teams
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS undos_remaining INTEGER DEFAULT 3;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_draft_actions_draft_id ON public.draft_actions(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_actions_team_id ON public.draft_actions(team_id);
CREATE INDEX IF NOT EXISTS idx_draft_actions_type ON public.draft_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_draft_actions_undone ON public.draft_actions(is_undone) WHERE is_undone = FALSE;

-- Function to record a draft action
CREATE OR REPLACE FUNCTION public.record_draft_action(
  p_draft_id UUID,
  p_action_type TEXT,
  p_team_id UUID,
  p_participant_id UUID,
  p_pokemon_id TEXT,
  p_pokemon_name TEXT,
  p_cost INTEGER,
  p_round_number INTEGER,
  p_pick_number INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_action_id UUID;
BEGIN
  INSERT INTO public.draft_actions (
    draft_id,
    action_type,
    team_id,
    participant_id,
    pokemon_id,
    pokemon_name,
    cost,
    round_number,
    pick_number,
    metadata
  ) VALUES (
    p_draft_id,
    p_action_type,
    p_team_id,
    p_participant_id,
    p_pokemon_id,
    p_pokemon_name,
    p_cost,
    p_round_number,
    p_pick_number,
    p_metadata
  ) RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to undo the last pick
CREATE OR REPLACE FUNCTION public.undo_last_pick(
  p_draft_id UUID,
  p_team_id UUID,
  p_participant_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, pick_id UUID) AS $$
DECLARE
  v_last_action RECORD;
  v_team_undos INTEGER;
  v_allow_undos BOOLEAN;
  v_max_undos INTEGER;
BEGIN
  -- Check if undos are allowed for this draft
  SELECT allow_undos, max_undos_per_team
  INTO v_allow_undos, v_max_undos
  FROM public.drafts
  WHERE id = p_draft_id;

  IF NOT v_allow_undos THEN
    RETURN QUERY SELECT FALSE, 'Undos are not allowed in this draft'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check team's remaining undos
  SELECT undos_remaining INTO v_team_undos
  FROM public.teams
  WHERE id = p_team_id;

  IF v_team_undos <= 0 THEN
    RETURN QUERY SELECT FALSE, 'No undos remaining for this team'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Get the last non-undone pick action for this team
  SELECT * INTO v_last_action
  FROM public.draft_actions
  WHERE draft_id = p_draft_id
    AND team_id = p_team_id
    AND action_type = 'pick'
    AND is_undone = FALSE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_action IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No picks to undo'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Mark the action as undone
  UPDATE public.draft_actions
  SET is_undone = TRUE,
      undone_at = NOW(),
      undone_by = p_participant_id
  WHERE id = v_last_action.id;

  -- Remove the pick from picks table
  DELETE FROM public.picks
  WHERE draft_id = p_draft_id
    AND team_id = p_team_id
    AND pokemon_id = v_last_action.pokemon_id
    AND round = v_last_action.round_number;

  -- Restore team budget
  UPDATE public.teams
  SET budget_remaining = budget_remaining + v_last_action.cost,
      undos_remaining = undos_remaining - 1
  WHERE id = p_team_id;

  -- Record the undo action
  INSERT INTO public.draft_actions (
    draft_id,
    action_type,
    team_id,
    participant_id,
    metadata
  ) VALUES (
    p_draft_id,
    'undo',
    p_team_id,
    p_participant_id,
    jsonb_build_object('undone_action_id', v_last_action.id)
  );

  RETURN QUERY SELECT TRUE, 'Pick undone successfully'::TEXT, v_last_action.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get draft action history
CREATE OR REPLACE FUNCTION public.get_draft_history(p_draft_id UUID)
RETURNS TABLE(
  action_id UUID,
  action_type TEXT,
  team_name TEXT,
  participant_name TEXT,
  pokemon_name TEXT,
  cost INTEGER,
  round_number INTEGER,
  pick_number INTEGER,
  is_undone BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    da.id,
    da.action_type,
    t.name,
    p.display_name,
    da.pokemon_name,
    da.cost,
    da.round_number,
    da.pick_number,
    da.is_undone,
    da.created_at
  FROM public.draft_actions da
  LEFT JOIN public.teams t ON da.team_id = t.id
  LEFT JOIN public.participants p ON da.participant_id = p.id
  WHERE da.draft_id = p_draft_id
  ORDER BY da.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE public.draft_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view draft actions for drafts they're in" ON public.draft_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.participants
      WHERE participants.draft_id = draft_actions.draft_id
    )
  );

CREATE POLICY "System can insert draft actions" ON public.draft_actions
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "System can update draft actions" ON public.draft_actions
  FOR UPDATE USING (TRUE);

-- Comments
COMMENT ON TABLE public.draft_actions IS 'Records all actions taken during a draft for history and undo functionality';
COMMENT ON FUNCTION public.undo_last_pick IS 'Undoes the last pick made by a team (if undos are allowed and team has undos remaining)';
COMMENT ON FUNCTION public.get_draft_history IS 'Returns the complete action history for a draft';
