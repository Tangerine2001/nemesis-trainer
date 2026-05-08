# Data And Content Plan

The product should run on cached and generated data wherever possible.

## Data Sources

Likely sources:

- Pokemon Showdown data and format definitions for mechanics and legality
- Smogon monthly usage stats for community ladder usage
- public tournament team data where licensing and attribution are acceptable
- PokeAPI for non-authoritative descriptive metadata
- local curated sample teams for demos and tests

Do not rely on official in-game ranked data unless a public, permitted source exists.

## Generated Data

Precompute JSON for:

- supported format metadata
- common threats
- common archetypes
- type matchup tables
- speed tiers
- usage-based threat lists
- sample boss trainers
- suggested counterplay snippets

## Shareable Results

Generated trainers and team audits should be shareable without accounts.

Preferred approach:

- compress the imported team, generation seed, selected format, and data version into the URL when feasible
- use short-lived server storage only if payloads become too large
- make result rendering deterministic from payload plus data version

## Useful Pages

Ad-supported content should be useful, not thin.

Good page families:

- counters to common threats
- best teammates for common threats
- how to beat archetypes
- format-specific boss challenges
- daily or weekly challenge archive
- team weakness explainers

Avoid mass-producing pages that only reformat usage percentages.

## Freshness

Version usage-driven pages by format and data month.

Example paths:

```text
/formats/gen9vgc2026/meta/2026-05
/threats/incineroar/counters
/bosses/daily/2026-05-08
```

Archive older pages instead of silently changing historical results.
