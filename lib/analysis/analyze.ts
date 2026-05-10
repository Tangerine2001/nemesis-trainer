import {
  DISRUPTION_MOVES,
  HAZARD_MOVES,
  HAZARD_REMOVAL_MOVES,
  PRIORITY_MOVES,
  SETUP_ANSWER_MOVES,
  SPEED_CONTROL_MOVES,
  getSpeciesDatum,
  moveType,
  typeEffectiveness
} from "@/lib/battle-data";
import {POKEMON_TYPES, type AnalysisReport, type PokemonType, type Team, type WeaknessSignal} from "@/lib/types";

const COVERAGE_TYPES: PokemonType[] = ["Water", "Ground", "Steel", "Fairy", "Dragon", "Ghost", "Dark", "Flying"];

export function analyzeTeam(team: Team): AnalysisReport {
  const known = team.members
    .map((member) => ({member, datum: getSpeciesDatum(member.species)}))
    .filter((entry): entry is {member: typeof entry.member; datum: NonNullable<typeof entry.datum>} => Boolean(entry.datum));

  const defensiveGaps = POKEMON_TYPES.map((attackType) => {
    let weakCount = 0;
    let resistCount = 0;
    let immuneCount = 0;
    let worstMultiplier = 1;

    for (const {datum} of known) {
      const multiplier = typeEffectiveness(attackType, datum.types);
      if (multiplier > 1) weakCount += 1;
      if (multiplier > worstMultiplier) worstMultiplier = multiplier;
      if (multiplier === 0) immuneCount += 1;
      else if (multiplier < 1) resistCount += 1;
    }

    return {type: attackType, weakCount, resistCount, immuneCount, worstMultiplier};
  })
    .filter((gap) => gap.weakCount >= 2 || gap.worstMultiplier >= 4)
    .sort((a, b) => b.weakCount - a.weakCount || a.resistCount + a.immuneCount - (b.resistCount + b.immuneCount) || b.worstMultiplier - a.worstMultiplier);

  const lowerMoves = team.members.flatMap((member) => member.moves.map((move) => move.toLowerCase()));
  const attackTypes = new Set<PokemonType>(lowerMoves.map(moveType).filter((type): type is PokemonType => Boolean(type)));
  const offensiveGaps = COVERAGE_TYPES.filter((targetType) => {
    if (attackTypes.size === 0) return true;
    return [...attackTypes].every((attackType) => typeEffectiveness(attackType, [targetType]) <= 1);
  });

  const baseSpeeds = known.map(({datum}) => datum.baseSpeed);
  const maxBaseSpeed = baseSpeeds.length ? Math.max(...baseSpeeds) : 0;
  const averageBaseSpeed = baseSpeeds.length ? Math.round(baseSpeeds.reduce((sum, speed) => sum + speed, 0) / baseSpeeds.length) : 0;
  const fastMembers = known.filter(({datum}) => datum.baseSpeed >= 110).map(({member}) => member.species);

  const roles = {
    hazards: countMembersWithMove(team, HAZARD_MOVES),
    hazardRemoval: countMembersWithMove(team, HAZARD_REMOVAL_MOVES),
    priority: countMembersWithMove(team, PRIORITY_MOVES),
    speedControl: countMembersWithMove(team, SPEED_CONTROL_MOVES),
    setupAnswers: countSetupAnswers(team),
    disruption: countMembersWithMove(team, DISRUPTION_MOVES)
  };

  const signals = buildSignals({
    team,
    knownMembers: known.length,
    defensiveGaps,
    offensiveGaps,
    roles,
    maxBaseSpeed,
    averageBaseSpeed,
    fastMembers
  });

  return {
    defensiveGaps,
    offensiveGaps,
    signals,
    knownMembers: known.length,
    speed: {averageBaseSpeed, maxBaseSpeed, fastMembers},
    roles
  };
}

function countMembersWithMove(team: Team, moveSet: Set<string>): number {
  return team.members.filter((member) => member.moves.some((move) => moveSet.has(move.toLowerCase()))).length;
}

function countSetupAnswers(team: Team): number {
  return team.members.filter((member) => {
    const abilityAnswer = member.ability?.toLowerCase() === "unaware";
    const moveAnswer = member.moves.some((move) => SETUP_ANSWER_MOVES.has(move.toLowerCase()));
    return abilityAnswer || moveAnswer;
  }).length;
}

function buildSignals(input: {
  team: Team;
  knownMembers: number;
  defensiveGaps: AnalysisReport["defensiveGaps"];
  offensiveGaps: PokemonType[];
  roles: AnalysisReport["roles"];
  maxBaseSpeed: number;
  averageBaseSpeed: number;
  fastMembers: string[];
}): WeaknessSignal[] {
  const signals: WeaknessSignal[] = [];
  const strongestDefensiveGap = input.defensiveGaps[0];

  if (input.knownMembers < input.team.members.length) {
    signals.push({
      id: "unknown-data",
      label: "Limited local data coverage",
      severity: 35,
      evidence: `${input.team.members.length - input.knownMembers} team member(s) are outside the current curated MVP data set.`
    });
  }

  if (strongestDefensiveGap && strongestDefensiveGap.weakCount >= 3) {
    signals.push({
      id: `defensive-${strongestDefensiveGap.type.toLowerCase()}`,
      label: `${strongestDefensiveGap.type} pressure overload`,
      severity: Math.min(95, 45 + strongestDefensiveGap.weakCount * 12 - strongestDefensiveGap.resistCount * 6),
      evidence: `${strongestDefensiveGap.weakCount} known members are weak to ${strongestDefensiveGap.type}, with ${strongestDefensiveGap.resistCount + strongestDefensiveGap.immuneCount} resist or immune switch-in(s).`
    });
  }

  if (input.maxBaseSpeed < 110 && input.roles.speedControl === 0 && input.roles.priority === 0) {
    signals.push({
      id: "speed-control",
      label: "Poor speed control",
      severity: 86,
      evidence: `Fastest known base Speed is ${input.maxBaseSpeed}; no priority or clear speed-control move was found.`
    });
  } else if (input.fastMembers.length <= 1 && input.roles.speedControl === 0) {
    signals.push({
      id: "speed-pressure",
      label: "Thin speed profile",
      severity: 64,
      evidence: input.fastMembers.length === 0 ? "No known member reaches base 110 Speed." : `${input.fastMembers[0]} is the only known base 110+ Speed member.`
    });
  }

  if (input.roles.setupAnswers === 0) {
    signals.push({
      id: "setup-answer",
      label: "No clear setup stop",
      severity: 78,
      evidence: "No Haze, phazing, Encore, Taunt, Clear Smog, or Unaware answer was found."
    });
  }

  if (input.roles.hazardRemoval === 0) {
    signals.push({
      id: "hazard-removal",
      label: "Hazards may stick",
      severity: 58,
      evidence: "No Rapid Spin, Defog, Mortal Spin, or Tidy Up user was found."
    });
  }

  if (input.roles.disruption === 0) {
    signals.push({
      id: "disruption",
      label: "Low disruption",
      severity: 52,
      evidence: "No obvious status, Knock Off, Taunt, Encore, Trick, or similar disruption was found."
    });
  }

  if (input.offensiveGaps.length >= 3) {
    signals.push({
      id: "coverage",
      label: "Coverage blind spots",
      severity: 48,
      evidence: `The parsed move types do not pressure ${input.offensiveGaps.slice(0, 4).join(", ")} targets super effectively.`
    });
  }

  return signals.sort((a, b) => b.severity - a.severity);
}
