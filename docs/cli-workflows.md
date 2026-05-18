# CLI Workflows

This document is the practical handoff for running Nemesis Trainer without a polished frontend. The battle AI and training loops are primarily driven through npm scripts and local API routes.

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

Run a production build when app routes, API routes, Next configuration, or bundled assets change:

```sh
npm run build
```

## Local App And API

Start the local Next app:

```sh
HOST=127.0.0.1 PORT=3000 npm run dev
```

The browser entry point is `http://localhost:3000`. The user-facing battle UI is currently a placeholder after the frontend battle interface was removed, so real battling and training work should use the CLI tools or API routes.

Important API routes:

- `POST /api/analyze`: parse and analyze a pasted Showdown team.
- `POST /api/battle/start`: start a deterministic Showdown-backed battle session.
- `POST /api/battle/turn`: submit a player choice and advance the battle.

Use deterministic seeds in API payloads and CLI flags so runs can be reproduced.

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

## Manual Battle Workflow

Until a new battle UI exists, manual validation should use the local API or a purpose-built CLI driver. The previous browser-based playtesting used the local app as a shell around API state; it was not dependent on a stable production UI.

Typical flow:

1. Start the local app with `HOST=127.0.0.1 PORT=3000 npm run dev`.
2. Call `POST /api/battle/start` with a Showdown team import, trainer style, and seed.
3. Repeatedly inspect legal choices and call `POST /api/battle/turn` with the selected move or switch.
4. Record the seed, trainer style, and final result in the relevant issue or handoff note.

## Troubleshooting

- Use `--workers 1` when debugging deterministic behavior.
- Use `--workers auto` for normal local training runs.
- If a run is slow, profile before changing simulator semantics; all battle transitions should remain Showdown-backed.
- If port `3000` is already in use, reuse the running app when it is this repo or start another port with `PORT=<port>`.
- If generated Next artifacts appear while the dev server is running, avoid committing transient `.next` output.
