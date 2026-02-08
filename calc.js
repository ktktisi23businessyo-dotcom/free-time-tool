"use strict";

// ===== 定数 =====
const MINUTES_PER_DAY = 1440;

// ===== 1) toMinutes =====
// 時間と分を「分」に変換する
function toMinutes(hours, minutes) {
  return hours * 60 + minutes;
}

// ===== 2) sumMinutes =====
// 基本項目と追加項目（最大3件）の合計分を返す
function sumMinutes(baseItems, extraItems) {
  const baseTotal =
    (baseItems.sleep    || 0) +
    (baseItems.work     || 0) +
    (baseItems.commute  || 0) +
    (baseItems.meal     || 0) +
    (baseItems.bath     || 0);

  const extras = (extraItems || []).slice(0, 3);
  const extraTotal = extras.reduce((sum, item) => sum + (item.minutes || 0), 0);

  return baseTotal + extraTotal;
}

// ===== 3) validateTotal =====
// 合計が1日(1440分)を超えていたらエラー文字列、問題なければ null
function validateTotal(totalMinutes) {
  if (totalMinutes > MINUTES_PER_DAY) {
    return `合計 ${totalMinutes} 分は1日(${MINUTES_PER_DAY}分)を超えています`;
  }
  return null;
}

// ===== 4) freeMinutes =====
// 必須時間を引いた自由時間（分）を返す
function freeMinutes(totalRequiredMinutes) {
  return MINUTES_PER_DAY - totalRequiredMinutes;
}

// ===== 5) formatMinutes =====
// 分を「X時間Y分」形式の文字列に変換する
function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m}分`;
}

// ===== 使用例 =====
// const base = { sleep: 420, work: 480, commute: 60, meal: 90, bath: 30 };
// const extra = [
//   { name: "勉強",   minutes: 60 },
//   { name: "運動",   minutes: 30 },
//   { name: "家事",   minutes: 30 },
// ];
//
// const total = sumMinutes(base, extra);   // => 1200
// const err   = validateTotal(total);      // => null（OK）
// const free  = freeMinutes(total);        // => 240
// const text  = formatMinutes(free);       // => "4時間0分"
//
// console.log(`必須時間: ${formatMinutes(total)}`);  // "20時間0分"
// console.log(`自由時間: ${text}`);                   // "4時間0分"
