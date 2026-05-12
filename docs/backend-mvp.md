# Backend MVP

The MVP backend should be a thin Node and TypeScript layer inside the Next.js project.

Do not start with a separate service unless the first implementation proves that the simulator path needs isolation.

## Shape

Use Next.js route handlers and shared domain modules:

```text
app/
  api/
    analyze/route.ts
    simulate/route.ts
lib/
  team-parser/
  analysis/
  boss-generator/
  share/
  showdown/
data/
  samples/
  generated/
```

The default product loop should remain mostly client-heavy:

1. Parse a pasted Pokemon Showdown team.
2. Normalize it into a typed internal team model.
3. Run basic weakness analysis.
4. Generate deterministic boss trainer candidates.
5. Render a shareable result from payload plus seed.

## Route Handlers

Start with only the endpoints that are useful for the MVP:

- `POST /api/analyze`: accepts pasted team text, format, and optional seed; returns normalized team data, weakness signals, boss candidate, and explanation.
- `POST /api/simulate`: optional at first; calls the Showdown boundary only when a matchup needs mechanics-backed validation.

If the analysis can run safely in the browser, keep the route as a fallback for large payloads or server-side validation.

## Domain Modules

Keep product logic outside route files.

Preferred module boundaries:

- `team-parser`: Showdown-compatible import parsing and validation adapters.
- `analysis`: type, speed, role, item, and archetype weakness scoring.
- `boss-generator`: deterministic adversarial roster generation from analysis signals and seed.
- `share`: compressed URL payloads and result reconstruction.
- `showdown`: thin boundary around Pokemon Showdown parsing, validation, simulation, and logs.

## Persistence

Avoid a database for the first useful version.

Shareable results should be reconstructed from:

- imported team payload
- selected format
- seed
- data version
- trainer style

Use short-lived server storage only if compressed URLs become too large.

## Success Criteria

The MVP backend is successful when it can:

- accept one supported Showdown team format
- return deterministic audit JSON
- produce the same boss result from the same payload and seed
- keep Showdown integration behind a narrow interface
- run without accounts, long-lived sessions, or persistent battle servers
