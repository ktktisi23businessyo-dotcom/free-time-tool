"use strict";

// ===== LocalStorage キー =====
const STORAGE_KEY_TEMPLATE  = "free_time_template";
const STORAGE_KEY_OVERRIDES = "free_time_overrides";

// ===== 曜日キー（月〜日）=====
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ============================================================
//  テンプレート：ヘルパー
// ============================================================

/** 空の1日分エントリを返す */
function emptyDayEntry() {
  return {
    base:   { sleep: 0, work: 0, commute: 0, meal: 0, bath: 0 },
    extras: [],
  };
}

/**
 * 旧形式テンプレートを新形式に変換（後方互換）
 *
 * 旧: { weekday:{sleep:{h,m},...}, holiday:{...}, extras:[{name,h,m}] }
 * 新: { mode, weekdayWeekend:{weekday:{base,extras}, weekend:{base,extras}}, byDay:{mon:{base,extras},...} }
 */
function migrateOldTemplate(raw) {
  const fields = ["sleep", "work", "commute", "meal", "bath"];

  function convertBase(dayObj) {
    const base = {};
    fields.forEach((f) => {
      const v = dayObj?.[f];
      base[f] = v ? (v.h || 0) * 60 + (v.m || 0) : 0;
    });
    return base;
  }

  function convertExtras(arr) {
    return (arr || [])
      .filter((ex) => ex.name && ((ex.h || 0) > 0 || (ex.m || 0) > 0))
      .map((ex) => ({ name: ex.name, minutes: (ex.h || 0) * 60 + (ex.m || 0) }));
  }

  const wdBase = convertBase(raw.weekday);
  const weBase = convertBase(raw.holiday);
  const extras = convertExtras(raw.extras);

  const weekdayEntry = { base: wdBase, extras: extras.map((e) => ({ ...e })) };
  const weekendEntry = { base: weBase, extras: extras.map((e) => ({ ...e })) };

  const byDay = {};
  DAY_KEYS.forEach((key) => {
    const isWeekend = key === "sat" || key === "sun";
    const src = isWeekend ? weekendEntry : weekdayEntry;
    byDay[key] = { base: { ...src.base }, extras: src.extras.map((e) => ({ ...e })) };
  });

  return {
    mode: "weekdayWeekend",
    weekdayWeekend: { weekday: weekdayEntry, weekend: weekendEntry },
    byDay,
  };
}

/**
 * 新形式テンプレートの不足キーを補完する
 */
function complementTemplate(tpl) {
  if (!tpl.mode) tpl.mode = "weekdayWeekend";

  // weekdayWeekend
  if (!tpl.weekdayWeekend) {
    tpl.weekdayWeekend = { weekday: emptyDayEntry(), weekend: emptyDayEntry() };
  }
  if (!tpl.weekdayWeekend.weekday) tpl.weekdayWeekend.weekday = emptyDayEntry();
  if (!tpl.weekdayWeekend.weekend) tpl.weekdayWeekend.weekend = emptyDayEntry();

  // byDay
  if (!tpl.byDay) tpl.byDay = {};
  DAY_KEYS.forEach((key) => {
    if (!tpl.byDay[key]) tpl.byDay[key] = emptyDayEntry();
  });

  return tpl;
}

// ============================================================
//  テンプレート系
// ============================================================

/**
 * テンプレートを保存する
 * @param {Object} template 新形式テンプレート
 */
function saveTemplate(template) {
  try {
    localStorage.setItem(STORAGE_KEY_TEMPLATE, JSON.stringify(template));
    return true;
  } catch (e) {
    console.error("[storage] テンプレート保存に失敗", e);
    return false;
  }
}

/**
 * テンプレートを読み込む
 * 旧形式であれば自動的に新形式へ移行し、不足キーを補完して返す
 * @returns {Object|null}
 */
function loadTemplate() {
  try {
    const json = localStorage.getItem(STORAGE_KEY_TEMPLATE);
    if (json === null) return null;
    const raw = JSON.parse(json);

    // 旧形式（mode キーなし）→ 新形式に移行
    if (!raw.mode) return migrateOldTemplate(raw);

    // 新形式：不足キーを補完
    return complementTemplate(raw);
  } catch (e) {
    console.error("[storage] テンプレート読み込みに失敗", e);
    return null;
  }
}

// ============================================================
//  日別上書き（overrides）系
// ============================================================

function loadOverrides() {
  try {
    const json = localStorage.getItem(STORAGE_KEY_OVERRIDES);
    if (json === null) return {};
    return JSON.parse(json);
  } catch (e) {
    console.error("[storage] 上書きデータ読み込みに失敗", e);
    return {};
  }
}

function saveOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides));
    return true;
  } catch (e) {
    console.error("[storage] 上書きデータ保存に失敗", e);
    return false;
  }
}

function saveOverride(dateStr, overrideData) {
  try {
    const overrides = loadOverrides();
    overrides[dateStr] = overrideData;
    return saveOverrides(overrides);
  } catch (e) {
    console.error("[storage] 上書き保存に失敗", dateStr, e);
    return false;
  }
}

function deleteOverride(dateStr) {
  try {
    const overrides = loadOverrides();
    if (!(dateStr in overrides)) return true;
    delete overrides[dateStr];
    return saveOverrides(overrides);
  } catch (e) {
    console.error("[storage] 上書き削除に失敗", dateStr, e);
    return false;
  }
}

function getOverride(dateStr) {
  try {
    const overrides = loadOverrides();
    return overrides[dateStr] || null;
  } catch (e) {
    console.error("[storage] 上書き取得に失敗", dateStr, e);
    return null;
  }
}

// ============================================================
//  全データ削除
// ============================================================

function clearAll() {
  try {
    localStorage.removeItem(STORAGE_KEY_TEMPLATE);
    localStorage.removeItem(STORAGE_KEY_OVERRIDES);
    return true;
  } catch (e) {
    console.error("[storage] 全データ削除に失敗", e);
    return false;
  }
}
