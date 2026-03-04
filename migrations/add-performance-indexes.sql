-- Performance indexes for scalability (1000+ concurrent users)
-- Run this in your Supabase SQL editor

-- match_pokemon_kos: queried by pick_id in KO leaderboard, death counts, pokemon stats
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_pick_id ON match_pokemon_kos(pick_id);

-- match_pokemon_kos: queried by match_id + is_death for death counts
CREATE INDEX IF NOT EXISTS idx_match_pokemon_kos_match_death ON match_pokemon_kos(match_id, is_death);

-- team_pokemon_status: queried by pick_id for individual pokemon stats
CREATE INDEX IF NOT EXISTS idx_team_pokemon_status_pick_id ON team_pokemon_status(pick_id);

-- standings: queried by team_id for per-team standings lookup
CREATE INDEX IF NOT EXISTS idx_standings_team_id ON standings(team_id);

-- picks: queried by team_id frequently for roster lookups
CREATE INDEX IF NOT EXISTS idx_picks_team_id ON picks(team_id);

-- bid_history: queried by auction_id for bid history display
CREATE INDEX IF NOT EXISTS idx_bid_history_auction_id ON bid_history(auction_id);

-- auctions: queried by draft_id + status for current auction lookup
CREATE INDEX IF NOT EXISTS idx_auctions_draft_status ON auctions(draft_id, status);
