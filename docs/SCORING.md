# Scoring

Two persisted formulas turn scan evidence into scores
(`src/lib/scoring/`). Both share the same discipline: failed measurements
are excluded from the denominator, missing data yields `null`
("not enough data") — never a fabricated number — and every score is stored
with its **formula version** so historical scans keep the score calculated
with the formula active at that time.

## Google Visibility Score — `google_visibility_v1`

Per tracked keyword, tiered rank points:

| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | > 10 | absent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Points | 100 | 85 | 70 | 55 | 45 | 35 | 27 | 20 | 14 | 10 | 5 | 0 |

Score = **mean points over keywords that have actual SERP data**, rounded
to one decimal. The distinction that matters:

- **Absent from the SERP is data** — `trackedDomainRank: null` counts as 0
  points in the denominator (confirmed measurement).
- **A failed SERP request is not data** — that keyword is excluded from the
  denominator entirely (the scan executor simply passes nothing for it).
- Zero keywords with SERP data → score `null`, labeled "not enough data".

Worked example — 5 keywords planned, 4 got SERP data, tracked-domain ranks
`[1, null, 7, 12]`:

```
points = 100 + 0(absent) + 27 + 5(page two) = 132
score  = 132 / 4 = 33.0
coverageExpected = 5 (planned SERP operations)
coverageCompleted = 4 (keywords actually scored)
```

Worked example — all SERP requests failed: score `null`,
`coverageExpected = 5`, `coverageCompleted = 0`. The UI must render "no
data", not `0`.

## AI Visibility Score — `ai_visibility_v1`

Per **valid observation** (one prompt × one engine, completed successfully):
brand mentioned → 100 points, not mentioned → 0 points. Score = mean over
valid observations, rounded to one decimal. Failed observations never enter
the denominator — the caller passes only outcomes that actually exist.
Zero valid observations → score `null`.

Worked example — 5 observations planned, 1 engine call failed, 4 valid
(mentioned, not, mentioned, not):

```
score = (100 + 0 + 100 + 0) / 4 = 50.0
coverageExpected = 5, coverageCompleted = 4
```

## Share of Voice

```
share = brand mentions ÷ (brand mentions + tracked-competitor mentions)
```

across all answers in the scan (competitor mentions are detected
deterministically per answer, see [AI_VISIBILITY.md](AI_VISIBILITY.md)).
Rounded to three decimals. Example: brand mentioned 3 times, competitors 5
times → 3 / 8 = 0.375. **Nobody mentioned anywhere → `null`, never 0** —
"not enough data" is different from "0% share".

## Citation Share

Counts **only genuine provider citations** (`kind='provider'`). Plain URLs
inside answer text are `kind='extracted'` and are excluded by construction.
Example: 2 provider citations, 1 on the owned domain → owned share 0.5.
Zero provider citations (today: both real adapters support no citations) →
`null`, labeled "no provider citations" — never a misleading 0.

## Persistence and coverage

Scores are computed at scan finalization from **persisted evidence**
(completed visibility runs, SERP snapshots) and stored on
`intelligence_scans` (see [SCAN_ENGINE.md](SCAN_ENGINE.md)):

| Columns | Meaning |
| --- | --- |
| `ai_score`, `google_score` | 0–100, or null when not enough data |
| `*_score_formula_version` | e.g. `google_visibility_v1` — keeps history interpretable |
| `*_coverage_expected` | prompt×engine / SERP keywords the scan planned |
| `*_coverage_completed` | valid observations / keywords actually scored |

Coverage is part of the metric, not decoration: a 60 on 2 of 10 planned
keywords is not the same fact as 60 on 10 of 10. **The UI must display
coverage next to any score** and show "no data" for null scores.

## Honesty guarantees

- Absence from a SERP is 0 points (data); a failed request is excluded —
  failures never dilute or inflate a score.
- Zero valid data → `null` + "not enough data", never a silent 0.
- Share of Voice and Citation Share are `null` (not 0) when nobody / no
  provider citations exist.
- Citation share counts only `kind='provider'` provenance; extracted URLs
  can never contribute.
- Every persisted score carries its formula version; scores are computed
  only from persisted scan evidence, never from estimates.
