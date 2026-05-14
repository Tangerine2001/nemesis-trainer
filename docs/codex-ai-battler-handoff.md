# Codex AI Battler Handoff

Last updated: 2026-05-13

This file exists so future Codex sessions can resume AI battler work without reconstructing the current state from chat history.

## Current Branch State

Branch: `master`

Latest pushed battle commit before the minimax implementation:

```text
72ef444 Improve deterministic AI battler
```

That commit added the greedy policy boundary, evaluator, AI choice replay tracking, battle log formatting improvements, and AI battler planning docs.

## Current Battler Capabilities

The app can:

- generate a deterministic nemesis trainer from a pasted team
- start a battle against the trainer
- submit user choices through API routes
- reconstruct battle state by replaying the initial seed and accepted choices
- display active Pokemon, bench status, legal moves, legal switches, HP conditions, and battle log
- handle forced user switches after a faint
- auto-settle AI-only forced switches after the AI loses a Pokemon
- reflect Showdown choice-lock behavior in legal move buttons
- choose live AI trainer actions with default depth-2 minimax
- fall back to greedy one-ply evaluation and basic rule scoring when search cannot complete

Manual browser smoke already covered:

- Great Tusk KOing Glimmora
- AI auto-switching to Dragonite
- Great Tusk fainting and forcing user switch
- user switching to Dragapult
- Dragapult being Choice Specs locked
- user switching to Kingambit
- Kingambit KOing opposing Gholdengo
- AI auto-switching to its next Pokemon

Browser console had no warnings or errors during that smoke test.

## Verification Commands

Use:

```sh
npm run test
npm run typecheck
npm run build
npm run ai:arena -- --seed smoke --rounds 2 --workers 2
npm run ai:evolve -- --seed smoke --generations 1 --population 4 --workers 2
npm run ai:train-target -- --seed smoke-target --generations 1 --population 4 --trainChallenges 2 --workers 2 --maxTurns 8
```

All three passed after the interactive battle implementation and forced-switch fix.

Arena and target-training reports now include perf counters for elapsed time, replay count, replay-cache hits, snapshots, and compact choice builds. Use those counters when comparing optimization work; do not infer improvement from wall time alone on a busy machine.

Full `npm audit` may still report an optional dependency issue through `pokemon-showdown` and `node-static`. `npm audit --omit=optional --audit-level=moderate` was clean at the time of implementation.

## Main AI Limitation

The current AI search is intentionally shallow. It:

- enumerates legal choices from the Showdown request
- prefers the first legal forced switch when forced
- simulates root AI choices through Showdown replay
- models the next visible user response as the minimizing branch
- uses the current evaluator for terminal, Pokemon count, HP, active HP, and status scoring
- uses deterministic seeded tie-breaking
- stops under node and time budgets
- falls back to greedy/basic policies when needed

It does not yet:

- search beyond the next visible user response
- use type-matchup, speed, hazard, boost, item, or ability-aware heuristics
- expose difficulty levels
- explain AI choices in the UI
- use a transposition cache

## Recommended Next Work

Read these docs first:

- `docs/ai-battler-implementation-plan.md`
- `docs/ai-battler-architecture.md`
- `docs/ai-battler-heuristics.md`
- `docs/battle-simulation.md`
- `docs/ai-trainer-strategy.md`

Then improve the evaluator before increasing search depth:

1. Add type-matchup and speed-pressure scoring.
2. Add hazard, boost/drop, item, and ability signals where the normalized snapshot exposes enough data.
3. Add decision explanations from the selected policy result.
4. Add difficulty levels only after depth-2 runtime is stable in browser smoke tests.
5. Use `docs/ai-arena-and-evolution.md` to compare heuristic changes before promoting them.

Do not raise default depth to 3 until replay runtime has been profiled on several realistic teams.

## Important Files

- `lib/showdown/battle.ts`: current battle runner, replay, and policy wiring
- `lib/battle-ai/minimax-policy.ts`: default depth-2 minimax policy
- `lib/battle-ai/greedy-policy.ts`: one-ply fallback policy
- `lib/battle-ai/basic-policy.ts`: deterministic fallback policy
- `lib/battle-ai/evaluate.ts`: normalized snapshot evaluator
- `lib/battle-ai/arena/`: internal AI-vs-AI arena and report helpers
- `lib/battle-ai/evolution/`: genetic algorithm for evaluator weights
- `scripts/ai-train-target.ts`: report-only peer-play trainer for evolving evaluator weights through candidate-vs-candidate battles
- `data/ai-arena/teams/`: curated 10-team Smogon SV OU arena pool plus source notes
- `lib/showdown/team.ts`: Showdown team packing
- `lib/types.ts`: battle snapshot and choice types
- `app/api/battle/start/route.ts`: battle start route
- `app/api/battle/turn/route.ts`: battle turn route
- `app/page.tsx`: battle UI
- `test/domain.test.ts`: current domain tests

## Known Design Decisions

- Showdown is the mechanics source of truth.
- Replay is preferred over mutable battle cloning for the first search implementation.
- Deterministic seeds are required for reproducibility and sharing.
- The AI should improve through policy, depth, and heuristic quality, not hidden advantages.
- Keep the MVP mostly stateless.

## Known Caveats

- Search may be slow if implemented with naive full replay and high depth.
- Arena simulation now caches request normalization and replay prefixes, but full Showdown replay is still the dominant cost for long peer-play training runs.
- The evaluator will initially be imperfect; keep it small and testable.
- Showdown protocol parsing may need more events as the UI and evaluator become richer.
- Battle logs currently simplify some item-removal messages.
- `gen9ou` should remain the first supported format until the loop is solid.

## Browser Smoke Procedure

1. Start the dev server:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
```

2. Open `http://127.0.0.1:3000`.
3. Click `Battle trainer`.
4. Play until at least one AI Pokemon faints.
5. Confirm the AI switches automatically.
6. Let one user Pokemon faint.
7. Confirm only legal forced switches appear.
8. Make a manual switch.
9. Check the browser console for warnings and errors.

Stop the dev server afterward.
