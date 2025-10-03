-- =============================================
-- MIGRATION: Helper Functions and Utilities
-- Useful database functions for your app
-- =============================================

-- Function to get complete draft state
CREATE OR REPLACE FUNCTION get_draft_state(p_draft_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'draft', (SELECT row_to_json(d.*) FROM drafts d WHERE d.id = p_draft_id),
        'teams', (SELECT COALESCE(json_agg(row_to_json(t.*)), '[]'::json) FROM teams t WHERE t.draft_id = p_draft_id ORDER BY t.draft_order),
        'picks', (SELECT COALESCE(json_agg(row_to_json(p.*)), '[]'::json) FROM picks p WHERE p.draft_id = p_draft_id ORDER BY p.pick_order),
        'participants', (SELECT COALESCE(json_agg(row_to_json(pt.*)), '[]'::json) FROM participants pt WHERE pt.draft_id = p_draft_id),
        'current_auction', (SELECT row_to_json(a.*) FROM auctions a WHERE a.draft_id = p_draft_id AND a.status = 'active' LIMIT 1)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
    characters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
    code_exists BOOLEAN;
BEGIN
    LOOP
        result := '';
        FOR i IN 1..6 LOOP
            result := result || substr(characters, floor(random() * length(characters) + 1)::integer, 1);
        END LOOP;

        SELECT EXISTS(SELECT 1 FROM drafts WHERE room_code = result) INTO code_exists;

        IF NOT code_exists THEN
            EXIT;
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old drafts (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_drafts(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM drafts
        WHERE
            status = 'completed'
            AND updated_at < NOW() - (days_old || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get team roster with all picks
CREATE OR REPLACE FUNCTION get_team_roster(p_team_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'team', (SELECT row_to_json(t.*) FROM teams t WHERE t.id = p_team_id),
        'picks', (
            SELECT COALESCE(json_agg(row_to_json(p.*)), '[]'::json)
            FROM picks p
            WHERE p.team_id = p_team_id
            ORDER BY p.pick_order
        ),
        'total_cost', (SELECT COALESCE(SUM(cost), 0) FROM picks WHERE team_id = p_team_id)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if Pokemon is already picked
CREATE OR REPLACE FUNCTION is_pokemon_picked(p_draft_id UUID, p_pokemon_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM picks
        WHERE draft_id = p_draft_id
        AND pokemon_id = p_pokemon_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available budget for team
CREATE OR REPLACE FUNCTION get_team_available_budget(p_team_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_spent INTEGER;
    initial_budget INTEGER;
BEGIN
    -- Get total spent
    SELECT COALESCE(SUM(cost), 0) INTO total_spent
    FROM picks
    WHERE team_id = p_team_id;

    -- Get initial budget from draft
    SELECT d.budget_per_team INTO initial_budget
    FROM teams t
    JOIN drafts d ON t.draft_id = d.id
    WHERE t.id = p_team_id;

    RETURN initial_budget - total_spent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update spectator count
CREATE OR REPLACE FUNCTION update_spectator_count(p_draft_id UUID, p_increment BOOLEAN DEFAULT true)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    IF p_increment THEN
        UPDATE drafts
        SET spectator_count = spectator_count + 1
        WHERE id = p_draft_id
        RETURNING spectator_count INTO new_count;
    ELSE
        UPDATE drafts
        SET spectator_count = GREATEST(spectator_count - 1, 0)
        WHERE id = p_draft_id
        RETURNING spectator_count INTO new_count;
    END IF;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get draft analytics
CREATE OR REPLACE FUNCTION get_draft_analytics(p_draft_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_picks', (SELECT COUNT(*) FROM picks WHERE draft_id = p_draft_id),
        'total_cost', (SELECT COALESCE(SUM(cost), 0) FROM picks WHERE draft_id = p_draft_id),
        'average_cost', (SELECT COALESCE(AVG(cost), 0) FROM picks WHERE draft_id = p_draft_id),
        'most_expensive_pick', (
            SELECT row_to_json(p.*) FROM picks p
            WHERE p.draft_id = p_draft_id
            ORDER BY p.cost DESC
            LIMIT 1
        ),
        'team_budgets', (
            SELECT json_agg(
                json_build_object(
                    'team_id', t.id,
                    'team_name', t.name,
                    'budget_used', (SELECT COALESCE(SUM(cost), 0) FROM picks WHERE team_id = t.id),
                    'budget_remaining', t.budget_remaining,
                    'pick_count', (SELECT COUNT(*) FROM picks WHERE team_id = t.id)
                )
            )
            FROM teams t
            WHERE t.draft_id = p_draft_id
        ),
        'picks_per_round', (
            SELECT json_object_agg(round, pick_count)
            FROM (
                SELECT round, COUNT(*) as pick_count
                FROM picks
                WHERE draft_id = p_draft_id
                GROUP BY round
            ) sub
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to auto-update team budget on pick
CREATE OR REPLACE FUNCTION update_team_budget_on_pick()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE teams
    SET budget_remaining = budget_remaining - NEW.cost
    WHERE id = NEW.team_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating budget
DROP TRIGGER IF EXISTS trigger_update_team_budget ON picks;
CREATE TRIGGER trigger_update_team_budget
    AFTER INSERT ON picks
    FOR EACH ROW
    EXECUTE FUNCTION update_team_budget_on_pick();

-- Trigger to auto-update wishlist availability when Pokemon is picked
CREATE OR REPLACE FUNCTION update_wishlist_on_pick()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE wishlist_items
    SET is_available = false
    WHERE draft_id = NEW.draft_id
    AND pokemon_id = NEW.pokemon_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wishlist ON picks;
CREATE TRIGGER trigger_update_wishlist
    AFTER INSERT ON picks
    FOR EACH ROW
    EXECUTE FUNCTION update_wishlist_on_pick();

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_draft_state(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_room_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_drafts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_roster(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_pokemon_picked(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_team_available_budget(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_spectator_count(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_draft_analytics(UUID) TO anon, authenticated;

COMMIT;
