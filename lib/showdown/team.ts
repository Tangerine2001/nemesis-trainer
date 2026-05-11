import {Teams} from "pokemon-showdown/dist/sim/teams";
import {TeamValidator} from "pokemon-showdown/dist/sim/team-validator";
import type {PokemonSet} from "pokemon-showdown/dist/sim/teams";
import type {BossPokemon, StatId, SupportedFormat, Team, TeamMember} from "@/lib/types";

const STAT_IDS: StatId[] = ["hp", "atk", "def", "spa", "spd", "spe"];

type FullStats = Record<StatId, number>;

interface BossBattleSet {
  nature: string;
  evs: FullStats;
  ivs?: Partial<FullStats>;
}

const BOSS_SET_DETAILS: Record<string, BossBattleSet> = {
  "cinderace": {nature: "Jolly", evs: physicalFast()},
  "cloyster": {nature: "Adamant", evs: physicalFast()},
  "dragapult": {nature: "Timid", evs: specialFast()},
  "dragonite": {nature: "Adamant", evs: physicalFast()},
  "gholdengo": {nature: "Timid", evs: specialFast()},
  "glimmora": {nature: "Timid", evs: specialFast()},
  "heatran": {nature: "Calm", evs: {hp: 252, atk: 0, def: 0, spa: 4, spd: 252, spe: 0}},
  "ironmoth": {nature: "Timid", evs: specialFast()},
  "ironvaliant": {nature: "Jolly", evs: physicalFast()},
  "kingambit": {nature: "Adamant", evs: {hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0}},
  "meowscarada": {nature: "Jolly", evs: physicalFast()},
  "ogerponwellspring": {nature: "Jolly", evs: physicalFast()},
  "ragingbolt": {nature: "Modest", evs: {hp: 0, atk: 0, def: 4, spa: 252, spd: 0, spe: 252}},
  "samurotthisui": {nature: "Jolly", evs: physicalFast()},
  "tyranitar": {nature: "Adamant", evs: physicalFast()},
  "ursalunabloodmoon": {nature: "Modest", evs: {hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0}},
  "walkingwake": {nature: "Timid", evs: specialFast()},
  "weavile": {nature: "Jolly", evs: physicalFast()},
  "zamazenta": {nature: "Jolly", evs: {hp: 252, atk: 0, def: 88, spa: 0, spd: 0, spe: 168}}
};

export interface PackedTeamResult {
  packed: string;
  sets: PokemonSet[];
  problems: string[];
}

export function packUserTeam(team: Team): PackedTeamResult {
  const imported = Teams.import(team.rawText);
  const sets = imported ?? team.members.map(teamMemberToSet);
  return validateAndPack(sets, team.format);
}

export function packBossTeam(roster: BossPokemon[], format: SupportedFormat): PackedTeamResult {
  const sets = roster.map(bossPokemonToSet);
  return validateAndPack(sets, format);
}

function validateAndPack(sets: PokemonSet[], format: SupportedFormat): PackedTeamResult {
  const problems = TeamValidator.get(format).validateTeam(sets) ?? [];
  return {
    sets,
    packed: problems.length ? "" : Teams.pack(sets),
    problems
  };
}

function teamMemberToSet(member: TeamMember): PokemonSet {
  return {
    name: member.name === member.species ? "" : member.name,
    species: member.species,
    item: member.item ?? "",
    ability: member.ability ?? "",
    moves: member.moves,
    nature: member.nature ?? "Serious",
    gender: "",
    evs: completeStats(member.evs, 0),
    ivs: completeStats(member.ivs, 31),
    level: member.level ?? 100,
    teraType: member.teraType
  };
}

function bossPokemonToSet(member: BossPokemon): PokemonSet {
  const details = BOSS_SET_DETAILS[toSetId(member.species)] ?? {nature: "Serious", evs: specialFast()};
  return {
    name: "",
    species: member.species,
    item: member.item,
    ability: member.ability,
    moves: member.moves,
    nature: details.nature,
    gender: "",
    evs: details.evs,
    ivs: completeStats(details.ivs ?? {}, 31),
    level: 100,
    teraType: member.teraType
  };
}

function completeStats(stats: Partial<Record<StatId, number>>, fallback: number): FullStats {
  return STAT_IDS.reduce((complete, stat) => {
    complete[stat] = stats[stat] ?? fallback;
    return complete;
  }, {} as FullStats);
}

function physicalFast(): FullStats {
  return {hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252};
}

function specialFast(): FullStats {
  return {hp: 0, atk: 0, def: 4, spa: 252, spd: 0, spe: 252};
}

function toSetId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
