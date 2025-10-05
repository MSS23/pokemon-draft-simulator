-- Migration: Real-time Chat System
-- Adds chat functionality for draft participants

-- Create chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  draft_id UUID REFERENCES public.drafts(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,

  -- Message content
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'pick', 'trade')),

  -- Sender info (denormalized for performance)
  sender_name TEXT NOT NULL,
  sender_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,

  -- Message metadata
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,

  -- Mentions and reactions
  mentioned_participant_ids UUID[],
  reactions JSONB DEFAULT '{}'::jsonb, -- {emoji: [participant_ids]}

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_draft_id ON public.chat_messages(draft_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_participant ON public.chat_messages(participant_id);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Participants can view chat in their draft" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.participants
      WHERE participants.draft_id = chat_messages.draft_id
    )
  );

CREATE POLICY "Participants can send messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants
      WHERE participants.id = chat_messages.participant_id
        AND participants.draft_id = chat_messages.draft_id
    )
  );

CREATE POLICY "Users can edit their own messages" ON public.chat_messages
  FOR UPDATE USING (
    participant_id IN (
      SELECT id FROM public.participants WHERE draft_id = chat_messages.draft_id
    )
  );

CREATE POLICY "Users can delete their own messages" ON public.chat_messages
  FOR DELETE USING (
    participant_id IN (
      SELECT id FROM public.participants WHERE draft_id = chat_messages.draft_id
    )
  );

-- Function to send a chat message
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_draft_id UUID,
  p_participant_id UUID,
  p_message TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_sender_name TEXT;
  v_sender_team_id UUID;
BEGIN
  -- Get sender info
  SELECT display_name, team_id
  INTO v_sender_name, v_sender_team_id
  FROM public.participants
  WHERE id = p_participant_id;

  -- Insert message
  INSERT INTO public.chat_messages (
    draft_id,
    participant_id,
    message,
    message_type,
    sender_name,
    sender_team_id,
    metadata
  ) VALUES (
    p_draft_id,
    p_participant_id,
    p_message,
    p_message_type,
    v_sender_name,
    v_sender_team_id,
    p_metadata
  ) RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add reaction to message
CREATE OR REPLACE FUNCTION public.add_message_reaction(
  p_message_id UUID,
  p_participant_id UUID,
  p_emoji TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_reactions JSONB;
  v_participant_reactions UUID[];
BEGIN
  -- Get current reactions
  SELECT reactions INTO v_reactions
  FROM public.chat_messages
  WHERE id = p_message_id;

  -- Get participants who already reacted with this emoji
  v_participant_reactions := COALESCE(
    (v_reactions->p_emoji)::TEXT::UUID[],
    ARRAY[]::UUID[]
  );

  -- Add participant if not already in array
  IF NOT (p_participant_id = ANY(v_participant_reactions)) THEN
    v_participant_reactions := array_append(v_participant_reactions, p_participant_id);
    v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], to_jsonb(v_participant_reactions));

    UPDATE public.chat_messages
    SET reactions = v_reactions
    WHERE id = p_message_id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove reaction from message
CREATE OR REPLACE FUNCTION public.remove_message_reaction(
  p_message_id UUID,
  p_participant_id UUID,
  p_emoji TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_reactions JSONB;
  v_participant_reactions UUID[];
BEGIN
  -- Get current reactions
  SELECT reactions INTO v_reactions
  FROM public.chat_messages
  WHERE id = p_message_id;

  -- Get participants who reacted with this emoji
  v_participant_reactions := COALESCE(
    (v_reactions->p_emoji)::TEXT::UUID[],
    ARRAY[]::UUID[]
  );

  -- Remove participant from array
  v_participant_reactions := array_remove(v_participant_reactions, p_participant_id);

  IF array_length(v_participant_reactions, 1) IS NULL THEN
    -- Remove emoji key if no more reactions
    v_reactions := v_reactions - p_emoji;
  ELSE
    v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], to_jsonb(v_participant_reactions));
  END IF;

  UPDATE public.chat_messages
  SET reactions = v_reactions
  WHERE id = p_message_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent chat messages
CREATE OR REPLACE FUNCTION public.get_chat_messages(
  p_draft_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  created_at TIMESTAMPTZ,
  sender_name TEXT,
  message TEXT,
  message_type TEXT,
  is_edited BOOLEAN,
  reactions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.created_at,
    cm.sender_name,
    cm.message,
    cm.message_type,
    cm.is_edited,
    cm.reactions
  FROM public.chat_messages cm
  WHERE cm.draft_id = p_draft_id
    AND cm.is_deleted = FALSE
  ORDER BY cm.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE public.chat_messages IS 'Real-time chat messages for draft participants';
COMMENT ON FUNCTION public.send_chat_message IS 'Sends a chat message in a draft';
COMMENT ON FUNCTION public.add_message_reaction IS 'Adds an emoji reaction to a message';
COMMENT ON FUNCTION public.remove_message_reaction IS 'Removes an emoji reaction from a message';
