# Draft Mega Stone Rules

Nemesis Trainer supports an optional league-rules layer for draft formats where several brought Pokemon can be Mega-capable, every Mega-capable Pokemon must hold its Mega Stone, and only one of those Pokemon may Mega evolve in battle.

This is an advanced add-on. The default product path remains standard Showdown-compatible team analysis and battle simulation.

## Request Shape

Pass `leagueRules` on audit or battle requests:

```ts
{
  megaMode: "draft-forced-stones",
  maxMegaEvolutionsPerBattle: 1,
  selectedMegaSpecies: "Mega Delphox",
  megaStoneBySpecies: {
    "Mega Delphox": "Delphoxite",
    "Mega Golurk": "Golurkite"
  }
}
```

`megaStoneBySpecies` is the source of truth for Champions-style custom Megas. If a species name starts with `Mega ` and no explicit mapping is provided, the rules layer can infer a display item such as `Delphoxite`; this is only a convenience fallback.

## Behavior

- `megaMode: "standard"` or missing `leagueRules` leaves teams unchanged.
- `draft-forced-stones` item-locks configured Mega-capable Pokemon to their stones.
- Conflicting items are replaced in the resolved team and returned as warnings.
- Missing items are filled with the forced Mega Stone and returned as warnings.
- `selectedMegaSpecies` marks the one Pokemon allowed to Mega evolve this battle.
- Other Mega-capable Pokemon still hold their stones and lose normal item value.

## Showdown Boundary

The current implementation models the item-lock cost and one-Mega selection intent. It does not add Champions custom forms, stats, or Mega evolution mechanics to Pokemon Showdown.

Rules-active teams are packed from resolved parsed members instead of raw import text so the forced item changes are visible to Showdown validation. Standard teams still use the existing raw Showdown import path.

Exact custom Mega battle mechanics require a future custom Showdown format or mod data integration.
