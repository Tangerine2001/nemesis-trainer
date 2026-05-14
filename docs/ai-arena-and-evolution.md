# AI Arena And Heuristic Evolution

This is internal tooling for comparing battle AI variants and tuning evaluator weights. It is not part of the public product UI.

## Commands

```sh
npm run ai:arena -- --seed smoke --rounds 2 --workers 2
npm run ai:evolve -- --seed smoke --generations 1 --population 4 --workers 2
npm run ai:train-target -- --seed target-v1 --generations 20 --population 24 --workers auto
```

Reports are written to `.arena-runs/`, which is intentionally ignored by git.

## Seed Team Pool

The default pool in `data/ai-arena/teams` contains 10 sourced Smogon SV OU Singles teams. They are intentionally `gen9ou` imports, not Pokemon Champions VGC/tournament sheets, because the current arena runs Showdown `gen9ou` battles.

See `data/ai-arena/teams/README.md` for source notes and PokePaste identifiers. If this project later adds a Champions-specific Singles simulator format, keep that seed pool separate from the `gen9ou` pool so evolution reports are comparable.

## Match Rule

An arena match runs up to five swapped team pairs.

For each pair:

1. Pick two teams from `data/ai-arena/teams` with seeded randomness.
2. Game 1: agent A uses the first team and agent B uses the second team.
3. Game 2: agents swap teams and player sides.
4. If the same agent wins both games, that agent wins the match.
5. If no agent wins both games after five pairs, the match is `shared-win-tie`.

The tie rule gives both agents partial positive fitness, because neither proved superiority across both team assignments.

## Evolution Scope

The genetic algorithm evolves evaluator weights only:

- remaining Pokemon
- total HP
- active Pokemon HP
- status penalties

It does not evolve teams, movesets, legality, hidden boosts, or Showdown mechanics.

## Peer-Play Training

`npm run ai:train-target` trains minimax evaluator weights through candidate-vs-candidate peer play. The command name is historical; the training mode in new reports is `peer-play`.

Each training challenge is exactly one swapped team pair between two candidates: game one uses the sampled team assignment, then game two swaps sides and teams. A candidate only gets a double-side match win if it wins both games. Split pairs and max-turn draws are shared ties.

Candidate selection uses a combined peer metric:

- double-side match wins
- individual game wins
- match win rate
- game win rate
- shared ties
- battle-quality fitness delta from the arena scorer
- losses and game losses as penalties

There is no fixed benchmark in the evolutionary loop. Elites from the current peer-play standings progress to the next generation. From the second generation onward, the previous generation's champion is retained as the incumbent candidate and every challenger also plays an incumbent-defense match, so new champions have to beat or displace prior strong candidates. Training is report-only. Do not personally battle a champion in the browser unless the user explicitly asks for that final validation step.

## Parallelism

Arena work is parallelized at the match-task level. The main process builds deterministic tasks, worker processes run complete matches, and results are sorted by task id before scoring. This keeps results stable regardless of worker count.

Use `--workers auto` for normal local runs or `--workers 1` when debugging.

## Performance Notes

Arena reports include internal perf counters per match:

- `elapsedMs`
- `replays`
- `replayCacheHits`
- `snapshots`
- `choiceBuilds`

These counters are for relative local comparisons, not exact benchmarking. The arena caches normalized request data and replay prefixes within each game, but all battle transitions still run through Pokemon Showdown.

## Promotion Rule

Do not promote a champion genome to the live battler from one run. Run several seeds, inspect reports, and add regression tests for any behavior that looks genuinely better.
