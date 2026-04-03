# k6 Load Tests — Draft Pick Latency

Tests 8 concurrent players making picks via the Supabase RPC to validate the PERF-04 performance requirement: p95 pick latency under 500ms with an error rate below 1%.

## Prerequisites

### 1. Install k6

k6 is a standalone binary — do **not** run `npm install k6`.

| Platform | Command |
|---|---|
| macOS (Homebrew) | `brew install k6` |
| Windows (winget) | `winget install k6` |
| Linux (snap) | `snap install k6` |
| Any (official) | https://grafana.com/docs/k6/latest/get-started/installation/ |

Verify installation:

```bash
k6 version
```

### 2. Create a test draft

The load test makes real picks against Supabase. Use a dedicated test draft — not a production draft.

1. Open the app and create a new draft with **exactly 8 teams**
2. Set all teams to ready and start the draft (status must be `active`)
3. Copy the draft UUID from the URL bar (e.g. `123e4567-e89b-12d3-a456-426614174000`)

### 3. Gather environment variables

| Variable | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | `https://abcdef.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJ...` |
| `DRAFT_ID` | UUID of the test draft | `123e4567-e89b-12d3-a456-426614174000` |

Find `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your `.env.local` file or in the Supabase dashboard under **Project Settings → API**.

## Run commands

### Run against staging / local

```bash
k6 run \
  -e SUPABASE_URL=https://yourproject.supabase.co \
  -e SUPABASE_ANON_KEY=eyJ... \
  -e DRAFT_ID=your-draft-uuid \
  tests/load/draft-load-test.js
```

### Run and save results to a JSON file

```bash
k6 run \
  -e SUPABASE_URL=https://yourproject.supabase.co \
  -e SUPABASE_ANON_KEY=eyJ... \
  -e DRAFT_ID=your-draft-uuid \
  tests/load/draft-load-test.js \
  --out json=results.json
```

### Run against production

Replace the URL with the production Supabase URL and use a dedicated test draft. Do not run load tests against live user drafts.

```bash
k6 run \
  -e SUPABASE_URL=https://prod-project.supabase.co \
  -e SUPABASE_ANON_KEY=eyJ... \
  -e DRAFT_ID=your-test-draft-uuid \
  tests/load/draft-load-test.js
```

## Interpreting results

k6 prints a summary at the end of the run. Look for the threshold lines:

```
✓ http_req_duration{scenario:draft_picks}...: p(95)<500  ✓ PASSED
✓ http_req_failed{scenario:draft_picks}......: rate<0.01  ✓ PASSED
✓ pick_latency...............................: p(95)<500  ✓ PASSED
```

- **PASS** — p95 pick latency is under 500ms and error rate is below 1%. The stack meets the PERF-04 requirement.
- **FAIL** — One or more thresholds were exceeded. See common causes below.

### Common failure causes

| Symptom | Likely cause | Fix |
|---|---|---|
| High latency (p95 > 500ms) | Cold-start or under-resourced Supabase instance | Wait for warm-up; check DB CPU in Supabase dashboard |
| High error rate (> 1%) | Draft not in `active` status | Ensure the test draft is active before running |
| `403 Unauthorized` errors | RLS policies blocking the anon key | Verify RLS policies allow `make_draft_pick` RPC for anon role |
| `Missing required env var` | Missing environment variable | Double-check `-e` flags on the k6 command |
| All picks fail with "Not your turn" | k6 team IDs don't match real team UUIDs | Update the script's `p_team_id` construction or use real UUIDs |

## Success criteria (PERF-04)

| Metric | Threshold | Measured by |
|---|---|---|
| p95 pick latency | < 500ms | `pick_latency` custom Trend metric |
| HTTP error rate | < 1% | `http_req_failed` built-in metric |
| Concurrent virtual users | 8 | `constant-vus` executor |
| Test duration | 60 seconds | `duration` in scenario config |

## Test design notes

- Each of the 8 VUs simulates one draft player. They pick from a pool of 20 Pokemon, cycling through different species each iteration to reduce duplicate-pick collisions.
- A 1-second sleep between iterations models realistic think time.
- "Not your turn" and "already drafted" RPC errors are treated as expected outcomes under concurrent load — they do not count toward the error rate threshold. Network errors and 4xx/5xx HTTP responses do count.
- The test requires real team UUIDs in `p_team_id` for picks to be accepted server-side. The default placeholders (`team-slot-N`) are correct only if your test draft teams use that naming pattern. Adjust the script's team ID logic if needed.
