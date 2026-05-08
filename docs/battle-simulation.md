# Battle Simulation Architecture

Use Smogon's Pokemon Showdown simulator as the source of truth for battle mechanics.

## Why

Pokemon battle rules include many interacting mechanics:

- move effects
- abilities
- items
- speed order
- field state
- weather and terrain
- generation differences
- clauses and format legality
- edge cases

Reimplementing those mechanics would become the project. Nemesis Trainer's differentiator is adversarial analysis and trainer generation, not simulator authorship.

## Required Source

Use `smogon/pokemon-showdown` for:

- turn resolution
- supported format rules
- legality validation where available
- canonical team parsing conventions
- battle logs and protocol output

References:

- https://github.com/smogon/pokemon-showdown
- https://github.com/smogon/pokemon-showdown/blob/master/sim/README.md
- https://github.com/smogon/pokemon-showdown/blob/master/sim/SIM-PROTOCOL.md
- https://github.com/smogon/pokemon-showdown/blob/master/COMMANDLINE.md

Pokemon Showdown is MIT licensed. Product branding, artwork, and trademark usage still need separate care.

## Integration Options

### Option A: Node Simulation Worker

Run a small Node or TypeScript worker that owns Showdown simulation.

The app can call it for:

- `parseTeam`
- `validateTeam`
- `simulateBattle`
- `scoreMatchup`
- `chooseAction`

This is the preferred default because Showdown is native to the JavaScript and TypeScript ecosystem.

### Option B: Vendored Showdown CLI

Install or vendor Pokemon Showdown and call command-line simulation tools.

This is acceptable for prototypes, offline jobs, and batch analysis. It is less attractive for high-volume request paths because subprocess startup can be wasteful.

### Option C: Browser-Compatible Simulator Package

Use a browser-compatible extraction only if it stays close to Showdown's `sim/` layer and materially improves the architecture.

This may help keep the app client-heavy, but it needs bundle-size and compatibility checks.

## API Boundary

Keep the rest of the app behind a thin interface:

```text
parseTeam(rawText) -> Team
validateTeam(team, format) -> ValidationResult
simulateBattle(leftTeam, rightTeam, format, seed) -> BattleResult
scoreMatchup(userTeam, bossTeam, format) -> MatchupScore
chooseAction(state, trainerConfig) -> Action
```

This lets the implementation move between CLI calls, a Node worker, and browser-compatible packages without rewriting product code.

## Damage Calculations

For pages that only need damage ranges, use `@smogon/calc` rather than full battle simulation.

Use full Showdown simulation when turn order, switching, abilities, items, weather, terrain, or multi-turn state matters.
