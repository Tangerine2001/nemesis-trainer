# Nemesis Trainer

`nemesis-trainer` is an early product repo for an adversarial team-testing website.

Core idea:

> Paste your team. Meet the trainer built to beat it.

The site should generate a custom boss trainer that exposes weaknesses in the user's team, explain why the matchup is hard, and suggest counterplay or team edits. The goal is a useful, shareable tool that can run with minimal backend infrastructure and eventually support passive ad revenue.

## Docs

- [Project vision](docs/project-vision.md)
- [MVP outline](docs/mvp.md)
- [Battle simulation architecture](docs/battle-simulation.md)
- [AI trainer strategy](docs/ai-trainer-strategy.md)
- [Data and content plan](docs/data-and-content.md)
- [Monetization and risk notes](docs/monetization-and-risk.md)
- [Backend MVP](docs/backend-mvp.md)
- [Backend later](docs/backend-later.md)
- [Backend avoid for now](docs/backend-avoid-for-now.md)

## Battle Simulation

Battle mechanics should come from Smogon's Pokemon Showdown simulator, not a hand-rolled battle engine.

References:

- https://github.com/smogon/pokemon-showdown
- https://github.com/smogon/pokemon-showdown/blob/master/sim/README.md
- https://github.com/smogon/pokemon-showdown/blob/master/COMMANDLINE.md

## Current Status

This repository is documentation-first. The first implementation should begin with team import, weakness analysis, deterministic boss trainer generation, and a thin Showdown-backed simulation boundary.
