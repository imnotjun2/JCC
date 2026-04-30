﻿const state = {
  data: null,
  activeProfile: null,
  activeTab: "pairwise",
  pairwiseEnemy: null,
  battleOpponents: [],
};

const labelTone = {
  "明显克制": "is-win",
  "小优": "is-win",
  "五五开": "is-even",
  "小劣": "is-lose",
  "明显被克": "is-lose",
  "条件互克": "is-conditional",
};

function splitValues(value, separator = "|") {
  return String(value || "").split(separator).map((item) => item.trim()).filter(Boolean);
}
function safeText(value, fallback = "暂无") {
  const text = String(value || "").trim();
  return text || fallback;
}
function numericScore(matchup) {
  const value = matchup?.curated_score ?? matchup?.matchup_score ?? 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function toneClass(label) { return labelTone[label] || "is-even"; }
function chip(text, tone = "") { return `<span class="status-chip ${tone}">${text}</span>`; }
function tagList(values) { return values.map((item) => `<span class="tag">${item}</span>`).join(""); }
function reasonTags(matchup, limit = 2) {
  return [matchup?.reason_1, matchup?.reason_2, matchup?.reason_3, matchup?.reason_4].filter(Boolean).slice(0, limit).map((item) => `<span class="reason-tag">${item}</span>`).join("");
}
function allProfiles() { return state.data.profiles; }
function findProfile(name) { return allProfiles().find((item) => item.display_name === name); }
function findMatchup(compName, enemyName) {
  return state.data.matchups.find((item) => item.display_comp_name === compName && item.display_enemy_name === enemyName);
}
function nonActiveProfiles() { return allProfiles().filter((item) => item.display_name !== state.activeProfile); }

function syncBattleOpponents(force = false) {
  const others = nonActiveProfiles().map((item) => item.display_name);
  const valid = state.battleOpponents.filter((name) => others.includes(name));
  const next = [];
  for (const name of valid) if (!next.includes(name)) next.push(name);
  for (const name of others) {
    if (next.length >= 7) break;
    if (!next.includes(name)) next.push(name);
  }
  if (force || next.length !== state.battleOpponents.length || next.some((item, index) => item !== state.battleOpponents[index])) {
    state.battleOpponents = next.slice(0, 7);
  }
  if (!state.pairwiseEnemy || state.pairwiseEnemy === state.activeProfile) {
    state.pairwiseEnemy = others[0] || null;
  }
}

function buildMeta() {
  document.getElementById("prdFocus").innerHTML = ["阵容认知", "阵容对阵", "对局分析", "环境矩阵"].map((item) => `<span class="pill">${item}</span>`).join("");
  document.getElementById("metaNote").innerHTML = [
    "左侧阵容池负责全局切换：Profile、阵容对阵、对局分析、矩阵高亮会同步更新。",
    "对局分析里的高威胁对手可直接回跳到阵容对阵页，查看前中后期关系和针对建议。",
    "环境矩阵是全局入口，点击任意单元格可直接进入对应 pairwise 对阵。",
  ].map((item) => `<div>${item}</div>`).join("");
}

function buildSidebar() {
  const wrap = document.getElementById("compList");
  wrap.innerHTML = allProfiles().map((profile) => {
    const active = profile.display_name === state.activeProfile ? "active" : "";
    return `
      <button class="comp-button ${active}" data-name="${profile.display_name}">
        <strong>${profile.display_name}</strong>
        <span>${safeText(profile.version_tier)} · ${safeText(profile.power_spike)}</span>
      </button>
    `;
  }).join("");
  wrap.querySelectorAll(".comp-button").forEach((button) => {
    button.addEventListener("click", () => setActiveProfile(button.dataset.name));
  });
}

function setActiveProfile(name) {
  state.activeProfile = name;
  syncBattleOpponents();
  buildSidebar();
  renderProfile();
  renderWorkbench();
  renderIntelFeed();
  renderMatrix();
}

function renderProfile() {
  const profile = findProfile(state.activeProfile);
  const top3 = state.data.top3.find((item) => item.display_comp_name === state.activeProfile);
  const phases = splitValues(profile.phase_profile).map((chunk) => chunk.replace("early:", "前期 ").replace("mid:", "中期 ").replace("late:", "后期 "));

  // 生成核心棋子图标HTML
  const coreUnits = splitValues(profile.core_units);
  const unitIconsHtml = coreUnits.map(unitName => {
    const iconUrl = getUnitIcon(unitName);
    return iconUrl ? `
      <div class="unit-icon-item">
        <img src="${iconUrl}" alt="${unitName}" class="profile-unit-icon" title="${unitName}">
        <span class="unit-icon-name">${unitName}</span>
      </div>
    ` : `<span class="tag">${unitName}</span>`;
  }).join('');

  // 生成优先海克斯图标HTML
  const priorityAugments = splitValues(profile.priority_augments).slice(0, 8);
  const augmentIconsHtml = priorityAugments.map(augmentName => {
    const iconUrl = getAugmentIcon(augmentName);
    return iconUrl ? `
      <div class="augment-icon-item">
        <img src="${iconUrl}" alt="${augmentName}" class="profile-augment-icon" title="${augmentName}">
        <span class="augment-icon-name">${augmentName}</span>
      </div>
    ` : `<span class="tag">${augmentName}</span>`;
  }).join('');

  document.getElementById("profilePanel").innerHTML = `
    <div class="profile-top">
      <div class="profile-title">
        <p class="panel-kicker">Profile</p>
        <h2>${profile.display_name}</h2>
        <p>${safeText(profile.positioning)}</p>
        <div class="chip-row">
          ${chip(`版本评级 ${safeText(profile.version_tier)}`)}
          ${chip(`强势期 ${safeText(profile.power_spike)}`)}
          ${chip(`阵容定位 ${safeText(profile.camp_name).replace(/\s&&\s/, " / ")}`)}
        </div>
      </div>
      <div class="detail-card">
        <h3>核心棋子</h3>
        <div class="icon-list">${unitIconsHtml}</div>
        <h3 style="margin-top:18px;">优先海克斯</h3>
        <div class="icon-list">${augmentIconsHtml}</div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-card"><h3>玩法摘要</h3><p>${safeText(profile.playstyle)}</p></div>
      <div class="detail-card"><h3>节奏判断</h3><p>${safeText(profile.tempo_note)}</p></div>
      <div class="detail-card"><h3>站位提醒</h3><p>${safeText(profile.standing_notes)}</p></div>
    </div>
    <div class="insight-grid">
      <div class="insight-card"><h3>阶段强势期</h3><div class="tag-list">${phases.map((item) => `<span class="tiny-chip">${item}</span>`).join("")}</div></div>
      <div class="insight-card"><h3>环境速览</h3><ul><li>最容易拿到优势的对局：${safeText(top3?.best_enemy_1)} · ${safeText(top3?.best_label_1)}</li><li>最值得避开的对局：${safeText(top3?.worst_enemy_1)} · ${safeText(top3?.worst_label_1)}</li></ul></div>
      <div class="insight-card"><h3>优势点</h3><ul>${splitValues(profile.manual_strengths).map((item) => `<li>${item}</li>`).join("")}</ul></div>
      <div class="insight-card"><h3>风险点</h3><ul>${splitValues(profile.manual_weaknesses).map((item) => `<li>${item}</li>`).join("")}</ul></div>
    </div>
  `;
}

function renderWorkbench() {
  document.getElementById("tabPairwise").classList.toggle("active", state.activeTab === "pairwise");
  document.getElementById("tabBattle").classList.toggle("active", state.activeTab === "battle");
  if (state.activeTab === "pairwise") renderPairwiseTab(); else renderBattleTab();
}

function pairwiseOptions(selected) {
  return allProfiles().map((profile) => `<option value="${profile.display_name}" ${profile.display_name === selected ? "selected" : ""}>${profile.display_name}</option>`).join("");
}

function renderPairwiseTab() {
  const enemy = state.pairwiseEnemy || nonActiveProfiles()[0]?.display_name;
  const matchup = findMatchup(state.activeProfile, enemy);
  const content = document.getElementById("tabContent");
  if (!matchup) {
    content.innerHTML = `<div class="empty-state">当前阵容对阵数据不存在。</div>`;
    return;
  }
  content.innerHTML = `
    <div class="compare-head">
      <p class="panel-kicker">Pairwise</p>
      <h2>${state.activeProfile} vs ${enemy}</h2>
      <p>${safeText(matchup.reason_text)}</p>
    </div>
    <div class="input-shell">
      <div class="input-card header-accent">
        <h3>选择对阵</h3>
        <div class="form-grid">
          <label class="field-block"><span>我方阵容</span><select id="pairwiseMy">${pairwiseOptions(state.activeProfile)}</select></label>
          <label class="field-block"><span>对手阵容</span><select id="pairwiseEnemy">${pairwiseOptions(enemy)}</select></label>
        </div>
      </div>
      <div class="input-side-card header-accent">
        <h3>对阵摘要</h3>
        <div class="chip-row">${chip(`总体 ${safeText(matchup.overall_label)}`, toneClass(matchup.overall_label))}</div>
        <p class="product-note">重点看前中后期关系是不是一致。如果出现阶段性反转，不要只按总体结论做决定。</p>
      </div>
    </div>
    <div class="stage-grid" style="margin-bottom:16px;">
      ${[["前期", matchup.early_label], ["中期", matchup.mid_label], ["后期", matchup.late_label], ["总体", matchup.overall_label]].map(([label, value]) => `
        <div class="stage-card ${toneClass(value)}"><span>${label}</span><strong>${safeText(value)}</strong></div>
      `).join("")}
    </div>
    <div class="compare-grid">
      <div class="compare-card"><h3>为什么会这样</h3><ul>${[matchup.reason_1, matchup.reason_2, matchup.reason_3, matchup.reason_4].filter(Boolean).map((item) => `<li>${item}</li>`).join("")}</ul></div>
      <div class="compare-card"><h3>怎么针对</h3><ul><li>装备方向：${safeText(matchup.suggested_counter_items)}</li><li>海克斯方向：${safeText(matchup.suggested_augment_themes)}</li><li>站位建议：${safeText(matchup.positioning_advice)}</li></ul></div>
    </div>
  `;
  document.getElementById("pairwiseMy").addEventListener("change", (event) => setActiveProfile(event.target.value));
  document.getElementById("pairwiseEnemy").addEventListener("change", (event) => { state.pairwiseEnemy = event.target.value; renderWorkbench(); });
}

function battleOptions(selected) {
  return nonActiveProfiles().map((profile) => `<option value="${profile.display_name}" ${profile.display_name === selected ? "selected" : ""}>${profile.display_name}</option>`).join("");
}

function readBattleSelections() {
  const selects = Array.from(document.querySelectorAll(".battle-enemy-select"));
  const raw = selects.map((select) => select.value).filter(Boolean);
  const unique = [];
  raw.forEach((name) => { if (!unique.includes(name)) unique.push(name); });
  return unique;
}
function analyzeEnvironment() {
  const myName = state.activeProfile;
  const opponents = state.battleOpponents.map((enemy) => ({ name: enemy, matchup: findMatchup(myName, enemy) })).filter((item) => item.matchup);
  const enriched = opponents.map((item) => {
    const score = numericScore(item.matchup);
    const reasons = [item.matchup.reason_1, item.matchup.reason_2, item.matchup.reason_3, item.matchup.reason_4].filter(Boolean);
    const stageLabels = [item.matchup.early_label, item.matchup.mid_label, item.matchup.late_label].filter(Boolean);
    const stageReversal = new Set(stageLabels.map((label) => toneClass(label))).size > 1 || item.matchup.overall_label === "条件互克";
    return { ...item, score, reasons, stageReversal };
  });

  const avgScore = enriched.reduce((sum, item) => sum + item.score, 0) / Math.max(enriched.length, 1);
  const threats = [...enriched].sort((a, b) => a.score - b.score);
  const easiest = [...enriched].sort((a, b) => b.score - a.score);
  const highThreats = threats.filter((item) => item.score <= -0.8 || toneClass(item.matchup.overall_label) === "is-lose");
  const easyTargets = easiest.filter((item) => item.score >= 0.8 || toneClass(item.matchup.overall_label) === "is-win");

  let envLabel = "中性";
  let envTone = "is-mid";
  if (avgScore >= 0.45) { envLabel = "顺风"; envTone = "is-good"; }
  else if (avgScore <= -0.45) { envLabel = "逆风"; envTone = "is-bad"; }

  return { myName, enriched, threats, easiest, highThreats, easyTargets, avgScore, envLabel, envTone };
}

function buildBattleSummary(battle) {
  const topThreat = battle.threats[0];
  const secondThreat = battle.threats[1];
  const easiest = battle.easiest[0];
  if (!topThreat) return "暂无对局数据。";
  if (battle.envLabel === "逆风") return `这局整体偏逆风，最需要优先处理的是 ${topThreat.name}${secondThreat ? ` 和 ${secondThreat.name}` : ""}。当前更像环境压力，而不是单纯阵容本身弱。`;
  if (battle.envLabel === "顺风") return `这局整体偏顺，${easiest ? `${easiest.name} 是最容易拿分的对手，` : ""}但仍要重点防 ${topThreat.name} 的阶段性反制。`;
  return `这局整体中性，决策重点在 ${topThreat.name} 这类高威胁对局上，同时尽量把 ${easiest ? easiest.name : "可打对手"} 转化成稳定拿分局。`;
}

function aggregateItems(battle) {
  return [...new Set(battle.threats.slice(0, 2).flatMap((item) => safeText(item.matchup.suggested_counter_items, "").split(/[、，,]/)).map((item) => item.trim()).filter(Boolean))].slice(0, 5);
}

function aggregateAdvice(battle, field) {
  return battle.threats.slice(0, 2).map((item) => safeText(item.matchup[field], "")).filter((item) => item && item !== "暂无").join("；");
}

function strategyText(battle) {
  const profile = findProfile(state.activeProfile);
  const topThreat = battle.threats[0];
  const easiest = battle.easiest[0];
  const itemList = aggregateItems(battle);
  const augment = aggregateAdvice(battle, "suggested_augment_themes") || safeText(profile.priority_augments).replace(/\|/g, "、");
  const positioning = aggregateAdvice(battle, "positioning_advice") || safeText(profile.standing_notes);
  const lateCarry = safeText(profile.power_spike).includes("后期") || safeText(profile.phase_profile).includes("late:很强") || safeText(profile.phase_profile).includes("late:极强");
  const tempo = lateCarry ? `当前优先保血并确保成型速度，关键目标是别被 ${topThreat?.name || "高威胁对手"} 提前滚死。` : `当前更适合主动提速，尽量在中期把 ${topThreat?.name || "高威胁对手"} 的成型窗口压缩掉。`;
  const target = `${topThreat ? `优先规避 ${topThreat.name}` : "优先规避高威胁对手"}${easiest ? `，并尽量把 ${easiest.name} 转成拿分对局` : ""}。`;
  const risk = battle.threats.filter((item) => item.stageReversal).slice(0, 2).map((item) => `${item.name} 属于阶段性反转对局，不能只看总体结论。`);
  return {
    tempo,
    items: itemList.length ? `优先考虑 ${itemList.join("、")}` : "优先补通用保命装与针对装。",
    augment,
    positioning,
    target,
    risk: risk.length ? risk.join("；") : "当前结论是对局参考，不等于绝对胜率，成型节奏会显著改变结果。",
  };
}

function renderBattleOutput(battle) {
  const summary = buildBattleSummary(battle);
  const strategy = strategyText(battle);
  const threatRows = battle.threats.slice(0, 4).map((item) => `
    <li>
      <div class="rank-title"><span>${item.name}</span><button type="button" class="tiny-chip" data-open-pair="${item.name}">查看对阵</button></div>
      <div class="rank-meta">${chip(item.matchup.overall_label, toneClass(item.matchup.overall_label))}${item.stageReversal ? '<span class="reason-tag">阶段性反转</span>' : ''}</div>
      <p>${item.reasons.slice(0, 2).join("；") || safeText(item.matchup.reason_text)}</p>
    </li>
  `).join("");

  const easyRows = battle.easiest.slice(0, 3).map((item) => `
    <li>
      <div class="rank-title"><span>${item.name}</span>${chip(item.matchup.overall_label, toneClass(item.matchup.overall_label))}</div>
      <p>${item.reasons.slice(0, 1).join("；") || safeText(item.matchup.reason_text)}</p>
    </li>
  `).join("");

  const localMatrix = battle.enriched.map((item) => `
    <div class="local-matrix-item ${toneClass(item.matchup.overall_label)}">
      <strong>${item.name}</strong>
      <div>${item.matchup.overall_label}</div>
      <div class="rank-meta">${reasonTags(item.matchup, 1)}</div>
    </div>
  `).join("");

  return `
    <div class="summary-grid summary-top" style="margin-top:18px; margin-bottom:16px;">
      <div class="summary-card"><h3>当前环境</h3><div class="chip-row"><span class="environment-badge ${battle.envTone}">${battle.envLabel}</span></div><p>${summary}</p></div>
      <div class="summary-card"><h3>高威胁对手</h3><strong>${battle.highThreats.length}</strong><p>需要优先规避或重点准备针对策略的对手数量。</p></div>
      <div class="summary-card"><h3>可稳定拿分对手</h3><strong>${battle.easyTargets.length}</strong><p>当前环境里更适合主动寻找优势交换的对手数量。</p></div>
    </div>
    <div class="rank-grid" style="margin-bottom:16px;">
      <div class="rank-item"><h3>威胁排序</h3><ol>${threatRows}</ol></div>
      <div class="rank-item"><h3>优势对局</h3><ol>${easyRows}</ol></div>
    </div>
    <div class="strategy-grid" style="margin-bottom:16px;">
      <div class="strategy-card"><h3>局势总结</h3><p>${summary}</p></div>
      <div class="strategy-card"><h3>节奏建议</h3><p>${strategy.tempo}</p></div>
      <div class="strategy-card"><h3>装备与海克斯建议</h3><ul><li>${strategy.items}</li><li>${strategy.augment}</li></ul></div>
      <div class="strategy-card"><h3>站位与目标管理</h3><ul><li>${strategy.positioning}</li><li>${strategy.target}</li></ul></div>
      <div class="strategy-card"><h3>风险提醒</h3><p>${strategy.risk}</p></div>
      <div class="strategy-card"><h3>局部克制矩阵</h3><div class="local-matrix">${localMatrix}</div></div>
    </div>
  `;
}

function renderBattleTab() {
  syncBattleOpponents();
  const content = document.getElementById("tabContent");
  const battle = analyzeEnvironment();
  const topThreat = battle.threats[0];
  const easiest = battle.easiest[0];

  content.innerHTML = `
    <div class="analysis-hero">
      <p class="panel-kicker">Battle</p>
      <h2>${state.activeProfile} 的单局分析</h2>
      <p>录入当前 7 家环境后，直接判断这局最该防谁、最好打谁，以及策略重点应该放在哪。</p>
    </div>
    <div class="input-shell">
      <div class="input-card header-accent">
        <h3>录入对局环境</h3>
        <div class="form-grid">
          <label class="field-block"><span>我的阵容</span><select id="battleMy">${pairwiseOptions(state.activeProfile)}</select></label>
          <div></div>
          ${state.battleOpponents.map((name, index) => `<label class="field-block"><span>对手 ${index + 1}</span><select class="battle-enemy-select" data-index="${index}">${battleOptions(name)}</select></label>`).join("")}
        </div>
        <div class="action-row"><button id="analyzeBtn" class="primary-btn" type="button">开始分析</button><span class="helper-text">录入结果会同步刷新威胁排序、策略建议和局部矩阵。</span></div>
      </div>
      <div class="input-side-card header-accent">
        <h3>本局快照</h3>
        <div class="chip-row"><span class="environment-badge ${battle.envTone}">${battle.envLabel}</span></div>
        <p class="product-note">${buildBattleSummary(battle)}</p>
        <div class="tag-list" style="margin-top:12px;">${topThreat ? `<span class="tiny-chip">最怕 ${topThreat.name}</span>` : ""}${easiest ? `<span class="tiny-chip">最好打 ${easiest.name}</span>` : ""}<span class="tiny-chip">${battle.highThreats.length} 家高威胁</span></div>
      </div>
    </div>
    <div id="battleOutput">${renderBattleOutput(battle)}</div>
  `;

  document.getElementById("battleMy").addEventListener("change", (event) => {
    setActiveProfile(event.target.value);
    state.activeTab = "battle";
    renderWorkbench();
  });
  document.querySelectorAll(".battle-enemy-select").forEach((select) => {
    select.addEventListener("change", () => { state.battleOpponents = readBattleSelections(); });
  });
  document.getElementById("analyzeBtn").addEventListener("click", () => {
    state.battleOpponents = readBattleSelections();
    renderBattleTab();
  });
  document.querySelectorAll("[data-open-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pairwiseEnemy = button.dataset.openPair;
      state.activeTab = "pairwise";
      renderWorkbench();
    });
  });
}
function renderIntelFeed() {
  document.getElementById("intelIntro").innerHTML = `
    <div class="intel-compact-grid">
      <div class="intel-card compact">
        <div class="intel-meta"><span>JCCBot</span><span class="dev-badge">开发中</span></div>
        <h3>今日上分日报</h3>
        <p class="product-note">这个区域暂时只保留日报入口位，后续再接入自动生成的环境摘要、矩阵提醒和单局信号。</p>
      </div>
      <div class="intel-card compact">
        <div class="intel-meta"><span>当前联动</span><span>${state.activeProfile}</span></div>
        <p class="product-note">日报会围绕当前阵容池和环境矩阵做轻量触达，主工作流仍然回到网页里的阵容对阵和对局分析。</p>
      </div>
    </div>
  `;
  document.getElementById("intelFeed").innerHTML = `
    <article class="intel-card compact daily-report-card">
      <div class="intel-meta"><span>开发占位</span><span>今日上分日报.py</span></div>
      <h3>今日上分日报</h3>
      <p>这里先作为 JCCBot 的日报卡片位，后续只接日报、矩阵摘要和关键提醒。</p>
    </article>
  `;
}
function renderMatrix() {
  const names = allProfiles().map((profile) => profile.display_name);
  const head = names.map((name) => `<th class="col-head ${name === state.activeProfile ? "is-active" : ""}">${name}</th>`).join("");
  const rows = names.map((rowName) => {
    const cells = names.map((colName) => {
      if (rowName === colName) return `<td class="matrix-cell is-self">-</td>`;
      const matchup = findMatchup(rowName, colName);
      const label = safeText(matchup?.overall_label, "-");
      const activeRow = rowName === state.activeProfile ? "is-active-row" : "";
      const activeCol = colName === state.activeProfile ? "is-active-col" : "";
      return `<td class="matrix-cell ${toneClass(label)} ${activeRow} ${activeCol}" data-comp="${rowName}" data-enemy="${colName}" title="${rowName} 对 ${colName}: ${label}">${label}</td>`;
    }).join("");
    return `<tr><th class="row-head ${rowName === state.activeProfile ? "is-active" : ""}">${rowName}</th>${cells}</tr>`;
  }).join("");

  document.getElementById("matrixWrap").innerHTML = `
    <table class="matrix">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.querySelectorAll(".matrix-cell[data-comp]").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.activeTab = "pairwise";
      state.pairwiseEnemy = cell.dataset.enemy;
      setActiveProfile(cell.dataset.comp);
      window.scrollTo({ top: document.querySelector('.workbench-panel').offsetTop - 100, behavior: 'smooth' });
    });
  });
}

function loadData() {
  const inline = document.getElementById("demo-data");
  if (inline?.textContent?.trim()) return Promise.resolve(JSON.parse(inline.textContent));
  return fetch("./data/demo-data.json").then((response) => response.json());
}

async function init() {
  state.data = await loadData();
  state.activeProfile = allProfiles()[0].display_name;
  syncBattleOpponents(true);
  buildMeta();
  buildSidebar();
  renderProfile();
  renderWorkbench();
  renderIntelFeed();
  renderMatrix();

  document.getElementById("tabPairwise").addEventListener("click", () => {
    state.activeTab = "pairwise";
    renderWorkbench();
  });
  document.getElementById("tabBattle").addEventListener("click", () => {
    state.activeTab = "battle";
    renderWorkbench();
  });
}

init().catch((error) => {
  document.body.innerHTML = `
    <div class="page-shell">
      <div class="panel">
        <h2>页面加载失败</h2>
        <p class="empty-state">${String(error)}</p>
      </div>
    </div>
  `;
});


