# Codex AI Battler Handoff

Last updated: 2026-05-11

This file exists so future Codex sessions can resume AI battler work without reconstructing the current state from chat history.

## Current Branch State

Branch: `master`

Latest pushed battle commit:

```text
239dde4 Add interactive AI trainer battles
```

That commit added the first interactive Showdown-backed battle loop.

Known uncommitted local files at the time this handoff was created:

- `README.md`
- `docs/backend-avoid-for-now.md`
- `docs/backend-later.md`
- `docs/backend-mvp.md`

Those were pre-existing/unrelated to the battle AI docs and should not be overwritten casually.

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
```

All three passed after the interactive battle implementation and forced-switch fix.

Full `npm audit` may still report an optional dependency issue through `pokemon-showdown` and `node-static`. `npm audit --omit=optional --audit-level=moderate` was clean at the time of implementation.

## Main AI Limitation

The current AI choice function is basic. It:

- enumerates legal choices from the Showdown request
- prefers the first legal forced switch when forced
- scores moves mostly by base power, priority, and a status-move bonus
- uses deterministic seeded tie-breaking

It does not yet:

- simulate candidate actions before choosing
- model the user's best response
- evaluate full battle state
- search multiple plies
- prune search
- explain why an action was chosen

## Recommended Next Work

Read these docs first:

- `docs/ai-battler-implementation-plan.md`
- `docs/ai-battler-architecture.md`
- `docs/ai-battler-heuristics.md`
- `docs/battle-simulation.md`
- `docs/ai-trainer-strategy.md`

Then implement the first narrow PR:

1. Create `lib/battle-ai/policy.ts`.
2. Move current choice scoring from `lib/showdown/battle.ts` into `lib/battle-ai/basic-policy.ts`.
3. Keep the battle runner behavior unchanged.
4. Add tests proving the policy is deterministic.
5. Create `lib/battle-ai/evaluate.ts` with terminal, Pokemon count, and HP-fraction scoring.
6. Add synthetic `BattleSnapshot` fixtures for evaluator tests.

Do not start with full minimax. The replay helper and evaluator need to be reliable first.

## Important Files

- `lib/showdown/battle.ts`: current battle runner and AI choice logic
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
