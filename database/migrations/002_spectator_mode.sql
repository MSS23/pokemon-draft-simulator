-- Migration: Add Spectator Mode Support
-- Description: Adds is_public field to drafts and creates RLS policies for read-only access

-- Add is_public column to drafts table
ALTER TABLE drafts ADD COLUMN is_public BOOLEAN DEFAULT FALSE;

-- Add spectator count tracking
ALTER TABLE drafts ADD COLUMN spectator_count INTEGER DEFAULT 0;

-- Add public discovery metadata
ALTER TABLE drafts ADD COLUMN description TEXT;
ALTER TABLE drafts ADD COLUMN tags TEXT[];

-- Create spectator activity log table
CREATE TABLE spectator_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'join', 'leave', 'view_pick', 'view_auction'
  spectator_id TEXT, -- Anonymous or authenticated user identifier
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_spectator_events_draft_id ON spectator_events(draft_id);
CREATE INDEX idx_spectator_events_created_at ON spectator_events(created_at);
CREATE INDEX idx_drafts_is_public ON drafts(is_public);
CREATE INDEX idx_drafts_status_public ON drafts(status, is_public);

-- RLS Policies for Spectator Mode

-- Enable RLS on spectator_events
ALTER TABLE spectator_events ENABLE ROW LEVEL SECURITY;

-- Drafts: Public drafts readable by anyone
CREATE POLICY "Public drafts are viewable by anyone" ON drafts
  FOR SELECT USING (is_public = true);

-- Teams: Public draft teams viewable by anyone
CREATE POLICY "Public draft teams are viewable by anyone" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM drafts 
      WHERE drafts.id = teams.draft_id 
      AND drafts.is_public = true
    )
  );

-- Participants: Public draft participants viewable by anyone
CREATE POLICY "Public draft participants are viewable by anyone" ON participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM drafts 
      WHERE drafts.id = participants.draft_id 
      AND drafts.is_public = true
    )
  );

-- Picks: Public draft picks viewable by anyone
CREATE POLICY "Public draft picks are viewable by anyone" ON picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM drafts 
      WHERE drafts.id = picks.draft_id 
      AND drafts.is_public = true
    )
  );

-- Auctions: Public draft auctions viewable by anyone
CREATE POLICY "Public draft auctions are viewable by anyone" ON auctions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM drafts 
      WHERE drafts.id = auctions.draft_id 
      AND drafts.is_public = true
    )
  );

-- Bids: Public draft bids viewable by anyone
CREATE POLICY "Public draft bids are viewable by anyone" ON bids
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auctions
      JOIN drafts ON drafts.id = auctions.draft_id
      WHERE auctions.id = bids.auction_id 
      AND drafts.is_public = true
    )
  );

-- Spectator Events: Users can insert their own events, view events for public drafts
CREATE POLICY "Users can log their own spectator events" ON spectator_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM drafts 
      WHERE drafts.id = spectator_events.draft_id 
      AND drafts.is_public = true
    )
  );

CREATE POLICY "Spectator events viewable for public drafts" ON spectator_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM drafts 
      WHERE drafts.id = spectator_events.draft_id 
      AND drafts.is_public = true
    )
  );

-- Function to update spectator count
CREATE OR REPLACE FUNCTION update_spectator_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.event_type = 'join' THEN
    UPDATE drafts 
    SET spectator_count = spectator_count + 1 
    WHERE id = NEW.draft_id;
  ELSIF TG_OP = 'INSERT' AND NEW.event_type = 'leave' THEN
    UPDATE drafts 
    SET spectator_count = GREATEST(0, spectator_count - 1) 
    WHERE id = NEW.draft_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update spectator count
CREATE TRIGGER spectator_count_trigger
  AFTER INSERT ON spectator_events
  FOR EACH ROW
  EXECUTE FUNCTION update_spectator_count();

-- View for discovering active public drafts
CREATE VIEW active_public_drafts AS
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
  COUNT(DISTINCT t.id) as teams_joined,
  COUNT(DISTINCT p.id) as total_picks,
  COALESCE(MAX(p.created_at), d.created_at) as last_activity
FROM drafts d
LEFT JOIN teams t ON t.draft_id = d.id
LEFT JOIN picks p ON p.draft_id = d.id
WHERE d.is_public = true
  AND d.status IN ('setup', 'active', 'paused')
GROUP BY d.id, d.name, d.description, d.format, d.status, d.max_teams, 
         d.current_round, d.spectator_count, d.tags, d.created_at, d.updated_at
ORDER BY last_activity DESC, d.created_at DESC;

-- Comments for documentation
COMMENT ON COLUMN drafts.is_public IS 'Whether this draft is publicly viewable by spectators';
COMMENT ON COLUMN drafts.spectator_count IS 'Current number of active spectators';
COMMENT ON COLUMN drafts.description IS 'Public description for spectator discovery';
COMMENT ON COLUMN drafts.tags IS 'Tags for categorizing and filtering public drafts';
COMMENT ON TABLE spectator_events IS 'Log of spectator activities for analytics and active count';
COMMENT ON VIEW active_public_drafts IS 'Discover active public drafts with metadata for spectator mode';
