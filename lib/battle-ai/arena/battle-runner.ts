import {BattleStream} from "pokemon-showdown/dist/sim/battle-stream";
import {basicPolicy} from "@/lib/battle-ai/basic-policy";
import {hashString} from "@/lib/boss-generator/random";
import type {AiPokemonRequest, AiRequest} from "@/lib/battle-ai/policy";
import type {
  ArenaAgentVariant,
  ArenaChoiceRecord,
  ArenaGameAgent,
  ArenaGameResult,
  ArenaPerfStats,
  ArenaSide,
  ArenaTeam
} from "@/lib/battle-ai/arena/types";
import type {BattleChoice, BattleLogEntry, BattlePokemonView, BattleSideView, BattleSnapshot} from "@/lib/types";

interface ArenaBattleState {
  p1Request?: AiRequest;
  p2Request?: AiRequest;
  turn: number;
  winner?: ArenaSide | "tie";
  ended: boolean;
  errors: string[];
  log: BattleLogEntry[];
}

interface ArenaCommand {
  side: ArenaSide;
  choice: string;
}

interface RunArenaGameInput {
  id: string;
  seed: string;
  p1: {agent: ArenaGameAgent["id"]; variant: ArenaAgentVariant; team: ArenaTeam};
  p2: {agent: ArenaGameAgent["id"]; variant: ArenaAgentVariant; team: ArenaTeam};
  maxTurns: number;
}

interface ReplayInput extends RunArenaGameInput {
  commands: ArenaCommand[];
}

interface ArenaRuntime {
  replayCache: Map<string, ArenaBattleState>;
  perf: ArenaPerfStats;
}

interface ArenaRequestInfo {
  sideView: BattleSideView;
  quality: ArenaGameResult["final"]["agentA"];
  choices: BattleChoice[];
}

const REQUEST_INFO_CACHE = new WeakMap<AiRequest, ArenaRequestInfo>();
const MAX_REPLAY_CACHE_SIZE = 600;

export function runArenaGame(input: RunArenaGameInput): ArenaGameResult {
  const runtime = createRuntime();
  const state = initializeBattle(input);
  const commands: ArenaCommand[] = [];
  const choices: ArenaChoiceRecord[] = [];
  let fallbackChoices = 0;

  for (let attempts = 0; attempts < input.maxTurns * 6 && !state.ended; attempts += 1) {
    if (state.turn > input.maxTurns) {
      state.ended = true;
      state.winner = "tie";
      state.errors.push(`Reached max turn limit ${input.maxTurns}.`);
      break;
    }

    const p1Choices = enabledChoices(choicesForRequest(state.p1Request, runtime));
    const p2Choices = enabledChoices(choicesForRequest(state.p2Request, runtime));
    if (!p1Choices.length && !p2Choices.length) break;

    const p1Choice = p1Choices.length ? chooseArenaChoice(input, runtime, state, commands, "p1", p1Choices) : undefined;
    const p2Choice = p2Choices.length ? chooseArenaChoice(input, runtime, state, commands, "p2", p2Choices) : undefined;

    if (p1Choice?.fallback) fallbackChoices += 1;
    if (p2Choice?.fallback) fallbackChoices += 1;

    if (p1Choice) {
      writeAndProcess(state.stream, `>p1 ${p1Choice.choice}`, state);
      commands.push({side: "p1", choice: p1Choice.choice});
      choices.push({side: "p1", choice: p1Choice.choice, turn: state.turn, reason: p1Choice.reason, fallback: p1Choice.fallback});
    }
    if (p2Choice) {
      writeAndProcess(state.stream, `>p2 ${p2Choice.choice}`, state);
      commands.push({side: "p2", choice: p2Choice.choice});
      choices.push({side: "p2", choice: p2Choice.choice, turn: state.turn, reason: p2Choice.reason, fallback: p2Choice.fallback});
    }
  }

  const agents: ArenaGameAgent[] = [
    {id: input.p1.agent, variant: input.p1.variant, side: "p1", teamId: input.p1.team.id},
    {id: input.p2.agent, variant: input.p2.variant, side: "p2", teamId: input.p2.team.id}
  ];
  const winner = winnerAgent(state.winner, agents);
  const final = finalQuality(state, agents);

  return {
    id: input.id,
    seed: input.seed,
    winner,
    turns: state.turn,
    fallbackChoices,
    errors: state.errors,
    perf: finishPerf(runtime),
    agents,
    choices,
    final
  };
}

function initializeBattle(input: RunArenaGameInput): ArenaBattleState & {stream: BattleStream} {
  const stream = new BattleStream({noCatch: true});
  const state: ArenaBattleState & {stream: BattleStream} = {stream, turn: 0, ended: false, errors: [], log: []};

  writeAndProcess(stream, `>start ${JSON.stringify({formatid: "gen9ou", seed: seedArray(input.seed)})}`, state);
  writeAndProcess(stream, `>player p1 ${JSON.stringify({name: "Agent A", team: input.p1.team.packed})}`, state);
  writeAndProcess(stream, `>player p2 ${JSON.stringify({name: "Agent B", team: input.p2.team.packed})}`, state);
  writeAndProcess(stream, `>p1 ${teamPreviewChoice(state.p1Request?.side.pokemon.length ?? 6)}`, state);
  writeAndProcess(stream, `>p2 ${teamPreviewChoice(state.p2Request?.side.pokemon.length ?? 6)}`, state);

  return state;
}

function chooseArenaChoice(
  input: RunArenaGameInput,
  runtime: ArenaRuntime,
  state: ArenaBattleState,
  history: ArenaCommand[],
  side: ArenaSide,
  legalChoices: BattleChoice[]
): {choice: string; reason?: string; fallback: boolean} | undefined {
  const variant = side === "p1" ? input.p1.variant : input.p2.variant;
  const request = side === "p1" ? state.p1Request : state.p2Request;
  const snapshot = snapshotForSide(state, side, side, runtime);
  const decision = variant.policy.choose({
    seed: `${input.seed}:${side}:${history.length}`,
    perspective: side === "p1" ? "user" : "nemesis",
    evaluator: variant.evaluator,
    request,
    snapshot,
    legalChoices,
    simulateChoice: (choice) => simulateArenaChoice(input, runtime, history, side, choice),
    simulateUserChoice: (rootChoice, opposingChoice) => simulateArenaChoice(input, runtime, history, side, rootChoice, opposingChoice)
  });

  const selected = decision.choice?.id;
  if (selected && legalChoices.some((choice) => choice.id === selected && !choice.disabled)) {
    return {choice: selected, reason: decision.reason, fallback: false};
  }

  const fallback = basicPolicy.choose({
    seed: `${input.seed}:fallback:${side}:${history.length}`,
    perspective: side === "p1" ? "user" : "nemesis",
    request,
    snapshot,
    legalChoices
  });
  return fallback.choice ? {choice: fallback.choice.id, reason: fallback.reason, fallback: true} : undefined;
}

function simulateArenaChoice(
  input: RunArenaGameInput,
  runtime: ArenaRuntime,
  history: ArenaCommand[],
  side: ArenaSide,
  rootChoice: BattleChoice,
  nextOpposingChoice?: BattleChoice
): BattleSnapshot | undefined {
  try {
    const currentCommands = currentTurnCommands(input, runtime, history, side, rootChoice.id);
    const first = replayArenaGame({...input, commands: [...history, ...currentCommands]}, runtime);
    if (!nextOpposingChoice || first.ended) return snapshotForSide(first, side, oppositeSide(side), runtime);

    const response = chooseBasicResponse(input, runtime, first, side);
    if (!response) return snapshotForSide(first, side, oppositeSide(side), runtime);

    const nextCommands = orderedCommands([
      {side: oppositeSide(side), choice: nextOpposingChoice.id},
      {side, choice: response}
    ]);
    const second = replayArenaGame({...input, commands: [...history, ...currentCommands, ...nextCommands]}, runtime);
    return snapshotForSide(second, side, oppositeSide(side), runtime);
  } catch {
    return undefined;
  }
}

function currentTurnCommands(input: RunArenaGameInput, runtime: ArenaRuntime, history: ArenaCommand[], side: ArenaSide, choice: string): ArenaCommand[] {
  const state = replayArenaGame({...input, commands: history}, runtime);
  const opposingSide = oppositeSide(side);
  const opposingChoice = chooseBasicResponse(input, runtime, state, opposingSide);
  const commands: ArenaCommand[] = [{side, choice}];
  if (opposingChoice) commands.push({side: opposingSide, choice: opposingChoice});
  return orderedCommands(commands);
}

function chooseBasicResponse(input: RunArenaGameInput, runtime: ArenaRuntime, state: ArenaBattleState, side: ArenaSide): string | undefined {
  const request = side === "p1" ? state.p1Request : state.p2Request;
  const legalChoices = enabledChoices(choicesForRequest(request, runtime));
  if (!legalChoices.length) return undefined;

  const decision = basicPolicy.choose({
    seed: `${input.seed}:basic-response:${side}:${state.turn}`,
    perspective: side === "p1" ? "user" : "nemesis",
    request,
    snapshot: snapshotForSide(state, side, side, runtime),
    legalChoices
  });
  return decision.choice?.id;
}

function replayArenaGame(input: ReplayInput, runtime?: ArenaRuntime): ArenaBattleState {
  const cacheKey = runtime ? replayCacheKey(input) : undefined;
  if (runtime && cacheKey) {
    const cached = runtime.replayCache.get(cacheKey);
    if (cached) {
      runtime.perf.replayCacheHits += 1;
      return cached;
    }
  }

  if (runtime) runtime.perf.replays += 1;
  const state = initializeBattle(input);
  for (const command of input.commands) {
    if (state.ended) break;
    writeAndProcess(state.stream, `>${command.side} ${command.choice}`, state);
  }
  if (runtime && cacheKey) cacheReplay(runtime, cacheKey, state);
  return state;
}

function orderedCommands(commands: ArenaCommand[]): ArenaCommand[] {
  return commands.slice().sort((left, right) => (left.side === right.side ? 0 : left.side === "p1" ? -1 : 1));
}

function snapshotForSide(state: ArenaBattleState, side: ArenaSide, choicesSide: ArenaSide, runtime?: ArenaRuntime): BattleSnapshot {
  if (runtime) runtime.perf.snapshots += 1;
  return {
    turn: state.turn,
    ended: state.ended,
    winner: state.winner === "p1" ? "user" : state.winner === "p2" ? "nemesis" : undefined,
    log: state.log.slice(-80),
    user: side === "p1" ? sideView(state.p1Request, "Agent A") : sideView(state.p2Request, "Agent B"),
    opponent: side === "p1" ? sideView(state.p2Request, "Agent B") : sideView(state.p1Request, "Agent A"),
    choices: state.ended ? [] : choicesForRequest(choicesSide === "p1" ? state.p1Request : state.p2Request, runtime),
    errors: state.errors
  };
}

function finalQuality(state: ArenaBattleState, agents: ArenaGameAgent[]): ArenaGameResult["final"] {
  const p1 = qualityForSide(state.p1Request);
  const p2 = qualityForSide(state.p2Request);
  const final = {agentA: p1, agentB: p2};
  for (const agent of agents) {
    final[agent.id] = agent.side === "p1" ? p1 : p2;
  }
  return final;
}

function qualityForSide(request?: AiRequest): {remainingPokemon: number; hpFraction: number} {
  return request ? requestInfo(request).quality : {remainingPokemon: 0, hpFraction: 0};
}

function winnerAgent(winner: ArenaSide | "tie" | undefined, agents: ArenaGameAgent[]): ArenaGameResult["winner"] {
  if (!winner || winner === "tie") return "tie";
  return agents.find((agent) => agent.side === winner)?.id ?? "tie";
}

function choicesForRequest(request: AiRequest | undefined, runtime?: ArenaRuntime): BattleChoice[] {
  if (!request) return [];
  if (runtime && !REQUEST_INFO_CACHE.has(request)) runtime.perf.choiceBuilds += 1;
  return requestInfo(request).choices;
}

export function buildArenaChoicesForTest(request?: AiRequest): BattleChoice[] {
  return request ? requestInfo(request).choices : [];
}

export function buildArenaSideViewForTest(request: AiRequest): BattleSideView {
  return requestInfo(request).sideView;
}

export function qualityForArenaRequestForTest(request: AiRequest): ArenaGameResult["final"]["agentA"] {
  return requestInfo(request).quality;
}

function buildChoices(request?: AiRequest): BattleChoice[] {
  if (!request || request.wait) return [];
  if (request.teamPreview) return [{id: teamPreviewChoice(request.side.pokemon.length), label: "Confirm lead order", kind: "switch"}];

  const forceSwitch = request.forceSwitch?.some(Boolean);
  const choices: BattleChoice[] = [];
  if (!forceSwitch) {
    const moves = request.active?.[0]?.moves ?? [];
    moves.forEach((move, index) => {
      choices.push({id: `move ${index + 1}`, label: move.move, kind: "move", disabled: Boolean(move.disabled) || move.pp <= 0});
    });
  }

  const trapped = request.active?.[0]?.trapped;
  if (!trapped || forceSwitch) {
    request.side.pokemon.forEach((pokemon, index) => {
      if (pokemon.active || isFainted(pokemon.condition)) return;
      choices.push({id: `switch ${index + 1}`, label: `Switch to ${speciesFromDetails(pokemon.details)}`, kind: "switch"});
    });
  }
  return choices;
}

function enabledChoices(choices: BattleChoice[]): BattleChoice[] {
  return choices.filter((choice) => !choice.disabled);
}

function createRuntime(): ArenaRuntime {
  return {
    replayCache: new Map(),
    perf: {elapsedMs: Date.now(), replays: 0, replayCacheHits: 0, snapshots: 0, choiceBuilds: 0}
  };
}

function finishPerf(runtime: ArenaRuntime): ArenaPerfStats {
  return {...runtime.perf, elapsedMs: Date.now() - runtime.perf.elapsedMs};
}

function replayCacheKey(input: ReplayInput): string {
  return `${input.seed}|${input.p1.team.id}|${input.p2.team.id}|${input.commands.map((command) => `${command.side}:${command.choice}`).join(",")}`;
}

function cacheReplay(runtime: ArenaRuntime, key: string, state: ArenaBattleState): void {
  if (runtime.replayCache.size >= MAX_REPLAY_CACHE_SIZE) {
    const oldest = runtime.replayCache.keys().next().value as string | undefined;
    if (oldest) runtime.replayCache.delete(oldest);
  }
  runtime.replayCache.set(key, state);
}

function writeAndProcess(stream: BattleStream, command: string, state: ArenaBattleState): void {
  stream.write(command);
  const readable = stream as unknown as {buf?: string[]};
  const buffered = readable.buf?.splice(0) ?? [];
  for (const output of buffered) processOutput(output, state);
}

function processOutput(output: string, state: ArenaBattleState): void {
  const [kind, ...rest] = output.split("\n");
  if (kind === "sideupdate") {
    const side = rest[0];
    const requestLine = rest.find((line) => line.startsWith("|request|"));
    if (!requestLine) return;
    const parsed = JSON.parse(requestLine.slice("|request|".length)) as AiRequest;
    if (side === "p1") state.p1Request = parsed;
    if (side === "p2") state.p2Request = parsed;
    return;
  }

  if (kind === "end") {
    state.ended = true;
    return;
  }
  if (kind !== "update") return;
  for (const line of publicUpdateLines(rest)) {
    if (!line || line === "|") continue;
    const parts = line.split("|");
    const command = parts[1];
    if (command === "turn") state.turn = Number.parseInt(parts[2] ?? "0", 10) || state.turn;
    if (command === "win") {
      state.ended = true;
      state.winner = parts[2] === "Agent A" ? "p1" : "p2";
    }
    if (command === "tie") {
      state.ended = true;
      state.winner = "tie";
    }
  }
}

function publicUpdateLines(lines: string[]): string[] {
  const publicLines: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("|split|")) {
      index += 1;
      if (lines[index + 1]) publicLines.push(lines[index + 1]);
      index += 1;
      continue;
    }
    publicLines.push(line);
  }
  return publicLines;
}

function sideView(request: AiRequest | undefined, fallbackName: string): BattleSideView {
  return request ? requestInfo(request).sideView : {name: fallbackName, pokemon: []};
}

function requestInfo(request: AiRequest): ArenaRequestInfo {
  const cached = REQUEST_INFO_CACHE.get(request);
  if (cached) return cached;

  const pokemon = request.side.pokemon.map(pokemonView);
  const active = pokemon.find((member) => member.active);
  const info: ArenaRequestInfo = {
    sideView: {name: request.side.name, pokemon},
    quality: {
      remainingPokemon: pokemon.filter((member) => !member.fainted).length,
      hpFraction: pokemon.reduce((total, member) => total + hpFractionFromCondition(member.condition), 0)
    },
    choices: buildChoices(request)
  };
  if (active) {
    // Touch the active member while the side view is built so its HP/status parse remains in the weak cache.
    hpFractionFromCondition(active.condition);
  }
  REQUEST_INFO_CACHE.set(request, info);
  return info;
}

function pokemonView(pokemon: AiPokemonRequest): BattlePokemonView {
  return {
    ident: pokemon.ident,
    species: speciesFromDetails(pokemon.details),
    condition: pokemon.condition,
    active: Boolean(pokemon.active),
    fainted: isFainted(pokemon.condition),
    item: pokemon.item,
    ability: pokemon.ability,
    teraType: pokemon.teraType,
    moves: pokemon.moves ?? []
  };
}

function hpFractionFromCondition(condition: string): number {
  if (isFainted(condition)) return 0;
  const match = condition.match(/(\d+)\/(\d+)/);
  if (!match) return 1;
  const current = Number.parseInt(match[1], 10);
  const max = Number.parseInt(match[2], 10);
  return max > 0 ? Math.max(0, Math.min(1, current / max)) : 1;
}

function seedArray(seed: string): [number, number, number, number] {
  let state = hashString(seed);
  return [0, 1, 2, 3].map(() => {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    return state || 1;
  }) as [number, number, number, number];
}

function teamPreviewChoice(teamSize: number): string {
  return `team ${Array.from({length: teamSize}, (_, index) => index + 1).join("")}`;
}

function oppositeSide(side: ArenaSide): ArenaSide {
  return side === "p1" ? "p2" : "p1";
}

function isFainted(condition: string): boolean {
  return condition.includes("fnt") || condition.startsWith("0 ");
}

function speciesFromDetails(details: string): string {
  return details.split(",")[0] || details;
}
