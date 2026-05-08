# AI Trainer Strategy

Nemesis Trainer should start with deterministic, explainable adversarial generation.

The goal is not to claim a truly unbeatable AI. The goal is to generate a credible trainer that exposes a team's weaknesses and can explain the pressure it creates.

## Pipeline

1. Parse and validate the user's team.
2. Analyze weaknesses.
3. Select a trainer archetype.
4. Generate a boss roster.
5. Score the matchup.
6. Explain the plan and counterplay.
7. Optionally simulate lines through Pokemon Showdown.

## Weakness Signals

Evaluate:

- defensive type gaps
- offensive coverage gaps
- speed control gaps
- lack of priority
- lack of status or disruption
- lack of setup answers
- weakness to hazards
- weakness to weather, terrain, or Trick Room
- overreliance on one wallbreaker
- overreliance on one defensive pivot
- item or ability dependency

## Boss Archetypes

Initial archetypes:

- `Fast Pressure`
- `Wallbreaker`
- `Setup Snowball`

Later archetypes:

- weather offense
- Trick Room
- hazard stack
- stall
- bulky offense
- anti-meta tournament boss
- daily challenge boss

## Action Selection

For interactive battles, prefer:

- rule-based move and switch scoring
- minimax where runtime permits
- alpha-beta pruning
- deterministic seeded choices
- configurable search depth by difficulty

Decision quality should improve through search depth and heuristic quality, not hidden stat bonuses.

## Heuristic Factors

Score non-terminal positions using:

- remaining HP
- number of remaining Pokemon
- speed advantage
- current type matchup
- safe switch options
- status conditions
- stat boosts and drops
- hazards and field effects
- imminent knockout threats
- setup threat potential
- endgame sweep potential

## Explanation Quality

Every generated trainer should explain:

- why the user's team is vulnerable
- what the boss is trying to force
- what the likely lead does
- what the user's best counterplay is
- what small team change would reduce the weakness

This explanation is part of the product, not flavor text.
