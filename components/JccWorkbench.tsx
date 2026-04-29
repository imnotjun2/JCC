"use client";

import {
  BarChart3,
  Crosshair,
  LayoutGrid,
  Search,
  ShieldAlert,
  Sparkles,
  Swords,
  Target
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { findMatchup, matchupReasons, safeText, scoreOf, splitValues, toneOf } from "../lib/matchups";
import type { JccData, Matchup, Profile, Tone } from "../lib/types";

type Tab = "pairwise" | "battle";

type BattleRow = {
  name: string;
  matchup: Matchup;
  score: number;
  reasons: string[];
  stageReversal: boolean;
};

function toneClass(tone: Tone | string | undefined) {
  const normalized = tone === "win" || tone === "even" || tone === "lose" || tone === "conditional" ? tone : toneOf(String(tone || ""));
  return `tone-${normalized}`;
}

function TagList({ values, limit }: { values: string[]; limit?: number }) {
  return (
    <div className="tag-list">
      {values.slice(0, limit || values.length).map((value) => (
        <span className="tag" key={value}>
          {value}
        </span>
      ))}
    </div>
  );
}

function StatTile({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="stat-tile">
      <span className="icon-badge">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function analyzeBattle(data: JccData, myName: string, opponents: string[]) {
  const enriched = opponents
    .map((name) => {
      const matchup = findMatchup(data, myName, name);
      if (!matchup) return null;
      const stageTones = [matchup.early_label, matchup.mid_label, matchup.late_label].map(toneOf);
      return {
        name,
        matchup,
        score: scoreOf(matchup),
        reasons: matchupReasons(matchup),
        stageReversal: new Set(stageTones).size > 1 || matchup.overall_label === "条件互克"
      };
    })
    .filter(Boolean) as BattleRow[];

  const avgScore = enriched.reduce((sum, item) => sum + item.score, 0) / Math.max(enriched.length, 1);
  const threats = [...enriched].sort((a, b) => a.score - b.score);
  const easiest = [...enriched].sort((a, b) => b.score - a.score);
  const highThreats = threats.filter((item) => item.score <= -0.8 || toneOf(item.matchup.overall_label) === "lose");
  const easyTargets = easiest.filter((item) => item.score >= 0.8 || toneOf(item.matchup.overall_label) === "win");
  const envLabel = avgScore >= 0.45 ? "顺风" : avgScore <= -0.45 ? "逆风" : "中性";
  const envTone = avgScore >= 0.45 ? "win" : avgScore <= -0.45 ? "lose" : "even";

  return { enriched, avgScore, threats, easiest, highThreats, easyTargets, envLabel, envTone };
}

function battleSummary(battle: ReturnType<typeof analyzeBattle>) {
  const topThreat = battle.threats[0];
  const secondThreat = battle.threats[1];
  const easiest = battle.easiest[0];
  if (!topThreat) return "暂无足够对局数据。";
  if (battle.envLabel === "逆风") {
    return `整体偏逆风，优先处理 ${topThreat.name}${secondThreat ? ` 和 ${secondThreat.name}` : ""}，这更像环境压力而不是单个阵容问题。`;
  }
  if (battle.envLabel === "顺风") {
    return `整体偏顺，${easiest ? `${easiest.name} 是最容易转化成分数的对手，` : ""}但仍要防 ${topThreat.name} 的阶段性反制。`;
  }
  return `整体中性，关键在于管住 ${topThreat.name} 这类高威胁对局，并把 ${easiest ? easiest.name : "优势对手"} 稳定转化成拿分局。`;
}

function buildStrategy(profile: Profile, battle: ReturnType<typeof analyzeBattle>) {
  const topThreat = battle.threats[0];
  const easiest = battle.easiest[0];
  const counterItems = [
    ...new Set(
      battle.threats
        .slice(0, 2)
        .flatMap((item) => safeText(item.matchup.suggested_counter_items, "").split(/[、，,]/))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ].slice(0, 5);
  const lateCarry = profile.power_spike.includes("后期") || profile.phase_profile.includes("late:很强") || profile.phase_profile.includes("late:极强");
  return {
    tempo: lateCarry
      ? `优先保血和成型速度，别被 ${topThreat?.name || "高威胁阵容"} 提前打掉容错。`
      : `适合主动提速，在中期压缩 ${topThreat?.name || "高威胁阵容"} 的成型窗口。`,
    items: counterItems.length ? counterItems.join("、") : "通用保命装、针对装和启动装",
    target: `${topThreat ? `规避 ${topThreat.name}` : "规避高威胁对手"}${easiest ? `，主动找 ${easiest.name} 换血` : ""}`,
    risk:
      battle.threats
        .filter((item) => item.stageReversal)
        .slice(0, 2)
        .map((item) => `${item.name} 是阶段性反转对局`)
        .join("；") || "成型速度、装备完整度和站位会显著改变结果。"
  };
}

export function JccWorkbench({ data }: { data: JccData }) {
  const [activeName, setActiveName] = useState(data.profiles[0]?.display_name || "");
  const [enemyName, setEnemyName] = useState(data.profiles[1]?.display_name || "");
  const [activeTab, setActiveTab] = useState<Tab>("pairwise");
  const [query, setQuery] = useState("");
  const [battleOpponents, setBattleOpponents] = useState(() => data.profiles.slice(1, 8).map((profile) => profile.display_name));
  const workbenchRef = useRef<HTMLElement>(null);

  const activeProfile = data.profiles.find((profile) => profile.display_name === activeName) || data.profiles[0];
  const opponents = data.profiles.filter((profile) => profile.display_name !== activeName);
  const matchup = findMatchup(data, activeName, enemyName) || findMatchup(data, activeName, opponents[0]?.display_name || "");
  const top3 = data.top3.find((item) => item.display_comp_name === activeName);
  const battle = useMemo(() => analyzeBattle(data, activeName, battleOpponents), [activeName, battleOpponents, data]);
  const strategy = buildStrategy(activeProfile, battle);

  const filteredProfiles = data.profiles.filter((profile) => {
    const haystack = `${profile.display_name} ${profile.camp_name} ${profile.core_units} ${profile.version_tier}`;
    return haystack.toLowerCase().includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    const validOpponents = data.profiles.filter((profile) => profile.display_name !== activeName).map((profile) => profile.display_name);
    if (!validOpponents.includes(enemyName)) setEnemyName(validOpponents[0] || "");
    setBattleOpponents((current) => {
      const next = current.filter((name) => validOpponents.includes(name));
      for (const name of validOpponents) {
        if (next.length >= 7) break;
        if (!next.includes(name)) next.push(name);
      }
      return next.slice(0, 7);
    });
  }, [activeName, data.profiles, enemyName]);

  function openPairwise(comp: string, enemy: string) {
    setActiveName(comp);
    setEnemyName(enemy);
    setActiveTab("pairwise");
    window.requestAnimationFrame(() => workbenchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand-block">
          <span className="brand-mark">JCC</span>
          <div>
            <p>金铲铲高手</p>
            <h1>阵容博弈工作台</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className="status-pill">数据更新时间 {data.meta.updatedAt}</span>
          <span className={`status-pill ${toneClass(battle.envTone)}`}>{battle.envLabel}</span>
        </div>
      </section>

      <section className="stats-grid">
        <StatTile icon={<Sparkles size={18} />} label="精选阵容" value={`${data.profiles.length} 套`} detail="当前前端阵容池" />
        <StatTile icon={<Swords size={18} />} label="对阵关系" value={`${data.matchups.length} 条`} detail="用于 pairwise 和矩阵" />
        <StatTile icon={<ShieldAlert size={18} />} label="高威胁" value={`${battle.highThreats.length} 家`} detail="当前单局环境" />
        <StatTile icon={<Target size={18} />} label="可拿分" value={`${battle.easyTargets.length} 家`} detail="适合主动转换优势" />
      </section>

      <div className="workspace-grid">
        <aside className="side-panel">
          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索阵容、核心棋子" />
          </div>
          <div className="comp-stack">
            {filteredProfiles.map((profile) => (
              <button
                className={`comp-row ${profile.display_name === activeName ? "active" : ""}`}
                key={profile.display_name}
                onClick={() => setActiveName(profile.display_name)}
                type="button"
              >
                <span>
                  <strong>{profile.display_name}</strong>
                  <small>{profile.core_units.replaceAll("|", " / ")}</small>
                </span>
                <b>{profile.version_tier}</b>
              </button>
            ))}
          </div>
        </aside>

        <section className="main-column">
          <section className="profile-section">
            <div className="section-head">
              <div>
                <p>Profile</p>
                <h2>{activeProfile.display_name}</h2>
              </div>
              <span className="status-pill">{activeProfile.power_spike}</span>
            </div>
            <p className="lead-copy">{activeProfile.positioning}</p>
            <div className="profile-grid">
              <div className="info-block">
                <h3>核心棋子</h3>
                <TagList values={splitValues(activeProfile.core_units)} />
              </div>
              <div className="info-block">
                <h3>优先海克斯</h3>
                <TagList values={splitValues(activeProfile.priority_augments)} limit={8} />
              </div>
              <div className="info-block">
                <h3>节奏判断</h3>
                <p>{activeProfile.tempo_note}</p>
              </div>
              <div className="info-block">
                <h3>环境速览</h3>
                <p>
                  最好打：{safeText(top3?.best_enemy_1)} · {safeText(top3?.best_label_1)}
                </p>
                <p>
                  最该防：{safeText(top3?.worst_enemy_1)} · {safeText(top3?.worst_label_1)}
                </p>
              </div>
            </div>
          </section>

          <section className="workbench-section" ref={workbenchRef}>
            <div className="section-head">
              <div>
                <p>Workbench</p>
                <h2>对阵与单局分析</h2>
              </div>
              <div className="segmented">
                <button className={activeTab === "pairwise" ? "active" : ""} onClick={() => setActiveTab("pairwise")} type="button">
                  <Swords size={16} />
                  阵容对阵
                </button>
                <button className={activeTab === "battle" ? "active" : ""} onClick={() => setActiveTab("battle")} type="button">
                  <BarChart3 size={16} />
                  对局分析
                </button>
              </div>
            </div>

            {activeTab === "pairwise" ? (
              <div className="pairwise-layout">
                <div className="form-strip">
                  <label>
                    我方阵容
                    <select value={activeName} onChange={(event) => setActiveName(event.target.value)}>
                      {data.profiles.map((profile) => (
                        <option key={profile.display_name} value={profile.display_name}>
                          {profile.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    对手阵容
                    <select value={enemyName} onChange={(event) => setEnemyName(event.target.value)}>
                      {opponents.map((profile) => (
                        <option key={profile.display_name} value={profile.display_name}>
                          {profile.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="matchup-title">
                  <Crosshair size={20} />
                  <div>
                    <h3>
                      {activeName} vs {enemyName}
                    </h3>
                    <p>{safeText(matchup?.reason_text)}</p>
                  </div>
                  <span className={`status-pill ${toneClass(matchup?.overall_label)}`}>{safeText(matchup?.overall_label)}</span>
                </div>

                <div className="stage-grid">
                  {[
                    ["前期", matchup?.early_label],
                    ["中期", matchup?.mid_label],
                    ["后期", matchup?.late_label],
                    ["总体", matchup?.overall_label]
                  ].map(([label, value]) => (
                    <div className={`stage-box ${toneClass(value)}`} key={label}>
                      <span>{label}</span>
                      <strong>{safeText(value)}</strong>
                    </div>
                  ))}
                </div>

                <div className="two-column">
                  <div className="info-block">
                    <h3>为什么会这样</h3>
                    <ul>{matchupReasons(matchup).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  </div>
                  <div className="info-block">
                    <h3>怎么针对</h3>
                    <ul>
                      <li>装备：{safeText(matchup?.suggested_counter_items)}</li>
                      <li>海克斯：{safeText(matchup?.suggested_augment_themes)}</li>
                      <li>站位：{safeText(matchup?.positioning_advice)}</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="battle-layout">
                <div className="form-strip battle-form">
                  <label>
                    我的阵容
                    <select value={activeName} onChange={(event) => setActiveName(event.target.value)}>
                      {data.profiles.map((profile) => (
                        <option key={profile.display_name} value={profile.display_name}>
                          {profile.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {battleOpponents.map((name, index) => (
                    <label key={`${name}-${index}`}>
                      对手 {index + 1}
                      <select
                        value={name}
                        onChange={(event) => {
                          setBattleOpponents((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)));
                        }}
                      >
                        {opponents.map((profile) => (
                          <option key={profile.display_name} value={profile.display_name}>
                            {profile.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="battle-summary">
                  <span className={`env-badge ${toneClass(battle.envTone)}`}>{battle.envLabel}</span>
                  <p>{battleSummary(battle)}</p>
                </div>

                <div className="two-column">
                  <div className="info-block">
                    <h3>威胁排序</h3>
                    <ol className="rank-list">
                      {battle.threats.slice(0, 4).map((item) => (
                        <li key={item.name}>
                          <button type="button" onClick={() => openPairwise(activeName, item.name)}>
                            <span>{item.name}</span>
                            <b className={toneClass(item.matchup.overall_label)}>{item.matchup.overall_label}</b>
                          </button>
                          <small>{item.reasons.slice(0, 2).join("；") || item.matchup.reason_text}</small>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="info-block">
                    <h3>策略建议</h3>
                    <ul>
                      <li>节奏：{strategy.tempo}</li>
                      <li>装备：{strategy.items}</li>
                      <li>目标：{strategy.target}</li>
                      <li>风险：{strategy.risk}</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="matrix-section">
            <div className="section-head">
              <div>
                <p>Matrix</p>
                <h2>环境矩阵</h2>
              </div>
              <span className="status-pill">
                <LayoutGrid size={15} />
                点击格子跳转
              </span>
            </div>
            <div className="matrix-wrap">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th />
                    {data.profiles.map((profile) => (
                      <th className={profile.display_name === activeName ? "active-axis" : ""} key={profile.display_name}>
                        {profile.display_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.profiles.map((row) => (
                    <tr key={row.display_name}>
                      <th className={row.display_name === activeName ? "active-axis" : ""}>{row.display_name}</th>
                      {data.profiles.map((col) => {
                        if (row.display_name === col.display_name) {
                          return <td className="self-cell" key={col.display_name}>-</td>;
                        }
                        const cellMatchup = findMatchup(data, row.display_name, col.display_name);
                        return (
                          <td
                            className={`${toneClass(cellMatchup?.overall_label)} ${row.display_name === activeName ? "active-row" : ""} ${col.display_name === activeName ? "active-col" : ""}`}
                            key={col.display_name}
                            onClick={() => openPairwise(row.display_name, col.display_name)}
                          >
                            {safeText(cellMatchup?.overall_label, "-")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
