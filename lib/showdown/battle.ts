import {BattleStream} from "pokemon-showdown/dist/sim/battle-stream";
import {basicPolicy} from "@/lib/battle-ai/basic-policy";
import {createEvaluator} from "@/lib/battle-ai/evaluate";
import {minimaxPolicy} from "@/lib/battle-ai/minimax-policy";
import type {AiPokemonRequest, AiRequest} from "@/lib/battle-ai/policy";
import type {BattleEvaluator} from "@/lib/battle-ai/evaluate";
import type {BattlePolicy} from "@/lib/battle-ai/policy";
import {createAudit} from "@/lib/nemesis";
import {hashString} from "@/lib/boss-generator/random";
import {packBossTeam, packUserTeam} from "@/lib/showdown/team";
import type {
  AuditRequest,
  BattleChoice,
  BattleLogEntry,
  BattlePokemonView,
  BattleResponse,
  BattleSideView,
  BattleSnapshot,
  BattleStartRequest,
  BattleTurnRequest
} from "@/lib/types";

interface BattleRunState {
  p1Request?: AiRequest;
  p2Request?: AiRequest;
  log: BattleLogEntry[];
  turn: number;
  winner?: "user" | "nemesis";
  ended: boolean;
  errors: string[];
}

interface BattleRunOptions {
  aiChoices?: string[];
  lockedUserChoices?: number;
  policy?: BattlePolicy;
  evaluator?: BattleEvaluator;
  allowPolicySimulation?: boolean;
  allowProvidedAiForUnlocked?: boolean;
}

export async function startBattle(request: BattleStartRequest): Promise<BattleResponse> {
  return runBattle(request, [], {policy: minimaxPolicy, evaluator: request.aiWeights ? createEvaluator(request.aiWeights) : undefined});
}

export async function takeBattleTurn(request: BattleTurnRequest): Promise<BattleResponse> {
  return runBattle(request, [...request.userChoices, request.choice], {
    aiChoices: request.aiChoices ?? [],
    lockedUserChoices: request.userChoices.length,
    policy: minimaxPolicy,
    evaluator: request.aiWeights ? createEvaluator(request.aiWeights) : undefined
  });
}

function runBattle(request: AuditRequest, userChoices: string[], options: BattleRunOptions = {}): BattleResponse {
  const audit = createAudit(request);
  const userTeam = packUserTeam(audit.team);
  const bossTeam = packBossTeam(audit.boss.roster, audit.format);

  const validationProblems = [
    ...userTeam.problems.map((problem) => `User team: ${problem}`),
    ...bossTeam.problems.map((problem) => `Nemesis team: ${problem}`)
  ];

  if (validationProblems.length) {
    return {
      userChoices: [],
      aiChoices: [],
      snapshot: emptySnapshot(validationProblems)
    };
  }

  const stream = new BattleStream({noCatch: true});
  const state: BattleRunState = {log: [], turn: 0, ended: false, errors: []};
  const acceptedChoices: string[] = [];
  const acceptedAiChoices: string[] = [];
  const providedAiChoices = options.aiChoices ?? [];
  const lockedUserChoices = options.lockedUserChoices ?? 0;
  const policy = options.policy ?? basicPolicy;
  const evaluator = options.evaluator;
  const allowPolicySimulation = options.allowPolicySimulation ?? true;
  const allowProvidedAiForUnlocked = options.allowProvidedAiForUnlocked ?? false;
  let aiChoiceCursor = 0;

  writeAndProcess(stream, `>start ${JSON.stringify({formatid: audit.format, seed: seedArray(audit.seed)})}`, state);
  writeAndProcess(stream, `>player p1 ${JSON.stringify({name: "You", team: userTeam.packed})}`, state);
  writeAndProcess(stream, `>player p2 ${JSON.stringify({name: "Nemesis", team: bossTeam.packed})}`, state);
  writeAndProcess(stream, `>p1 ${teamPreviewChoice(userTeam.sets.length)}`, state);
  writeAndProcess(stream, `>p2 ${teamPreviewChoice(bossTeam.sets.length)}`, state);
  settleAiOnlyChoices(stream, state, audit.seed, acceptedChoices.length, lockedUserChoices > 0);

  for (const [choiceIndex, choice] of userChoices.entries()) {
    if (state.ended) break;
    const legalChoices = buildChoices(state.p1Request);
    if (!legalChoices.some((legalChoice) => legalChoice.id === choice && !legalChoice.disabled)) {
      throw new Error(`Illegal battle choice "${choice}".`);
    }

    const userChoicesThroughTurn = [...acceptedChoices, choice];
    const aiChoice = selectAiChoice(
      state,
      `${audit.seed}:${acceptedChoices.length}:${choice}`,
      choiceIndex < lockedUserChoices,
      userChoicesThroughTurn
    );
    writeAndProcess(stream, `>p1 ${choice}`, state);
    if (aiChoice) writeAndProcess(stream, `>p2 ${aiChoice}`, state);
    acceptedChoices.push(choice);
    settleAiOnlyChoices(stream, state, audit.seed, acceptedChoices.length, choiceIndex < lockedUserChoices);
  }

  if (aiChoiceCursor < providedAiChoices.length) {
    throw new Error("Battle replay includes extra recorded AI choices.");
  }

  return {
    userChoices: acceptedChoices,
    aiChoices: acceptedAiChoices,
    snapshot: snapshotFromState(state)
  };

  function selectAiChoice(
    currentState: BattleRunState,
    seed: string,
    locked: boolean,
    userChoicesForSimulation?: string[]
  ): string | undefined {
    const legalChoices = buildChoices(currentState.p2Request);
    const enabledChoices = legalChoices.filter((choice) => !choice.disabled);
    if (!enabledChoices.length) return undefined;

    if (aiChoiceCursor < providedAiChoices.length && (locked || allowProvidedAiForUnlocked)) {
      const recordedChoice = providedAiChoices[aiChoiceCursor];
      if (!enabledChoices.some((choice) => choice.id === recordedChoice)) {
        throw new Error(`Recorded AI choice "${recordedChoice}" is no longer legal for this battle replay.`);
      }
      aiChoiceCursor += 1;
      acceptedAiChoices.push(recordedChoice);
      return recordedChoice;
    }

    if (locked) {
      throw new Error("Battle replay is missing a recorded AI choice.");
    }

    if (aiChoiceCursor < providedAiChoices.length) {
      throw new Error("Battle replay includes extra recorded AI choices.");
    }

    const decision = policy.choose({
      seed,
      evaluator,
      request: currentState.p2Request,
      snapshot: snapshotFromState(currentState),
      legalChoices,
      simulateChoice:
        allowPolicySimulation && userChoicesForSimulation
          ? (candidate) =>
              simulateBattleCandidate(request, userChoicesForSimulation, [...acceptedAiChoices, candidate.id], acceptedChoices.length)
          : undefined,
      simulateUserChoice:
        allowPolicySimulation && userChoicesForSimulation
          ? (aiChoice, userChoice) =>
              simulateBattleCandidate(
                request,
                [...userChoicesForSimulation, userChoice.id],
                [...acceptedAiChoices, aiChoice.id],
                acceptedChoices.length
              )
          : undefined
    });

    const selected = decision.choice?.id;
    if (!selected || !enabledChoices.some((choice) => choice.id === selected)) {
      const fallback = basicPolicy.choose({seed, request: currentState.p2Request, snapshot: snapshotFromState(currentState), legalChoices});
      if (!fallback.choice) return undefined;
      acceptedAiChoices.push(fallback.choice.id);
      return fallback.choice.id;
    }

    acceptedAiChoices.push(selected);
    return selected;
  }

  function settleAiOnlyChoices(stream: BattleStream, currentState: BattleRunState, seed: string, turnIndex: number, locked: boolean): void {
    for (let attempts = 0; attempts < 10; attempts += 1) {
      if (currentState.ended) return;
      const userChoices = buildChoices(currentState.p1Request).filter((choice) => !choice.disabled);
      if (userChoices.length) return;

      const aiChoices = buildChoices(currentState.p2Request).filter((choice) => !choice.disabled);
      if (!aiChoices.length) return;

      const aiChoice = selectAiChoice(currentState, `${seed}:forced:${turnIndex}:${attempts}`, locked);
      if (!aiChoice) return;
      writeAndProcess(stream, `>p2 ${aiChoice}`, currentState);
    }
  }
}

function simulateBattleCandidate(
  request: AuditRequest,
  userChoices: string[],
  aiChoices: string[],
  lockedUserChoices: number
): BattleSnapshot | undefined {
  try {
    return runBattle(request, userChoices, {
      aiChoices,
      lockedUserChoices,
      policy: basicPolicy,
      allowPolicySimulation: false,
      allowProvidedAiForUnlocked: true
    }).snapshot;
  } catch {
    return undefined;
  }
}

function writeAndProcess(stream: BattleStream, command: string, state: BattleRunState): void {
  stream.write(command);
  const buffered = drainStream(stream);
  for (const output of buffered) processOutput(output, state);
}

function drainStream(stream: BattleStream): string[] {
  const readable = stream as unknown as {buf?: string[]};
  if (!readable.buf?.length) return [];
  return readable.buf.splice(0);
}

function processOutput(output: string, state: BattleRunState): void {
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

  if (kind === "update") {
    processUpdateLines(publicUpdateLines(rest), state);
  }

  if (kind === "end") {
    state.ended = true;
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

function processUpdateLines(lines: string[], state: BattleRunState): void {
  for (const line of lines) {
    if (!line || line === "|") continue;
    const parts = line.split("|");
    const command = parts[1];

    if (command === "turn") {
      state.turn = Number.parseInt(parts[2] ?? "0", 10) || state.turn;
      addLog(state, `Turn ${state.turn}`, "turn");
    } else if (command === "start") {
      addLog(state, "Battle started.", "info");
    } else if (command === "move") {
      addLog(state, `${pokemonName(parts[2])} used ${parts[3]}.`, "move");
    } else if (command === "switch" || command === "drag") {
      addLog(state, `${pokemonName(parts[2])} entered the battle.`, "switch");
    } else if (command === "-damage") {
      addLog(state, `${pokemonName(parts[2])} took damage (${parts[3]}).`, "damage");
    } else if (command === "-heal") {
      addLog(state, `${pokemonName(parts[2])} recovered HP (${parts[3]}).`, "damage");
    } else if (command === "faint") {
      addLog(state, `${pokemonName(parts[2])} fainted.`, "faint");
    } else if (command === "-sidestart") {
      addLog(state, `${sideName(parts[2])} is affected by ${effectName(parts[3])}.`, "info");
    } else if (command === "-sideend") {
      addLog(state, `${effectName(parts[3])} ended on ${sideName(parts[2])}.`, "info");
    } else if (command === "-status") {
      addLog(state, `${pokemonName(parts[2])} was afflicted with ${statusName(parts[3])}.`, "info");
    } else if (command === "-supereffective") {
      addLog(state, `It was super effective against ${pokemonName(parts[2])}.`, "info");
    } else if (command === "-resisted") {
      addLog(state, `${pokemonName(parts[2])} resisted the hit.`, "info");
    } else if (command?.startsWith("-")) {
      const formatted = formatProtocolEvent(parts);
      if (formatted) addLog(state, formatted, protocolEventKind(command));
    } else if (command === "win") {
      state.ended = true;
      state.winner = parts[2] === "You" ? "user" : "nemesis";
      addLog(state, `${parts[2]} won the battle.`, "end");
    } else if (command === "tie") {
      state.ended = true;
      addLog(state, "The battle ended in a tie.", "end");
    }
  }
}

function buildChoices(request?: AiRequest): BattleChoice[] {
  if (!request || request.wait) return [];

  if (request.teamPreview) {
    return [{id: teamPreviewChoice(request.side.pokemon.length), label: "Confirm lead order", kind: "switch"}];
  }

  const forceSwitch = request.forceSwitch?.some(Boolean);
  const choices: BattleChoice[] = [];

  if (!forceSwitch) {
    const moves = request.active?.[0]?.moves ?? [];
    moves.forEach((move, index) => {
      choices.push({
        id: `move ${index + 1}`,
        label: move.move,
        kind: "move",
        disabled: Boolean(move.disabled) || move.pp <= 0
      });
    });
  }

  const trapped = request.active?.[0]?.trapped;
  if (!trapped || forceSwitch) {
    request.side.pokemon.forEach((pokemon, index) => {
      if (pokemon.active || isFainted(pokemon.condition)) return;
      choices.push({
        id: `switch ${index + 1}`,
        label: `Switch to ${speciesFromDetails(pokemon.details)}`,
        kind: "switch"
      });
    });
  }

  return choices;
}

function snapshotFromState(state: BattleRunState): BattleSnapshot {
  return {
    turn: state.turn,
    ended: state.ended,
    winner: state.winner,
    log: state.log.slice(-80),
    user: sideView(state.p1Request, "You"),
    opponent: sideView(state.p2Request, "Nemesis"),
    choices: state.ended ? [] : buildChoices(state.p1Request),
    errors: state.errors
  };
}

function emptySnapshot(errors: string[]): BattleSnapshot {
  return {
    turn: 0,
    ended: false,
    log: [],
    user: {name: "You", pokemon: []},
    opponent: {name: "Nemesis", pokemon: []},
    choices: [],
    errors
  };
}

function sideView(request: AiRequest | undefined, fallbackName: string): BattleSideView {
  return {
    name: request?.side.name ?? fallbackName,
    pokemon: request?.side.pokemon.map(pokemonView) ?? []
  };
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

function addLog(state: BattleRunState, text: string, kind: BattleLogEntry["kind"]): void {
  const previous = state.log[state.log.length - 1];
  if (previous?.text === text) return;
  state.log.push({id: `${state.log.length + 1}`, text, kind});
}

function formatProtocolEvent(parts: string[]): string | undefined {
  const command = parts[1];
  const target = pokemonName(parts[2]);

  if (command === "-item") return `${target} is holding ${effectName(parts[3])}.`;
  if (command === "-enditem") return `${target} lost ${effectName(parts[3])}.`;
  if (command === "-immune") return `${target} was immune.`;
  if (command === "-miss") return `${pokemonName(parts[2])}'s attack missed ${pokemonName(parts[3])}.`;
  if (command === "-fail") return `${target}'s ${effectName(parts[3])} failed.`;
  if (command === "-crit") return `A critical hit landed on ${target}.`;
  if (command === "-boost") return `${target}'s ${statName(parts[3])} rose by ${parts[4] ?? "1"}.`;
  if (command === "-unboost") return `${target}'s ${statName(parts[3])} fell by ${parts[4] ?? "1"}.`;
  if (command === "-activate") return `${target}'s ${effectName(parts[3])} activated.`;
  if (command === "-start") return `${target} started ${effectName(parts[3])}.`;
  if (command === "-end") return `${effectName(parts[3])} ended for ${target}.`;

  return undefined;
}

function protocolEventKind(command: string): BattleLogEntry["kind"] {
  if (command === "-miss" || command === "-fail" || command === "-immune" || command === "-crit") return "damage";
  return "info";
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

function isFainted(condition: string): boolean {
  return condition.includes("fnt") || condition.startsWith("0 ");
}

function pokemonName(ident?: string): string {
  return ident?.split(": ").at(-1) ?? "A Pokemon";
}

function sideName(side?: string): string {
  if (!side) return "A side";
  if (side.includes("You")) return "Your side";
  if (side.includes("Nemesis")) return "Nemesis's side";
  return side;
}

function effectName(effect?: string): string {
  return effect?.replace(/^(move|item|ability): /, "") ?? "an effect";
}

function statName(stat?: string): string {
  const names: Record<string, string> = {
    atk: "Attack",
    def: "Defense",
    spa: "Special Attack",
    spd: "Special Defense",
    spe: "Speed",
    accuracy: "accuracy",
    evasion: "evasion"
  };
  return names[stat ?? ""] ?? stat ?? "stat";
}

function statusName(status?: string): string {
  const names: Record<string, string> = {
    brn: "burn",
    par: "paralysis",
    psn: "poison",
    tox: "bad poison",
    slp: "sleep",
    frz: "freeze"
  };
  return names[status ?? ""] ?? status ?? "status";
}

function speciesFromDetails(details: string): string {
  return details.split(",")[0] || details;
}
