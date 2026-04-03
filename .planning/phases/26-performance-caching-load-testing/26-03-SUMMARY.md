---
phase: 26-performance-caching-load-testing
plan: "03"
subsystem: load-testing
tags: [k6, load-test, performance, supabase, rpc, PERF-04]
dependency_graph:
  requires: [26-01, 26-02]
  provides: [load-test-suite, PERF-04-validation]
  affects: [tests/load/]
tech_stack:
  added: [k6 (standalone binary, not npm)]
  patterns: [k6 constant-vus executor, custom Trend metric, env var configuration]
key_files:
  created:
    - tests/load/draft-load-test.js
    - tests/load/README.md
decisions:
  - "Turn contention errors (not your turn, already drafted) treated as expected outcomes under concurrent load, not failures"
  - "p_expected_turn set to null in load test payload to skip server-side turn order validation — load test measures raw RPC latency, not turn-order correctness"
  - "k6 is a standalone binary — not added to package.json"
metrics:
  duration: ~5 minutes
  completed: 2026-04-03T10:02:00Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 26 Plan 03: k6 Draft Load Test Suite Summary

k6 load test suite with 8 concurrent VUs making draft picks via Supabase RPC, validating p95 latency < 500ms and error rate < 1% per PERF-04 requirement.

## Tasks Completed

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Write k6 draft load test script | c27f489 | tests/load/draft-load-test.js |
| 2 | Write k6 load test README | 5ca1ca5 | tests/load/README.md |

## What Was Built

### tests/load/draft-load-test.js

A k6 load test script that:
- Runs 8 concurrent VUs (virtual users) for 60 seconds using the `constant-vus` executor
- Each VU simulates one draft player making picks via `POST /rest/v1/rpc/make_draft_pick`
- Records a custom `pick_latency` Trend metric separate from generic `http_req_duration`
- Enforces PERF-04 thresholds: `p(95)<500` on `pick_latency` and `rate<0.01` on `http_req_failed`
- Validates env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DRAFT_ID`) in `setup()` before VUs start
- Rotates through a pool of 20 Pokemon IDs to reduce duplicate-pick collisions across VUs
- Includes 1-second `sleep()` between iterations to model realistic think time
- Treats "not your turn" and "already drafted" RPC errors as expected concurrent-load outcomes, not failures

### tests/load/README.md

Actionable documentation covering:
- k6 install instructions for macOS (`brew install k6`), Windows (`winget install k6`), Linux (`snap install k6`), and the official Grafana docs URL
- Required env vars table with descriptions and examples
- `k6 run` commands for local, staging, and production environments
- Results interpretation: pass/fail criteria and what the k6 output looks like
- PERF-04 success criteria table
- Common failure causes with diagnosis and fix guidance

## Key Decisions

**1. Turn contention treated as expected under concurrent load**
Under 8 concurrent VUs, only the player whose turn it is will have their pick accepted. "Not your turn" responses are structurally unavoidable in a turn-based game under concurrent load. These are counted as informational logs, not errors, so they do not inflate the error rate threshold.

**2. p_expected_turn set to null**
The atomic `make_draft_pick` RPC enforces turn order when `p_expected_turn` is provided. Setting it to `null` bypasses server-side turn validation in the load test so all 8 VUs can attempt picks simultaneously — this measures raw RPC call latency rather than testing game logic correctness.

**3. k6 not added to package.json**
Per plan constraint: k6 is a standalone binary. Installing via npm would pull in incompatible stubs. The README documents direct binary installation.

## Verification

```
tests/load/draft-load-test.js  — exists, contains make_draft_pick, pick_latency, p(95)<500, vus: 8
tests/load/README.md           — exists, contains brew install k6, grafana.com/docs/k6, SUPABASE_URL, PERF-04
package.json                   — k6 NOT present (correct)
npm run build                  — passes (k6 .js files are not processed by Next.js build)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The `p_team_id` value in the load test script uses placeholder identifiers (`team-slot-N`) rather than real Supabase team UUIDs. This is intentional and documented in the README: the test validates RPC call latency and HTTP-level error rates; turn-order acceptance requires real UUIDs that match a specific test draft. The README instructs testers to update the team ID logic or use real UUIDs for full end-to-end validation.

## Self-Check: PASSED

- tests/load/draft-load-test.js: FOUND
- tests/load/README.md: FOUND
- Commit c27f489 (Task 1): FOUND
- Commit 5ca1ca5 (Task 2): FOUND
