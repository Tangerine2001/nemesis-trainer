# MVP Outline

The first useful version should prove the adversarial trainer loop without requiring a large backend.

## Must Have

- Pokemon Showdown text import.
- Basic parse validation for one supported format.
- Team weakness analysis.
- Deterministic adversarial trainer generation.
- Three initial trainer styles.
- A matchup explanation for each trainer.
- One or two suggested team changes.
- Shareable challenge payloads.

## Initial Trainer Styles

Start with three archetypes:

- `Fast Pressure`: punishes teams with poor speed control.
- `Wallbreaker`: punishes fragile defensive cores and passive teams.
- `Setup Snowball`: punishes teams without status, phazing, priority, or revenge-killing.

Each generated trainer should include:

- roster
- likely lead
- first three-turn plan
- why it beats the user
- user's best counterplay
- one suggested team edit

## Should Have

- Local sample teams for demos.
- Deterministic seeds so results can be reproduced.
- Static pages for common threats and archetypes.
- A daily or weekly boss challenge.
- Simple difficulty controls.

## Defer

- Accounts.
- Cloud team saves.
- Live PvP.
- Ranked ladder.
- Chat or social features.
- Full-dex support across every generation.
- Expensive LLM generation in the default flow.

## First Technical Slice

1. Build a team parser around Showdown-compatible text.
2. Normalize team data into a typed internal model.
3. Compute simple type, speed, role, and archetype gaps.
4. Generate deterministic trainer candidates.
5. Return a shareable JSON payload or compressed URL payload.
6. Add the Showdown simulation boundary after the static audit loop works.
