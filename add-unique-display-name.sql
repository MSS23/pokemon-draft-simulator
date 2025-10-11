-- Add unique constraint to display_name in user_profiles table
-- This ensures usernames are globally unique across the platform

-- First, handle any duplicate display names that might exist
-- Update duplicates by appending a number
DO $$
DECLARE
  duplicate_name RECORD;
  counter INTEGER;
BEGIN
  FOR duplicate_name IN
    SELECT display_name, COUNT(*) as count
    FROM user_profiles
    WHERE display_name IS NOT NULL
    GROUP BY display_name
    HAVING COUNT(*) > 1
  LOOP
    counter := 1;
    FOR user_record IN
      SELECT id FROM user_profiles
      WHERE display_name = duplicate_name.display_name
      ORDER BY created_at
      OFFSET 1  -- Keep the first one as-is
    LOOP
      UPDATE user_profiles
      SET display_name = duplicate_name.display_name || '_' || counter
      WHERE id = user_record.id;
      counter := counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- Add unique constraint on display_name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_display_name_unique
  ON user_profiles (LOWER(display_name));

-- Add comment
COMMENT ON INDEX idx_user_profiles_display_name_unique IS 'Ensures display names are globally unique (case-insensitive)';
