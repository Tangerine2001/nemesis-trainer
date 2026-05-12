# Backend Later

The backend can grow after the static audit loop proves repeat use.

Add backend complexity only when it improves matchup quality, shareability, performance, or monetizable content.

## Extracted Simulation Worker

Move Showdown simulation into a small stateless Node worker if route handlers become too heavy.

Good reasons to extract:

- simulator startup or bundle size slows the Next.js app
- battle scoring needs CPU isolation
- parallel batch simulations become common
- deployment needs different scaling for UI and simulation

The public interface should stay stable:

```text
parseTeam(rawText) -> Team
validateTeam(team, format) -> ValidationResult
simulateBattle(leftTeam, rightTeam, format, seed) -> BattleResult
scoreMatchup(userTeam, bossTeam, format) -> MatchupScore
chooseAction(state, trainerConfig) -> Action
```

## Cached Generated Data

Add scheduled or manual jobs to precompute JSON for:

- supported format metadata
- common threats
- speed tiers
- type matchup tables
- archetype profiles
- usage-based threat lists
- sample boss trainers
- suggested counterplay snippets

Generated data should be versioned by format and data month where freshness matters.

## Result Storage

Add short-lived or durable result storage only when URL payloads become impractical.

Possible storage paths:

- short-lived key-value storage for large generated challenges
- durable saved results for supporter features
- archived daily or weekly boss challenges

Result rendering should remain deterministic from stored payload plus data version.

## Accounts And Paid Features

Accounts are a later product feature, not infrastructure for the MVP.

Add them only after the free loop shows repeat use.

Possible account-backed features:

- saved teams
- private notes
- ad-free supporter mode
- exports
- batch matchup analysis
- personal challenge history

## Stronger Trainer AI

Improve decision quality through deterministic systems first:

- richer heuristics
- minimax where runtime permits
- alpha-beta pruning
- difficulty-based search depth
- seeded tie-breaking
- Showdown-backed line validation

Machine learning can be explored later, but it should build on top of a correct simulator boundary and explainable baseline.
