import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import dexPkg from "pokemon-showdown/dist/sim/dex.js";
import learnsetsPkg from "pokemon-showdown/dist/data/learnsets.js";

const {Dex} = dexPkg;
const {Learnsets} = learnsetsPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "public", "data", "builder", "gen9ou.json");
const STAT_IDS = ["hp", "atk", "def", "spa", "spd", "spe"];
const OU_TIERS = new Set(["OU", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU", "PUBL", "PU", "ZUBL", "ZU", "NFE", "LC"]);

function isStandard(entry) {
  return entry.exists && !entry.isNonstandard;
}

function sortByName(left, right) {
  return left.name.localeCompare(right.name);
}

const movesById = new Map(
  Dex.moves
    .all()
    .filter(isStandard)
    .map((move) => [
      move.id,
      {
        id: move.id,
        name: move.name,
        type: move.type,
        category: move.category,
        basePower: move.basePower || 0,
        accuracy: move.accuracy === true ? true : move.accuracy || 0,
        pp: move.pp || 0,
        priority: move.priority || 0,
        target: move.target,
        shortDesc: move.shortDesc || ""
      }
    ])
);

const species = Dex.species
  .all()
  .filter((pokemon) => {
    if (!isStandard(pokemon)) return false;
    if (pokemon.num <= 0) return false;
    if (pokemon.tier && pokemon.tier.startsWith("CAP")) return false;
    return !pokemon.battleOnly;
  })
  .map((pokemon) => {
    const abilities = Object.values(pokemon.abilities).filter(Boolean);
    const learnset = Learnsets[pokemon.id]?.learnset ?? {};
    const legalMoves = Object.keys(learnset)
      .filter((moveId) => movesById.has(moveId))
      .sort((left, right) => movesById.get(left).name.localeCompare(movesById.get(right).name));

    return {
      id: pokemon.id,
      name: pokemon.name,
      types: pokemon.types,
      baseStats: STAT_IDS.reduce((stats, stat) => {
        stats[stat] = pokemon.baseStats[stat] ?? 0;
        return stats;
      }, {}),
      abilities,
      tier: pokemon.tier || "Unranked",
      isUsuallyLegalInOu: !pokemon.tier || OU_TIERS.has(pokemon.tier),
      moves: legalMoves
    };
  })
  .sort(sortByName);

const items = Dex.items
  .all()
  .filter((item) => isStandard(item) && item.id !== "noitem")
  .map((item) => ({
    id: item.id,
    name: item.name,
    shortDesc: item.shortDesc || ""
  }))
  .sort(sortByName);

const abilities = Dex.abilities
  .all()
  .filter(isStandard)
  .map((ability) => ({
    id: ability.id,
    name: ability.name,
    shortDesc: ability.shortDesc || ""
  }))
  .sort(sortByName);

const moves = [...movesById.values()].sort(sortByName);
const natures = Dex.natures
  .all()
  .map((nature) => ({
    id: nature.id,
    name: nature.name,
    plus: nature.plus || null,
    minus: nature.minus || null
  }))
  .sort(sortByName);

const payload = {
  format: "gen9ou",
  source: {
    package: "pokemon-showdown",
    version: "0.11.10"
  },
  types: Dex.types.all().filter((type) => type.exists).map((type) => type.name),
  stats: STAT_IDS,
  species,
  items,
  abilities,
  moves,
  natures
};

mkdirSync(dirname(OUT_FILE), {recursive: true});
writeFileSync(OUT_FILE, `${JSON.stringify(payload)}\n`);
console.log(`Wrote ${OUT_FILE}`);
