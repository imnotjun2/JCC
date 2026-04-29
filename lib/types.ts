export type Profile = {
  display_name: string;
  comp_row_id: string;
  camp_name: string;
  version_tier: string;
  positioning: string;
  core_units: string;
  power_spike: string;
  phase_profile: string;
  tempo_note: string;
  playstyle: string;
  priority_augments: string;
  standing_notes: string;
  manual_strengths: string;
  manual_weaknesses: string;
  confidence: string;
  source_type: string;
  original_comp_row_id: string;
};

export type Matchup = {
  display_comp_name: string;
  display_enemy_name: string;
  early_label: string;
  mid_label: string;
  late_label: string;
  overall_label: string;
  reason_1?: string;
  reason_2?: string;
  reason_3?: string;
  reason_4?: string;
  reason_text?: string;
  matchup_score?: string | number;
  curated_score?: string | number;
  suggested_counter_items?: string;
  suggested_augment_themes?: string;
  positioning_advice?: string;
  confidence_level?: string;
  source_type?: string;
};

export type Top3 = {
  display_comp_name: string;
  best_enemy_1?: string;
  best_label_1?: string;
  worst_enemy_1?: string;
  worst_label_1?: string;
};

export type JccData = {
  meta: {
    title: string;
    curatedCount: number;
    matchupCount: number;
    updatedAt: string;
  };
  profiles: Profile[];
  top3: Top3[];
  matchups: Matchup[];
};

export type Tone = "win" | "even" | "lose" | "conditional";
