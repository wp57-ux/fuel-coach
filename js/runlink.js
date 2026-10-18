// Run Coach lives on the same website, so its saved data is readable here.
// Fuel Coach only reads it, never writes.
import { dayKey } from './targets.js';

const KG_PER_LB = 0.45359237;
const ZONE = { warmup: 'easy', cooldown: 'easy', easy: 'easy', steady: 'steady', strong: 'strong', hard: 'hard' };
const PCT = { easy: 0.6, steady: 1, strong: 1.15, hard: 1.35 };
const MET = { easy: 4.8, steady: 6.8, strong: 8.8, hard: 11 };
const MPS = { imperial: 26.8224, metric: 1000 / 60 };

export function readRunCoach() {
  try {
    const s = JSON.parse(localStorage.getItem('runcoach.v1') || 'null');
    return s && Array.isArray(s.sessions) ? s : null;
  } catch {
    return null;
  }
}

const kgOf = s => (Number(s.weight) || 0) * (s.units === 'metric' ? 1 : KG_PER_LB);

// Same estimates Run Coach uses: the ACSM cycling equation (or effort-zone
// METs without watts), and the ACSM walking/running equations.
function rideKcal(s) {
  const kg = kgOf(s);
  let kcal = 0;
  for (const [type, sec] of Object.entries(s.byType || {})) {
    const z = ZONE[type];
    if (!z || !sec) continue;
    const w = s.power ? Math.max(20, Math.round(s.power * PCT[z] / 5) * 5) : null;
    const perMin = w ? (1.8 * w * 6.12 + 7 * kg) * 5 / 1000 : MET[z] * kg * 3.5 * 5 / 1000;
    kcal += perMin * sec / 60;
  }
  return Math.round(kcal);
}

function runKcal(s) {
  const kg = kgOf(s), sp = s.speeds || {}, g = (sp.incline || 0) / 100, m = MPS[s.units] || MPS.imperial;
  const run = (sp.runSpeed || 0) * m, walk = (sp.walkSpeed || 0) * m;
  const perMin = (vo2, sec) => (vo2 * kg / 1000) * 5 * sec / 60;
  return Math.round(perMin(0.2 * run + 0.9 * run * g + 3.5, s.runSec || 0) + perMin(0.1 * walk + 1.8 * walk * g + 3.5, s.walkSec || 0));
}

// Workouts logged in Run Coach on that food day.
export function workoutsOn(key, rc = readRunCoach()) {
  if (!rc) return [];
  const on = s => s?.at && dayKey(Date.parse(s.at)) === key;
  const out = [];
  for (const s of rc.sessions.filter(on)) {
    out.push(s.mode === 'bike'
      ? { kind: 'ride', label: `Ride · stage ${s.stage}`, kcal: rideKcal(s) }
      : { kind: 'run', label: `Run · stage ${s.stage}`, kcal: runKcal(s) });
  }
  for (const s of (rc.lifts || []).filter(on)) {
    out.push({ kind: 'lift', label: s.day ? `Lift · Day ${s.day}` : 'Lift', kcal: Math.round(s.kcal || 0) });
  }
  return out;
}

export function runCoachWeight(rc = readRunCoach()) {
  const p = rc?.profile;
  if (!p?.weight) return null;
  return p.units === 'metric' ? Math.round(p.weight / KG_PER_LB * 10) / 10 : p.weight;
}
