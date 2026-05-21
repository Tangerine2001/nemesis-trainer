export const STAT_IDS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export const STAT_LABELS: Record<StatId, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe"
};

export type StatId = (typeof STAT_IDS)[number];
export type StatTable = Record<StatId, number>;

export interface BuilderMove {
  id: string;
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  target: string;
  shortDesc: string;
}

export interface BuilderSpecies {
  id: string;
  name: string;
  types: string[];
  baseStats: StatTable;
  abilities: string[];
  tier: string;
  isUsuallyLegalInOu: boolean;
  moves: string[];
}

export interface BuilderNamedOption {
  id: string;
  name: string;
  shortDesc?: string;
}

export interface BuilderNature {
  id: string;
  name: string;
  plus: StatId | null;
  minus: StatId | null;
}

export interface BuilderData {
  format: "gen9ou";
  source: {
    package: string;
    version: string;
  };
  types: string[];
  stats: StatId[];
  species: BuilderSpecies[];
  items: BuilderNamedOption[];
  abilities: BuilderNamedOption[];
  moves: BuilderMove[];
  natures: BuilderNature[];
}

export interface TeamSlotDraft {
  nickname: string;
  species: string;
  item: string;
  ability: string;
  teraType: string;
  nature: string;
  evs: StatTable;
  ivs: StatTable;
  moves: string[];
  level: number;
  gender: "" | "M" | "F" | "N";
  shiny: boolean;
}

export interface TeamDraft {
  format: "gen9ou";
  slots: TeamSlotDraft[];
  seed: string;
  style: "auto" | "Fast Pressure" | "Wallbreaker" | "Setup Snowball";
}

export interface DraftIssue {
  severity: "error" | "warning";
  message: string;
  slot?: number;
}

export interface ValidationResponse {
  ok: boolean;
  packed: string;
  problems: string[];
  issues: DraftIssue[];
}
