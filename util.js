"use strict";

// ============================================================
//  共通定数
// ============================================================
const BASE_FIELDS = ["sleep", "work", "commute", "meal", "bath"];

/** getDay() (0=日) → DAY_KEYS のマッピング */
const DOW_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ============================================================
//  日付ユーティリティ
// ============================================================

/**
 * Date オブジェクトを "YYYY-MM-DD" 文字列に変換する
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 今日の日付を "YYYY-MM-DD" で返す
 * @returns {string}
 */
function getTodayStr() {
  return formatDate(new Date());
}

/**
 * 今日を含む過去 n 日分の "YYYY-MM-DD" 配列を返す（新しい順）
 * @param {number} n
 * @returns {string[]}
 */
function getLastNDates(n) {
  const dates = [];
  const now   = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

/**
 * 日付文字列から曜日キー ("mon"〜"sun") を返す
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"}
 */
function getWeekdayKey(dateStr) {
  return DOW_TO_KEY[new Date(dateStr).getDay()];
}

/**
 * 日付文字列が平日（月〜金）なら true
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {boolean}
 */
function isWeekday(dateStr) {
  const key = getWeekdayKey(dateStr);
  return key !== "sat" && key !== "sun";
}

// ============================================================
//  データ取得ロジック（override 優先 → template フォールバック）
// ============================================================

/**
 * テンプレートから指定日に対応する dayEntry を返す
 * @param {Object} tpl   新形式テンプレート
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {{ base: Object, extras: Array }|null}
 */
function getTemplateDayEntry(tpl, dateStr) {
  if (tpl.mode === "byDay") {
    return tpl.byDay?.[getWeekdayKey(dateStr)] || null;
  }
  // weekdayWeekend（デフォルト）
  return isWeekday(dateStr)
    ? tpl.weekdayWeekend?.weekday || null
    : tpl.weekdayWeekend?.weekend || null;
}

/**
 * 指定日の必須時間合計（分）を返す
 * - overrides に dateStr があればそのデータを使用
 * - なければ保存済み template から曜日判定で計算
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {number}
 */
function getDayRequiredMinutes(dateStr) {
  // 1) 上書きデータを優先
  const ov = getOverride(dateStr);
  if (ov) return sumMinutes(ov.base, ov.extras);

  // 2) テンプレートから取得
  const tpl = loadTemplate();
  if (!tpl) return 0;

  const entry = getTemplateDayEntry(tpl, dateStr);
  if (!entry) return 0;

  return sumMinutes(entry.base, entry.extras);
}

/**
 * 指定日の自由時間（分）を返す
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {number}
 */
function getFreeMinutesForDay(dateStr) {
  return freeMinutes(getDayRequiredMinutes(dateStr));
}

// ============================================================
//  集計
// ============================================================

/**
 * 直近7日間の自由時間を返す
 * @returns {{ dates: string[], daily: number[], total: number }}
 */
function sumLast7Days() {
  const dates = getLastNDates(7);
  const daily = dates.map((d) => getFreeMinutesForDay(d));
  const total = daily.reduce((sum, m) => sum + m, 0);
  return { dates, daily, total };
}
