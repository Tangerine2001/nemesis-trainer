# AGENTS

This repository is `nemesis-trainer`.

Future Codex agents should treat this as an early-stage product repo for a lightweight, ad-supported web tool where users paste or build a competitive monster-battling team and receive an adversarial trainer designed to expose that team's worst matchup.

## Product Direction

Working product name: `Nemesis Trainer`.

Core promise:

> Paste your team. Meet the trainer built to beat it.

The product should feel like a team builder, matchup lab, and final-boss generator. It should not be framed as another generic AI team generator.

## Key Constraints

- Keep the first useful version mostly static or client-heavy.
- Do not require accounts for the MVP.
- Do not build live matchmaking for the MVP.
- Do not build chat, ladder integrity, moderation, or persistent multiplayer systems for the MVP.
- Make generated audits and trainers shareable by URL.
- Favor deterministic generation, cached JSON, static pages, and cheap stateless services.
- Avoid high-volume LLM calls in the default user path.

## Battle Simulation Requirement

Use Smogon's Pokemon Showdown simulator as the source of truth for battle mechanics.

Preferred approaches:

- call the canonical `smogon/pokemon-showdown` simulator from a Node/TypeScript service or worker
- use a browser-compatible extraction that stays close to Showdown's `sim/` layer only if it materially improves the architecture
- use `@smogon/calc` for damage-calculation pages when full battle state simulation is unnecessary

Do not build a full custom battle simulator as the long-term mechanics engine. Pokemon battle mechanics are too broad for this project to reproduce safely.

Useful upstream references:

- https://github.com/smogon/pokemon-showdown
- https://github.com/smogon/pokemon-showdown/blob/master/sim/README.md
- https://github.com/smogon/pokemon-showdown/blob/master/sim/SIM-PROTOCOL.md
- https://github.com/smogon/pokemon-showdown/blob/master/COMMANDLINE.md

## AI Trainer Intent

The default AI direction is deterministic and explainable, not ML-first.

Preferred baseline:

- team weakness analysis
- adversarial boss-team generation
- rule-based action scoring
- minimax search where runtime permits
- alpha-beta pruning where useful
- configurable trainer styles and difficulty

ML can be explored later, but it should build on top of a correct Showdown-backed simulator and a strong deterministic baseline.

## Engineering Guidance

- Use Pokemon Showdown-compatible team import/export formats.
- Separate team parsing, weakness analysis, boss generation, battle simulation, and explanation generation.
- Keep battle execution deterministic and reproducible by seed.
- Use structured data and parsers instead of ad hoc string manipulation.
- Prefer a narrow supported format before trying full-dex, all-generation support.
- PokeAPI may be useful for descriptive metadata, but it is not authoritative for battle mechanics or legality.
- Smogon monthly usage stats can inform meta threat lists, but pages should add original analysis.
- Avoid product names or public branding that include `Pokemon`, `Cynthia`, or `GPT`.
- Use carefully licensed or original assets; do not assume official artwork, sprites, or logos are safe for ad-supported use.

## Primary Docs

- [docs/project-vision.md](docs/project-vision.md)
- [docs/mvp.md](docs/mvp.md)
- [docs/battle-simulation.md](docs/battle-simulation.md)
- [docs/ai-trainer-strategy.md](docs/ai-trainer-strategy.md)
- [docs/data-and-content.md](docs/data-and-content.md)
- [docs/monetization-and-risk.md](docs/monetization-and-risk.md)
