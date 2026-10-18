// Everything lives in this phone's localStorage. Nothing is sent anywhere,
// except a barcode number when you look up a new food.

const KEY = 'fuelcoach.v1';
const TIMER = 'fuelcoach.timer';

export const DEFAULTS = {
  version: 1,
  onboarded: false,
  // goal = where you're headed; stop = a first milestone on the way (optional)
  profile: { sex: 'm', age: null, heightIn: null, startLb: null, goal: null, stop: null, pace: 1, activity: 1.5 },
  // the rest-day target; since = the day it was last set
  target: null,
  adjust: [],
  adjustSnooze: null,
  // kcal added on training days; train = days you switched training on or off by hand
  trainBonus: 150,
  train: {},
  evening: 350,
  nudges: true,
  // null until first run, then filled from foods.js
  foods: null,
  log: {},
  weights: {},
  pantry: null,
  custom: {},
  shop: [],
  cravings: [],
  seen: {},
};

const clone = o => JSON.parse(JSON.stringify(o));

function merge(base, saved) {
  for (const [k, v] of Object.entries(saved || {})) {
    const b = base[k];
    base[k] = b && v && typeof b === 'object' && typeof v === 'object' && !Array.isArray(b) ? { ...b, ...v } : v;
  }
  return base;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(clone(DEFAULTS), JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return clone(DEFAULTS);
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save', e);
    return false;
  }
}

export function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TIMER);
  } catch {}
}

// The 10-minute craving timer, so it survives closing the app.
export function saveTimer(t) {
  try { t ? localStorage.setItem(TIMER, JSON.stringify(t)) : localStorage.removeItem(TIMER); } catch {}
}

export function loadTimer() {
  try { return JSON.parse(localStorage.getItem(TIMER) || 'null'); } catch { return null; }
}

export function toBackup(state) {
  return JSON.stringify({ app: 'fuel-coach', exportedAt: new Date().toISOString(), state }, null, 1);
}

export function fromBackup(text) {
  const data = JSON.parse(text);
  const s = data && data.app === 'fuel-coach' ? data.state : null;
  if (!s || typeof s.log !== 'object') throw new Error('Not a Fuel Coach backup');
  return merge(clone(DEFAULTS), s);
}
