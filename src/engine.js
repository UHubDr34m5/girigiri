// ギリギリ・ナンバーの得点計算。Firebase に依存しない純粋関数です。
export const INITIAL_RULES = Object.freeze({
  limit: 25, safeZone: false, lowerLimit: 15, bonus: false,
  bonusMultiplier: 2, batting: false, prediction: false,
  defense: false, doubleUp: false,
});
export const RULE_NAMES = {
  safeZone: 'セーフゾーン', bonus: 'ボーナス', batting: 'バッティング',
  prediction: 'セーフ・アウト予想', defense: 'ディフェンス', doubleUp: 'ダブルアップ',
};
export const n = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
export function normalizeRules(raw = {}) {
  return {
    limit: Math.min(160, Math.max(1, Math.trunc(n(raw.limit, 25)))),
    safeZone: !!raw.safeZone,
    lowerLimit: Math.min(160, Math.max(0, Math.trunc(n(raw.lowerLimit, 15)))),
    bonus: !!raw.bonus,
    bonusMultiplier: Math.min(10, Math.max(2, Math.trunc(n(raw.bonusMultiplier, 2)))),
    batting: !!raw.batting, prediction: !!raw.prediction,
    defense: !!raw.defense, doubleUp: !!raw.doubleUp,
  };
}
export function validRules(raw) {
  const r = normalizeRules(raw);
  return r.limit >= 1 && (!r.safeZone || r.lowerLimit < r.limit);
}
export function getUsedNumbers(player) {
  return Object.keys(player?.usedNumbers || {}).filter(k => /^n([1-9]|10)$/.test(k))
    .map(k => Number(k.slice(1))).sort((a, b) => a - b);
}
export function availableNumbers(player) {
  const used = new Set(getUsedNumbers(player));
  return Array.from({ length: 10 }, (_, i) => i + 1).filter(x => !used.has(x));
}
export function safeSubmission(sub, rules, player) {
  if (!sub || typeof sub !== 'object') return {number: 0, prediction: '', doubleMultiplier: 1, absent: true};
  const num = Math.trunc(n(sub.number, 0));
  const validNumber = num >= 1 && num <= 10 && !getUsedNumbers(player).includes(num);
  const defenseNumber = num === 0 && rules.defense;
  const number = validNumber || defenseNumber ? num : 0;
  const prediction = rules.prediction && ['safe', 'out'].includes(sub.prediction) ? sub.prediction : '';
  const doubleMultiplier = rules.doubleUp && !player?.usedDouble && [2,3,4,5].includes(n(sub.doubleMultiplier)) ? n(sub.doubleMultiplier) : 1;
  return {number, prediction, doubleMultiplier, absent: !!sub.absent || (!validNumber && !defenseNumber)};
}
/**
 * 計算順序: 基礎点 -> バッティング(0方向へ切り捨て) -> ボーナス ->
 *            セーフ/アウト予想 -> ダブルアップ。0を選んだ人は常に0点。
 * 安全/危険の判定: 下限未満と上限超過は、ともに OUT。
 */
export function calculateGame(players, submissions, rawRules) {
  const rules = normalizeRules(rawRules);
  const entries = Object.entries(players || {}).sort((a,b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0) || a[0].localeCompare(b[0]));
  const picks = Object.fromEntries(entries.map(([id, p]) => [id, safeSubmission(submissions?.[id], rules, p)]));
  const sum = Object.values(picks).reduce((acc, v) => acc + v.number, 0);
  const status = sum > rules.limit ? 'over' : rules.safeZone && sum < rules.lowerLimit ? 'under' : 'safe';
  const positives = Object.values(picks).map(s => s.number).filter(num => num > 0);
  const min = positives.length ? Math.min(...positives) : 0;
  const max = positives.length ? Math.max(...positives) : 0;
  const counts = {};
  for (const v of Object.values(picks)) if (v.number > 0) counts[v.number] = (counts[v.number] || 0) + 1;
  const scored = {};
  for (const [id, p] of entries) {
    const sub = picks[id];
    let base = 0;
    if (!sub.absent && sub.number > 0) {
      if (status === 'safe') base = sub.number;
      if (status === 'over') base = -sub.number;
      if (status === 'under' && sub.number === min) base = -max;
    }
    const afterBatting = rules.batting && sub.number > 0 ? Math.trunc(base / counts[sub.number]) : base;
    const afterBonus = afterBatting * (rules.bonus ? rules.bonusMultiplier : 1);
    let afterPrediction = afterBonus;
    if (rules.prediction && !sub.absent && sub.number > 0) {
      if (status === 'safe') afterPrediction = sub.prediction === 'safe' ? afterBonus * 2 : 0;
      else afterPrediction = sub.prediction === 'out' ? 0 : afterBonus * 2;
    }
    const final = afterPrediction * sub.doubleMultiplier;
    scored[id] = {
      nickname: p.nickname, number: sub.number, prediction: sub.prediction,
      doubleMultiplier: sub.doubleMultiplier, absent: sub.absent,
      battingCount: sub.number ? counts[sub.number] : 0,
      base, afterBatting, afterBonus, afterPrediction, points: final,
      previousScore: n(p.score), totalScore: n(p.score) + final,
    };
  }
  return {sum, status, min, max, rules, scored};
}
export function leaderboard(players = {}) {
  return Object.entries(players).map(([id, p]) => ({id, ...p, score: n(p.score)}))
    .sort((a,b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0) || a.id.localeCompare(b.id));
}
export function nextGame(current) {
  const inRound = Number(current?.gameInRound || 0);
  const round = Number(current?.round || 1);
  return {
    round: inRound >= 5 ? round + 1 : round,
    gameInRound: inRound >= 5 ? 1 : inRound + 1,
    totalGame: Number(current?.totalGame || 0) + 1,
    newRound: inRound >= 5,
  };
}
