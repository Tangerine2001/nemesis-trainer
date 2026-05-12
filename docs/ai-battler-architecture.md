# AI Battler Architecture

This document describes how the interactive battler should be structured as the AI becomes stronger.

## Design Principle

Separate mechanics, state normalization, policy, and presentation.

```text
Pokemon Showdown
  -> battle runner and replay
  -> normalized snapshot
  -> legal choices
  -> AI policy
  -> API response
  -> UI
```

The UI should never need to understand Showdown internals or minimax internals.

## Current Files

- `lib/showdown/battle.ts`: starts and advances Showdown-backed battles
- `lib/showdown/team.ts`: packs user and nemesis teams for Showdown
- `app/api/battle/start/route.ts`: starts a battle
- `app/api/battle/turn/route.ts`: applies a user choice
- `lib/types.ts`: battle request, response, snapshot, choice, and view types
- `app/page.tsx`: current single-page UI for audit and battle controls

## Recommended New Modules

Keep new battle AI code under `lib/battle-ai/`.

Suggested structure:

```text
lib/battle-ai/
  policy.ts
  basic-policy.ts
  greedy-policy.ts
  minimax-policy.ts
  evaluate.ts
  move-ordering.ts
  simulate.ts
  cache.ts
  explain.ts
  fixtures.ts
```

Module responsibilities:

- `policy.ts`: shared interfaces and policy configuration
- `basic-policy.ts`: current deterministic rule-based behavior
- `greedy-policy.ts`: one-ply evaluation policy
- `minimax-policy.ts`: depth-limited minimax and alpha-beta pruning
- `evaluate.ts`: battle state scoring
- `move-ordering.ts`: cheap ordering before search
- `simulate.ts`: replay or clone helper for hypothetical choices
- `cache.ts`: state hashing and transposition cache
- `explain.ts`: reason strings for decisions
- `fixtures.ts`: compact test states

## Policy Interface

The battler should call a policy instead of hardcoding AI choice logic inside the Showdown runner.

Target shape:

```ts
export interface BattlePolicyConfig {
  name: "basic" | "greedy" | "minimax";
  depth?: number;
  nodeBudget?: number;
}

export interface BattlePolicyContext {
  seed: string;
  perspective: "p1" | "p2";
  history: string[];
  snapshot: BattleSnapshot;
  legalChoices: BattleChoice[];
}

export interface BattleDecision {
  choice?: BattleChoice;
  score?: number;
  reason?: string;
  nodesEvaluated?: number;
}

export interface BattlePolicy {
  choose(context: BattlePolicyContext): Promise<BattleDecision> | BattleDecision;
}
```

The first implementation can keep this synchronous. Use `Promise` compatibility only if it helps later workerization.

## Replay Model

Showdown battles are mutable. The safest MVP search model is replay:

```text
initial teams + seed + accepted choices + hypothetical choices
  -> fresh BattleStream
  -> normalized BattleSnapshot
```

Benefits:

- deterministic
- avoids accidental mutation of active battle state
- easier to test
- keeps Showdown as source of truth

Costs:

- slower than cloning
- needs node budgets before deeper search

Do not optimize this until correctness is locked down.

## Choice History

The current API keeps user choice history and lets the server deterministically reconstruct AI choices from the seed and prior choices.

For deeper AI, store enough history to reconstruct both sides exactly.

Preferred shape:

```ts
interface BattleChoiceRecord {
  side: "p1" | "p2";
  choice: string;
  turn: number;
  reason?: string;
}
```

The public API can continue returning only the user choices if AI choices remain deterministic. Internally, explicit records will make search, replay debugging, and future sharing easier.

## State Evaluation Boundary

The evaluator should consume normalized state, not raw Showdown objects whenever possible.

Good:

```ts
evaluateBattleState(snapshot, "p2")
```

Avoid:

```ts
evaluateBattleState(rawBattleStream, "p2")
```

This makes tests cheaper and keeps the evaluator independent from Showdown protocol parsing.

## Search Flow

For one AI decision:

```text
get legal AI choices
order legal AI choices
for each choice:
  simulate choice
  if depth remains:
    search opposing legal choices
  else:
    evaluate snapshot
return best legal choice
```

For minimax:

- AI nodes maximize score.
- User nodes minimize score.
- terminal snapshots return immediately.
- forced-switch states should be resolved by legal choices like any other node.
- if a side has no legal choices but the battle is not ended, settle AI-only or wait states through the battle runner.

## Runtime Controls

Every search policy should accept:

- `depth`
- `nodeBudget`
- `timeBudgetMs`
- `maxLegalChoices`

Initial defaults:

- depth 2 for interactive use
- node budget around 100-300 nodes
- time budget around 150-300 ms
- no deeper than depth 3 until profiling says it is acceptable

If a budget is reached, return the best fully evaluated action so far.

## State Hashing

A first cache does not need a perfect Showdown state hash.

Useful fields:

- side to move
- turn
- active species
- active HP and status
- bench HP and status
- known boosts
- side conditions
- weather and terrain when available
- choice history length

Cache key shape:

```text
format:seed:turn:side:active-state:bench-state:field-state
```

Do not cache across different seeds unless the state hash ignores all RNG-sensitive paths safely.

## Determinism

All policies must use seeded deterministic tie-breaking.

Rules:

- never use `Math.random()` for AI decisions
- include seed, turn, choice id, and node path in tie-breaks
- preserve stable ordering when scores tie
- keep difficulty deterministic for the same input

## Error Handling

Illegal choices should be rejected at the boundary closest to Showdown.

Expected errors:

- invalid Showdown import
- unsupported team member or move
- choice no longer legal
- malformed shared battle state
- replay divergence

Prefer clear `errors` in `BattleSnapshot` for user-visible problems and thrown errors for programmer mistakes in tests.

## Testing Strategy

Unit tests:

- legal choice building
- forced switch settlement
- basic policy deterministic choice
- evaluator terminal and HP scoring
- move ordering stable order
- minimax pruned vs unpruned result equivalence

Integration tests:

- start battle
- play a damaging move
- KO opponent and force AI switch
- user mon faints and user must switch
- Choice item locks moves
- battle reaches ended state

Browser smoke:

- start from sample team
- click `Battle trainer`
- play at least five turns
- verify no console warnings/errors

## Workerization Later

If search becomes too slow for API routes, move policy execution to:

- a Node worker thread
- a separate serverless function
- a long-lived lightweight service

Do not start with this. The current product should stay simple until search cost is measured.
