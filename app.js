"use strict";
// ※ BASE_FIELDS, DAY_KEYS, DOW_TO_KEY 等は util.js / storage.js で定義済み
// ※ toMinutes, sumMinutes 等は calc.js で定義済み
// ※ saveTemplate, loadTemplate 等は storage.js で定義済み

// ============================================================
//  定数（UI ラベル）
// ============================================================

const DAY_LABELS = {
  mon: "月", tue: "火", wed: "水", thu: "木",
  fri: "金", sat: "土", sun: "日",
};

const BASE_LABELS = {
  sleep: "睡眠", work: "仕事", commute: "通勤",
  meal: "食事", bath: "入浴身支度",
};

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// ============================================================
//  通知システム
// ============================================================

/**
 * 画面上部にトースト通知を表示する
 * @param {string} message  表示テキスト（改行可）
 * @param {"success"|"error"} type
 */
function showNotification(message, type = "success") {
  let area = document.getElementById("notification-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "notification-area";
    document.body.prepend(area);
  }

  const el = document.createElement("div");
  el.className = `notification notification-${type}`;
  el.textContent = message;
  area.appendChild(el);

  const duration = type === "error" ? 6000 : 3000;

  const dismiss = () => {
    if (!el.parentNode) return;
    el.classList.add("fade-out");
    el.addEventListener("animationend", () => el.remove());
  };

  el.addEventListener("click", dismiss);
  setTimeout(dismiss, duration);
}

// ============================================================
//  DOM ヘルパー
// ============================================================

/**
 * 数値 input から値を読み取る（計算用 — 寛容モード）
 * - 空欄 → 0
 * - 数値でない入力 → 0
 * - 負数 → 0 にクランプ
 * - 小数 → 切り捨て
 */
function getNum(id) {
  const el = document.getElementById(id);
  if (el.validity && el.validity.badInput) return 0;
  const v = el.value.trim();
  if (v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function setVal(id, value) {
  document.getElementById(id).value = value;
}

function getSelectedDate() {
  return document.getElementById("ov-date").value;
}

function getSelectedMode() {
  return document.querySelector('input[name="tpl-mode"]:checked').value;
}

// ============================================================
//  入力バリデーション（保存用 — 厳格モード）
// ============================================================

/**
 * 単一の数値 input を厳格に検証する
 * @param {string} id    要素 ID
 * @param {string} label エラーメッセージ用ラベル
 * @param {Object} opts
 * @param {number} opts.min 最小値（デフォルト 0）
 * @param {number} opts.max 最大値（デフォルト Infinity）
 * @returns {{ ok: boolean, value: number, msg: string|null }}
 */
function validateField(id, label, { min = 0, max = Infinity } = {}) {
  const el = document.getElementById(id);

  // ブラウザが「数値でない」と判定した入力
  if (el.validity && el.validity.badInput) {
    return { ok: false, value: 0, msg: `${label}: 数値を入力してください` };
  }

  const raw = el.value.trim();
  if (raw === "") return { ok: true, value: 0, msg: null };

  const num = Number(raw);

  if (!Number.isFinite(num)) {
    return { ok: false, value: 0, msg: `${label}: 有効な数値を入力してください` };
  }
  if (!Number.isInteger(num)) {
    return { ok: false, value: 0, msg: `${label}: 整数を入力してください` };
  }
  if (num < min) {
    return { ok: false, value: 0, msg: `${label}: ${min}以上で入力してください` };
  }
  if (num > max) {
    return { ok: false, value: 0, msg: `${label}: ${max}以下で入力してください` };
  }

  return { ok: true, value: num, msg: null };
}

/**
 * 基本5項目を厳格に検証する
 * @param {string} prefix     "wd"|"hd"|"ov"|"mon"|...
 * @param {string} groupLabel "平日"|"休日"|"月曜"|"日別上書き"|...
 * @returns {{ errors: string[], base: Object }}
 */
function validateBaseFields(prefix, groupLabel) {
  const errors = [];
  const base   = {};

  BASE_FIELDS.forEach((f) => {
    const fLabel  = `${groupLabel} ${BASE_LABELS[f]}`;
    const hResult = validateField(`${prefix}-${f}-h`, `${fLabel}（時間）`, { min: 0, max: 24 });
    const mResult = validateField(`${prefix}-${f}-m`, `${fLabel}（分）`,   { min: 0, max: 59 });
    if (!hResult.ok) errors.push(hResult.msg);
    if (!mResult.ok) errors.push(mResult.msg);
    base[f] = toMinutes(hResult.value, mResult.value);
  });

  return { errors, base };
}

/**
 * 追加項目（最大3件）を厳格に検証する
 * @param {string} idPrefix   "extra"|"ov-extra"|"mon-extra"|...
 * @param {string} groupLabel "共通"|"日別上書き"|"月曜"|...
 * @returns {{ errors: string[], extras: Array }}
 */
function validateExtrasFields(idPrefix, groupLabel) {
  const errors = [];
  const extras = [];

  for (let i = 1; i <= 3; i++) {
    const name = document.getElementById(`${idPrefix}-name-${i}`).value.trim();
    const hRes = validateField(`${idPrefix}-h-${i}`, `${groupLabel} 追加${i}（時間）`, { min: 0, max: 24 });
    const mRes = validateField(`${idPrefix}-m-${i}`, `${groupLabel} 追加${i}（分）`,   { min: 0, max: 59 });
    if (!hRes.ok) errors.push(hRes.msg);
    if (!mRes.ok) errors.push(mRes.msg);

    const mins = toMinutes(hRes.value, mRes.value);
    if (name !== "" && mins > 0) {
      extras.push({ name, minutes: mins });
    }
  }

  return { errors, extras };
}

/**
 * weekdayWeekend フォーム全体を厳格に検証する
 * 入力値の検証 + 合計 1440 分チェック
 * @returns {string[]} エラーメッセージ配列（空なら OK）
 */
function validateTemplateWeekdayWeekend() {
  const errors = [];

  const wdBase = validateBaseFields("wd", "平日");
  const hdBase = validateBaseFields("hd", "休日");
  const extras = validateExtrasFields("extra", "共通");
  errors.push(...wdBase.errors, ...hdBase.errors, ...extras.errors);

  // 入力値エラーがなければ合計チェック
  if (errors.length === 0) {
    const wdTotalErr = validateTotal(sumMinutes(wdBase.base, extras.extras));
    const hdTotalErr = validateTotal(sumMinutes(hdBase.base, extras.extras));
    if (wdTotalErr) errors.push(`【平日】${wdTotalErr}`);
    if (hdTotalErr) errors.push(`【休日】${hdTotalErr}`);
  }

  return errors;
}

/**
 * byDay フォーム全体を厳格に検証する
 * @returns {string[]} エラーメッセージ配列（空なら OK）
 */
function validateTemplateByDay() {
  const errors = [];

  DAY_KEYS.forEach((key) => {
    const label   = `${DAY_LABELS[key]}曜`;
    const base    = validateBaseFields(key, label);
    const extras  = validateExtrasFields(`${key}-extra`, label);
    errors.push(...base.errors, ...extras.errors);

    // 個別合計チェック
    if (base.errors.length === 0 && extras.errors.length === 0) {
      const totalErr = validateTotal(sumMinutes(base.base, extras.extras));
      if (totalErr) errors.push(`【${label}】${totalErr}`);
    }
  });

  return errors;
}

/**
 * 上書きフォームを厳格に検証する
 * @returns {string[]} エラーメッセージ配列（空なら OK）
 */
function validateOverrideFields() {
  const errors = [];

  const base   = validateBaseFields("ov", "上書き");
  const extras = validateExtrasFields("ov-extra", "上書き");
  errors.push(...base.errors, ...extras.errors);

  if (errors.length === 0) {
    const totalErr = validateTotal(sumMinutes(base.base, extras.extras));
    if (totalErr) errors.push(totalErr);
  }

  return errors;
}

// ============================================================
//  フォーム読み取り（計算用 — 寛容モード）
// ============================================================

function readBaseFromForm(prefix) {
  return {
    sleep:   toMinutes(getNum(`${prefix}-sleep-h`),   getNum(`${prefix}-sleep-m`)),
    work:    toMinutes(getNum(`${prefix}-work-h`),    getNum(`${prefix}-work-m`)),
    commute: toMinutes(getNum(`${prefix}-commute-h`), getNum(`${prefix}-commute-m`)),
    meal:    toMinutes(getNum(`${prefix}-meal-h`),    getNum(`${prefix}-meal-m`)),
    bath:    toMinutes(getNum(`${prefix}-bath-h`),    getNum(`${prefix}-bath-m`)),
  };
}

function readExtrasFromForm(idPrefix) {
  const items = [];
  for (let i = 1; i <= 3; i++) {
    const name = document.getElementById(`${idPrefix}-name-${i}`).value.trim();
    const h    = getNum(`${idPrefix}-h-${i}`);
    const m    = getNum(`${idPrefix}-m-${i}`);
    const mins = toMinutes(h, m);
    if (name !== "" && mins > 0) {
      items.push({ name, minutes: mins });
    }
  }
  return items;
}

function writeBaseToForm(prefix, base) {
  BASE_FIELDS.forEach((f) => {
    const mins = base[f] || 0;
    setVal(`${prefix}-${f}-h`, Math.floor(mins / 60));
    setVal(`${prefix}-${f}-m`, mins % 60);
  });
}

function writeExtrasToForm(idPrefix, extras) {
  for (let i = 1; i <= 3; i++) {
    const ex = (extras || [])[i - 1];
    if (ex) {
      setVal(`${idPrefix}-name-${i}`, ex.name || "");
      setVal(`${idPrefix}-h-${i}`,    Math.floor((ex.minutes || 0) / 60));
      setVal(`${idPrefix}-m-${i}`,    (ex.minutes || 0) % 60);
    } else {
      setVal(`${idPrefix}-name-${i}`, "");
      setVal(`${idPrefix}-h-${i}`,    "");
      setVal(`${idPrefix}-m-${i}`,    "");
    }
  }
}

// ============================================================
//  byDay フォーム動的生成
// ============================================================

function generateByDayForms() {
  const container = document.getElementById("byday-container");
  if (!container || container.children.length > 0) return;

  DAY_KEYS.forEach((key) => {
    const label     = DAY_LABELS[key];
    const isWeekend = key === "sat" || key === "sun";

    const baseRows = BASE_FIELDS.map((f) => `
      <div class="input-row">
        <label>${BASE_LABELS[f]}</label>
        <input type="number" id="${key}-${f}-h" min="0" max="24" value="0" placeholder="時間">
        <span class="unit">時間</span>
        <input type="number" id="${key}-${f}-m" min="0" max="59" value="0" placeholder="分">
        <span class="unit">分</span>
      </div>`).join("");

    let extraRows = "";
    for (let i = 1; i <= 3; i++) {
      extraRows += `
      <div class="input-row extra-row">
        <input type="text" id="${key}-extra-name-${i}" class="extra-name" placeholder="項目名">
        <input type="number" id="${key}-extra-h-${i}" min="0" max="24" placeholder="時間">
        <span class="unit">時間</span>
        <input type="number" id="${key}-extra-m-${i}" min="0" max="59" placeholder="分">
        <span class="unit">分</span>
      </div>`;
    }

    container.insertAdjacentHTML("beforeend", `
      <details class="day-details ${isWeekend ? "weekend" : "weekday"}">
        <summary>${label}曜日</summary>
        <div class="day-details-body">
          <fieldset class="day-group">
            <legend>固定項目</legend>
            ${baseRows}
          </fieldset>
          <fieldset class="day-group">
            <legend>追加項目（最大3）</legend>
            ${extraRows}
          </fieldset>
        </div>
      </details>`);
  });
}

// ============================================================
//  モード切替
// ============================================================

function onModeChange() {
  const mode = getSelectedMode();
  document.getElementById("weekday-weekend-section").hidden = (mode !== "weekdayWeekend");
  document.getElementById("byday-section").hidden           = (mode !== "byDay");
}

// ============================================================
//  テンプレート読み取り（mode 別）
// ============================================================

function readTemplateWeekdayWeekend() {
  const extras = readExtrasFromForm("extra");
  return {
    weekday: { base: readBaseFromForm("wd"), extras: extras.map((e) => ({ ...e })) },
    weekend: { base: readBaseFromForm("hd"), extras: extras.map((e) => ({ ...e })) },
  };
}

function readTemplateByDay() {
  const byDay = {};
  DAY_KEYS.forEach((key) => {
    byDay[key] = {
      base:   readBaseFromForm(key),
      extras: readExtrasFromForm(`${key}-extra`),
    };
  });
  return byDay;
}

function readTemplate() {
  const mode = getSelectedMode();
  const ww   = readTemplateWeekdayWeekend();

  let byDay;
  if (mode === "byDay") {
    byDay = readTemplateByDay();
  } else {
    byDay = {};
    DAY_KEYS.forEach((key) => {
      const isWeekend = key === "sat" || key === "sun";
      const src = isWeekend ? ww.weekend : ww.weekday;
      byDay[key] = { base: { ...src.base }, extras: src.extras.map((e) => ({ ...e })) };
    });
  }

  return { mode, weekdayWeekend: ww, byDay };
}

// ============================================================
//  テンプレート復元（mode 別）
// ============================================================

function restoreWeekdayWeekendForm(ww) {
  if (!ww) return;
  if (ww.weekday?.base)  writeBaseToForm("wd", ww.weekday.base);
  if (ww.weekend?.base)  writeBaseToForm("hd", ww.weekend.base);
  writeExtrasToForm("extra", ww.weekday?.extras);
}

function restoreByDayForm(byDay) {
  if (!byDay) return;
  DAY_KEYS.forEach((key) => {
    const entry = byDay[key];
    if (!entry) return;
    if (entry.base) writeBaseToForm(key, entry.base);
    writeExtrasToForm(`${key}-extra`, entry.extras);
  });
}

function restoreTemplate(tpl) {
  const radio = document.querySelector(
    `input[name="tpl-mode"][value="${tpl.mode || "weekdayWeekend"}"]`
  );
  if (radio) radio.checked = true;
  onModeChange();

  restoreWeekdayWeekendForm(tpl.weekdayWeekend);
  restoreByDayForm(tpl.byDay);
}

function resetTemplateForm() {
  document.querySelector('input[name="tpl-mode"][value="weekdayWeekend"]').checked = true;
  onModeChange();

  ["wd", "hd"].forEach((p) => {
    BASE_FIELDS.forEach((f) => {
      const hEl = document.getElementById(`${p}-${f}-h`);
      const mEl = document.getElementById(`${p}-${f}-m`);
      hEl.value = hEl.defaultValue;
      mEl.value = mEl.defaultValue;
    });
  });
  for (let i = 1; i <= 3; i++) {
    setVal(`extra-name-${i}`, "");
    setVal(`extra-h-${i}`,    "");
    setVal(`extra-m-${i}`,    "");
  }

  DAY_KEYS.forEach((key) => {
    BASE_FIELDS.forEach((f) => {
      setVal(`${key}-${f}-h`, 0);
      setVal(`${key}-${f}-m`, 0);
    });
    for (let i = 1; i <= 3; i++) {
      setVal(`${key}-extra-name-${i}`, "");
      setVal(`${key}-extra-h-${i}`,    "");
      setVal(`${key}-extra-m-${i}`,    "");
    }
  });
}

// ============================================================
//  コピー機能
// ============================================================

/** 平日/休日 → 全曜日コピー（byDay セクション用） */
function handleCopyToAll() {
  const wdBase = readBaseFromForm("wd");
  const hdBase = readBaseFromForm("hd");
  const extras = readExtrasFromForm("extra");

  DAY_KEYS.forEach((key) => {
    const isWeekend = key === "sat" || key === "sun";
    writeBaseToForm(key, isWeekend ? hdBase : wdBase);
    writeExtrasToForm(`${key}-extra`, extras);
  });
}

/** 平日 → 休日コピー（weekdayWeekend セクション用） */
function handleCopyWeekdayToWeekend() {
  const base = readBaseFromForm("wd");
  writeBaseToForm("hd", base);
  // 追加項目は共通なのでコピー不要
}

/** byDay: 指定曜日の値を選択されたコピー先にコピー */
function handleCopyDayToTargets() {
  const sourceKey = document.getElementById("copy-source-day").value;

  // チェックされたコピー先を収集
  const targetKeys = [];
  document.querySelectorAll("#copy-target-days input[type='checkbox']:checked").forEach((cb) => {
    targetKeys.push(cb.value);
  });

  if (targetKeys.length === 0) {
    showNotification("コピー先を1つ以上選択してください", "error");
    return;
  }

  // コピー元と同じ曜日は除外
  const filteredTargets = targetKeys.filter((k) => k !== sourceKey);
  if (filteredTargets.length === 0) {
    showNotification("コピー元と異なる曜日を選択してください", "error");
    return;
  }

  const base   = readBaseFromForm(sourceKey);
  const extras = readExtrasFromForm(`${sourceKey}-extra`);

  filteredTargets.forEach((key) => {
    writeBaseToForm(key, base);
    writeExtrasToForm(`${key}-extra`, extras);
  });

  const srcLabel    = DAY_LABELS[sourceKey];
  const targetLabel = filteredTargets.map((k) => DAY_LABELS[k]).join("・");
  showNotification(`${srcLabel}曜 → ${targetLabel}曜 にコピーしました`, "success");
}

/** byDay コピー先チェックボックスを生成 */
function generateCopyTargetCheckboxes() {
  const container = document.getElementById("copy-target-days");
  if (!container || container.children.length > 0) return;

  DAY_KEYS.forEach((key) => {
    const label = document.createElement("label");
    const cb    = document.createElement("input");
    cb.type  = "checkbox";
    cb.value = key;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${DAY_LABELS[key]}`));
    container.appendChild(label);
  });
}

/** クイック選択: 平日チェック */
function checkWeekdayTargets() {
  document.querySelectorAll("#copy-target-days input[type='checkbox']").forEach((cb) => {
    cb.checked = ["mon", "tue", "wed", "thu", "fri"].includes(cb.value);
  });
}

/** クイック選択: 休日チェック */
function checkWeekendTargets() {
  document.querySelectorAll("#copy-target-days input[type='checkbox']").forEach((cb) => {
    cb.checked = ["sat", "sun"].includes(cb.value);
  });
}

/** クイック選択: 全曜日チェック */
function checkAllTargets() {
  document.querySelectorAll("#copy-target-days input[type='checkbox']").forEach((cb) => {
    cb.checked = true;
  });
}

// ============================================================
//  上書きフォーム
// ============================================================

function readOverrideFromForm() {
  return {
    base:   readBaseFromForm("ov"),
    extras: readExtrasFromForm("ov-extra"),
    memo:   document.getElementById("ov-memo").value.trim(),
  };
}

function restoreOverrideForm(data) {
  writeBaseToForm("ov", data.base || {});
  writeExtrasToForm("ov-extra", data.extras);
  document.getElementById("ov-memo").value = data.memo || "";
}

function clearOverrideForm() {
  BASE_FIELDS.forEach((f) => { setVal(`ov-${f}-h`, 0); setVal(`ov-${f}-m`, 0); });
  for (let i = 1; i <= 3; i++) {
    setVal(`ov-extra-name-${i}`, "");
    setVal(`ov-extra-h-${i}`,    "");
    setVal(`ov-extra-m-${i}`,    "");
  }
  document.getElementById("ov-memo").value = "";
}

/**
 * 上書きフォームを、保存済みテンプレートの該当日の値で初期化する。
 * テンプレ未保存の場合は 0 クリアにフォールバック。
 * @param {string} dateStr "YYYY-MM-DD"
 */
function fillOverrideFormWithTemplate(dateStr) {
  const tpl = loadTemplate();
  if (!tpl) {
    clearOverrideForm();
    return;
  }

  const entry = getTemplateDayEntry(tpl, dateStr);
  if (!entry) {
    clearOverrideForm();
    return;
  }

  writeBaseToForm("ov", entry.base || {});
  writeExtrasToForm("ov-extra", entry.extras || []);
  document.getElementById("ov-memo").value = "";
}

function updateOverrideStatus(hasOverride) {
  const el = document.getElementById("ov-status");
  el.textContent = hasOverride ? "⚡ 上書き適用中" : "📌 テンプレ適用";
  el.className   = hasOverride ? "ov-status badge-override" : "ov-status badge-template";
}

// ============================================================
//  計算ロジック（ダッシュボード用 — 寛容モード）
// ============================================================

function calcTemplateResults() {
  const ww    = readTemplateWeekdayWeekend();
  const wdTot = sumMinutes(ww.weekday.base, ww.weekday.extras);
  const hdTot = sumMinutes(ww.weekend.base, ww.weekend.extras);

  const wdErr = validateTotal(wdTot);
  const hdErr = validateTotal(hdTot);
  if (wdErr || hdErr) {
    const msgs = [];
    if (wdErr) msgs.push(`【平日】${wdErr}`);
    if (hdErr) msgs.push(`【休日】${hdErr}`);
    return { wdTotal: wdTot, hdTotal: hdTot, wdFree: 0, hdFree: 0, error: msgs.join("\n") };
  }

  return {
    wdTotal: wdTot, hdTotal: hdTot,
    wdFree: freeMinutes(wdTot),
    hdFree: freeMinutes(hdTot),
    error: null,
  };
}

function calcByDayResults() {
  const days   = {};
  const errors = [];

  DAY_KEYS.forEach((key) => {
    const base   = readBaseFromForm(key);
    const extras = readExtrasFromForm(`${key}-extra`);
    const total  = sumMinutes(base, extras);
    const err    = validateTotal(total);
    if (err) errors.push(`【${DAY_LABELS[key]}曜】${err}`);
    days[key] = { total, free: err ? 0 : freeMinutes(total) };
  });

  return { days, error: errors.length > 0 ? errors.join("\n") : null };
}

function calcForDate(dateStr, ctx) {
  const ov = getOverride(dateStr);
  if (ov) {
    const total = sumMinutes(ov.base, ov.extras);
    const err   = validateTotal(total);
    return { total, free: err ? 0 : freeMinutes(total), source: "override", error: err };
  }

  if (ctx.mode === "byDay" && ctx.byDayResult) {
    const dr = ctx.byDayResult.days[getWeekdayKey(dateStr)];
    return { total: dr.total, free: dr.free, source: "template", error: null };
  }

  if (ctx.tplResult) {
    const wd = isWeekday(dateStr);
    return {
      total:  wd ? ctx.tplResult.wdTotal : ctx.tplResult.hdTotal,
      free:   wd ? ctx.tplResult.wdFree  : ctx.tplResult.hdFree,
      source: "template",
      error:  null,
    };
  }

  return { total: 0, free: 1440, source: "template", error: null };
}

// ============================================================
//  ダッシュボード描画
// ============================================================

function shortDateLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_LABELS[d.getDay()]})`;
}

function buildWeeklySummary() {
  const week     = sumLast7Days();
  const todayStr = getTodayStr();
  let overrideCount = 0;

  const rows = week.dates.map((dateStr, i) => {
    const hasOv   = getOverride(dateStr) !== null;
    const isToday = dateStr === todayStr;
    if (hasOv) overrideCount++;

    const srcBadge  = hasOv
      ? '<span class="src-badge src-override">上書き</span>'
      : '<span class="src-badge src-template">テンプレ</span>';
    const todayMark = isToday ? ' <span class="today-mark">← 今日</span>' : "";

    return `<li class="weekly-row">${shortDateLabel(dateStr)}　${formatMinutes(week.daily[i])}　${srcBadge}${todayMark}</li>`;
  });

  return {
    html: `<ul class="weekly-list">${rows.join("")}</ul>`,
    overrideCount,
    total: week.total,
  };
}

function renderDashboard() {
  const errorEl     = document.getElementById("dashboard-error");
  const resultEl    = document.getElementById("dashboard-result");
  const currentMode = getSelectedMode();

  errorEl.hidden      = true;
  errorEl.textContent = "";

  // ── 0) テンプレ未設定チェック ──
  const savedTpl = loadTemplate();
  if (!savedTpl) {
    resultEl.innerHTML = `
      <div class="result-card today-error">
        <h3>テンプレート未設定</h3>
        <p class="result-detail">テンプレートを設定して「テンプレ保存」を押してください</p>
      </div>`;
    return;
  }

  // ── 1) モード別バリデーション（寛容モード: getNum 経由）──
  let tplResult   = null;
  let byDayResult = null;

  if (currentMode === "weekdayWeekend") {
    tplResult = calcTemplateResults();
    if (tplResult.error) {
      errorEl.textContent = tplResult.error;
      errorEl.hidden      = false;
      resultEl.innerHTML  = '<p class="placeholder">エラーを修正してください</p>';
      return;
    }
  } else {
    byDayResult = calcByDayResults();
    if (byDayResult.error) {
      errorEl.textContent = byDayResult.error;
      errorEl.hidden      = false;
      resultEl.innerHTML  = '<p class="placeholder">エラーを修正してください</p>';
      return;
    }
  }

  // ── 2) 今日の自由時間 ──
  const todayStr    = getTodayStr();
  const todayResult = calcForDate(todayStr, { mode: currentMode, tplResult, byDayResult });
  const todayLabel  = todayResult.source === "override" ? "⚡ 上書き適用" : "📌 テンプレ適用";

  let todayHtml;
  if (todayResult.error) {
    todayHtml = `
      <div class="result-card today-error">
        <h3>今日の自由時間（${shortDateLabel(todayStr)}）</h3>
        <p class="result-value" style="color:#e25d5d;">エラー</p>
        <p class="result-detail">${todayResult.error}</p>
      </div>`;
  } else {
    todayHtml = `
      <div class="result-card today">
        <h3>今日の自由時間（${shortDateLabel(todayStr)}）</h3>
        <p class="result-value">${formatMinutes(todayResult.free)}</p>
        <p class="result-detail">必須 ${formatMinutes(todayResult.total)}（${todayResult.total}分）｜${todayLabel}</p>
      </div>`;
  }

  // ── 3) 直近7日間サマリー ──
  const summary = buildWeeklySummary();
  const ovNote  = summary.overrideCount > 0
    ? `（うち ${summary.overrideCount} 日は上書きデータを使用）`
    : "（すべてテンプレートで計算）";

  const weeklyHtml = `
    <div class="result-card weekly">
      <h3>直近7日間の自由時間</h3>
      <p class="result-value">${formatMinutes(summary.total)}</p>
      <p class="result-detail">${ovNote}</p>
      ${summary.html}
    </div>`;

  // ── 4) テンプレートカード（weekdayWeekend のみ）──
  let tplHtml = "";
  if (currentMode === "weekdayWeekend" && tplResult) {
    tplHtml = `
      <div class="result-card weekday">
        <h3>平日の自由時間（テンプレート）</h3>
        <p class="result-value">${formatMinutes(tplResult.wdFree)}</p>
        <p class="result-detail">必須 ${formatMinutes(tplResult.wdTotal)}（${tplResult.wdTotal}分）</p>
      </div>
      <div class="result-card holiday">
        <h3>休日の自由時間（テンプレート）</h3>
        <p class="result-value">${formatMinutes(tplResult.hdFree)}</p>
        <p class="result-detail">必須 ${formatMinutes(tplResult.hdTotal)}（${tplResult.hdTotal}分）</p>
      </div>`;
  }

  resultEl.innerHTML = todayHtml + weeklyHtml + tplHtml;
}

// ============================================================
//  日付変更ハンドラ
// ============================================================

function onDateChange() {
  const dateStr = getSelectedDate();
  if (!dateStr) {
    clearOverrideForm();
    updateOverrideStatus(false);
    return;
  }

  const ov = getOverride(dateStr);
  if (ov) {
    restoreOverrideForm(ov);
    updateOverrideStatus(true);
  } else {
    // テンプレ値でフォームを初期化（何を入力すべきか分かりやすい）
    fillOverrideFormWithTemplate(dateStr);
    updateOverrideStatus(false);
  }
}

// ============================================================
//  テンプレ保存（厳格バリデーション → 保存 → 通知）
// ============================================================

function handleSaveTemplate() {
  const mode   = getSelectedMode();
  const errors = mode === "weekdayWeekend"
    ? validateTemplateWeekdayWeekend()
    : validateTemplateByDay();

  if (errors.length > 0) {
    showNotification("保存できません:\n" + errors.join("\n"), "error");
    return;
  }

  const tpl = readTemplate();
  if (saveTemplate(tpl)) {
    renderDashboard();
    showNotification("テンプレートを保存しました", "success");
  } else {
    showNotification("保存に失敗しました。ブラウザの設定を確認してください。", "error");
  }
}

// ============================================================
//  上書き保存 / 削除（厳格バリデーション → 保存 → 通知）
// ============================================================

function handleSaveOverride() {
  const dateStr = getSelectedDate();
  if (!dateStr) {
    showNotification("日付を選択してください", "error");
    return;
  }

  // 厳格バリデーション
  const errors = validateOverrideFields();
  if (errors.length > 0) {
    showNotification("保存できません:\n" + errors.join("\n"), "error");
    return;
  }

  const data = readOverrideFromForm();
  if (saveOverride(dateStr, data)) {
    updateOverrideStatus(true);
    renderDashboard();
    showNotification(`${dateStr} の上書きを保存しました`, "success");
  } else {
    showNotification("保存に失敗しました。ブラウザの設定を確認してください。", "error");
  }
}

function handleDeleteOverride() {
  const dateStr = getSelectedDate();
  if (!dateStr) {
    showNotification("日付を選択してください", "error");
    return;
  }
  if (!confirm(`${dateStr} の上書きデータを削除しますか？`)) return;

  deleteOverride(dateStr);
  // テンプレ値でフォームを復元（0クリアではなく）
  fillOverrideFormWithTemplate(dateStr);
  updateOverrideStatus(false);
  renderDashboard();
  showNotification(`${dateStr} の上書きを削除しました（テンプレート値に戻しました）`, "success");
}

// ============================================================
//  イベントリスナー
// ============================================================

document.querySelectorAll('input[name="tpl-mode"]').forEach((radio) => {
  radio.addEventListener("change", onModeChange);
});

document.getElementById("btn-calc")
  .addEventListener("click", renderDashboard);

document.getElementById("btn-save-template")
  .addEventListener("click", handleSaveTemplate);

document.getElementById("btn-save-override")
  .addEventListener("click", handleSaveOverride);
document.getElementById("btn-delete-override")
  .addEventListener("click", handleDeleteOverride);

document.getElementById("btn-copy-to-all")
  .addEventListener("click", () => {
    handleCopyToAll();
    showNotification("平日/休日の値を全曜日にコピーしました", "success");
  });

document.getElementById("btn-copy-wd-to-hd")
  .addEventListener("click", () => {
    handleCopyWeekdayToWeekend();
    showNotification("平日の値を休日にコピーしました", "success");
  });

document.getElementById("btn-copy-day")
  .addEventListener("click", handleCopyDayToTargets);

document.getElementById("btn-check-weekdays")
  .addEventListener("click", checkWeekdayTargets);
document.getElementById("btn-check-weekends")
  .addEventListener("click", checkWeekendTargets);
document.getElementById("btn-check-all-days")
  .addEventListener("click", checkAllTargets);

document.getElementById("btn-clear-all")
  .addEventListener("click", () => {
    if (!confirm("保存済みデータ（テンプレート・日別上書き）をすべて削除しますか？\nこの操作は元に戻せません。")) return;
    clearAll();
    resetTemplateForm();
    clearOverrideForm();
    updateOverrideStatus(false);
    document.getElementById("ov-date").value = "";
    renderDashboard();                       // 「テンプレート未設定」表示に自動で戻る
    showNotification("すべてのデータを削除しました", "success");
  });

document.getElementById("ov-date")
  .addEventListener("change", onDateChange);

// ============================================================
//  初期化
// ============================================================
(function init() {
  try {
    generateByDayForms();
    generateCopyTargetCheckboxes();

    const tpl = loadTemplate();
    if (tpl) restoreTemplate(tpl);

    document.getElementById("ov-date").value = getTodayStr();
    onDateChange();

    renderDashboard();
  } catch (e) {
    console.error("[init]", e);
  }
})();
