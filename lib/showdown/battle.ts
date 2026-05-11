import {BattleStream} from "pokemon-showdown/dist/sim/battle-stream";
import {Dex} from "pokemon-showdown/dist/sim/dex";
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

interface ShowdownMoveRequest {
  move: string;
  id: string;
  pp: number;
  maxpp: number;
  target: string;
  disabled?: boolean;
}

interface ShowdownPokemonRequest {
  ident: string;
  details: string;
  condition: string;
  active?: boolean;
  item?: string;
  ability?: string;
  teraType?: string;
  moves?: string[];
}

interface ShowdownSideRequest {
  name: string;
  id: "p1" | "p2";
  pokemon: ShowdownPokemonRequest[];
}

interface ShowdownRequest {
  rqid?: number;
  wait?: boolean;
  teamPreview?: boolean;
  forceSwitch?: boolean[];
  active?: Array<{moves: ShowdownMoveRequest[]; trapped?: boolean}>;
  side: ShowdownSideRequest;
}

interface BattleRunState {
  p1Request?: ShowdownRequest;
  p2Request?: ShowdownRequest;
  log: BattleLogEntry[];
  turn: number;
  winner?: "user" | "nemesis";
  ended: boolean;
  errors: string[];
}

export async function startBattle(request: BattleStartRequest): Promise<BattleResponse> {
  return runBattle(request, []);
}

export async function takeBattleTurn(request: BattleTurnRequest): Promise<BattleResponse> {
  return runBattle(request, [...request.userChoices, request.choice]);
}

async function runBattle(request: AuditRequest, userChoices: string[]): Promise<BattleResponse> {
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
      snapshot: emptySnapshot(validationProblems)
    };
  }

  const stream = new BattleStream({noCatch: true});
  const state: BattleRunState = {log: [], turn: 0, ended: false, errors: []};
  const acceptedChoices: string[] = [];

  writeAndProcess(stream, `>start ${JSON.stringify({formatid: audit.format, seed: seedArray(audit.seed)})}`, state);
  writeAndProcess(stream, `>player p1 ${JSON.stringify({name: "You", team: userTeam.packed})}`, state);
  writeAndProcess(stream, `>player p2 ${JSON.stringify({name: "Nemesis", team: bossTeam.packed})}`, state);
  writeAndProcess(stream, `>p1 ${teamPreviewChoice(userTeam.sets.length)}`, state);
  writeAndProcess(stream, `>p2 ${teamPreviewChoice(bossTeam.sets.length)}`, state);
  settleAiOnlyChoices(stream, state, audit.seed, acceptedChoices.length);

  for (const choice of userChoices) {
    if (state.ended) break;
    const legalChoices = buildChoices(state.p1Request);
    if (!legalChoices.some((legalChoice) => legalChoice.id === choice && !legalChoice.disabled)) {
      throw new Error(`Illegal battle choice "${choice}".`);
    }

    const aiChoice = chooseAiChoice(state.p2Request, `${audit.seed}:${acceptedChoices.length}:${choice}`);
    writeAndProcess(stream, `>p1 ${choice}`, state);
    if (aiChoice) writeAndProcess(stream, `>p2 ${aiChoice}`, state);
    acceptedChoices.push(choice);
    settleAiOnlyChoices(stream, state, audit.seed, acceptedChoices.length);
  }

  return {
    userChoices: acceptedChoices,
    snapshot: snapshotFromState(state)
  };
}

function settleAiOnlyChoices(stream: BattleStream, state: BattleRunState, seed: string, turnIndex: number): void {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    if (state.ended) return;
    const userChoices = buildChoices(state.p1Request).filter((choice) => !choice.disabled);
    if (userChoices.length) return;

    const aiChoices = buildChoices(state.p2Request).filter((choice) => !choice.disabled);
    if (!aiChoices.length) return;

    const aiChoice = chooseAiChoice(state.p2Request, `${seed}:forced:${turnIndex}:${attempts}`);
    if (!aiChoice) return;
    writeAndProcess(stream, `>p2 ${aiChoice}`, state);
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
    const parsed = JSON.parse(requestLine.slice("|request|".length)) as ShowdownRequest;
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
      addLog(state, `${pokemonName(parts[2])} was afflicted with ${parts[3]}.`, "info");
    } else if (command === "-enditem") {
      addLog(state, `${pokemonName(parts[2])} consumed ${parts[3]}.`, "info");
    } else if (command === "-supereffective") {
      addLog(state, `It was super effective against ${pokemonName(parts[2])}.`, "info");
    } else if (command === "-resisted") {
      addLog(state, `${pokemonName(parts[2])} resisted the hit.`, "info");
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

function buildChoices(request?: ShowdownRequest): BattleChoice[] {
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

function chooseAiChoice(request: ShowdownRequest | undefined, seed: string): string | undefined {
  const choices = buildChoices(request).filter((choice) => !choice.disabled);
  if (!choices.length) return undefined;
  const switches = choices.filter((choice) => choice.kind === "switch");
  if (request?.forceSwitch?.some(Boolean) && switches.length) return switches[0].id;

  let best = choices[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const choice of choices) {
    const score = scoreChoice(choice, request, seed);
    if (score > bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  return best.id;
}

function scoreChoice(choice: BattleChoice, request: ShowdownRequest | undefined, seed: string): number {
  if (choice.kind === "switch") return 10 + tieBreak(seed, choice.id);
  const moveIndex = Number.parseInt(choice.id.replace("move ", ""), 10) - 1;
  const moveRequest = request?.active?.[0]?.moves[moveIndex];
  const move = Dex.moves.get(moveRequest?.id ?? choice.label);
  const statusBonus = move.category === "Status" ? statusMoveBonus(move.id) : 0;
  return (move.basePower || 0) + move.priority * 18 + statusBonus + tieBreak(seed, choice.id);
}

function statusMoveBonus(moveId: string): number {
  if (["stealthrock", "spikes", "toxicspikes", "stickyweb"].includes(moveId)) return 55;
  if (["dragondance", "swordsdance", "nastyplot", "calmmind", "shellsmash", "quiverdance", "irondefense"].includes(moveId)) return 45;
  if (["encore", "taunt", "willowisp", "thunderwave", "substitute"].includes(moveId)) return 35;
  return 20;
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

function sideView(request: ShowdownRequest | undefined, fallbackName: string): BattleSideView {
  return {
    name: request?.side.name ?? fallbackName,
    pokemon: request?.side.pokemon.map(pokemonView) ?? []
  };
}

function pokemonView(pokemon: ShowdownPokemonRequest): BattlePokemonView {
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

function seedArray(seed: string): [number, number, number, number] {
  let state = hashString(seed);
  return [0, 1, 2, 3].map(() => {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    return state || 1;
  }) as [number, number, number, number];
}

function tieBreak(seed: string, choice: string): number {
  return (hashString(`${seed}:${choice}`) % 1000) / 1000;
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
  return effect?.replace(/^move: /, "") ?? "an effect";
}

function speciesFromDetails(details: string): string {
  return details.split(",")[0] || details;
}
