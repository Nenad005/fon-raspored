# tRPC/DB performance investigation

Measured on 2026-10-07 with read-only requests against the deployed app and
the configured Neon database. No schedule imports or production mutations
were performed.

## Main bottleneck

- Production responses identify the function region as `iad1` (US), while
  the PostgreSQL endpoint is in `eu-central-1` (Frankfurt).
- The original catalog read performs **11 SQL commands**, including
  transaction control; a group schedule performs **5 SELECTs**.
- `Promise.all` inside an interactive transaction does not execute database
  queries in parallel: the transaction has one connection.
- `EXPLAIN ANALYZE` on the original SELECTs reports roughly **0.04–0.63 ms**
  execution time. Client-observed query durations in that sample were
  **102–191 ms**. Network/connection round trips dominate; additional indexes
  are not the main remedy for the current dataset.

## Original production HTTP measurements

Five sequential requests per endpoint, measured from this workstation.
Times include receiving the complete response. First samples include any
connection/function warmup and are kept in the median.

| Endpoint | Median | First sample | Response bytes |
| --- | ---: | ---: | ---: |
| `catalog.get` | 1,386 ms | 1,948 ms | 97,495 |
| `schedule.groups` (year 1) | 326 ms | 362 ms | 885 |
| `schedule.getSchedule` (year 1, A1) | 675 ms | 1,187 ms | 2,254 |

## Changes

1. `vercel.json` places functions in `fra1`, alongside the current Neon DB.
   Both services should stay in the same region if either is moved.
2. Prisma `relationJoins` makes join-based relation loading the default.
   The catalog now issues **6 commands** rather than 11; the group schedule
   issues **2 SELECTs** rather than 5. The joined catalog SELECT executes in
   about **13.5 ms** in the measured plan, trading small local DB work for
   fewer network round trips.
3. Public datasets use Next.js Data Cache keyed by dataset, input and the
   current published schedule version. A warm public read only needs the
   version SELECT. Every request checks the version, so CLI publication
   selects a fresh cache key immediately. Direct callers opt in explicitly
   when a Next.js cache context is available.
4. Production Prisma clients reuse a process-global connection pool.
5. Account mutations reuse the release already protected by the transaction's
   shared lock. `saveTimeslots` no longer locks/reads that release twice, and
   mutation response reads no longer repeat the version lookup. Revision
   checks, atomic writes and read snapshot isolation are retained.

## Same-environment database A/B comparison

Seven reads per strategy, alternating query/join order on the same client
and database, with the public cache disabled. The benchmark checks response
checksums; only unordered group labels are normalized for comparison.

| Endpoint | Original query strategy | Join strategy | SQL commands query → join |
| --- | ---: | ---: | ---: |
| `catalog.get` | 716 ms | 366 ms | 11 → 6 |
| `schedule.groups` | 61 ms | 59 ms | 1 → 1 |
| `schedule.getSchedule` | 296 ms | 107 ms | 5 → 2 |
| `account.get`, nonexistent account | 290 ms | 295 ms | 5 → 5 normally |

The empty account case has no related rows and is not expected to benefit
from join loading. Populated account reads benefit from fewer relation
queries, but no real users' private state was used for this benchmark.
An occasional extra Prisma connection-health query can appear in counts.

## Optimized local production HTTP measurements

The optimized `next build` / `next start` was measured against the **same
hosted Neon database**, with real Next.js cache behavior and five sequential
requests per endpoint.

| Endpoint | Median | First sample / cache fill | Later samples |
| --- | ---: | ---: | --- |
| `catalog.get` | 72 ms | 1,799 ms | 74, 64, 72, 61 ms |
| `schedule.groups` | 58 ms | 199 ms | 58, 69, 57, 50 ms |
| `schedule.getSchedule` | 82 ms | 275 ms | 82, 60, 98, 56 ms |

These are **local production-server measurements**, not post-deployment
Vercel measurements. Cache fill/cold starts still cost more than warm reads.
The function-region change must be deployed before its effect can be
measured. Repeat the production HTTP benchmark after deployment.

## Verification and repeatable commands

```bash
npm run db:generate
npm test
npm run build
npm run perf:api -- --runs 5
npm run perf:api -- --db --compare --runs 7
npm run perf:api -- --db --runs 1 --explain
```

Verification: 159 tests passed; the 2 existing disposable-DB integration
tests were skipped because their test database environment variables were
not configured. Docker was unavailable for starting those databases.
Production build passed, including TypeScript and lint checks (existing
`<img>` warnings in `header.tsx`). The added cache test verifies key
isolation, reuse, release changes, uncached direct calls and error retries.
An actual tRPC streaming batch containing catalog, groups, group schedule
and an anonymous account read also passed: public procedures returned data
and the private procedure returned `UNAUTHORIZED`.

No database schema migration is needed. The generated Prisma client must
include the updated generator setting; normal `npm ci` runs the project's
`postinstall` generation step.
