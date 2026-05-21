import {STAT_IDS, STAT_LABELS, type DraftIssue, type StatId, type StatTable, type TeamDraft, type TeamSlotDraft} from "./types";

const EMPTY_STATS: StatTable = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
const FULL_IVS: StatTable = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
const STAT_ALIASES: Record<string, StatId> = {
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

export function emptySlot(): TeamSlotDraft {
  return {
    nickname: "",
    species: "",
    item: "",
    ability: "",
    teraType: "",
    nature: "Serious",
    evs: {...EMPTY_STATS},
    ivs: {...FULL_IVS},
    moves: ["", "", "", ""],
    level: 100,
    gender: "",
    shiny: false
  };
}

export function createEmptyDraft(): TeamDraft {
  return {
    format: "gen9ou",
    slots: Array.from({length: 6}, emptySlot),
    seed: "nemesis-demo",
    style: "auto"
  };
}

export function normalizeDraft(input: Partial<TeamDraft> | undefined): TeamDraft {
  const base = createEmptyDraft();
  if (!input) return base;
  return {
    format: "gen9ou",
    seed: input.seed?.trim() || base.seed,
    style: input.style ?? base.style,
    slots: Array.from({length: 6}, (_, index) => normalizeSlot(input.slots?.[index]))
  };
}

export function normalizeSlot(input: Partial<TeamSlotDraft> | undefined): TeamSlotDraft {
  const base = emptySlot();
  if (!input) return base;
  return {
    ...base,
    ...input,
    level: clampNumber(input.level ?? base.level, 1, 100),
    gender: input.gender === "M" || input.gender === "F" || input.gender === "N" ? input.gender : "",
    evs: normalizeStats(input.evs, 0, 252),
    ivs: normalizeStats(input.ivs, 0, 31),
    moves: Array.from({length: 4}, (_, index) => input.moves?.[index]?.trim() ?? "")
  };
}

export function draftToShowdownExport(draft: TeamDraft): string {
  return draft.slots
    .filter((slot) => slot.species.trim())
    .map(slotToShowdownExport)
    .join("\n\n");
}

export function showdownExportToDraft(rawText: string): TeamDraft {
  const draft = createEmptyDraft();
  const blocks = rawText
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 6);

  blocks.forEach((block, index) => {
    draft.slots[index] = blockToSlot(block);
  });

  return draft;
}

export function validateDraftBasics(draft: TeamDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const seenSpecies = new Map<string, number>();

  draft.slots.forEach((slot, index) => {
    if (!slot.species.trim()) return;
    const speciesId = toId(slot.species);
    const firstSeen = seenSpecies.get(speciesId);
    if (firstSeen !== undefined) {
      issues.push({severity: "warning", slot: index, message: `Duplicate species also appears in slot ${firstSeen + 1}.`});
    } else {
      seenSpecies.set(speciesId, index);
    }

    const evTotal = statTotal(slot.evs);
    if (evTotal > 510) {
      issues.push({severity: "error", slot: index, message: `EV total is ${evTotal}; Showdown allows 510.`});
    }

    for (const stat of STAT_IDS) {
      if (slot.evs[stat] > 252) issues.push({severity: "error", slot: index, message: `${STAT_LABELS[stat]} EVs exceed 252.`});
    }

    const moves = slot.moves.map((move) => toId(move)).filter(Boolean);
    const duplicateMove = moves.find((move, moveIndex) => moves.indexOf(move) !== moveIndex);
    if (duplicateMove) {
      issues.push({severity: "warning", slot: index, message: "Duplicate move selected."});
    }
  });

  if (!draft.slots.some((slot) => slot.species.trim())) {
    issues.push({severity: "error", message: "Add at least one team member before validating."});
  }

  return issues;
}

export function slotCompletion(slot: TeamSlotDraft) {
  if (!slot.species.trim()) return 0;
  const checks = [slot.item, slot.ability, slot.teraType, slot.nature, ...slot.moves];
  const completed = checks.filter((value) => value.trim()).length;
  return Math.round((1 + completed) / 9 * 100);
}

export function statTotal(stats: StatTable) {
  return STAT_IDS.reduce((total, stat) => total + (stats[stat] || 0), 0);
}

export function toId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slotToShowdownExport(slot: TeamSlotDraft): string {
  const name = slot.nickname.trim();
  const species = slot.species.trim();
  const identity = name && toId(name) !== toId(species) ? `${name} (${species})` : species;
  const lines = [`${identity}${slot.item.trim() ? ` @ ${slot.item.trim()}` : ""}`];

  if (slot.ability.trim()) lines.push(`Ability: ${slot.ability.trim()}`);
  if (slot.level !== 100) lines.push(`Level: ${slot.level}`);
  if (slot.gender) lines.push(`Gender: ${slot.gender}`);
  if (slot.shiny) lines.push("Shiny: Yes");
  if (slot.teraType.trim()) lines.push(`Tera Type: ${slot.teraType.trim()}`);
  if (statTotal(slot.evs) > 0) lines.push(`EVs: ${formatStats(slot.evs, 0)}`);
  if (slot.nature.trim()) lines.push(`${slot.nature.trim()} Nature`);
  if (STAT_IDS.some((stat) => slot.ivs[stat] !== 31)) lines.push(`IVs: ${formatStats(slot.ivs, 31)}`);
  for (const move of slot.moves) {
    if (move.trim()) lines.push(`- ${move.trim()}`);
  }

  return lines.join("\n");
}

function blockToSlot(block: string): TeamSlotDraft {
  const slot = emptySlot();
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines[0] ?? "";
  const [identityPart, itemPart] = header.split("@").map((part) => part.trim());
  const parentheticalSpecies = identityPart.match(/^(.*?)\s*\((.*?)\)$/);
  slot.nickname = parentheticalSpecies?.[1]?.trim() || "";
  slot.species = parentheticalSpecies?.[2]?.trim() || identityPart.trim();
  slot.item = itemPart || "";

  const moves: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith("- ")) {
      moves.push(line.slice(2).trim());
      continue;
    }

    if (line.endsWith(" Nature")) {
      slot.nature = line.replace(/\s+Nature$/, "");
      continue;
    }

    const [rawKey, ...valueParts] = line.split(":");
    if (valueParts.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = valueParts.join(":").trim();

    if (key === "ability") slot.ability = value;
    if (key === "tera type") slot.teraType = value;
    if (key === "level") slot.level = clampNumber(Number.parseInt(value, 10), 1, 100);
    if (key === "gender" && (value === "M" || value === "F" || value === "N")) slot.gender = value;
    if (key === "shiny") slot.shiny = value.toLowerCase() === "yes";
    if (key === "evs") slot.evs = parseStats(value, 0);
    if (key === "ivs") slot.ivs = parseStats(value, 31);
  }

  slot.moves = Array.from({length: 4}, (_, index) => moves[index] ?? "");
  return slot;
}

function parseStats(value: string, fallback: number): StatTable {
  const stats: StatTable = {hp: fallback, atk: fallback, def: fallback, spa: fallback, spd: fallback, spe: fallback};
  for (const chunk of value.split("/")) {
    const match = chunk.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const stat = STAT_ALIASES[match[2].trim().toLowerCase()];
    if (stat) stats[stat] = clampNumber(Number.parseInt(match[1], 10), 0, fallback === 31 ? 31 : 252);
  }
  return stats;
}

function formatStats(stats: StatTable, omittedValue: number) {
  return STAT_IDS.filter((stat) => stats[stat] !== omittedValue)
    .map((stat) => `${stats[stat]} ${STAT_LABELS[stat]}`)
    .join(" / ");
}

function normalizeStats(input: Partial<StatTable> | undefined, min: number, max: number): StatTable {
  return STAT_IDS.reduce((stats, stat) => {
    stats[stat] = clampNumber(input?.[stat] ?? (max === 31 ? 31 : 0), min, max);
    return stats;
  }, {} as StatTable);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
