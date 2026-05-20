# Nemesis Trainer

`nemesis-trainer` is an early product repo for adversarial team-testing logic and AI battler experiments.

Core idea:

> Paste your team. Meet the trainer built to beat it.

The product should eventually generate a custom boss trainer that exposes weaknesses in the user's team, explain why the matchup is hard, and suggest counterplay or team edits. The current repo intentionally has no frontend or backend app surface so the core logic can stay cheap to develop and run locally.

## Docs

- [Project vision](docs/project-vision.md)
- [MVP outline](docs/mvp.md)
- [Battle simulation architecture](docs/battle-simulation.md)
- [AI trainer strategy](docs/ai-trainer-strategy.md)
- [Data and content plan](docs/data-and-content.md)
- [Monetization and risk notes](docs/monetization-and-risk.md)

## Battle Simulation

Battle mechanics should come from Smogon's Pokemon Showdown simulator, not a hand-rolled battle engine.

References:

- https://github.com/smogon/pokemon-showdown
- https://github.com/smogon/pokemon-showdown/blob/master/sim/README.md
- https://github.com/smogon/pokemon-showdown/blob/master/COMMANDLINE.md

## Current Status

The Next app and API routes have been removed. The remaining code is a TypeScript library and CLI/test workspace for team import, weakness analysis, deterministic boss trainer generation, Showdown-backed simulation, AI arena runs, and heuristic evolution.
