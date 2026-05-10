# Pokemon Draft - Local DevOps helpers.
#
# These targets wrap the Supabase CLI for the workflows we run by hand:
#   make schema-diff   diff live PROD against the migrations on disk
#   make staging       apply pending migrations to the staging project
#   make seed          reset staging DB + reseed it from supabase/seed.sql
#
# Requires:
#   * Supabase CLI installed (https://supabase.com/docs/guides/cli)
#   * `supabase login` already run once with SUPABASE_ACCESS_TOKEN
#   * Env vars set in your shell (NOT committed):
#       STAGING_PROJECT_REF, STAGING_DB_PASSWORD
#       PROD_PROJECT_REF,    PROD_DB_PASSWORD
#
# You can put these in a local `.env.makefile` and `source` it before
# running make. Do NOT commit that file.

.PHONY: help schema-diff staging staging-link prod-link seed migration-list reset-local start-local stop-local

help:
	@echo "Pokemon Draft - DevOps targets:"
	@echo "  make schema-diff    Diff live PROD against supabase/migrations/"
	@echo "  make staging        Link staging + push pending migrations"
	@echo "  make seed           Reset staging DB and reseed (DESTRUCTIVE)"
	@echo "  make migration-list Show migrations applied on the linked project"
	@echo "  make start-local    Start local Supabase stack"
	@echo "  make stop-local     Stop local Supabase stack"
	@echo "  make reset-local    Reset local DB + reapply migrations + seed"

# --------------------------------------------------------------------
# Schema diff (against PROD by default — change link target if needed).
# Read-only. Safe to run any time.
# --------------------------------------------------------------------
schema-diff: prod-link
	supabase db diff --linked --schema public

# --------------------------------------------------------------------
# Staging deploy (link + push pending migrations).
# --------------------------------------------------------------------
staging: staging-link
	supabase migration list --linked
	supabase db push --linked --password "$$STAGING_DB_PASSWORD"

staging-link:
	@if [ -z "$$STAGING_PROJECT_REF" ] || [ -z "$$STAGING_DB_PASSWORD" ]; then \
	  echo "ERROR: set STAGING_PROJECT_REF and STAGING_DB_PASSWORD in your shell."; \
	  exit 1; \
	fi
	supabase link \
	  --project-ref "$$STAGING_PROJECT_REF" \
	  --password "$$STAGING_DB_PASSWORD"

prod-link:
	@if [ -z "$$PROD_PROJECT_REF" ] || [ -z "$$PROD_DB_PASSWORD" ]; then \
	  echo "ERROR: set PROD_PROJECT_REF and PROD_DB_PASSWORD in your shell."; \
	  exit 1; \
	fi
	supabase link \
	  --project-ref "$$PROD_PROJECT_REF" \
	  --password "$$PROD_DB_PASSWORD"

# --------------------------------------------------------------------
# Seed: resets staging DB then loads supabase/seed.sql.
# DESTRUCTIVE — wipes all data in the linked project.
# --------------------------------------------------------------------
seed: staging-link
	@echo ""
	@echo "About to RESET the linked Supabase project (staging) and reseed."
	@echo "This will DELETE all rows in user_profiles, drafts, teams, etc."
	@echo "Press Ctrl+C in the next 5 seconds to cancel."
	@sleep 5
	supabase db reset --linked --password "$$STAGING_DB_PASSWORD"
	@# `db reset` auto-applies migrations + supabase/seed.sql. Done.

migration-list:
	supabase migration list --linked

# --------------------------------------------------------------------
# Local stack helpers (no remote calls).
# --------------------------------------------------------------------
start-local:
	supabase start

stop-local:
	supabase stop

reset-local:
	supabase db reset
