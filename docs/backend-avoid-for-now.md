# Backend Avoid For Now

Avoid backend systems that make the MVP expensive, fragile, or slow to ship before the core adversarial audit loop is proven.

## Do Not Build First

Do not start with:

- a separate backend service
- a database-first architecture
- account registration
- cloud team saves
- payment flows
- persistent battle servers
- live matchmaking
- ranked ladders
- chat
- realtime spectator features
- moderation systems
- high-volume LLM generation in the default path

These systems solve problems the MVP does not yet have.

## Avoid Custom Battle Mechanics

Do not build a custom battle simulator.

Pokemon battle mechanics include too many interacting rules for this project to safely reproduce:

- abilities
- items
- move effects
- speed order
- weather
- terrain
- field state
- generation differences
- legality rules
- edge cases

Use Pokemon Showdown as the source of truth for mechanics and legality.

## Avoid Early Infrastructure Commitments

Avoid infrastructure that locks the product into unnecessary complexity:

- queues before batch jobs exist
- distributed workers before simulation load is measured
- long-lived sessions before interactive battles exist
- durable storage before compressed share payloads fail
- external auth before saved-user features are validated

Prefer static pages, cached JSON, deterministic generation, and small stateless endpoints.

## Avoid Hidden Or Expensive AI

Do not make LLM calls part of the default user path.

The core trainer should be generated from explainable rules, scored weaknesses, deterministic seeds, and Showdown-backed validation. LLMs may be useful later for optional copy variation or assisted explanation drafts, but they should not be required to generate every audit.

## Avoid Thin Content At Scale

Do not mass-produce pages that only reformat usage stats or scraped text.

Ad-supported pages should contain original analysis:

- why the matchup is hard
- what sequence creates pressure
- what the user can change
- how an archetype functions
- what assumptions the analysis uses
