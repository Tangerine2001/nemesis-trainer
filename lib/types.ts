export const DATA_VERSION = "2026-05-09-mvp-1";

export const POKEMON_TYPES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy"
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];
export type SupportedFormat = "gen9ou";
export type TrainerStyle = "auto" | "Fast Pressure" | "Wallbreaker" | "Setup Snowball";
export type StatId = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export interface TeamMember {
  name: string;
  species: string;
  item?: string;
  ability?: string;
  level?: number;
  teraType?: PokemonType;
  nature?: string;
  evs: Partial<Record<StatId, number>>;
  ivs: Partial<Record<StatId, number>>;
  moves: string[];
}

export interface Team {
  format: SupportedFormat;
  members: TeamMember[];
  rawText: string;
}

export interface ParseIssue {
  severity: "error" | "warning";
  message: string;
  memberIndex?: number;
}

export interface ParseResult {
  team?: Team;
  issues: ParseIssue[];
}

export interface WeaknessSignal {
  id: string;
  label: string;
  severity: number;
  evidence: string;
}

export interface DefensiveGap {
  type: PokemonType;
  weakCount: number;
  resistCount: number;
  immuneCount: number;
  worstMultiplier: number;
}

export interface AnalysisReport {
  defensiveGaps: DefensiveGap[];
  offensiveGaps: PokemonType[];
  signals: WeaknessSignal[];
  knownMembers: number;
  speed: {
    averageBaseSpeed: number;
    maxBaseSpeed: number;
    fastMembers: string[];
  };
  roles: {
    hazards: number;
    hazardRemoval: number;
    priority: number;
    speedControl: number;
    setupAnswers: number;
    disruption: number;
  };
}

export interface BossPokemon {
  species: string;
  item: string;
  ability: string;
  teraType: PokemonType;
  moves: string[];
  role: string;
}

export interface BossTrainer {
  name: string;
  style: Exclude<TrainerStyle, "auto">;
  difficulty: "Standard" | "Hard" | "Final Boss";
  seed: string;
  roster: BossPokemon[];
  likelyLead: string;
  firstThreeTurns: string[];
  whyItBeatsYou: string[];
  bestCounterplay: string[];
  suggestedTeamEdit: string;
}

export interface AuditRequest {
  rawTeam: string;
  format?: SupportedFormat;
  seed?: string;
  style?: TrainerStyle;
}

export interface AuditResult {
  format: SupportedFormat;
  seed: string;
  team: Team;
  parseIssues: ParseIssue[];
  analysis: AnalysisReport;
  boss: BossTrainer;
  shareCode: string;
}

export interface SharePayload {
  v: string;
  format: SupportedFormat;
  rawTeam: string;
  seed: string;
  style: TrainerStyle;
}

export type BattleChoiceKind = "move" | "switch";

export interface BattleChoice {
  id: string;
  label: string;
  kind: BattleChoiceKind;
  disabled?: boolean;
}

export interface BattlePokemonView {
  ident: string;
  species: string;
  condition: string;
  active: boolean;
  fainted: boolean;
  item?: string;
  ability?: string;
  teraType?: string;
  moves: string[];
}

export interface BattleSideView {
  name: string;
  pokemon: BattlePokemonView[];
}

export interface BattleLogEntry {
  id: string;
  text: string;
  kind: "info" | "turn" | "move" | "switch" | "damage" | "faint" | "end";
}

export interface BattleSnapshot {
  turn: number;
  ended: boolean;
  winner?: "user" | "nemesis";
  log: BattleLogEntry[];
  user: BattleSideView;
  opponent: BattleSideView;
  choices: BattleChoice[];
  errors: string[];
}

export interface BattleStartRequest extends AuditRequest {}

export interface BattleTurnRequest extends BattleStartRequest {
  userChoices: string[];
  aiChoices?: string[];
  choice: string;
}

export interface BattleResponse {
  snapshot: BattleSnapshot;
  userChoices: string[];
  aiChoices: string[];
}
