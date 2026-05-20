# CLI Workflows

This document is the practical handoff for running Nemesis Trainer after the frontend and API routes were removed.

The repo is currently a local TypeScript library, test suite, and AI training workspace. There is no `app/` directory, no Next server, and no HTTP API.

## Setup And Checks

Install dependencies once:

```sh
npm install
```

Run the normal verification commands before committing code changes:

```sh
npm run typecheck
npm test
```

There is no production web build command right now because the frontend/backend app surface has been removed.

## Local Usage

Use the exported library functions directly from tests, scripts, or temporary local drivers:

- `createAudit` in `lib/nemesis.ts`: parse and analyze a pasted Showdown team, then generate a nemesis trainer.
- `startBattle` and `takeBattleTurn` in `lib/showdown/battle.ts`: run deterministic Showdown-backed battles in process.
- `parseTeam`, `analyzeTeam`, and `generateBossTrainer`: lower-level pieces for focused experiments.

Use deterministic seeds in scripts and test payloads so runs can be reproduced.

## Arena Runs

Use the arena to compare predefined AI variants against each other:

```sh
npm run ai:arena -- --seed smoke --rounds 1 --maxPairs 1 --maxTurns 40 --workers 2
npm run ai:arena -- --seed arena-medium --rounds 4 --maxPairs 5 --maxTurns 120 --workers auto
```

Arena matches use swapped team pairs. An agent only wins the match if it wins both sides of a team assignment. If no agent does that within the configured pair limit, the match is recorded as a shared-win tie.

## Evolution Runs

Use heuristic evolution to search evaluator weights through peer-play:

```sh
npm run ai:evolve -- --seed evolve-smoke --generations 2 --population 4 --rounds 1 --maxPairs 2 --maxTurns 60 --workers 2
npm run ai:evolve -- --seed evolve-medium --generations 5 --population 8 --rounds 2 --maxPairs 5 --maxTurns 120 --workers auto
```

This is for internal tuning only. Do not promote a genome from one run without repeating multiple seeds and adding regression tests for the behavior that improved.

## Peer-Play Training

`ai:train-target` is a historical script name. Current training should follow the repository rule in `AGENTS.md`: candidates play other candidates, and selection is based on peer-play performance rather than a fixed benchmark gate.

Useful commands:

```sh
npm run ai:train-target -- --seed target-smoke --generations 2 --population 6 --trainChallenges 2 --maxTurns 60 --workers 2
npm run ai:train-target -- --seed target-medium --generations 5 --population 12 --trainChallenges 3 --maxTurns 80 --workers auto
```

Training reports should show which candidates advanced because of double-side match wins, individual game wins, win rates, split pairs, shared ties, and battle-quality fitness. Final trained champions should not be manually battled unless the user explicitly asks for that validation step.

## Reports

Arena and training reports are written to `.arena-runs/`, which is ignored by git. Report filenames include a timestamp, seed, and run type.

Useful inspection commands:

```sh
ls -t .arena-runs | head
jq '.champion' .arena-runs/<report>.json
jq '.standings[:5]' .arena-runs/<report>.json
jq '.config' .arena-runs/<report>.json
```

Keep reports out of commits unless a user explicitly asks for a run artifact to be checked in.

## Troubleshooting

- Use `--workers 1` when debugging deterministic behavior.
- Use `--workers auto` for normal local training runs.
- If a run is slow, profile before changing simulator semantics; all battle transitions should remain Showdown-backed.
