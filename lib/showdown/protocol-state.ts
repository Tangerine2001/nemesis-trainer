import type {BattlePokemonView, BattleSideCondition, BattleSideView} from "@/lib/types";

export type BattleProtocolSide = "p1" | "p2";
export type BoostId = "atk" | "def" | "spa" | "spd" | "spe" | "accuracy" | "evasion";
export type BoostTable = Partial<Record<BoostId, number>>;

export interface BattleProtocolState {
  boosts: Map<string, BoostTable>;
  sideConditions: Record<BattleProtocolSide, Map<string, BattleSideCondition>>;
  fieldConditions: Map<string, BattleSideCondition>;
}

const BOOST_IDS = new Set(["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"]);

export function createBattleProtocolState(): BattleProtocolState {
  return {
    boosts: new Map(),
    sideConditions: {p1: new Map(), p2: new Map()},
    fieldConditions: new Map()
  };
}

export function applyProtocolLineToState(parts: string[], state: BattleProtocolState): void {
  const command = parts[1];
  if (command === "switch" || command === "drag") {
    state.boosts.delete(normalizeIdent(parts[2]));
    return;
  }

  if (command === "-boost" || command === "-unboost") {
    updateBoost(parts[2], parts[3], command === "-boost" ? Number(parts[4] ?? 1) : -Number(parts[4] ?? 1), state);
    return;
  }

  if (command === "-clearboost") {
    state.boosts.delete(normalizeIdent(parts[2]));
    return;
  }

  if (command === "-sidestart") {
    updateSideCondition(parts[2], parts[3], 1, state);
    return;
  }

  if (command === "-sideend") {
    removeSideCondition(parts[2], parts[3], state);
    return;
  }

  if (command === "-fieldstart" || command === "-weather") {
    const condition = conditionFromEffect(parts[2] ?? parts[3]);
    if (condition) state.fieldConditions.set(condition.id, condition);
    return;
  }

  if (command === "-fieldend") {
    const condition = conditionFromEffect(parts[2]);
    if (condition) state.fieldConditions.delete(condition.id);
  }
}

export function sideViewWithProtocolState(
  base: BattleSideView,
  side: BattleProtocolSide,
  protocolState: BattleProtocolState
): BattleSideView {
  const pokemon = base.pokemon.map((member) => pokemonWithBoosts(member, protocolState));
  const conditions = [
    ...protocolState.sideConditions[side].values(),
    ...protocolState.fieldConditions.values()
  ];
  return {...base, pokemon, conditions: conditions.length ? conditions : undefined};
}

function pokemonWithBoosts(pokemon: BattlePokemonView, state: BattleProtocolState): BattlePokemonView {
  const boosts = state.boosts.get(normalizeIdent(pokemon.ident));
  return boosts && Object.keys(boosts).length ? {...pokemon, boosts: {...boosts}} : pokemon;
}

function updateBoost(ident: string | undefined, stat: string | undefined, delta: number, state: BattleProtocolState): void {
  if (!ident || !isBoostId(stat) || !Number.isFinite(delta)) return;
  const key = normalizeIdent(ident);
  const current = state.boosts.get(key) ?? {};
  current[stat] = clamp((current[stat] ?? 0) + delta, -6, 6);
  state.boosts.set(key, current);
}

function updateSideCondition(sideName: string | undefined, effect: string | undefined, layers: number, state: BattleProtocolState): void {
  const side = protocolSide(sideName);
  const condition = conditionFromEffect(effect);
  if (!side || !condition) return;
  const existing = state.sideConditions[side].get(condition.id);
  state.sideConditions[side].set(condition.id, {
    ...condition,
    layers: condition.id === "spikes" || condition.id === "toxicspikes" ? Math.min(3, (existing?.layers ?? 0) + layers) : condition.layers
  });
}

function removeSideCondition(sideName: string | undefined, effect: string | undefined, state: BattleProtocolState): void {
  const side = protocolSide(sideName);
  const condition = conditionFromEffect(effect);
  if (!side || !condition) return;
  state.sideConditions[side].delete(condition.id);
}

function protocolSide(value: string | undefined): BattleProtocolSide | undefined {
  if (!value) return undefined;
  if (value.startsWith("p1")) return "p1";
  if (value.startsWith("p2")) return "p2";
  return undefined;
}

function conditionFromEffect(effect: string | undefined): BattleSideCondition | undefined {
  const label = effect?.replace(/^(move|item|ability): /, "");
  if (!label) return undefined;
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!id) return undefined;
  return {id, label};
}

function normalizeIdent(ident: string | undefined): string {
  return ident?.replace(/^(p[12])[a-z](?=:)/, "$1") ?? "";
}

function isBoostId(value: string | undefined): value is BoostId {
  return Boolean(value && BOOST_IDS.has(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
