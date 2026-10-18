// The numbers behind Fuel Coach: your daily targets, the pace line through
// the day, your weight trend and when to adjust.

export const LB_PER_KG = 2.20462262;
// Food after midnight counts toward the night before, until 4 am.
export const DAY_START_H = 4;

const pad = n => String(n).padStart(2, '0');
const fmtKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dayKey = (t = Date.now()) => fmtKey(new Date(t - DAY_START_H * 3600e3));
export function keyDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = keyDate(k);
  d.setDate(d.getDate() + n);
  return fmtKey(d);
}
export const daysBetween = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 86400e3);
// Hours since midnight of the food day, so 1 am reads as 25.
export const hourOf = (t = Date.now()) => (t - keyDate(dayKey(t)).getTime()) / 3600e3;

// ---- targets -----------------------------------------------------------------

// Mifflin–St Jeor resting burn (Mifflin 1990).
export function bmr(p, lb) {
  const kg = lb / LB_PER_KG, cm = p.heightIn * 2.54;
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'f' ? -161 : 5);
}

export const minKcal = p => (p.sex === 'f' ? 1200 : 1500);

// Maintenance (resting burn × activity) minus 500 a day per lb a week,
// rounded down to 50. Protein is 0.85 g per lb of goal weight.
export function suggestTarget(p, lb) {
  const b = bmr(p, lb);
  const maint = b * (p.activity || 1.5);
  const kcal = Math.max(Math.floor((maint - (p.pace || 0) * 500) / 50) * 50, minKcal(p));
  const protein = Math.round(0.85 * (p.goal || lb) / 5) * 5;
  return { kcal, p: protein, bmr: Math.round(b), maint: Math.round(maint / 10) * 10 };
}

// ---- the day ------------------------------------------------------------------

// The template for a 2,200 kcal / 160 g day. Times are hours; "to" is when
// that slot should be eaten by. The other 170 kcal and 20 g are any-time slack.
export const SLOTS = [
  { id: 'morning', name: 'Morning', short: 'Morning', from: 8, to: 10.5, kcal: 230, p: 25 },
  { id: 'lunch', name: 'Lunch', short: 'Lunch', from: 12, to: 13.5, kcal: 600, p: 40 },
  { id: 'snack', name: 'Afternoon snack', short: 'Snack', from: 15, to: 16.5, kcal: 250, p: 25 },
  { id: 'dinner', name: 'Dinner', short: 'Dinner', from: 18.5, to: 20, kcal: 600, p: 35 },
  { id: 'evening', name: 'Evening', short: 'Evening', from: 20.5, to: 24, kcal: 350, p: 15 },
];
const DAY_KCAL = 1850, DAY_P = 160;
export const SLOT = Object.fromEntries(SLOTS.map(s => [s.id, s]));

// Scales the template to today's target. The evening budget stays fixed
// (it's yours to set), and the daytime slots share the rest.
export function dayPlan(t, evening = 350) {
  const ev = Math.min(evening, Math.round(t.kcal * 0.25));
  const kf = (t.kcal - ev) / DAY_KCAL, pf = t.p / DAY_P;
  const slots = SLOTS.map(s => ({
    ...s,
    kcal: s.id === 'evening' ? ev : Math.round(s.kcal * kf / 10) * 10,
    p: Math.round(s.p * pf),
  }));
  return { kcal: t.kcal, p: t.p, evening: ev, slots };
}

// Where you should be by hour h: each daytime slot ramps up over its window.
// The evening budget isn't on the pace line.
export function paceAt(plan, h) {
  let kcal = 0, p = 0;
  for (const s of plan.slots) {
    if (s.id === 'evening') continue;
    const f = h >= s.to ? 1 : h <= s.from ? 0 : (h - s.from) / (s.to - s.from);
    kcal += s.kcal * f;
    p += s.p * f;
  }
  return { kcal: Math.round(kcal), p: Math.round(p) };
}

export const slotAt = h => (h < 11 ? 'morning' : h < 14.5 ? 'lunch' : h < 17.5 ? 'snack' : h < 20.25 ? 'dinner' : 'evening');

export const sumEntries = list => (list || []).reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p }), { kcal: 0, p: 0 });

// Behind = from 2 pm until the evening, 400 kcal or 30 g protein under pace.
export function paceStatus(plan, eaten, h) {
  const pace = paceAt(plan, h);
  const dk = eaten.kcal - pace.kcal, dp = eaten.p - pace.p;
  const behind = h >= 14 && h < 20.5 && (dk <= -400 || dp <= -30);
  return { pace, dk, dp, behind };
}

// ---- weight -------------------------------------------------------------------

// Average of the weigh-ins in the 7 days ending on `key`.
export function avg7(weights, key) {
  const vals = [];
  for (let i = 0; i < 7; i++) {
    const w = weights[addDays(key, -i)];
    if (w) vals.push(w);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Straight-line trend through the weigh-ins of the last `days` days.
export function trend(weights, endKey, days = 21) {
  const pts = Object.entries(weights)
    .map(([k, w]) => [daysBetween(endKey, k), w])
    .filter(([x, w]) => x <= 0 && x > -days && w);
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, [x]) => a + x, 0) / n, my = pts.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  if (!sxx) return null;
  const xs = pts.map(([x]) => x);
  return { perWeek: (sxy / sxx) * 7, n, span: Math.max(...xs) - Math.min(...xs) };
}

// After 3 weeks on a target (2 weeks after a change), compare your trend
// with the plan: losing under 0.5 lb a week → 150 less; over 1.5 → 150 more.
export function adjustCheck(state, today) {
  const t = state.target, p = state.profile;
  if (!t || !t.since) return null;
  if (state.adjustSnooze && daysBetween(state.adjustSnooze, today) < 7) return null;
  const since = daysBetween(t.since, today);
  if (since < (state.adjust.length ? 14 : 21)) return null;
  const tr = trend(state.weights, today, Math.min(21, since + 1));
  if (!tr || tr.n < 10 || tr.span < 12) return null;
  const avg = avg7(state.weights, today);
  if (p.goal && avg !== null && avg <= p.goal) {
    if (p.pace === 0) return null;
    return { kind: 'goal', from: t.kcal, to: suggestTarget({ ...p, pace: 0 }, avg).kcal, rate: tr.perWeek, avg };
  }
  if (p.pace === 0) return null;
  if (tr.perWeek > -0.5) {
    const to = Math.max(t.kcal - 150, minKcal(p));
    return to < t.kcal ? { kind: 'down', from: t.kcal, to, rate: tr.perWeek } : null;
  }
  if (tr.perWeek < -1.5) return { kind: 'up', from: t.kcal, to: t.kcal + 150, rate: tr.perWeek };
  return null;
}

// When you'd reach `goal` at `perWeek` lb a week (a loss is negative).
export function eta(avg, perWeek, goal, today) {
  if (avg === null || !goal || avg <= goal || !(perWeek < -0.1)) return null;
  return addDays(today, Math.round(((avg - goal) / -perWeek) * 7));
}
