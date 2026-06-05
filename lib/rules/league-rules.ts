import type {LeagueRules, ParseIssue, Team, TeamMember} from "@/lib/types";

export interface LeagueRulesResult {
  team: Team;
  issues: ParseIssue[];
}

interface MegaStoneMatch {
  item: string;
  sourceSpecies: string;
}

export function applyLeagueRules(team: Team, rules?: LeagueRules): LeagueRulesResult {
  if (rules?.megaMode !== "draft-forced-stones") {
    return {team, issues: []};
  }

  const issues: ParseIssue[] = [];
  const maxMegaEvolutions = rules.maxMegaEvolutionsPerBattle ?? 1;
  if (maxMegaEvolutions !== 1) {
    issues.push({
      severity: "error",
      message: "Draft Mega rules currently support exactly one Mega evolution per battle."
    });
  }

  const members = team.members.map((member, memberIndex) => applyMegaStoneLock(member, memberIndex, rules, issues));
  const selectedMegaId = rules.selectedMegaSpecies ? toId(rules.selectedMegaSpecies) : "";

  if (selectedMegaId) {
    const selectedIndex = members.findIndex((member) => memberMatchesSelectedMega(member, selectedMegaId));
    if (selectedIndex === -1) {
      issues.push({
        severity: "error",
        message: `Selected Mega "${rules.selectedMegaSpecies}" is not on the team.`
      });
    } else if (!members[selectedIndex].canMegaEvolve) {
      issues.push({
        severity: "error",
        message: `Selected Mega "${members[selectedIndex].species}" is not item-locked to a Mega Stone.`
      });
    }

    members.forEach((member, index) => {
      if (!member.canMegaEvolve) return;
      member.mayMegaEvolveThisBattle = index === selectedIndex;
    });
  }

  return {
    team: {
      ...team,
      members,
      leagueRules: rules
    },
    issues
  };
}

export function hasActiveLeagueRules(team: Team): boolean {
  return team.leagueRules?.megaMode === "draft-forced-stones" || team.members.some((member) => Boolean(member.lockedItem));
}

function applyMegaStoneLock(member: TeamMember, memberIndex: number, rules: LeagueRules, issues: ParseIssue[]): TeamMember {
  const match = megaStoneForMember(member, rules);
  if (!match) return {...member, canMegaEvolve: false};

  const currentItem = member.item?.trim();
  if (currentItem && toId(currentItem) !== toId(match.item)) {
    issues.push({
      severity: "warning",
      memberIndex,
      message: `${member.species} must hold ${match.item} under draft Mega rules; ${currentItem} was ignored.`
    });
  } else if (!currentItem) {
    issues.push({
      severity: "warning",
      memberIndex,
      message: `${member.species} was given ${match.item} because draft Mega rules force its Mega Stone.`
    });
  }

  return {
    ...member,
    item: match.item,
    lockedItem: {
      item: match.item,
      reason: "mega-stone",
      sourceSpecies: match.sourceSpecies,
      replacedItem: currentItem && toId(currentItem) !== toId(match.item) ? currentItem : undefined
    },
    canMegaEvolve: true
  };
}

function megaStoneForMember(member: TeamMember, rules: LeagueRules): MegaStoneMatch | undefined {
  const mappedStone = megaStoneFromMap(member.species, rules.megaStoneBySpecies);
  if (mappedStone) return mappedStone;

  const baseMegaSpecies = baseSpeciesFromMegaName(member.species);
  if (!baseMegaSpecies) return undefined;

  return {
    item: rules.inferMegaStoneNames === false ? "Mega Stone" : `${baseMegaSpecies}ite`,
    sourceSpecies: baseMegaSpecies
  };
}

function megaStoneFromMap(species: string, megaStoneBySpecies: Record<string, string> | undefined): MegaStoneMatch | undefined {
  if (!megaStoneBySpecies) return undefined;

  const lookup = normalizedStoneMap(megaStoneBySpecies);
  const exactStone = lookup.get(toId(species));
  if (exactStone) return {item: exactStone, sourceSpecies: species};

  const baseSpecies = baseSpeciesFromMegaName(species);
  if (!baseSpecies) return undefined;

  const baseStone = lookup.get(toId(baseSpecies));
  return baseStone ? {item: baseStone, sourceSpecies: baseSpecies} : undefined;
}

function normalizedStoneMap(megaStoneBySpecies: Record<string, string>): Map<string, string> {
  const entries = Object.entries(megaStoneBySpecies)
    .map(([species, item]) => [toId(species), item.trim()] as const)
    .filter(([speciesId, item]) => speciesId && item);
  return new Map(entries);
}

function memberMatchesSelectedMega(member: TeamMember, selectedMegaId: string): boolean {
  return toId(member.species) === selectedMegaId || toId(baseSpeciesFromMegaName(member.species) ?? "") === selectedMegaId;
}

function baseSpeciesFromMegaName(species: string): string | undefined {
  const trimmed = species.trim();
  if (!/^mega\s+/i.test(trimmed)) return undefined;
  return trimmed.replace(/^mega\s+/i, "").trim() || undefined;
}

function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
