-- =====================================================================
-- Player profiles: nationality (2026-08-24)
--
-- user_profiles.nationality — ISO 3166-1 alpha-2 country code, chosen by
-- the user in Settings and shown (as a flag) on their profile, the public
-- player page, and league standings. Nullable; world-readable like
-- display_name (the table's SELECT policy is USING (true) by design).
-- =====================================================================

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS nationality TEXT;

DO $$ BEGIN
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_nationality_iso2
    CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$');
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists
END $$;

COMMENT ON COLUMN public.user_profiles.nationality IS
  'ISO 3166-1 alpha-2 country code (e.g. GB, US, JP). User-chosen, public.';
