import {pick, createRng} from "@/lib/boss-generator/random";
import type {AnalysisReport, BossPokemon, BossTrainer, Team, TrainerStyle} from "@/lib/types";

type ConcreteStyle = Exclude<TrainerStyle, "auto">;

const FAST_PRESSURE_CORE: BossPokemon[] = [
  {species: "Glimmora", item: "Focus Sash", ability: "Toxic Debris", teraType: "Grass", role: "hazard lead", moves: ["Stealth Rock", "Mortal Spin", "Power Gem", "Earth Power"]},
  {species: "Dragapult", item: "Choice Specs", ability: "Infiltrator", teraType: "Ghost", role: "speed check", moves: ["Shadow Ball", "Draco Meteor", "Flamethrower", "U-turn"]},
  {species: "Iron Valiant", item: "Booster Energy", ability: "Quark Drive", teraType: "Fairy", role: "cleaner", moves: ["Moonblast", "Close Combat", "Knock Off", "Encore"]},
  {species: "Meowscarada", item: "Choice Band", ability: "Protean", teraType: "Dark", role: "pivot breaker", moves: ["Flower Trick", "Knock Off", "U-turn", "Triple Axel"]}
];

const FAST_PRESSURE_OPTIONS: BossPokemon[] = [
  {species: "Weavile", item: "Heavy-Duty Boots", ability: "Pressure", teraType: "Ice", role: "priority revenge killer", moves: ["Triple Axel", "Knock Off", "Ice Shard", "Swords Dance"]},
  {species: "Cinderace", item: "Heavy-Duty Boots", ability: "Libero", teraType: "Fire", role: "tempo pivot", moves: ["Pyro Ball", "U-turn", "Sucker Punch", "Will-O-Wisp"]},
  {species: "Zamazenta", item: "Leftovers", ability: "Dauntless Shield", teraType: "Steel", role: "fast win condition", moves: ["Body Press", "Crunch", "Substitute", "Iron Defense"]}
];

const WALLBREAKER_CORE: BossPokemon[] = [
  {species: "Samurott-Hisui", item: "Focus Sash", ability: "Sharpness", teraType: "Dark", role: "spike lead", moves: ["Ceaseless Edge", "Aqua Jet", "Knock Off", "Swords Dance"]},
  {species: "Walking Wake", item: "Choice Specs", ability: "Protosynthesis", teraType: "Water", role: "special breaker", moves: ["Hydro Pump", "Draco Meteor", "Flamethrower", "Flip Turn"]},
  {species: "Ogerpon-Wellspring", item: "Wellspring Mask", ability: "Water Absorb", teraType: "Water", role: "physical breaker", moves: ["Power Whip", "Ivy Cudgel", "Knock Off", "Swords Dance"]},
  {species: "Raging Bolt", item: "Booster Energy", ability: "Protosynthesis", teraType: "Electric", role: "bulky breaker", moves: ["Thunderclap", "Draco Meteor", "Calm Mind", "Thunderbolt"]}
];

const WALLBREAKER_OPTIONS: BossPokemon[] = [
  {species: "Heatran", item: "Air Balloon", ability: "Flash Fire", teraType: "Grass", role: "trap pressure", moves: ["Magma Storm", "Earth Power", "Taunt", "Stealth Rock"]},
  {species: "Ursaluna-Bloodmoon", item: "Leftovers", ability: "Mind's Eye", teraType: "Normal", role: "slow nuke", moves: ["Blood Moon", "Earth Power", "Moonlight", "Vacuum Wave"]},
  {species: "Tyranitar", item: "Choice Band", ability: "Sand Stream", teraType: "Rock", role: "special wall breaker", moves: ["Stone Edge", "Knock Off", "Earthquake", "Ice Punch"]}
];

const SETUP_CORE: BossPokemon[] = [
  {species: "Glimmora", item: "Focus Sash", ability: "Toxic Debris", teraType: "Ghost", role: "hazard lead", moves: ["Stealth Rock", "Spikes", "Mortal Spin", "Earth Power"]},
  {species: "Dragonite", item: "Heavy-Duty Boots", ability: "Multiscale", teraType: "Normal", role: "priority sweeper", moves: ["Dragon Dance", "Extreme Speed", "Earthquake", "Roost"]},
  {species: "Gholdengo", item: "Air Balloon", ability: "Good as Gold", teraType: "Flying", role: "removal blocker", moves: ["Nasty Plot", "Make It Rain", "Shadow Ball", "Recover"]},
  {species: "Kingambit", item: "Black Glasses", ability: "Supreme Overlord", teraType: "Dark", role: "endgame cleaner", moves: ["Swords Dance", "Kowtow Cleave", "Sucker Punch", "Iron Head"]}
];

const SETUP_OPTIONS: BossPokemon[] = [
  {species: "Cloyster", item: "Focus Sash", ability: "Skill Link", teraType: "Ice", role: "shell smash sweeper", moves: ["Shell Smash", "Icicle Spear", "Rock Blast", "Liquidation"]},
  {species: "Iron Moth", item: "Booster Energy", ability: "Quark Drive", teraType: "Ground", role: "special cleaner", moves: ["Fiery Dance", "Sludge Wave", "Energy Ball", "Dazzling Gleam"]},
  {species: "Raging Bolt", item: "Leftovers", ability: "Protosynthesis", teraType: "Fairy", role: "bulky setup", moves: ["Calm Mind", "Thunderclap", "Dragon Pulse", "Substitute"]}
];

export function generateBossTrainer(team: Team, analysis: AnalysisReport, seed: string, requestedStyle: TrainerStyle = "auto"): BossTrainer {
  const style = requestedStyle === "auto" ? chooseStyle(analysis) : requestedStyle;
  const rng = createRng(`${seed}:${team.members.map((member) => member.species).join("|")}:${style}`);
  const roster = buildRoster(style, rng);
  const topSignal = analysis.signals[0];
  const topGap = analysis.defensiveGaps[0];

  return {
    name: `${style} Nemesis`,
    style,
    difficulty: analysis.signals.some((signal) => signal.severity >= 80) ? "Final Boss" : analysis.signals.some((signal) => signal.severity >= 65) ? "Hard" : "Standard",
    seed,
    roster,
    likelyLead: roster[0].species,
    firstThreeTurns: firstThreeTurns(style, topGap?.type),
    whyItBeatsYou: whyItBeatsYou(style, topSignal?.evidence, topGap?.type),
    bestCounterplay: bestCounterplay(style),
    suggestedTeamEdit: suggestedEdit(style, analysis)
  };
}

function chooseStyle(analysis: AnalysisReport): ConcreteStyle {
  const topSignal = analysis.signals[0]?.id ?? "";
  if (topSignal.includes("speed")) return "Fast Pressure";
  if (topSignal.includes("setup")) return "Setup Snowball";
  if (analysis.roles.setupAnswers === 0) return "Setup Snowball";
  if (analysis.speed.fastMembers.length <= 1 && analysis.roles.speedControl === 0) return "Fast Pressure";
  return "Wallbreaker";
}

function buildRoster(style: ConcreteStyle, rng: () => number): BossPokemon[] {
  if (style === "Fast Pressure") return [...FAST_PRESSURE_CORE, ...chooseTwo(FAST_PRESSURE_OPTIONS, rng)];
  if (style === "Setup Snowball") return [...SETUP_CORE, ...chooseTwo(SETUP_OPTIONS, rng)];
  return [...WALLBREAKER_CORE, ...chooseTwo(WALLBREAKER_OPTIONS, rng)];
}

function chooseTwo(options: BossPokemon[], rng: () => number): BossPokemon[] {
  const first = pick(options, rng);
  const remaining = options.filter((option) => option.species !== first.species);
  return [first, pick(remaining, rng)];
}

function firstThreeTurns(style: ConcreteStyle, pressureType?: string): string[] {
  if (style === "Fast Pressure") {
    return [
      "Lead with Glimmora to force hazards or an immediate trade.",
      "Pivot through Dragapult or Meowscarada to deny a comfortable defensive switch.",
      `Bring in Iron Valiant once chip damage makes the ${pressureType ?? "main"} weakness punishable.`
    ];
  }

  if (style === "Setup Snowball") {
    return [
      "Open with hazards, then preserve the lead if removal looks likely.",
      "Use Dragonite or Volcarona to test whether your team has an immediate setup answer.",
      "Save Kingambit for the endgame once faster checks have been weakened."
    ];
  }

  return [
    "Lead Samurott-Hisui to stack early chip while threatening Knock Off.",
    "Cycle Choice Specs and mask-boosted attacks into the least stable switch-in.",
    "Use Raging Bolt or the final breaker to punish the first forced recovery turn."
  ];
}

function whyItBeatsYou(style: ConcreteStyle, topEvidence?: string, pressureType?: string): string[] {
  const base = topEvidence ? [topEvidence] : [];
  if (style === "Fast Pressure") {
    return [...base, "The roster keeps the turn count low and attacks before slower balance pieces can stabilize.", "Priority and fast pivots make revenge-killing unreliable."];
  }
  if (style === "Setup Snowball") {
    return [...base, "Multiple sweepers ask the same question: can you stop boosts immediately?", "Hazards and removal blocking turn small positioning errors into a losing endgame."];
  }
  return [...base, `The team repeatedly attacks the weakest defensive lane${pressureType ? `, especially ${pressureType}` : ""}.`, "Mixed physical and special pressure reduces the value of a single dedicated wall."];
}

function bestCounterplay(style: ConcreteStyle): string[] {
  if (style === "Fast Pressure") {
    return ["Keep your healthiest resist available for the first Choice-locked attack.", "Trade aggressively for hazard control; playing purely reactive gives the boss too many free pivots."];
  }
  if (style === "Setup Snowball") {
    return ["Do not spend early turns on low-impact setup if a sweeper can enter next.", "Preserve your disruption move until the real win condition commits."];
  }
  return ["Scout the locked or boosted breaker before sacrificing your only pivot.", "Force chip on the lead so hazards do not become permanent pressure."];
}

function suggestedEdit(style: ConcreteStyle, analysis: AnalysisReport): string {
  if (analysis.roles.speedControl === 0 && style === "Fast Pressure") {
    return "Add a real speed-control slot, such as priority, Thunder Wave, Choice Scarf speed, or a naturally fast revenge killer.";
  }
  if (analysis.roles.setupAnswers === 0) {
    return "Add one setup stop: Haze, Encore, Taunt, phazing, Clear Smog, or an Unaware wall.";
  }
  if (analysis.roles.hazardRemoval === 0) {
    return "Add hazard removal or a more hazard-resilient structure so chip damage does not decide the matchup early.";
  }
  return "Replace the least active defensive slot with a pivot or coverage move that pressures the top listed weakness.";
}
