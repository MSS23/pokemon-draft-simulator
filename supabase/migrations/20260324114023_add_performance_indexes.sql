-- Performance indexes for scalability (1000+ concurrent users)
-- Run this in your Supabase SQL editor

-- match_pokemon_kos: queried by match_id for KO details per match
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_match_id ON match_pokemon_kos(match_id);

-- match_pokemon_kos: queried by team_id for team KO stats
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_team_id ON match_pokemon_kos(team_id);

-- match_pokemon_kos: queried by pokemon_id for per-pokemon KO leaderboard
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_pokemon_id ON match_pokemon_kos(pokemon_id);

-- team_pokemon_status: queried by team_id + league_id for roster health
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_team_league ON team_pokemon_status(team_id, league_id);

-- team_pokemon_status: queried by pokemon_id for pokemon-specific stats
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_pokemon_id ON team_pokemon_status(pokemon_id);

-- standings: queried by team_id for per-team standings lookup
CREATE INDEX IF NOT EXISTS idx_standings_team_id ON standings(team_id);

-- picks: queried by team_id frequently for roster lookups
CREATE INDEX IF NOT EXISTS idx_picks_team_id ON picks(team_id);

-- picks: queried by draft_id for all picks in a draft
CREATE INDEX IF NOT EXISTS idx_picks_draft_id ON picks(draft_id);

-- bid_history: queried by auction_id for bid history display
CREATE INDEX IF NOT EXISTS idx_bid_history_auction_id ON bid_history(auction_id);

-- auctions: queried by draft_id + status for current auction lookup
CREATE INDEX IF NOT EXISTS idx_auctions_draft_status ON auctions(draft_id, status);

-- teams: queried by draft_id for all teams in a draft
CREATE INDEX IF NOT EXISTS idx_teams_draft_id ON teams(draft_id);

-- teams: queried by owner_id for user's teams across drafts
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

-- matches: queried by league_id for league match history
CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id);

-- league_teams: queried by league_id for league roster
CREATE INDEX IF NOT EXISTS idx_league_teams_league_id ON league_teams(league_id);

-- drafts: queried by room_code for joining drafts
CREATE INDEX IF NOT EXISTS idx_drafts_room_code ON drafts(room_code);

-- drafts: queried by host_id for dashboard
CREATE INDEX IF NOT EXISTS idx_drafts_host_id ON drafts(host_id);
