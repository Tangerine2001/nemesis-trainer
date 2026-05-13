# AI Battler Implementation Plan

This document is the working plan for improving Nemesis Trainer's interactive battle AI. It should be updated as the battler moves from a simple rule-based opponent to a deterministic search-driven trainer.

## Current State

The app can already:

- parse a Showdown-style imported user team
- generate a deterministic nemesis trainer
- start a Showdown-backed battle through `/api/battle/start`
- advance turns through `/api/battle/turn`
- replay accepted user choices from the initial teams and seed
- expose legal user choices from Showdown requests
- handle normal moves, switches, forced user switches, and forced AI switches
- choose AI actions with a default depth-2 minimax policy
- fall back to greedy one-ply evaluation and then basic rule scoring when search cannot complete

The current AI is still intentionally lean. It uses replay-based Showdown simulation for candidate AI choices and the next visible user response, but deeper search and richer heuristics are still future work.

## Goal

Build a deterministic, explainable battler that feels like an adversarial trainer rather than a random move picker.

The target direction is:

1. Showdown remains the only source of truth for battle mechanics.
2. AI quality improves through policy selection, search depth, and heuristic tuning.
3. Every AI action can eventually be explained in terms of pressure, damage, matchup, setup, or preservation.
4. Runtime stays acceptable for a stateless web app.

## Non-Goals

Do not build:

- a custom Pokemon battle simulator
- live matchmaking
- ML-first action selection
- hidden stat bonuses or cheating difficulty
- broad all-generation support before `gen9ou` is solid
- account-backed persistence for the MVP

## Implementation Phases

### Phase 1: Extract AI Policy Boundary

Move the current AI choice logic behind a small policy interface.

Target shape:

```ts
export interface BattlePolicyContext {
  seed: string;
  perspective: "p1" | "p2";
  history: string[];
  request: ShowdownRequest;
}

export interface BattlePolicy {
  choose(context: BattlePolicyContext): BattleChoice | undefined;
}
```

Policies to support:

- `basicRulePolicy`: current behavior, preserved as the fallback
- `greedyPolicy`: one-step Showdown simulation plus state evaluation
- `minimaxPolicy`: depth-limited minimax with alpha-beta pruning

Acceptance criteria:

- Existing battle behavior remains deterministic.
- Unit tests cover policy selection and fallback behavior.
- UI/API do not know which policy implementation is used.

### Phase 2: Create a Replayable Simulation Helper

The search engine needs to evaluate hypothetical choices safely. Showdown battle objects are mutable, so the MVP should prefer replay over cloning.

Target helper:

```ts
simulateBattlePath({
  request,
  userChoices,
  aiChoices,
  hypotheticalChoice,
  seed
}) -> BattleSnapshot
```

The helper should:

- rebuild the battle from the initial teams and seed
- replay all accepted choices
- append hypothetical choices
- return a normalized snapshot and legal choices
- avoid mutating the active user-facing battle state

Acceptance criteria:

- Simulation is deterministic for the same seed and history.
- Illegal hypothetical choices are rejected clearly.
- Forced switches are settled consistently.
- Tests cover at least one KO, one forced switch, and one switch turn.

### Phase 3: Add Battle State Evaluation

Create `evaluateBattleState(snapshot, perspective)` and keep it independent from UI code.

Initial scoring dimensions:

- terminal win/loss
- remaining Pokemon count
- total remaining HP fraction
- active matchup pressure
- speed and priority pressure
- status conditions
- stat boosts and drops
- hazards and side conditions
- item removal and consumed items
- trapped or forced-switch states

Acceptance criteria:

- Terminal states dominate all non-terminal states.
- A side with more healthy Pokemon scores better than the same side with fewer healthy Pokemon.
- Obvious tactical improvements, such as taking a KO, improve the score.
- The evaluator is covered by focused unit tests with small fixture snapshots.

### Phase 4: Greedy One-Ply AI

For each legal AI choice:

1. Simulate the AI choice with a plausible player response model.
2. Evaluate the resulting state from the AI perspective.
3. Choose the highest-scoring result with deterministic tie-breaking.

The first player-response model can be simple:

- if the player has a KO move, assume they use it
- otherwise use the player's highest greedy score
- if forced to switch, assume the best evaluated switch

Acceptance criteria:

- AI takes available KOs more reliably than the current policy.
- AI avoids obviously bad switches when a damaging move is better.
- AI still responds instantly for normal MVP teams.

### Phase 5: Depth-Limited Minimax

Add minimax once replay and evaluation are reliable.

Initial target:

- default depth: 2 plies
- optional stronger depth: 3 plies
- hard cap on evaluated nodes per decision
- deterministic tie-breaking by seed

Search meaning:

```text
AI maximizes score.
User minimizes AI score.
```

Acceptance criteria:

- Search respects Showdown legal choices.
- Search terminates under a fixed node/time budget.
- Depth 2 can see obvious one-turn punishments and avoid them.
- If the budget is exceeded, the AI returns the best fully evaluated action so far.

### Phase 6: Alpha-Beta Pruning and Move Ordering

Add alpha-beta pruning after minimax is correct.

Order choices before search:

1. known or likely KO
2. high-damage super-effective move
3. priority move when the active matchup is low HP
4. strong neutral damage
5. useful status or setup
6. safe switch
7. weak resisted move

Acceptance criteria:

- Alpha-beta returns the same choice as unpruned minimax for the same depth.
- Evaluated node count decreases on common battle states.
- Tests compare pruned and unpruned search on small fixture states.

### Phase 7: Difficulty Levels

Expose policy configuration through trainer difficulty.

Suggested mapping:

- `Standard`: greedy one-ply policy
- `Hard`: minimax depth 2
- `Final Boss`: minimax depth 3 with stronger heuristic weights

Difficulty should not alter stats, mechanics, or legality.

### Phase 8: Explanation Hooks

Attach a concise reason to AI decisions.

Examples:

- "takes a guaranteed KO"
- "preserves the win condition"
- "switches into a resisted hit"
- "sets hazards because your team lacks removal"
- "uses priority to prevent a revenge KO"

These explanations can later appear in logs, replays, or post-game analysis.

## First Concrete PR

The next implementation PR should be narrow:

1. Extract the current AI choice logic into `lib/battle-ai/basic-policy.ts`.
2. Add a policy interface and policy tests.
3. Add a state evaluator with basic terminal, HP, and faint scoring.
4. Add fixtures for battle snapshots.

Do not implement full minimax until the evaluator and replay helper are tested.

## Risks

- Replay-based simulation can become slow if search depth grows too quickly.
- Showdown request objects are rich and can expose edge cases that the UI does not yet render.
- A weak heuristic can make deeper search worse, not better.
- The AI can appear smart in obvious damage races while still making bad long-term switches.

## Validation Checklist

Before shipping each AI improvement:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- browser smoke test: start battle, play through a KO, force a user switch, force an AI switch
- check browser console for warnings/errors
- compare at least one deterministic seed before and after the change
