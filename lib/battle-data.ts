import {POKEMON_TYPES, type PokemonType, type StatId} from "@/lib/types";

export interface SpeciesDatum {
  types: PokemonType[];
  baseSpeed: number;
}

const species: Record<string, SpeciesDatum> = {
  "baxcalibur": {types: ["Dragon", "Ice"], baseSpeed: 87},
  "chienpao": {types: ["Dark", "Ice"], baseSpeed: 135},
  "cinderace": {types: ["Fire"], baseSpeed: 119},
  "clefable": {types: ["Fairy"], baseSpeed: 60},
  "corviknight": {types: ["Flying", "Steel"], baseSpeed: 67},
  "dondozo": {types: ["Water"], baseSpeed: 35},
  "dragonite": {types: ["Dragon", "Flying"], baseSpeed: 80},
  "dragapult": {types: ["Dragon", "Ghost"], baseSpeed: 142},
  "flutter mane": {types: ["Ghost", "Fairy"], baseSpeed: 135},
  "garchomp": {types: ["Dragon", "Ground"], baseSpeed: 102},
  "garganacl": {types: ["Rock"], baseSpeed: 35},
  "gholdengo": {types: ["Steel", "Ghost"], baseSpeed: 84},
  "glimmora": {types: ["Rock", "Poison"], baseSpeed: 86},
  "gouging fire": {types: ["Fire", "Dragon"], baseSpeed: 91},
  "great tusk": {types: ["Ground", "Fighting"], baseSpeed: 87},
  "heatran": {types: ["Fire", "Steel"], baseSpeed: 77},
  "iron valiant": {types: ["Fairy", "Fighting"], baseSpeed: 116},
  "kingambit": {types: ["Dark", "Steel"], baseSpeed: 50},
  "landorustherian": {types: ["Ground", "Flying"], baseSpeed: 91},
  "landorus-therian": {types: ["Ground", "Flying"], baseSpeed: 91},
  "meowscarada": {types: ["Grass", "Dark"], baseSpeed: 123},
  "ogerponwellspring": {types: ["Grass", "Water"], baseSpeed: 110},
  "ogerpon-wellspring": {types: ["Grass", "Water"], baseSpeed: 110},
  "raging bolt": {types: ["Electric", "Dragon"], baseSpeed: 75},
  "rillaboom": {types: ["Grass"], baseSpeed: 85},
  "rotomwash": {types: ["Electric", "Water"], baseSpeed: 86},
  "rotom-wash": {types: ["Electric", "Water"], baseSpeed: 86},
  "samurotthisui": {types: ["Water", "Dark"], baseSpeed: 85},
  "samurott-hisui": {types: ["Water", "Dark"], baseSpeed: 85},
  "skeledirge": {types: ["Fire", "Ghost"], baseSpeed: 66},
  "skarmory": {types: ["Steel", "Flying"], baseSpeed: 70},
  "tinglu": {types: ["Dark", "Ground"], baseSpeed: 45},
  "ting-lu": {types: ["Dark", "Ground"], baseSpeed: 45},
  "tyranitar": {types: ["Rock", "Dark"], baseSpeed: 61},
  "ursalunabloodmoon": {types: ["Ground", "Normal"], baseSpeed: 52},
  "ursaluna-bloodmoon": {types: ["Ground", "Normal"], baseSpeed: 52},
  "volcarona": {types: ["Bug", "Fire"], baseSpeed: 100},
  "walking wake": {types: ["Water", "Dragon"], baseSpeed: 109},
  "weavile": {types: ["Dark", "Ice"], baseSpeed: 125},
  "zamazenta": {types: ["Fighting"], baseSpeed: 138}
};

export function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getSpeciesDatum(speciesName: string): SpeciesDatum | undefined {
  return species[toId(speciesName)] ?? species[speciesName.toLowerCase()];
}

export function isPokemonType(value: string): value is PokemonType {
  return (POKEMON_TYPES as readonly string[]).includes(value);
}

export const STAT_ALIASES: Record<string, StatId> = {
  hp: "hp",
  atk: "atk",
  attack: "atk",
  def: "def",
  defense: "def",
  spa: "spa",
  "sp. atk": "spa",
  spatk: "spa",
  spd: "spd",
  "sp. def": "spd",
  spdef: "spd",
  spe: "spe",
  speed: "spe"
};

export const MOVE_TYPES: Record<string, PokemonType> = {
  "air slash": "Flying",
  "aqua jet": "Water",
  "aqua step": "Water",
  "body press": "Fighting",
  "brave bird": "Flying",
  "bullet punch": "Steel",
  "ceaseless edge": "Dark",
  "close combat": "Fighting",
  "crunch": "Dark",
  "dark pulse": "Dark",
  "dragon darts": "Dragon",
  "dragon dance": "Dragon",
  "dragon tail": "Dragon",
  "draco meteor": "Dragon",
  "earth power": "Ground",
  "earthquake": "Ground",
  "electro drift": "Electric",
  "extreme speed": "Normal",
  "fiery dance": "Fire",
  "fire blast": "Fire",
  "fire punch": "Fire",
  "flamethrower": "Fire",
  "flare blitz": "Fire",
  "flower trick": "Grass",
  "focus blast": "Fighting",
  "giga drain": "Grass",
  "gold rush": "Steel",
  "headlong rush": "Ground",
  "hydro pump": "Water",
  "ice beam": "Ice",
  "ice shard": "Ice",
  "icicle crash": "Ice",
  "iron head": "Steel",
  "knock off": "Dark",
  "lava plume": "Fire",
  "make it rain": "Steel",
  "moonblast": "Fairy",
  "mortal spin": "Poison",
  "mystical fire": "Fire",
  "outrage": "Dragon",
  "play rough": "Fairy",
  "power whip": "Grass",
  "psyshock": "Psychic",
  "psychic": "Psychic",
  "rapid spin": "Normal",
  "raging fury": "Fire",
  "sacred sword": "Fighting",
  "salt cure": "Rock",
  "shadow ball": "Ghost",
  "shadow sneak": "Ghost",
  "sludge bomb": "Poison",
  "spirit break": "Fairy",
  "stone edge": "Rock",
  "stored power": "Psychic",
  "sucker punch": "Dark",
  "surf": "Water",
  "surging strikes": "Water",
  "tera blast": "Normal",
  "thunderbolt": "Electric",
  "thunderclap": "Electric",
  "triple axel": "Ice",
  "u-turn": "Bug",
  "waterfall": "Water",
  "wave crash": "Water",
  "wild charge": "Electric"
};

export const PRIORITY_MOVES = new Set([
  "aqua jet",
  "bullet punch",
  "extreme speed",
  "ice shard",
  "mach punch",
  "quick attack",
  "shadow sneak",
  "sucker punch",
  "thunderclap"
]);

export const SPEED_CONTROL_MOVES = new Set([
  "agility",
  "icy wind",
  "rock tomb",
  "scary face",
  "sticky web",
  "tailwind",
  "thunder wave",
  "trick room"
]);

export const HAZARD_MOVES = new Set(["ceaseless edge", "spikes", "stealth rock", "sticky web", "toxic spikes"]);
export const HAZARD_REMOVAL_MOVES = new Set(["defog", "mortal spin", "rapid spin", "tidy up"]);
export const SETUP_ANSWER_MOVES = new Set(["clear smog", "dragon tail", "encore", "haze", "roar", "taunt", "whirlwind"]);
export const DISRUPTION_MOVES = new Set([
  "encore",
  "knock off",
  "spore",
  "taunt",
  "thunder wave",
  "toxic",
  "trick",
  "will-o-wisp",
  "yawn"
]);

export const TYPE_CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  Normal: {Rock: 0.5, Ghost: 0, Steel: 0.5},
  Fire: {Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2},
  Water: {Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5},
  Electric: {Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5},
  Grass: {Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5},
  Ice: {Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5},
  Fighting: {Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5},
  Poison: {Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2},
  Ground: {Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2},
  Flying: {Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5},
  Psychic: {Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5},
  Bug: {Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5},
  Rock: {Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5},
  Ghost: {Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5},
  Dragon: {Dragon: 2, Steel: 0.5, Fairy: 0},
  Dark: {Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5},
  Steel: {Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2},
  Fairy: {Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5}
};

export function moveType(move: string): PokemonType | undefined {
  return MOVE_TYPES[move.toLowerCase()];
}

export function typeEffectiveness(attackType: PokemonType, defenderTypes: PokemonType[]): number {
  return defenderTypes.reduce((multiplier, defenderType) => {
    return multiplier * (TYPE_CHART[attackType][defenderType] ?? 1);
  }, 1);
}
