# AI Battler Heuristics

This document records the first scoring model for greedy and minimax AI policies. Treat these weights as starting points, not final truth.

## Scoring Direction

`evaluateBattleState(snapshot, perspective)` returns a number.

- higher is better for `perspective`
- terminal wins should dominate all normal position scores
- terminal losses should dominate negatively
- ties should be near zero unless one side was clearly ahead before a forced draw mechanic

Suggested terminal values:

```text
win:  +1_000_000
loss: -1_000_000
tie:  0
```

## Initial Formula

Start with:

```text
score =
  terminalScore
  + pokemonCountScore
  + hpScore
  + activeMatchupScore
  + speedPressureScore
  + statusScore
  + boostScore
  + hazardScore
  + itemScore
  + choicePressureScore
```

Keep each function small and separately tested.

## Suggested Weights

These are deliberately simple.

```text
fainted opposing Pokemon:     +180
fainted own Pokemon:          -180
total HP fraction advantage:  +120 max
active HP fraction advantage: +45 max
status advantage:             +15 to +40 each
major boost advantage:        +20 to +60
hazard advantage:             +10 to +45
item advantage:               +10 to +35
speed advantage:              +10 to +35
likely KO available:          +90
likely opponent KO available: -90
```

Terminal scores must remain much larger than all heuristic scores.

## Pokemon Count Score

Remaining Pokemon matters more than raw HP.

```text
(ownAlive - opposingAlive) * 180
```

This should make a clean KO valuable even if the active mon takes damage.

## HP Score

Use HP fractions, not raw HP numbers.

```text
sum(ownHpFraction) - sum(opposingHpFraction)
```

Multiply by around `120`.

Notes:

- fainted Pokemon count as `0`
- unknown max HP should fall back to condition percentage if only `45/100` is available
- exact HP from Showdown request is better when available

## Active Matchup Score

The active matchup is important because it determines immediate pressure.

Signals:

- active HP advantage
- whether either active mon is fainted or forced out
- type effectiveness of known moves
- whether the active mon is trapped
- whether the active mon is choice-locked into a bad move

Initial implementation can use only HP and legal choice quality. Add type-effectiveness after the evaluator has access to move and species data cleanly.

## Speed Pressure

Estimate whether the active Pokemon can move first.

Initial options:

1. Use known base speed from local data if available.
2. Fall back to request move priority.
3. Treat priority moves as local speed pressure.

Suggested scoring:

- active side likely faster: `+15`
- active side has useful priority into low-HP target: `+25`
- active side is slower and in KO range: `-35`

## Status Score

Status should be matchup-dependent.

Simple first weights:

```text
burn on physical attacker: +35 for opponent, -35 for own
paralysis on fast attacker: +30 for opponent, -30 for own
sleep or freeze: +45 for opponent, -45 for own
toxic on wall: +25 for opponent, -25 for own
poison on non-wall: +12 for opponent, -12 for own
```

If role detection is unavailable, use generic weights:

```text
brn/par: 25
slp/frz: 45
tox: 30
psn: 15
```

## Boost Score

Use Showdown boost stages when available.

Suggested generic values:

```text
atk/spa positive stage: +18 each
spe positive stage:     +22 each
def/spd positive stage: +12 each
accuracy/evasion:       +8 each
negative stages: same values inverted
```

Boosts on low-HP Pokemon should be discounted.

## Hazard Score

Hazards matter if the opposing team switches or is weak to chip.

Initial values:

```text
Stealth Rock on opponent side: +25
one layer Spikes:              +14
two layers Spikes:             +24
three layers Spikes:           +34
Toxic Spikes:                  +18
Sticky Web:                    +22
```

Invert values for hazards on own side.

If the opponent has obvious hazard removal alive, reduce hazard value slightly. This can come later.

## Item Score

Items are not always exposed in perfect detail, but known item changes still matter.

Suggested values:

- removed Heavy-Duty Boots while hazards are up: `+30`
- removed Choice item from attacker: `+20`
- removed Leftovers from defensive mon: `+18`
- consumed Focus Sash: context-dependent, usually `+15` after breaking it
- Air Balloon popped: `+15` if Ground coverage exists

The current log says some removed items were "consumed"; future cleanup should distinguish `-enditem` causes when useful.

## Choice Pressure

Choice items create important constraints.

Signals:

- only one move legal and switches are available
- the locked move is ineffective or resisted
- the locked move can still KO

Suggested values:

- opponent locked into low-value move: `+35`
- own side locked into low-value move: `-35`
- locked move still threatens KO: reduce penalty or add bonus

## Move Scoring for Ordering

Move ordering is not the final evaluator. It is a cheap guess to make alpha-beta prune more.

Order by:

1. legal forced switches
2. likely KO moves
3. super-effective high-power moves
4. priority into low-HP active target
5. strong neutral moves
6. setup if active side is safe
7. status/hazard if early and safe
8. switches with defensive value
9. weak resisted moves

The ordering function should be deterministic and stable.

## Greedy Policy

Greedy should:

1. enumerate legal AI choices
2. simulate each AI choice
3. optionally simulate one plausible user response
4. evaluate resulting state
5. pick the highest score

This is the first meaningful upgrade over the current policy.

## Minimax Policy

Minimax should use the same evaluator.

```text
max node: AI chooses highest score
min node: user chooses lowest AI score
```

Required controls:

- depth
- node budget
- time budget
- deterministic tie-break

Add alpha-beta only after plain minimax is tested.

## Evaluation Test Fixtures

Create small synthetic `BattleSnapshot` fixtures:

- equal full-health state should score near zero
- one side up a Pokemon should score strongly positive
- terminal win should exceed all non-terminal scores
- low-HP active mon in front of priority should score worse
- hazards on opponent side should improve score
- status on own active should reduce score

Avoid using huge full battle transcripts in evaluator unit tests. Use integration tests for Showdown replay.

## Tuning Method

Tune through a small set of deterministic seeds and teams.

For each seed, record:

- current AI choice
- expected stronger choice
- reason
- resulting score before and after change

Do not tune only from one battle. A heuristic that fixes one obvious mistake can create another.

## Explanation Mapping

Each high-value scoring term should be able to produce a reason.

Examples:

- `likelyKo`: "takes a likely knockout"
- `preserveHp`: "avoids losing the active attacker"
- `hazardValue`: "sets chip damage because the opposing team lacks removal"
- `statusValue`: "slows the faster threat"
- `switchValue`: "switches into a resisted attack"

These explanations do not need to be perfect at first, but they should be grounded in the same signals the AI uses.
