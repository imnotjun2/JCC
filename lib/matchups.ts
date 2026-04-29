import type { JccData, Matchup, Tone } from "./types";

export function splitValues(value: string | undefined, separator = "|") {
  return String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeText(value: unknown, fallback = "暂无") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function toneOf(label: string | undefined): Tone {
  if (label === "明显克制" || label === "小优") return "win";
  if (label === "小劣" || label === "明显被克") return "lose";
  if (label === "条件互克") return "conditional";
  return "even";
}

export function scoreOf(matchup: Matchup | undefined) {
  const parsed = Number.parseFloat(String(matchup?.curated_score ?? matchup?.matchup_score ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function findMatchup(data: JccData, compName: string, enemyName: string) {
  return data.matchups.find(
    (item) => item.display_comp_name === compName && item.display_enemy_name === enemyName
  );
}

export function matchupReasons(matchup: Matchup | undefined) {
  return [matchup?.reason_1, matchup?.reason_2, matchup?.reason_3, matchup?.reason_4].filter(
    Boolean
  ) as string[];
}
