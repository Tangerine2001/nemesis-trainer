import {Dex} from "pokemon-showdown/dist/sim/dex";
import {createRng} from "@/lib/boss-generator/random";
import {parseTeam} from "@/lib/team-parser/parser";
import type {StatId, SupportedFormat, TeamMember} from "@/lib/types";

const STAT_IDS: StatId[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const CHAMPIONS_EV_TOTAL_CAP = 66;
const CHAMPIONS_EV_STAT_CAP = 32;

const USEFUL_STATUS_MOVE_WEIGHTS: Record<string, number> = {
  stealthrock: 900,
  spikes: 760,
  stickyweb: 720,
  toxicspikes: 680,
  mortalspin: 760,
  rapidspin: 740,
  defog: 700,
  tidyup: 700,
  recover: 680,
  roost: 680,
  softboiled: 680,
  moonlight: 620,
  synthesis: 620,
  slackoff: 680,
  swordsdance: 650,
  nastyplot: 650,
  calmmind: 620,
  bulkup: 600,
  dragondance: 650,
  shellsmash: 700,
  agility: 520,
  thunderwave: 610,
  willowisp: 590,
  toxic: 560,
  encore: 620,
  taunt: 580,
  substitute: 520,
  trick: 520,
  wish: 560,
  protect: 430
};

const USUALLY_USELESS_MOVES = new Set([
  "celebrate",
  "conversion",
  "conversion2",
  "dreameater",
  "happyhour",
  "holdhands",
  "lastresort",
  "snore",
  "splash",
  "steelroller"
]);

const GOOD_ABILITY_IDS = new Set([
  "adaptability",
  "beastboost",
  "contrary",
  "defiant",
  "flashfire",
  "goodasgold",
  "intimidate",
  "infiltrator",
  "levitate",
  "magicbounce",
  "magicguard",
  "moldbreaker",
  "multiscale",
  "noguard",
  "poisontouch",
  "prankster",
  "protean",
  "regenerator",
  "scrappy",
  "sharpness",
  "sheerforce",
  "stamina",
  "technician",
  "unaware",
  "unburden",
  "voltabsorb",
  "waterabsorb"
]);

interface CompletedDraftSet {
  rawBlock: string;
  generatedMoves: string[];
  normalizedEvs: Partial<Record<StatId, number>>;
}

export function completeDraftRosterBlock(rawBlock: string, format: SupportedFormat, seed: string): CompletedDraftSet {
  const parsed = parseTeam(rawBlock, format);
  const member = parsed.team?.members[0];
  if (!member) return {rawBlock, generatedMoves: [], normalizedEvs: {}};

  const dex = Dex.forFormat(format);
  const species = dex.species.get(member.species);
  if (!species.exists) {
    return {
      rawBlock: stripIvLines(rawBlock),
      generatedMoves: [],
      normalizedEvs: normalizeChampionsEvs(member.evs)
    };
  }

  const rng = createRng(`${seed}:${species.id}:set`);
  const ability = member.ability || chooseAbility(species.abilities);
  const moves = completeMoves(member, format, ability, rng);
  const evs = Object.keys(member.evs).length ? normalizeChampionsEvs(member.evs) : generateChampionsEvs(species.baseStats, moves, dex);
  const nature = member.nature || chooseNature(species.baseStats, moves, dex);

  return {
    rawBlock: formatDraftBlock(rawBlock, {
      member,
      ability,
      evs,
      nature,
      moves
    }),
    generatedMoves: moves.filter((move) => !member.moves.some((existing) => toId(existing) === toId(move))),
    normalizedEvs: evs
  };
}

export function normalizeChampionsEvs(input: Partial<Record<StatId, number>>): Partial<Record<StatId, number>> {
  const positive = STAT_IDS
    .map((stat) => ({stat, value: Math.max(0, Math.trunc(input[stat] ?? 0))}))
    .filter((entry) => entry.value > 0);

  if (!positive.length) return {};

  const capped = Object.fromEntries(positive.map((entry) => [entry.stat, Math.min(entry.value, CHAMPIONS_EV_STAT_CAP)])) as Partial<Record<StatId, number>>;
  const cappedTotal = totalEvs(capped);
  if (cappedTotal <= CHAMPIONS_EV_TOTAL_CAP) return capped;

  const originalTotal = positive.reduce((total, entry) => total + entry.value, 0);
  const scaled = STAT_IDS.reduce((evs, stat) => {
    const original = input[stat] ?? 0;
    evs[stat] = Math.min(CHAMPIONS_EV_STAT_CAP, Math.floor((original / originalTotal) * CHAMPIONS_EV_TOTAL_CAP));
    return evs;
  }, {} as Record<StatId, number>);

  let remaining = CHAMPIONS_EV_TOTAL_CAP - totalEvs(scaled);
  const fractionalOrder = positive
    .map((entry) => ({
      stat: entry.stat,
      fraction: (entry.value / originalTotal) * CHAMPIONS_EV_TOTAL_CAP - Math.floor((entry.value / originalTotal) * CHAMPIONS_EV_TOTAL_CAP)
    }))
    .sort((left, right) => right.fraction - left.fraction || STAT_IDS.indexOf(left.stat) - STAT_IDS.indexOf(right.stat));

  while (remaining > 0) {
    const target = fractionalOrder.find((entry) => (scaled[entry.stat] ?? 0) < CHAMPIONS_EV_STAT_CAP);
    if (!target) break;
    scaled[target.stat] += 1;
    remaining -= 1;
  }

  return cleanEvs(scaled);
}

function completeMoves(
  member: TeamMember,
  format: SupportedFormat,
  ability: string,
  rng: () => number
): string[] {
  const dex = Dex.forFormat(format);
  const species = dex.species.get(member.species);
  const chosen = member.moves.slice(0, 4);
  const chosenIds = new Set(chosen.map(toId));
  const pool = Array.from(dex.species.getMovePool(species.id))
    .filter((moveId) => !chosenIds.has(moveId) && !USUALLY_USELESS_MOVES.has(moveId));

  while (chosen.length < 4 && pool.length) {
    const scored = pool
      .map((moveId) => {
        const move = dex.moves.get(moveId);
        return {
          moveId,
          score: scoreMove({move, species, ability, chosen, dex}) * (0.98 + rng() * 0.04)
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.moveId.localeCompare(right.moveId));

    const selected = scored[0];
    if (!selected) break;
    const move = dex.moves.get(selected.moveId);
    chosen.push(move.name);
    chosenIds.add(selected.moveId);
    pool.splice(pool.indexOf(selected.moveId), 1);
  }

  return chosen;
}

function scoreMove({
  move,
  species,
  ability,
  chosen,
  dex
}: {
  move: ReturnType<typeof Dex.moves.get>;
  species: ReturnType<typeof Dex.species.get>;
  ability: string;
  chosen: string[];
  dex: typeof Dex;
}): number {
  if (!move.exists || move.target === "adjacentAlly") return 0;

  const chosenMoves = chosen.map((name) => dex.moves.get(name));
  const statusCount = chosenMoves.filter((chosenMove) => chosenMove.category === "Status").length;
  if (move.category === "Status") {
    const base = USEFUL_STATUS_MOVE_WEIGHTS[move.id] ?? 180;
    const setupBias = setupMoveMatchesAttacker(move.id, species.baseStats) ? 1.35 : 0.75;
    const duplicateStatusPenalty = statusCount >= 2 ? 0.35 : 1;
    return base * setupBias * duplicateStatusPenalty;
  }

  const moveType = move.type;
  const categoryStat = move.category === "Physical" ? species.baseStats.atk : species.baseStats.spa;
  const accuracy = move.accuracy === true ? 1.1 : Math.max(0.5, move.accuracy / 100);
  const basePower = estimatedBasePower(move.id, move.basePower);
  const stab = species.types.includes(moveType) ? 1.5 : 1;
  const priority = move.priority > 0 ? 1.15 : move.priority < 0 ? 0.7 : 1;
  const categoryBias = categoryStat >= 95 ? 1.2 : categoryStat < 65 ? 0.8 : 1;
  const duplicateTypePenalty = chosenMoves.some((chosenMove) => chosenMove.type === moveType && chosenMove.category !== "Status") ? 0.68 : 1;
  const abilityBias = abilityMoveBias(toId(ability), move);
  return Math.max(1, basePower) * categoryStat * accuracy * stab * priority * categoryBias * duplicateTypePenalty * abilityBias;
}

function generateChampionsEvs(
  baseStats: Record<StatId, number>,
  moves: string[],
  dex: typeof Dex
): Partial<Record<StatId, number>> {
  const role = inferOffensiveRole(moves, dex);
  if (role === "physical") return cleanEvs({hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32});
  if (role === "special") return cleanEvs({hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32});
  if (role === "mixed") return cleanEvs({hp: 0, atk: 16, def: 0, spa: 16, spd: 2, spe: 32});

  const defensiveStat = baseStats.def >= baseStats.spd ? "def" : "spd";
  return cleanEvs({
    hp: 32,
    atk: 0,
    def: defensiveStat === "def" ? 32 : 2,
    spa: 0,
    spd: defensiveStat === "spd" ? 32 : 2,
    spe: 0
  });
}

function chooseAbility(abilities: object): string {
  const pool = Object.values(abilities).filter((ability): ability is string => typeof ability === "string" && Boolean(ability));
  return pool.find((ability) => GOOD_ABILITY_IDS.has(toId(ability))) ?? pool[0] ?? "";
}

function chooseNature(
  baseStats: Record<StatId, number>,
  moves: string[],
  dex: typeof Dex
): string {
  const role = inferOffensiveRole(moves, dex);
  if (role === "physical") return baseStats.spe >= 80 ? "Jolly" : "Adamant";
  if (role === "special") return baseStats.spe >= 80 ? "Timid" : "Modest";
  if (role === "mixed") return baseStats.spe >= 80 ? "Naive" : "Mild";
  return baseStats.def >= baseStats.spd ? "Bold" : "Calm";
}

function formatDraftBlock(
  rawBlock: string,
  complete: {
    member: TeamMember;
    ability: string;
    evs: Partial<Record<StatId, number>>;
    nature: string;
    moves: string[];
  }
): string {
  const lines = rawBlock.replace(/\r\n/g, "\n").trim().split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines[0] ?? complete.member.species;
  const metadata = lines.slice(1).filter((line) => {
    if (line.startsWith("- ")) return false;
    if (line.endsWith(" Nature")) return false;
    const key = line.split(":")[0]?.trim().toLowerCase();
    return !["ability", "evs", "ivs"].includes(key);
  });

  return [
    header,
    complete.ability ? `Ability: ${complete.ability}` : undefined,
    formatEvs(complete.evs),
    ...metadata,
    `${complete.nature} Nature`,
    ...complete.moves.map((move) => `- ${move}`)
  ].filter(Boolean).join("\n");
}

function formatEvs(evs: Partial<Record<StatId, number>>): string | undefined {
  const chunks = STAT_IDS
    .map((stat) => ({stat, value: evs[stat] ?? 0}))
    .filter((entry) => entry.value > 0)
    .map((entry) => `${entry.value} ${statLabel(entry.stat)}`);
  return chunks.length ? `EVs: ${chunks.join(" / ")}` : undefined;
}

function stripIvLines(rawBlock: string): string {
  return rawBlock
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().split(":")[0]?.trim().toLowerCase() !== "ivs")
    .join("\n");
}

function inferOffensiveRole(moves: string[], dex: typeof Dex): "physical" | "special" | "mixed" | "defensive" {
  const counts = moves.reduce((totals, moveName) => {
    const move = dex.moves.get(moveName);
    if (move.category === "Physical") totals.physical += 1;
    if (move.category === "Special") totals.special += 1;
    return totals;
  }, {physical: 0, special: 0});

  if (!counts.physical && !counts.special) return "defensive";
  if (counts.physical >= 2 && counts.special >= 2) return "mixed";
  return counts.physical > counts.special ? "physical" : "special";
}

function setupMoveMatchesAttacker(moveId: string, baseStats: Record<StatId, number>): boolean {
  if (["swordsdance", "bulkup", "dragondance"].includes(moveId)) return baseStats.atk >= baseStats.spa - 10;
  if (["nastyplot", "calmmind"].includes(moveId)) return baseStats.spa >= baseStats.atk - 10;
  return true;
}

function estimatedBasePower(moveId: string, basePower: number): number {
  if (["grassknot", "heatcrash", "heavyslam", "lowkick"].includes(moveId)) return 70;
  if (["gyroball", "electroball"].includes(moveId)) return 80;
  return basePower;
}

function abilityMoveBias(abilityId: string, move: ReturnType<typeof Dex.moves.get>): number {
  if (abilityId === "technician" && move.basePower > 0 && move.basePower <= 60) return 1.4;
  if (abilityId === "sharpness" && move.flags.slicing) return 1.4;
  if (abilityId === "strongjaw" && move.flags.bite) return 1.35;
  if (abilityId === "ironfist" && move.flags.punch) return 1.25;
  if (abilityId === "sheerforce" && (move.secondary || move.secondaries)) return 1.25;
  return 1;
}

function cleanEvs(evs: Partial<Record<StatId, number>>): Partial<Record<StatId, number>> {
  return STAT_IDS.reduce((clean, stat) => {
    const value = Math.min(CHAMPIONS_EV_STAT_CAP, Math.max(0, Math.trunc(evs[stat] ?? 0)));
    if (value > 0) clean[stat] = value;
    return clean;
  }, {} as Partial<Record<StatId, number>>);
}

function totalEvs(evs: Partial<Record<StatId, number>>): number {
  return STAT_IDS.reduce((total, stat) => total + (evs[stat] ?? 0), 0);
}

function statLabel(stat: StatId): string {
  return ({hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"})[stat];
}

function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
