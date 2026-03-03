# Any Type Elimination - Progress Tracker

## Status: IN PROGRESS (2 of 9 files complete)

## Commits Made
- `c2f989d` - **supabase.ts** (CRITICAL FOUNDATION): Added `Relationships: []` to all 16 tables + 1 view, added `Functions` with 3 RPCs, added `Enums`, replaced `any` in user_profiles with `string | null` / `Record<string, unknown> | null`
- `89fccc9` - **auto-skip-service.ts**: Replaced all `any` with proper DB Row types, fixed discriminated union metadata, fixed boolean return

## Files Completed
1. `src/lib/supabase.ts` - Foundation fix (Relationships/Functions/Enums + user_profiles any)
2. `src/lib/auto-skip-service.ts` - All any types eliminated

## Files Remaining (7 files)
Each file below lists the exact changes needed (all were validated in a previous session - 94 errors -> 27, with 0 in target files):

### 3. `src/lib/advanced-analytics.ts` (~7 any)
- Add local interfaces: `AnalyticsPickData { pokemon: Pokemon }`, `AnalyticsTeamData { picks?: AnalyticsPickData[] }`, `AnalyticsDraftData extends Draft { teams?: AnalyticsTeamData[] }`
- `analyzeMetaGame(drafts: Draft[])` -> `analyzeMetaGame(drafts: AnalyticsDraftData[])`
- Remove `draft as any` -> use `draft` directly with new type
- `(team: any)` -> `(team: AnalyticsTeamData)`, `(pick: any)` -> `(pick: AnalyticsPickData)`
- `(type: any)` in types forEach -> remove any (types are string[])
- `(otherPick: any)` -> `(otherPick: AnalyticsPickData)`
- `(a: any)` in abilities -> remove (abilities are string[])
- `(t: any)` in calculateMatchupScore defenderTypes -> `(t: string | { name: string })`

### 4. `src/hooks/useSupabase.ts` (~8 any)
- Remove `as any` on `.from('picks')` line 128-129 -> just `.from('picks')`
- `(draft as any).current_turn` -> `draft.current_turn` (line 136)
- `(draft as any).current_round` -> `draft.current_round` (line 137)
- `(supabase.rpc as any)('update_team_budget', ...)` -> `supabase.rpc('update_team_budget', ...)` (line 144)
- `(supabase.rpc as any)('advance_draft_turn', ...)` -> `supabase.rpc('advance_draft_turn', ...)` (line 153)
- `(supabase.rpc as any)('place_bid', ...)` -> `supabase.rpc('place_bid', ...)` (line 166)
- `data as Team[]` -> `data as unknown as Team[]` (snake_case/camelCase mismatch, line 51)
- `data as Participant[]` -> `data as unknown as Participant[]` (line 71)
- `data as Auction` -> `data as unknown as Auction` (line 92)
- Remove `as any` on `.from('auctions')` line 185-186
- Remove `as any` on `.from('participants')` line 206-207

### 5. `src/app/settings/page.tsx` (~3 any)
- Line 57: `.single() as any` -> `.single()`, destructure `{ data, error }`
- Map `data` fields to profile: `setProfile({ user_id: data.user_id, username: data.username || '', ... })`
- Line 84-85: `(supabase.from('user_profiles') as any).upsert(...)` -> `supabase.from('user_profiles').upsert(...)`
- Line 100: `updateResponse?.error` -> destructure `{ error: updateError }` from upsert

### 6. `src/lib/wishlist-service.ts` (~20+ any)
- Add `Database` import, add `type WishlistItemRow = Database['public']['Tables']['wishlist_items']['Row']`
- Add helper: `function mapRowToWishlistItem(row: WishlistItemRow): WishlistItem { ... }`
- Replace ALL `(data as any).field` blocks with `mapRowToWishlistItem(data)` or `data.map(mapRowToWishlistItem)`
- Remove `(draftData as { id: string }).id` -> `draftData.id`
- Remove `(existingItems[0] as any).priority` -> `existingItems[0].priority`
- Remove `insert(newItem as any)` -> `insert(newItem)`
- Remove `(supabase as any)` -> `supabase`
- Change `.order('participant_id, priority')` -> `.order('participant_id').order('priority')`
- Upsert partial updates: cast as `Database['public']['Tables']['wishlist_items']['Insert'][]`

### 7. `src/lib/ai-access-control.ts` (~6 any)
- Remove `as any` on `.maybeSingle()` and `.single()` results (lines 61, 119, 217, 239, 261, 293)
- Destructure results: `const { data: leagueData, error: leagueError } = await supabase...`
- Remove `const league = leagueResponse.data as { draft_id: string }` -> use `leagueData` directly
- `teamsResponse?.data?.map((t: any) => t.id)` -> `teamsData?.map((t) => t.id)`

### 8. `src/lib/error-handler.ts` (~3 any)
- Add `interface SupabaseErrorLike { code?: string; status?: string; statusCode?: string; message?: string; error_description?: string }`
- `error as any` in categorizeError -> `error as SupabaseErrorLike`
- `handleSupabaseError(error: any, ...)` -> `handleSupabaseError(error: SupabaseErrorLike, ...)`

### 9. `src/lib/env.ts`
- No `any` types found. Already clean. Skip.

## Key Technical Notes
- The supabase.ts Database type fix is the ROOT CAUSE fix. Without `Relationships: []` on tables and `Functions` on schema, Supabase JS v2.58 resolves ALL query results to `never` type, which is why `as any` was used everywhere.
- With the foundation fix committed (c2f989d), all downstream files can now safely remove `as any` casts on Supabase operations.
- snake_case (DB Row) vs camelCase (app types like Team, Participant) requires `as unknown as Type` for cross-casting in useSupabase.ts.
- Pre-existing build failure at `/api/formats/sync` route is NOT related to these changes.
