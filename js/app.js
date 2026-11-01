import * as store from './store.js';
import * as T from './targets.js';
import { ING, SECTIONS } from './ingredients.js';
import { RECIPES, perServing } from './recipes.js';
import { seedFoods, batchPortion, batchTotals } from './foods.js';
import { workoutsOn, readRunCoach, runCoachWeight } from './runlink.js';
import * as Scan from './scan.js';

const { SLOTS, SLOT } = T;
// Shown in Settings, so you can tell which version your phone is running.
// Keep in step with VERSION in sw.js.
const APP_VERSION = '5 · Nov 1';
const QTYS = [0.5, 1, 1.5, 2, 3];
const WINDOW = { morning: '8–10:30 am', lunch: '12–1:30 pm', snack: '3–4:30 pm', dinner: '6:30–8 pm', evening: 'after 8:30 pm' };
// What you said is at home, and what your usual cooks need.
const HAVE = ['eggs', 'milk', 'oats', 'oat-flour', 'protein-powder', 'vanilla', 'chicken-nuggets', 'spinach-frozen', 'blueberries-frozen', 'banana-frozen', 'tuna'];
const USUAL = ['turkey-ground', 'vindaloo-sauce', 'broccoli', 'zucchini', 'mushrooms', 'bell-pepper', 'pizza-crust', 'pizza-sauce', 'cheddar',
  'turkey-pepperoni', 'feta', 'choc-chips', 'sweetener', 'greek-yogurt', 'tequila', 'orange', 'lemon'];
const CAT = { batch: 'Batch cooks', oven: 'Toaster oven', breakfast: 'Breakfast', snack: 'Snacks & treats', drink: 'Drinks' };
const FILTERS = [['all', 'All'], ['make', 'Can make now'], ['fits', 'Fits today'], ['batch', 'Batch cooks'], ['oven', 'Toaster oven'],
  ['breakfast', 'Breakfast'], ['snack', 'Snacks & treats'], ['drink', 'Drinks']];
const SECS = [...SECTIONS, { id: 'other', name: 'Other' }];
const RECIPE = Object.fromEntries(RECIPES.map(r => [r.id, r]));
// Whole words in ingredient ids, so graham-crackers and ginger don't count.
const BOOZE = /(^|-)(tequila|vodka|gin|rum|beer|wine|whisky|whiskey|ipa|lager|cider)(-|$)/;
const WHY = {
  hungry: { name: 'Hungry', sub: 'It’s been a while since you ate' },
  bored: { name: 'Bored', sub: 'Nothing to do, the TV’s on' },
  stressed: { name: 'Stressed', sub: 'Long day, wound up' },
  treat: { name: 'Treat', sub: 'You just want something good' },
};
const IDEAS = {
  bored: ['Text or call someone', 'A 10-minute walk, even just around the block', 'A shower', 'Prep tomorrow’s lattes and lunch',
    'Brush your teeth (it really does switch off snacking)', 'Tea or sparkling water'],
  stressed: ['10 slow breaths: in for 4, out for 6', 'A walk outside', 'A hot shower', 'Tea or sparkling water',
    'Write down what’s bugging you', 'Your Run Coach stretches (5 minutes)'],
};

let state = store.load();
let view = 'today';
let rFilter = 'all';
let kTab = 'pantry';
let kEdit = false;
let picker = null;      // food picker sheet
let form = null;        // food form sheet
let batch = null;       // batch being edited
let scanner = null;
let ticker = null;      // craving timer
let installEvt = null;

if (!state.foods) state.foods = seedFoods();
if (!state.pantry) state.pantry = seedPantry();

// ---- helpers -----------------------------------------------------------------

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => Math.round(n || 0).toLocaleString();
const fmt1 = n => (Math.round(n * 10) / 10).toFixed(1);
const round1 = n => Math.round(n * 10) / 10;
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const FR = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const fq = q => { const w = Math.floor(q + 1e-9), f = Math.round((q - w) * 100) / 100; return f ? (FR[f] ? `${w || ''}${FR[f]}` : String(q)) : String(w); };
const today = () => T.dayKey();
const nowH = () => T.hourOf();
const entriesOn = k => state.log[k] || [];
const fmtDay = (k, o = { weekday: 'short', month: 'short', day: 'numeric' }) => T.keyDate(k).toLocaleDateString(undefined, o);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches;
const foodById = id => state.foods.find(f => f.id === id);
const itemName = id => ING[id]?.name ?? state.custom[id]?.name ?? id;
const shortName = id => itemName(id).replace(/\s*\(.*?\)/g, '');
const secOf = id => (ING[id] ? ING[id].sec : 'other');
const isBoozeRecipe = r => r.ing.some(([id]) => BOOZE.test(id));
const isDrinkEntry = e => (e.food ? !!foodById(e.food)?.drink : e.recipe && RECIPE[e.recipe] ? isBoozeRecipe(RECIPE[e.recipe]) : false);
const lastWeight = () => { const ks = Object.keys(state.weights).sort(); return ks.length ? state.weights[ks[ks.length - 1]] : null; };

function seedPantry() {
  const p = {};
  for (const id of USUAL) if (ING[id] && !ING[id].basic) p[id] = 'out';
  for (const id of HAVE) if (ING[id] && !ING[id].basic) p[id] = 'have';
  return p;
}

function persist() {
  if (!store.save(state)) toast('Couldn’t save. Is the phone’s storage full?');
}

let toastTimer, toastUndo = null;
function toast(msg, undo = null) {
  const t = $('#toast');
  toastUndo = undo;
  t.innerHTML = `<span>${msg}</span>${undo ? '<button data-act="undo">Undo</button>' : ''}`;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('on'); toastUndo = null; }, undo ? 5000 : 2800);
}

// The Android back button closes the open sheet or screen instead of leaving.
let guarded = false;
function guard() {
  if (!guarded) { history.pushState({ fc: 1 }, ''); guarded = true; }
}

function showScreen(html) {
  guard();
  const s = $('#screen');
  s.innerHTML = html;
  s.classList.add('on');
  s.scrollTop = 0;
  document.body.classList.add('locked');
}

function hideScreen() {
  const s = $('#screen');
  s.classList.remove('on');
  s.innerHTML = '';
  document.body.classList.remove('locked');
}

function openSheet(html, cls = '') {
  guard();
  const s = $('#sheet');
  s.onclick = null;
  s.innerHTML = `<div class="sheet-back" data-act="sheet-close"></div><div class="sheet-card ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  s.classList.add('on');
}

function setSheet(html) {
  const c = $('#sheet .sheet-card');
  if (c) { c.innerHTML = html; c.scrollTop = 0; }
}

function closeSheet() {
  const s = $('#sheet');
  s.classList.remove('on');
  s.innerHTML = '';
  s.onclick = null;
  picker = null;
  form = null;
}

function ask(title, body, buttons) {
  return new Promise(resolve => {
    const s = $('#sheet');
    s.innerHTML = `<div class="sheet-back" data-ans="-1"></div>
      <div class="sheet-card" role="alertdialog" aria-modal="true">
        <h3>${title}</h3>${body ? `<p>${body}</p>` : ''}
        <div class="sheet-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-ans="${i}">${b.label}</button>`).join('')}</div>
      </div>`;
    s.classList.add('on');
    s.onclick = e => {
      const el = e.target.closest('[data-ans]');
      if (!el) return;
      const i = +el.dataset.ans;
      s.onclick = null;
      closeSheet();
      resolve(i < 0 ? undefined : buttons[i].value);
    };
  });
}

const headerHTML = sub => `<header class="top"><div class="brand">Fuel<i>/</i>Coach</div><div class="date">${esc(sub)}</div></header>`;

const card = (tone, title, body, actions = '', actCls = 'row') =>
  `<div class="card ${tone}"><h3>${title}</h3><p>${body}</p>${actions ? `<div class="${actCls}">${actions}</div>` : ''}</div>`;

const toggleHTML = (path, label, sub = '') => {
  const on = !!getPath(state, path);
  return `<button class="toggle" role="switch" aria-checked="${on}" data-act="toggle" data-path="${path}">
    <span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i></i></button>`;
};

const numField = (label, bind, value, unit, min, max, step, note = '') =>
  `<label class="field"><span>${label}</span><div class="inp"><input data-bind="${bind}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${value ?? ''}"><em>${unit}</em></div>${note ? `<small>${note}</small>` : ''}</label>`;

const hot = n => (n ? `<span class="hot" title="Spice ${n} of 3">${'<i></i>'.repeat(n)}</span>` : '');

// ---- foods, recipes and the log -----------------------------------------------

const itemOfFood = f => ({ key: `f:${f.id}`, name: f.name, kcal: f.kcal, p: f.p, serving: f.serving, food: f.id, slot: f.slot, drink: !!f.drink });
const itemOfRecipe = r => ({ key: `r:${r.id}`, name: r.name, ...perServing(r), serving: r.serves > 1 ? `1 of ${r.serves} servings` : '1 serving', recipe: r.id, slot: r.when?.[0], drink: isBoozeRecipe(r), min: r.hands });
function itemOfKey(key) {
  const id = key.slice(2);
  if (key[0] === 'f') { const f = foodById(id); return f ? itemOfFood(f) : null; }
  return RECIPE[id] ? itemOfRecipe(RECIPE[id]) : null;
}
const keyOfEntry = e => (e.food ? `f:${e.food}` : e.recipe ? `r:${e.recipe}` : null);

function addEntry(item, qty, slot, k = today()) {
  const e = { id: uid(), t: Date.now(), slot, qty, name: item.name, kcal: Math.round(item.kcal * qty), p: round1(item.p * qty) };
  if (item.food) e.food = item.food;
  if (item.recipe) e.recipe = item.recipe;
  (state.log[k] ||= []).push(e);
  return e;
}

function removeEntry(k, id) {
  const list = state.log[k];
  if (!list) return;
  state.log[k] = list.filter(e => e.id !== id);
  if (!state.log[k].length) delete state.log[k];
}

function logAndToast(item, qty, slot) {
  const k = today();
  const e = addEntry(item, qty, slot, k);
  persist();
  closeSheet();
  render();
  toast(`Logged ${esc(e.name)}${qty !== 1 ? ` ×${fq(qty)}` : ''} · ${fmt(e.kcal)} kcal`, () => { removeEntry(k, e.id); persist(); render(); });
  return e;
}

// Your most-logged foods in a slot over 3 weeks, then your usuals for it.
function usualsFor(slot) {
  const counts = {};
  for (let i = 1; i <= 21; i++) {
    for (const e of entriesOn(T.addDays(today(), -i))) {
      const key = e.slot === slot && keyOfEntry(e);
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
  }
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  for (const f of state.foods) if (f.fav && f.slot === slot && !keys.includes(`f:${f.id}`)) keys.push(`f:${f.id}`);
  return keys.map(itemOfKey).filter(Boolean).slice(0, 4);
}

function recentItems(n) {
  const seen = new Set(), out = [];
  for (let i = 0; i <= 30 && out.length < n; i++) {
    for (const e of [...entriesOn(T.addDays(today(), -i))].reverse()) {
      const key = keyOfEntry(e);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const it = itemOfKey(key);
      if (it) out.push(it);
    }
  }
  return out.slice(0, n);
}

// "Tequila + fresh citrus" and "Tequila with fresh citrus" are the same thing.
const STOP = new Set(['with', 'fresh', 'protein', 'high', 'easy', 'quick', 'your', 'the', 'and']);
const sameKey = name => name.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)).sort().join(' ');
function distinct(list, n) {
  const seen = new Set(), out = [];
  for (const x of list) {
    const k = sameKey(x.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length === n) break;
  }
  return out;
}

function missing(r) {
  const ids = [...new Set(r.ing.map(([id]) => id))];
  return ids.filter(id => ING[id] && !ING[id].basic && !['have', 'low'].includes(state.pantry[id]));
}
const canMake = r => missing(r).length === 0;

// Quick, high-protein fixes when you're behind: your usuals first, then
// recipes you can make right now.
function quickFixes(left) {
  const pool = [];
  for (const f of state.foods) if (f.fav && !f.drink && ['morning', 'snack'].includes(f.slot)) pool.push(itemOfFood(f));
  for (const r of RECIPES) {
    if (['snack', 'drink'].includes(r.cat) && r.hands <= 10 && !isBoozeRecipe(r) && canMake(r)) pool.push(itemOfRecipe(r));
  }
  return distinct(pool.filter(x => x.p >= 12 && x.kcal <= Math.max(200, left)).sort((a, b) => b.p / b.kcal - a.p / a.kcal), 3);
}

// A real, protein-first meal for a light day: your foods, then quick recipes.
function proteinOptions(left) {
  const pool = state.foods.filter(f => !f.drink).map(itemOfFood);
  for (const r of RECIPES) if ((r.total || r.hands) <= 15 && !isBoozeRecipe(r)) pool.push(itemOfRecipe(r));
  return distinct(pool.filter(x => x.p >= 15 && x.kcal <= left).sort((a, b) => (b.p / b.kcal + (b.food ? 0.01 : 0)) - (a.p / a.kcal + (a.food ? 0.01 : 0))), 4);
}

// Evening options: your evening usuals and evening recipes, the ones that fit first.
function eveningOptions(left, proteinFirst = false) {
  const pool = state.foods.filter(f => f.slot === 'evening' || f.drink).map(itemOfFood);
  for (const r of RECIPES) if (r.when?.includes('evening') && r.hands <= 15) pool.push(itemOfRecipe(r));
  const fits = x => x.kcal <= Math.max(left, 0) + 25;
  const score = x => (fits(x) ? 1000 : 0) + (proteinFirst ? x.p / x.kcal * 100 : 0) - (x.food ? 0 : 1);
  return distinct(pool.sort((a, b) => score(b) - score(a)), 6);
}

// ---- training days (from Run Coach, or switched by hand) -----------------------

function trainInfo(k) {
  const w = workoutsOn(k);
  const manual = state.train[k];
  return { on: manual ?? w.length > 0, manual, workouts: w, burn: w.reduce((a, x) => a + x.kcal, 0) };
}

function dayTarget(k) {
  const tr = trainInfo(k);
  const t = { kcal: state.target.kcal + (tr.on ? state.trainBonus : 0), p: state.target.p };
  return { ...t, tr, plan: T.dayPlan(t, state.evening) };
}

// ---- views -----------------------------------------------------------------------

function render() {
  if (!state.onboarded) {
    if (!$('#onboard')) showScreen(onboardHTML());
    return;
  }
  const fn = { today: todayHTML, recipes: recipesHTML, kitchen: kitchenHTML, weight: weightHTML, settings: settingsHTML }[view] || todayHTML;
  $('#view').innerHTML = safe(fn);
  $$('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
}

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.error(e);
    return `<div class="card red"><h3>Something broke</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ---- today -----------------------------------------------------------------------

function todayHTML() {
  const k = today(), h = nowH(), list = entriesOn(k);
  const dt = dayTarget(k), eaten = T.sumEntries(list);
  const st = T.paceStatus(dt.plan, eaten, h);
  const cards = [];

  const tm = store.loadTimer();
  if (tm && tm.end <= Date.now() && Date.now() - tm.end < 2 * 3600e3) {
    cards.push(card('acc', 'Ten minutes are up', 'Still want it? Then have the planned treat, logged and guilt-free. Or let it go.',
      '<button class="btn primary" data-act="t-open">See options</button><button class="btn ghost" data-act="t-pass">I’m good</button>'));
  } else if (tm && tm.end > Date.now()) {
    cards.push(card('acc', 'Craving timer running', 'Give it the full ten minutes.', '<button class="btn primary" data-act="t-open">Open timer</button>'));
  }
  if (!state.weights[k] && h < 20 && state.seen.weigh !== k) cards.push(weighCardHTML(true));
  const adj = T.adjustCheck(state, k);
  if (adj) cards.push(adjustHTML(adj));
  if (st.behind && state.nudges && h < 20.5) cards.push(catchupHTML(dt, eaten, st));
  if (h >= 20) cards.push(eveningHTML(dt, eaten, list));
  if (installEvt && !isStandalone()) {
    cards.push(card('info', 'Put it on your home screen', 'Opens full-screen and works offline.', '<button class="btn primary" data-act="install">Install app</button>'));
  }

  return `
    ${headerHTML(fmtDay(k, { weekday: 'long', month: 'short', day: 'numeric' }))}
    ${heroHTML(dt, eaten, st, h)}
    ${cards.join('')}
    ${dt.plan.slots.map(s => slotHTML(s, list, h, k)).join('')}
    <div class="startbar"><div class="sbar">
      <button class="big" data-act="crave">Craving?</button>
      <button class="big go" data-act="pick">+ Log food</button>
    </div></div>`;
}

const pct = (v, t) => Math.max(0, Math.min(100, (v / t) * 100));

function meterHTML(cls, v, t, pace, unit) {
  return `<div class="meter ${cls} ${v > t ? 'over' : ''}"><i style="width:${pct(v, t)}%"></i>${pace > 0 && pace < t ? `<em style="left:${pct(pace, t)}%"></em>` : ''}</div>
    <div class="meter-l"><span><b>${fmt(v)}</b> ${unit}</span><span>${pace > 0 ? `pace ${fmt(pace)}` : ''}</span></div>`;
}

function heroHTML(dt, eaten, st, h) {
  const left = dt.kcal - eaten.kcal, pLeft = Math.round(dt.p - eaten.p);
  return `<section class="hero">
    <span class="eyebrow">Left today</span>
    <div class="left">
      <div class="k ${left < 0 ? 'over' : ''}"><b>${fmt(Math.abs(left))}<small>kcal</small></b><span>${left < 0 ? 'over today' : `of ${fmt(dt.kcal)}`}</span></div>
      <div class="pr"><b>${Math.max(0, pLeft)}<small>g</small></b><span>${pLeft <= 0 ? 'protein done' : `protein to go, of ${dt.p}`}</span></div>
    </div>
    ${meterHTML('k', eaten.kcal, dt.kcal, st.pace.kcal, 'kcal')}
    ${meterHTML('p', eaten.p, dt.p, st.pace.p, 'g protein')}
    ${paceHTML(st, eaten, h, dt)}
    ${state.trainBonus ? trainHTML(dt.tr) : ''}
  </section>`;
}

function paceHTML(st, eaten, h, dt) {
  let cls = 'ok', msg;
  const behind = [];
  if (st.dk <= -200) behind.push(`<b>${fmt(-st.dk)} kcal</b>`);
  if (st.dp <= -15) behind.push(`<b>${Math.round(-st.dp)} g protein</b>`);
  if (h >= 20.5) {
    const l = dt.kcal - eaten.kcal;
    cls = l < 0 ? 'behind' : 'ok';
    msg = l > state.evening + 250 ? `Light day: <b>${fmt(l)} kcal</b> left. Protein first.`
      : l >= 0 ? `Evening: <b>${fmt(l)} kcal</b> left for tonight.` : `<b>${fmt(-l)} kcal</b> over. One day doesn’t move the trend.`;
  } else if (h < 8 && !eaten.kcal) {
    cls = 'idle';
    msg = 'A fresh day. It starts with your lattes.';
  } else if (behind.length) {
    cls = 'behind';
    msg = `${behind.join(' and ')} behind pace.`;
  } else if (st.dk >= 250) {
    cls = 'ahead';
    msg = `<b>${fmt(st.dk)} kcal</b> ahead of pace. A lighter dinner keeps tonight’s budget.`;
  } else {
    msg = 'On pace. Nice.';
  }
  return `<p class="pace ${cls}"><i></i><span>${msg}</span></p>`;
}

function trainHTML(tr) {
  const sub = tr.workouts.length
    ? tr.workouts.map(w => esc(w.label)).join(' · ') + (tr.burn ? ` · ${fmt(tr.burn)} kcal burned` : '')
    : tr.on ? 'Switched on by you' : 'Lift, ride or volleyball';
  return `<div class="trainbar"><button class="train" aria-pressed="${tr.on}" data-act="train"><i></i>${tr.on ? `Training day · +${state.trainBonus}` : 'Training today?'}</button><small>${sub}</small></div>`;
}

function slotHTML(s, list, h, k) {
  const mine = list.filter(e => e.slot === s.id);
  const got = T.sumEntries(mine);
  const chips = [];
  if (!mine.length) {
    const y = entriesOn(T.addDays(k, -1)).filter(e => e.slot === s.id);
    if (y.length) chips.push(`<button class="qc rep" data-act="repeat" data-slot="${s.id}">Same as yesterday <small>${fmt(T.sumEntries(y).kcal)}</small></button>`);
  }
  for (const it of usualsFor(s.id)) {
    chips.push(`<button class="qc" data-act="qlog" data-key="${it.key}" data-slot="${s.id}">${esc(it.name)} <small>${fmt(it.kcal)}</small></button>`);
  }
  chips.push(`<button class="qc add" data-act="pick" data-slot="${s.id}">+ Add</button>`);
  const now = T.slotAt(h) === s.id && h >= 7;
  return `<section class="slot ${now ? 'now' : ''} ${s.id !== 'evening' && got.kcal >= s.kcal * 0.8 ? 'full' : ''}">
    <div class="slot-h"><h2>${s.name}<small>${WINDOW[s.id]}</small></h2><span><b>${fmt(got.kcal)}</b> / ${fmt(s.kcal)} · ${Math.round(got.p)}/${s.p} g</span></div>
    ${mine.length ? `<ul class="entries">${mine.map(entryHTML).join('')}</ul>` : ''}
    <div class="qchips">${chips.join('')}</div>
  </section>`;
}

const entryHTML = e => `<li><button class="entry" data-act="entry" data-id="${e.id}"><span>${esc(e.name)}${e.qty !== 1 ? `<em>×${fq(e.qty)}</em>` : ''}</span><small>${fmt(e.kcal)} · <b>${Math.round(e.p)} g</b></small></button></li>`;

function weighCardHTML(onToday) {
  const last = lastWeight();
  return `<div class="wcard">
    <span class="eyebrow">Weigh-in · ${esc(fmtDay(today()))}</span>
    <div class="wstep">
      <button class="pm" data-act="w-step" data-v="-0.2">−0.2</button>
      <input id="wIn" type="number" inputmode="decimal" step="0.1" min="80" max="600" value="${last ?? ''}" aria-label="Weight in pounds">
      <button class="pm" data-act="w-step" data-v="0.2">+0.2</button>
    </div>
    <div class="row"><button class="btn primary" style="flex:1" data-act="w-save">Save ${last ? '' : 'weight'}</button>${onToday ? '<button class="btn ghost" data-act="w-skip">Not today</button>' : ''}</div>
  </div>`;
}

function adjustHTML(a) {
  const rate = fmt1(Math.abs(a.rate));
  if (a.kind === 'goal') {
    return card('green', 'Goal reached', `Your 7-day average is <b>${fmt1(a.avg)} lb</b>. Switch to maintenance, about <b>${fmt(a.to)} kcal</b> a day, to hold it there?`,
      '<button class="btn primary" data-act="adj-yes">Switch</button><button class="btn ghost" data-act="adj-no">Not now</button>');
  }
  const body = a.kind === 'down'
    ? `Over the last few weeks you’ve averaged <b>${a.rate < 0 ? `−${rate}` : `+${rate}`} lb a week</b>, slower than the 0.5 lb minimum. Bring calories down 150, to <b>${fmt(a.to)}</b>?`
    : `You’re losing <b>${rate} lb a week</b>. Faster than 1.5 costs muscle and makes evenings harder. Bring calories up 150, to <b>${fmt(a.to)}</b>?`;
  return card('amber', 'Time to adjust', body,
    `<button class="btn primary" data-act="adj-yes">${a.kind === 'down' ? 'Lower it' : 'Raise it'}</button><button class="btn ghost" data-act="adj-no">Not now</button>`);
}

function catchupHTML(dt, eaten, st) {
  const parts = [];
  if (st.dk <= -200) parts.push(`<b>${fmt(-st.dk)} kcal</b>`);
  if (st.dp <= -15) parts.push(`<b>${Math.round(-st.dp)} g protein</b>`);
  const slot = T.slotAt(nowH());
  const fixes = quickFixes(dt.kcal - eaten.kcal).map(x =>
    `<button class="qc" data-act="qlog" data-key="${x.key}" data-slot="${slot}">${esc(x.name)} <small>${fmt(x.kcal)} · ${Math.round(x.p)} g${x.min ? ` · ${x.min} min` : ''}</small></button>`);
  return card('amber', 'Catch up now', `You’re ${parts.join(' and ')} behind pace. A snack now keeps tonight easy.`, fixes.join(''), 'qchips');
}

function eveningHTML(dt, eaten, list) {
  const left = dt.kcal - eaten.kcal;
  const drinks = list.filter(isDrinkEntry).reduce((a, e) => a + e.qty, 0);
  const dtext = drinks ? ` ${fq(drinks)} drink${drinks > 1 ? 's' : ''} so far.` : '';
  const chip = x => `<button class="qc" data-act="qlog" data-key="${x.key}" data-slot="evening">${esc(x.name)} <small>${fmt(x.kcal)}${x.p >= 10 ? ` · ${Math.round(x.p)} g` : ''}</small></button>`;
  if (left > state.evening + 250) {
    return card('amber', 'Light day', `<b>${fmt(left)} kcal</b> left. That’s room for a real meal, not a raid on the cupboard: protein first, then your <b>${fmt(state.evening)} kcal</b> evening budget.${dtext}`,
      proteinOptions(left).map(chip).join(''), 'qchips');
  }
  const body = left >= 0
    ? `<b>${fmt(left)} kcal</b> left for tonight.${dtext} Pick it now, then enjoy it.`
    : `You’re <b>${fmt(-left)} kcal</b> over today.${dtext} That’s fine: one day doesn’t move the trend. Water or tea from here.`;
  const opts = left > 0 ? eveningOptions(left).map(chip).join('') : '';
  return card(left >= 0 ? 'info' : 'amber', 'Tonight', body, opts, 'qchips');
}

// ---- food picker -----------------------------------------------------------------

const ICON = {
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 8v8M11 8v8M14 8v8M17 8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L4 13.8a1.5 1.5 0 0 1 2.4-1.8L8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pot: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6.5h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function openPicker(slot) {
  picker = { slot: slot || T.slotAt(nowH()), q: '', step: 'list' };
  openSheet(pickerHTML(), 'tall');
}

const slotSeg = cur => `<div class="seg">${SLOTS.map(s => `<button data-act="pk-slot" data-v="${s.id}" aria-pressed="${cur === s.id}">${s.short}</button>`).join('')}</div>`;

function pickerHTML() {
  return `<h3>Log food</h3>
    ${slotSeg(picker.slot)}
    <div class="inp text"><input id="pkQ" type="search" placeholder="Search your foods and recipes" autocomplete="off" value="${esc(picker.q)}"></div>
    <div class="pick-tools">
      <button class="btn" data-act="scan">${ICON.scan}Scan</button>
      <button class="btn" data-act="est-open">${ICON.hand}Estimate</button>
      <button class="btn" data-act="food-new">${ICON.plus}New food</button>
      <button class="btn" data-act="batch-new">${ICON.pot}Batch</button>
    </div>
    <div id="pkList">${pickListHTML()}</div>`;
}

const pickRow = x => `<li><button class="prow" data-act="pk-item" data-key="${x.key}">
  <span><b>${esc(x.name)}${x.recipe ? '<span class="tagr">recipe</span>' : ''}</b><small>${esc(x.serving || '')}</small></span>
  <span><b>${fmt(x.kcal)}</b> kcal<em>${Math.round(x.p)} g</em></span></button></li>`;

const pickSection = (title, rows) => (rows.length ? `<span class="eyebrow">${title}</span><ul class="plist">${rows.map(pickRow).join('')}</ul>` : '');

function pickListHTML() {
  const q = picker.q.trim().toLowerCase();
  if (q) {
    const match = x => x.name.toLowerCase().includes(q);
    const rows = [...state.foods.map(itemOfFood).filter(match), ...RECIPES.map(itemOfRecipe).filter(match)];
    return rows.length ? `<ul class="plist">${rows.map(pickRow).join('')}</ul>`
      : `<p class="empty">Nothing called “${esc(picker.q.trim())}” yet. Scan it, or add it as a new food.</p>`;
  }
  const favs = state.foods.filter(f => f.fav).map(itemOfFood).sort((a, b) => (b.slot === picker.slot) - (a.slot === picker.slot));
  const recent = recentItems(10).filter(x => !favs.some(f => f.key === x.key));
  const others = state.foods.filter(f => !f.fav).map(itemOfFood).filter(x => !recent.some(r => r.key === x.key));
  const recipes = RECIPES.filter(r => r.when?.includes(picker.slot)).map(itemOfRecipe).slice(0, 8);
  return pickSection('Your usuals', favs) + pickSection('Recent', recent) + pickSection('Your other foods', others)
    + pickSection('Recipes', recipes) + '<p class="note" style="margin-top:12px">Search to find any recipe.</p>';
}

function qtyHTML() {
  const x = picker.item, q = picker.qty;
  return `<div class="qty-food"><b>${esc(x.name)}</b><p>${esc(x.serving || '1 serving')} · ${fmt(x.kcal)} kcal · ${Math.round(x.p)} g protein</p></div>
    <span class="eyebrow">How much</span>
    <div class="qty">${QTYS.map(v => `<button data-act="pk-qty" data-v="${v}" aria-pressed="${v === q}">${fq(v)}</button>`).join('')}</div>
    <div class="row" style="justify-content:center;margin:-4px 0 12px"><button class="btn small" data-act="pk-step" data-v="-0.25">− ¼</button><button class="btn small" data-act="pk-step" data-v="0.25">+ ¼</button></div>
    <div class="qty-total"><div><b>${fmt(x.kcal * q)}<small>kcal</small></b></div><div><b class="pk">${Math.round(x.p * q)}<small>g protein</small></b></div><div><b>×${fq(q)}</b></div></div>
    <span class="eyebrow">When</span>
    ${slotSeg(picker.slot)}
    <div class="sheet-btns">
      ${picker.entry ? '<button class="btn danger" data-act="en-del">Delete</button>' : '<button class="btn ghost" data-act="pk-back">Back</button>'}
      <button class="btn primary" data-act="pk-log">${picker.entry ? 'Save' : 'Log it'}</button>
    </div>
    ${x.food && foodById(x.food) ? `<button class="btn ghost wide" data-act="food-edit" data-id="${x.food}">Edit this food</button>` : ''}`;
}

// ---- estimate with your hand ----------------------------------------------------
// Hand portions for a man's hand. Eating out adds 20% for the butter and oil
// restaurants cook with.
const HAND = [
  { k: 'palm', name: 'Palms', sub: 'Meat, fish, eggs, tofu', kcal: 150, p: 25 },
  { k: 'cup', name: 'Cupped hands', sub: 'Rice, pasta, fries, bread, potatoes, fruit', kcal: 120, p: 3 },
  { k: 'thumb', name: 'Thumbs', sub: 'Cheese, sauce, dressing, oil, butter, nuts', kcal: 100, p: 1 },
  { k: 'fist', name: 'Fists', sub: 'Vegetables and salad', kcal: 25, p: 1.5 },
];
const OUT_EXTRA = 0.2;

function estTotals(e) {
  let kcal = 0, p = 0;
  for (const h of HAND) { kcal += h.kcal * e[h.k]; p += h.p * e[h.k]; }
  if (e.out) kcal *= 1 + OUT_EXTRA;
  return { kcal: Math.round(kcal / 5) * 5, p: Math.round(p) };
}

const estTotHTML = t => `<div><b>${fmt(t.kcal)}<small>kcal</small></b></div><div><b class="pk">${t.p}<small>g protein</small></b></div>`;

function openEstimate() {
  if (!picker) picker = { slot: form?.slot || T.slotAt(nowH()), q: '' };
  picker.step = 'est';
  picker.est = { palm: 0, cup: 0, thumb: 0, fist: 0, out: false, save: false, name: '' };
  if ($('#sheet').classList.contains('on')) setSheet(estHTML()); else openSheet(estHTML(), 'tall');
}

function estHTML() {
  const e = picker.est;
  return `<h3>Estimate it</h3>
    <p>Count what’s on the plate with your hand. Halves are fine.</p>
    <p class="note">A palm is its size and thickness, without fingers. A cupped hand is what fits in it. A thumb is the whole thumb.</p>
    ${HAND.map(h => `<div class="est-row"><span><b>${h.name}</b><small>${h.sub} · ${h.kcal} kcal${h.p >= 3 ? `, ${h.p} g protein` : ''} each</small></span>
      <div class="est-stp"><button data-act="est-step" data-k="${h.k}" data-v="-0.5" aria-label="Less">−</button><b id="est-${h.k}">${fq(e[h.k])}</b><button data-act="est-step" data-k="${h.k}" data-v="0.5" aria-label="More">+</button></div></div>`).join('')}
    <button class="toggle" role="switch" aria-checked="${e.out}" data-act="est-out"><span><b>Eating out</b><small>Adds 20% for the butter and oil restaurants cook with</small></span><i></i></button>
    <div class="qty-total" id="estTot" style="margin-top:14px">${estTotHTML(estTotals(e))}</div>
    <label class="field"><span>Name it <small style="display:inline;margin:0">optional</small></span><div class="inp text"><input id="estName" maxlength="60" placeholder="e.g. Shawarma plate" value="${esc(e.name)}"></div></label>
    <span class="eyebrow">When</span>
    ${slotSeg(picker.slot)}
    <button class="toggle" role="switch" aria-checked="${e.save}" data-act="est-save"><span><b>Save to your usuals</b><small>For a meal you’ll have again</small></span><i></i></button>
    <div class="sheet-btns"><button class="btn ghost" data-act="pk-back">Back</button><button class="btn primary" data-act="est-log">Log it</button></div>`;
}

// ---- food form -------------------------------------------------------------------

function openFoodForm(f, opts = {}) {
  form = { id: f?.id || null, slot: f?.slot || picker?.slot || (opts.logAfter ? T.slotAt(nowH()) : null), fav: f ? !!f.fav : !opts.barcode, drink: !!f?.drink, barcode: f?.barcode || opts.barcode || null,
    per100: f?.per100 || opts.per100 || null, logAfter: !!opts.logAfter, from: opts.from || null };
  openSheet(foodFormHTML(f || opts.prefill || {}), 'tall');
}

function foodFormHTML(f) {
  const per = form.per100;
  return `<h3>${form.id ? 'Edit food' : 'New food'}</h3>
    ${form.from === 'off' ? '<p class="note warn">From Open Food Facts. Check the numbers against the label once.</p>' : ''}
    ${form.barcode && form.from !== 'off' && !form.id ? '<p class="note">Not in the food database. Type it in from the label, and the app remembers the barcode.</p>' : ''}
    ${!form.id && !form.barcode ? '<button class="btn small" style="margin:-4px 0 14px" data-act="est-open">No label? Estimate it with your hand</button>' : ''}
    <label class="field"><span>Name</span><div class="inp text"><input id="ffName" maxlength="60" value="${esc(f.name || '')}" placeholder="e.g. Oikos protein yogurt"></div></label>
    <label class="field"><span>Serving</span><div class="inp text"><input id="ffServ" maxlength="40" value="${esc(f.serving || '')}" placeholder="e.g. 1 cup (175 g)"></div></label>
    ${per ? `<label class="field"><span>Serving size</span><div class="inp"><input id="ffG" type="number" inputmode="decimal" min="1" max="2000" value="${f.g ?? 100}"><em>g</em></div>
      <small>${fmt(per.kcal)} kcal and ${fmt1(per.p)} g protein per 100 g</small></label>` : ''}
    <div class="grid2">
      <label class="field"><span>Calories</span><div class="inp"><input id="ffK" type="number" inputmode="decimal" min="0" max="3000" value="${f.kcal ?? ''}"><em>kcal</em></div></label>
      <label class="field"><span>Protein</span><div class="inp"><input id="ffP" type="number" inputmode="decimal" min="0" max="300" step="0.1" value="${f.p ?? ''}"><em>g</em></div></label>
    </div>
    <span class="eyebrow">Usually at</span>
    <div class="seg">${SLOTS.map(s => `<button data-act="ff-slot" data-v="${s.id}" aria-pressed="${form.slot === s.id}">${s.short}</button>`).join('')}</div>
    <button class="toggle" role="switch" aria-checked="${form.fav}" data-act="ff-fav"><span><b>One of your usuals</b><small>Shows as a one-tap button</small></span><i></i></button>
    <button class="toggle" role="switch" aria-checked="${form.drink}" data-act="ff-drink"><span><b>An alcoholic drink</b><small>Counted in your evening drinks</small></span><i></i></button>
    <div class="sheet-btns">
      ${form.id ? '<button class="btn danger" data-act="ff-del">Delete</button>' : '<button class="btn ghost" data-act="sheet-close">Cancel</button>'}
      <button class="btn primary" data-act="ff-save">${form.logAfter ? 'Save and log' : 'Save'}</button>
    </div>
    ${form.id && foodById(form.id)?.batch ? `<button class="btn wide" data-act="batch-edit" data-id="${form.id}">Edit the batch</button>` : ''}`;
}

function readFoodForm() {
  const name = $('#ffName').value.trim();
  const kcal = Number($('#ffK').value), p = Number($('#ffP').value);
  if (!name) return toast('Give it a name'), null;
  if (!($('#ffK').value !== '' && kcal >= 0 && kcal <= 3000)) return toast('Calories should be 0–3,000'), null;
  if (!($('#ffP').value !== '' && p >= 0 && p <= 300)) return toast('Protein should be 0–300 g'), null;
  const out = { name, serving: $('#ffServ').value.trim() || '1 serving', kcal: Math.round(kcal), p: round1(p), slot: form.slot, fav: form.fav, drink: form.drink };
  if (form.barcode) out.barcode = form.barcode;
  if (form.per100 && $('#ffG')) { out.per100 = form.per100; out.g = Number($('#ffG').value) || 100; }
  return out;
}

// ---- recipes -----------------------------------------------------------------------

function recipesHTML() {
  const k = today();
  const left = dayTarget(k).kcal - T.sumEntries(entriesOn(k)).kcal;
  const test = {
    all: () => true, make: canMake, fits: r => perServing(r).kcal <= left,
    batch: r => r.cat === 'batch', oven: r => r.cat === 'oven', breakfast: r => r.cat === 'breakfast', snack: r => r.cat === 'snack', drink: r => r.cat === 'drink',
  };
  const list = RECIPES.filter(test[rFilter] || test.all);
  const count = id => RECIPES.filter(test[id]).length;
  const grouped = ['all', 'make', 'fits'].includes(rFilter);
  let body = '';
  if (!list.length) {
    body = rFilter === 'make'
      ? '<p class="empty">Nothing you can make with exactly what’s at home. Recipes list what they need, so you can add it to your shopping.</p>'
      : `<p class="empty">Nothing fits the ${fmt(Math.max(0, left))} kcal left today. Tea or sparkling water?</p>`;
  } else if (grouped) {
    for (const c of Object.keys(CAT)) {
      const rs = list.filter(r => r.cat === c);
      if (rs.length) body += `<span class="eyebrow" style="margin:16px 0 8px">${CAT[c]}</span><div class="rlist">${rs.map(rcardHTML).join('')}</div>`;
    }
  } else {
    body = `<div class="rlist">${list.map(rcardHTML).join('')}</div>`;
  }
  return `${headerHTML(`${RECIPES.length} recipes`)}
    <h1 class="page-h">Recipes</h1>
    <div class="chips">${FILTERS.map(([id, label]) => `<button class="chip" data-act="rfilter" data-v="${id}" aria-pressed="${rFilter === id}">${label}${['make', 'fits'].includes(id) ? `<small>${count(id)}</small>` : ''}</button>`).join('')}</div>
    ${rFilter === 'fits' ? `<p class="note">${fmt(Math.max(0, left))} kcal left today.</p>` : ''}
    ${body}`;
}

function rcardHTML(r) {
  const s = perServing(r), miss = missing(r);
  const o = r.oven?.[0];
  return `<button class="rcard" data-act="recipe" data-id="${r.id}">
    <h3>${esc(r.name)}</h3>
    <div class="rmeta"><span><b>${s.kcal}</b> kcal</span><span class="pv"><b class="pv">${s.p}</b> g</span><span>${r.serves > 1 ? `makes ${r.serves}` : '1 serving'}</span><span>${r.hands} min</span>${o ? `<span>${esc(o.mode)}</span>` : ''}${hot(r.spice)}</div>
    <p class="rneed ${miss.length ? '' : 'ok'}">${miss.length ? `Need: ${esc(miss.map(id => shortName(id)).join(', '))}` : 'You have everything'}</p>
  </button>`;
}

// Grams in a teaspoon, for showing small amounts of basics in spoons.
const TSP = { salt: 6, 'olive-oil': 4.5, water: 5, 'hot-sauce': 5, sriracha: 6, vanilla: 4.2, 'baking-powder': 4.6, 'garlic-powder': 3, 'onion-powder': 2.5, cinnamon: 2.6 };

function amountText(id, g) {
  const i = ING[id];
  if (i?.basic && !i.ml && g <= 20) {
    if (id === 'oil-spray') return 'a few sprays';
    const tsp = Math.round(g / (TSP[id] || 2.5) * 4) / 4;
    if (tsp < 0.25) return 'a pinch';
    return tsp >= 3 ? `${fq(Math.round(tsp / 3 * 2) / 2)} tbsp` : `${fq(tsp)} tsp`;
  }
  if (i?.each) {
    const n = g / i.each, half = Math.round(n * 2) / 2;
    if (half > 0 && Math.abs(n - half) < 0.12) return `${fq(half)} ${esc(i.eachName || 'piece')}${half > 1 ? 's' : ''}`;
  }
  return `${fmt(g)} ${i?.ml ? 'ml' : 'g'}`;
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const ovenHTML = o => `<div class="oven"><b>${esc(o.mode)}${o.temp ? ` · ${o.temp}°F` : o.mode === 'Broil' ? ' · High' : ''} · ${o.min} min</b>
  <span>${esc([cap(o.tool), o.rack && `${o.rack} rack`, o.flip && `flip at ${o.flip} min`, o.note].filter(Boolean).join(' · '))}</span></div>`;

function recipeHTML(r) {
  const s = perServing(r), miss = missing(r);
  const inUsuals = state.foods.some(f => f.recipe === r.id);
  const ings = r.ing.map(([id, g]) => {
    const i = ING[id];
    const cls = i?.basic ? 'basic' : miss.includes(id) ? 'miss' : '';
    return `<li class="${cls}"><i></i><span>${esc(i?.name ?? id)}</span><small>${amountText(id, g)}</small></li>`;
  }).join('');
  return `<div class="scr">
    <div class="scr-top"><button class="back" data-act="close-screen">‹ Back</button><span class="eyebrow">${CAT[r.cat]}${r.spice ? ` · ${hot(r.spice)}` : ''}</span></div>
    <div class="r-head"><h1>${esc(r.name)}</h1></div>
    <dl class="r-nums">
      <div class="k"><dt>Calories</dt><dd>${s.kcal}<small>kcal</small></dd></div>
      <div class="pr"><dt>Protein</dt><dd>${s.p}<small>g</small></dd></div>
      <div><dt>Makes</dt><dd>${r.serves}</dd></div>
      <div><dt>Hands-on</dt><dd>${r.hands}<small>min</small></dd></div>
    </dl>
    ${(r.oven || []).map(ovenHTML).join('')}
    <section class="group" style="margin-top:16px"><div class="gh"><h2>Ingredients</h2>${miss.length ? `<button class="btn small" data-act="r-shop" data-id="${r.id}">Add ${miss.length} to shopping</button>` : ''}</div>
      <ul class="ilist">${ings}</ul>
      <p class="note" style="margin-top:8px">${miss.length ? `Missing: ${esc(miss.map(itemName).join(', '))}.` : 'You have everything for this.'} Grey dots are basics like spices.</p>
    </section>
    <section class="group"><h2>Steps</h2><ol class="steps">${r.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
    ${r.note ? `<p class="r-note">${esc(r.note)}</p>` : ''}
    <div class="r-actions">
      <button class="btn primary" data-act="r-log" data-id="${r.id}">Log a serving</button>
      <button class="btn" data-act="r-usual" data-id="${r.id}" ${inUsuals ? 'disabled' : ''}>${inUsuals ? 'In your usuals' : 'Add to your usuals'}</button>
    </div>
  </div>`;
}

// ---- kitchen -----------------------------------------------------------------------

function shopItems() {
  const out = Object.entries(state.pantry || {}).filter(([, v]) => v !== 'have').map(([id, v]) => ({ id, v, name: itemName(id), sec: secOf(id) }));
  for (const x of state.shop) out.push({ id: x.id, v: 'extra', name: x.name, sec: 'other' });
  return out;
}

const ingOptions = () => Object.values(ING).filter(i => !i.basic).map(i => `<option value="${esc(i.name)}">`).join('');

function kitchenHTML() {
  const n = shopItems().length;
  return `${headerHTML('Kitchen')}
    <div class="seg">
      <button data-act="ktab" data-v="pantry" aria-pressed="${kTab === 'pantry'}">At home</button>
      <button data-act="ktab" data-v="shop" aria-pressed="${kTab === 'shop'}">Shopping${n ? ` · ${n}` : ''}</button>
    </div>
    ${kTab === 'pantry' ? pantryHTML() : shopHTML()}
    <datalist id="ingList">${ingOptions()}</datalist>`;
}

function pantryHTML() {
  const ids = Object.keys(state.pantry);
  const tri = (id, v) => `<div class="tri">${['have', 'low', 'out'].map(x =>
    `<button class="${x}" data-act="pan-set" data-id="${esc(id)}" data-v="${x}" aria-pressed="${v === x}">${cap(x)}</button>`).join('')}</div>`;
  const secs = SECS.map(s => {
    const rows = ids.filter(id => secOf(id) === s.id).sort((a, b) => itemName(a).localeCompare(itemName(b)));
    if (!rows.length) return '';
    return `<div class="pan-sec"><h2>${s.name}</h2>${rows.map(id => `<div class="pan"><span>${esc(itemName(id))}</span>${kEdit
      ? `<button class="rm" data-act="pan-rm" data-id="${esc(id)}" aria-label="Remove">×</button>` : tri(id, state.pantry[id])}</div>`).join('')}</div>`;
  }).join('');
  return `${state.seen.pantry ? '' : '<p class="note">This starts with what you told me, plus what your usual cooks need. Tap Have, Low or Out as things change. Low and Out go on your shopping list.</p>'}
    <div class="gh"><h2>${ids.length} things</h2><button class="btn small" data-act="pan-edit">${kEdit ? 'Done' : 'Edit list'}</button></div>
    <div class="addrow"><div class="inp text"><input id="panAdd" list="ingList" maxlength="40" placeholder="Add something you keep at home"></div><button class="btn" data-act="pan-add">Add</button></div>
    ${secs || '<p class="empty">Nothing here yet.</p>'}`;
}

function shopHTML() {
  const items = shopItems();
  const add = `<div class="addrow"><div class="inp text"><input id="shopAdd" list="ingList" maxlength="40" placeholder="Add to the list"></div><button class="btn" data-act="shop-add">Add</button></div>`;
  if (!items.length) return `${add}<p class="empty">Nothing to buy. Mark things Low or Out at home, or add a recipe’s missing ingredients.</p>`;
  const secs = SECS.map(s => {
    const rows = items.filter(x => x.sec === s.id).sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) return '';
    return `<div class="pan-sec"><h2>${s.name}</h2>${rows.map(x => `<button class="shop" data-act="shop-got" data-id="${esc(x.id)}"><i></i><span>${esc(x.name)}</span><small class="${x.v}">${x.v === 'extra' ? '' : x.v}</small></button>`).join('')}</div>`;
  }).join('');
  return `${add}<p class="note">Tap things as they go in the cart. They’re marked Have at home.</p>${secs}
    <button class="btn wide" data-act="shop-copy">Copy the list</button>`;
}

// ---- weight ------------------------------------------------------------------------

function weightHTML() {
  const k = today(), w = state.weights, p = state.profile;
  const avg = T.avg7(w, k), tr = T.trend(w, k, 21);
  const rateOk = tr && tr.n >= 5 && tr.span >= 6;
  const rate = rateOk ? tr.perWeek : null;
  const rateCls = rate === null ? '' : rate <= -0.5 && rate >= -1.5 ? 'good' : 'slow';
  const togo = avg !== null && p.goal ? avg - p.goal : null;
  const pace = p.pace || 0;
  const goals = [p.stop, p.goal].filter((g, i, a) => g && a.indexOf(g) === i).sort((a, b) => b - a);
  const etaRows = goals.map(g => {
    if (avg !== null && avg <= g) return `<li class="done"><span>${g} lb</span><b>Reached</b></li>`;
    const byTrend = rate !== null ? T.eta(avg, rate, g, k) : null;
    const byPlan = avg !== null && pace ? T.eta(avg, -pace, g, k) : null;
    const when = byTrend || byPlan;
    return `<li><span>${g} lb ${!byTrend && byPlan ? `<small>at ${pace} lb/week</small>` : ''}</span><b>${when ? fmtDay(when, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</b></li>`;
  }).join('');
  const recent = Object.keys(w).sort().reverse().slice(0, 10);
  return `${headerHTML('Weight')}
    ${w[k] ? `<div class="wcard done"><div class="wdone"><div><span class="eyebrow">Today</span><b>${fmt1(w[k])}<small>lb</small></b></div><button class="btn small" data-act="w-edit" data-k="${k}">Change</button></div></div>` : weighCardHTML(false)}
    <dl class="stats">
      <div><dt>7-day avg</dt><dd>${avg !== null ? fmt1(avg) : '—'}<small>lb</small></dd></div>
      <div><dt>Per week</dt><dd class="${rateCls}">${rate !== null ? `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${fmt1(Math.abs(rate))}` : '—'}<small>lb</small></dd></div>
      <div><dt>To go</dt><dd>${togo !== null ? fmt1(Math.max(0, togo)) : '—'}<small>lb</small></dd></div>
    </dl>
    ${chartHTML()}
    ${etaRows ? `<ul class="eta">${etaRows}</ul>` : ''}
    ${rate === null ? '<p class="note">Your weekly rate shows after about a week of weigh-ins. Daily numbers bounce 1–3 lb with water and salt; the 7-day average is the one that counts.</p>' : ''}
    ${weekHTML()}
    <section class="group"><h2>Targets</h2>
      <div class="hrow"><span>Rest days</span><b>${fmt(state.target.kcal)} kcal · ${state.target.p} g</b></div>
      ${state.trainBonus ? `<div class="hrow"><span>Training days</span><b>${fmt(state.target.kcal + state.trainBonus)} kcal</b></div>` : ''}
      ${state.adjust.slice().reverse().map(a => `<div class="hrow"><small>${fmtDay(a.at)}</small><span>${fmt(a.from)} → ${fmt(a.to)} kcal</span></div>`).join('')}
      <p class="note" style="margin-top:10px">After 3 weeks the app compares your trend with ${pace || 1} lb a week and suggests a change of 150 kcal if you’re off. Then it rechecks every 2 weeks.</p>
    </section>
    ${recent.length ? `<section class="group"><h2>Weigh-ins</h2>${recent.map(d => `<button class="hrow" data-act="w-edit" data-k="${d}"><small>${fmtDay(d)}</small><b>${fmt1(w[d])}</b></button>`).join('')}</section>` : ''}`;
}

function chartHTML() {
  const k = today(), w = state.weights, DAYS = 56;
  const pts = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = T.addDays(k, -i);
    if (w[d]) pts.push([DAYS - 1 - i, w[d], d]);
  }
  if (pts.length < 2) return '<p class="empty">Your chart starts after a couple of weigh-ins.</p>';
  const x0 = Math.min(pts[0][0], DAYS - 8), x1 = DAYS - 1;
  const avg = [];
  for (let x = pts[0][0]; x <= x1; x++) {
    const a = T.avg7(w, T.addDays(k, x - x1));
    if (a !== null) avg.push([x, a]);
  }
  const pace = state.profile.pace || 0;
  const plan = pace ? [[avg[0][0], avg[0][1]], [x1, avg[0][1] - pace * (x1 - avg[0][0]) / 7]] : null;
  const ys = [...pts.map(p => p[1]), ...avg.map(a => a[1]), ...(plan ? plan.map(p => p[1]) : [])];
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const goal = state.profile.goal;
  if (goal && goal >= lo - 4) lo = Math.min(lo, goal);
  lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
  const W = 340, H = 170, L = 30, R = 6, TP = 8, B = 18;
  const sx = x => L + (x - x0) / (x1 - x0) * (W - L - R), sy = y => TP + (hi - y) / (hi - lo) * (H - TP - B);
  const step = hi - lo > 12 ? 5 : 2;
  let grid = '';
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) {
    grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}"/><text class="glab" x="${L - 5}" y="${sy(y) + 3}" text-anchor="end">${y}</text>`;
  }
  const line = a => a.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const lab = (x, anchor) => `<text class="glab" x="${sx(x)}" y="${H - 4}" text-anchor="${anchor}">${fmtDay(T.addDays(k, x - x1), { month: 'short', day: 'numeric' })}</text>`;
  return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over the last 8 weeks">
      ${grid}
      ${goal && goal >= lo && goal <= hi ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${sy(goal)}" y2="${sy(goal)}"/>` : ''}
      ${plan ? `<path class="planl" d="${line(plan)}"/>` : ''}
      ${pts.map(([x, y]) => `<circle class="dot" cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="2.6"/>`).join('')}
      <path class="avg" d="${line(avg)}"/>
      ${lab(x0, 'start')}${lab(x1, 'end')}
    </svg>
    <div class="legend"><span class="l-day">Daily</span><span class="l-avg">7-day average</span>${plan ? `<span class="l-plan">${pace} lb a week</span>` : ''}${goal && goal >= lo ? '<span class="l-goal">Goal</span>' : ''}</div>`;
}

// The last 7 full days of eating.
function weekHTML() {
  const k = today();
  const days = [];
  for (let i = 7; i >= 1; i--) {
    const d = T.addDays(k, -i), list = entriesOn(d);
    days.push({ d, list, sum: T.sumEntries(list), t: dayTarget(d) });
  }
  const logged = days.filter(x => x.list.length);
  if (logged.length < 2) return '';
  const avgK = logged.reduce((a, x) => a + x.sum.kcal, 0) / logged.length;
  const avgP = logged.reduce((a, x) => a + x.sum.p, 0) / logged.length;
  const hits = logged.filter(x => x.sum.p >= x.t.p - 10).length;
  const eve = logged.reduce((a, x) => a + T.sumEntries(x.list.filter(e => e.slot === 'evening')).kcal, 0) / logged.length;
  const drinks = logged.reduce((a, x) => a + x.list.filter(isDrinkEntry).reduce((b, e) => b + e.qty, 0), 0);
  const since = Date.now() - 7 * 86400e3;
  const cr = state.cravings.filter(c => c.t >= since);
  const top = Object.entries(cr.reduce((a, c) => ({ ...a, [c.why]: (a[c.why] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
  const bars = days.map(x => {
    const h = x.list.length ? Math.min(130, x.sum.kcal / x.t.kcal * 100) * 0.55 : 0;
    return `<div><b>${x.list.length ? Math.round(x.sum.p) : ''}</b><i class="${x.sum.p >= x.t.p - 10 ? 'hit' : 'k'}" style="height:${Math.max(3, h)}%"></i><span>${fmtDay(x.d, { weekday: 'narrow' })}</span></div>`;
  }).join('');
  return `<section class="group"><h2>Your last 7 days</h2>
    <div class="wk7">${bars}</div>
    <p class="note">Bar height is calories against the target; blue bars hit protein. The numbers are grams of protein.</p>
    <p class="wkline">Averaged <b>${fmt(avgK)} kcal</b> and <b>${fmt(avgP)} g protein</b> on ${logged.length} logged days. Protein target hit <b>${hits} of ${logged.length}</b>.</p>
    <p class="wkline">Evenings averaged <b>${fmt(eve)} kcal</b> (budget ${fmt(state.evening)})${drinks ? `, with <b>${fq(drinks)} drink${drinks === 1 ? '' : 's'}</b> over the week` : ''}.</p>
    ${cr.length ? `<p class="wkline"><b>${cr.length} craving${cr.length > 1 ? 's' : ''}</b>, mostly ${WHY[top[0]].name.toLowerCase()}. ${cr.filter(c => c.outcome === 'passed').length} passed on their own.</p>` : ''}
  </section>`;
}

// ---- settings ----------------------------------------------------------------------

function settingsHTML() {
  const p = state.profile, w = lastWeight() || p.startLb;
  const sug = p.age && p.heightIn && w ? T.suggestTarget(p, w) : null;
  const rc = readRunCoach();
  const nW = rc ? rc.sessions.length + (rc.lifts?.length || 0) : 0;
  const ft = p.heightIn ? Math.floor(p.heightIn / 12) : '', inch = p.heightIn ? p.heightIn % 12 : '';
  const foods = [...state.foods].sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
  return `${headerHTML('Settings')}
    <section class="group"><h2>Daily targets</h2>
      <div class="grid2">
        ${numField('Calories, rest days', 'target.kcal', state.target.kcal, 'kcal', 1200, 4500, 10)}
        ${numField('Protein', 'target.p', state.target.p, 'g', 60, 300, 5)}
      </div>
      ${numField('Evening budget', 'evening', state.evening, 'kcal', 0, 1000, 25, 'Set aside for after dinner: a treat, drinks, or both.')}
      <label class="field"><span>Training days add</span></label>
      <div class="seg">${[0, 100, 150, 200].map(v => `<button data-act="bonus" data-v="${v}" aria-pressed="${state.trainBonus === v}">${v ? `+${v}` : 'Nothing'}</button>`).join('')}</div>
      ${toggleHTML('nudges', 'Catch-up nudges', 'From 2 pm, when you’re well behind pace')}
      ${sug ? `<p class="note" style="margin-top:12px">From your profile today: <b>${fmt(sug.kcal)} kcal · ${sug.p} g</b> (resting burn ${fmt(sug.bmr)} × ${p.activity}${p.pace ? ` − ${fmt(p.pace * 500)}` : ''}).
        ${sug.kcal !== state.target.kcal || sug.p !== state.target.p ? '<button class="btn small" data-act="recalc">Use these</button>' : ''}</p>` : ''}
    </section>
    <section class="group"><h2>You</h2>
      <div class="grid3">
        ${numField('Age', 'profile.age', p.age, 'yrs', 18, 100, 1)}
        ${numField('Height', 'h-ft', ft, 'ft', 4, 7, 1)}
        ${numField('&nbsp;', 'h-in', inch, 'in', 0, 11, 1)}
      </div>
      <div class="grid2">
        ${numField('Goal', 'profile.goal', p.goal, 'lb', 80, 500, 1)}
        ${numField('First stop', 'profile.stop', p.stop, 'lb', 80, 500, 1, 'Optional')}
      </div>
      <label class="field"><span>Pace</span></label>
      <div class="seg">${[[0.5, '½ lb/wk'], [1, '1 lb/wk'], [1.5, '1½ lb/wk'], [0, 'Maintain']].map(([v, l]) => `<button data-act="pace" data-v="${v}" aria-pressed="${p.pace === v}">${l}</button>`).join('')}</div>
    </section>
    <section class="group"><div class="gh"><h2>Your foods</h2><div class="row" style="gap:6px"><button class="btn small" data-act="batch-new">+ Batch</button><button class="btn small" data-act="food-new">+ New</button></div></div>
      <ul class="plist">${foods.map(f => `<li><button class="prow" data-act="food-edit" data-id="${f.id}"><span><b>${esc(f.name)}${f.fav ? '<span class="tagr">usual</span>' : ''}${f.batch ? '<span class="tagr">batch</span>' : ''}</b><small>${esc(f.serving)}</small></span><span><b>${fmt(f.kcal)}</b> kcal<em>${Math.round(f.p)} g</em></span></button></li>`).join('')}</ul>
    </section>
    <section class="group"><h2>Run Coach</h2>
      <p class="note">${rc ? `Linked: ${nW} workout${nW === 1 ? '' : 's'} found. A lift or ride logged today switches on the training day by itself.` : 'Not found on this phone yet. Open Run Coach in the same browser and log a workout, and training days switch on by themselves.'}</p>
      <a class="btn small" href="../run-coach/">Open Run Coach</a>
    </section>
    <section class="group"><h2>Backup</h2>
      <p class="note">Your log lives only on this phone. Save a backup now and then.</p>
      <div class="row"><button class="btn" data-act="export">Save a backup</button><label class="btn">Restore<input id="importFile" type="file" accept="application/json,.json" hidden></label></div>
      <button class="btn ghost wide" data-act="reset" style="color:var(--red)">Erase everything</button>
    </section>
    <p class="foot">Fuel Coach version ${APP_VERSION} · your data stays on this phone · not medical advice</p>`;
}

// ---- onboarding ----------------------------------------------------------------------

function onboardHTML() {
  const rcW = runCoachWeight();
  return `<form class="onboard" id="onboard" novalidate>
    <div class="brand big">Fuel<i>/</i>Coach</div>
    <p class="lede">Eat on pace through the day, so the evening is planned, not a fight. A few numbers set your starting targets.</p>
    <input type="hidden" name="sex" value="m"><input type="hidden" name="pace" value="1">
    <span class="eyebrow" style="margin-bottom:6px">You are</span>
    <div class="seg">${[['m', 'A man'], ['f', 'A woman']].map(([v, l]) => `<button type="button" data-act="ob-seg" data-name="sex" data-v="${v}" aria-pressed="${v === 'm'}">${l}</button>`).join('')}</div>
    <div class="grid3">
      <label class="field"><span>Age</span><div class="inp"><input name="age" type="number" inputmode="numeric" min="18" max="100"><em>yrs</em></div></label>
      <label class="field"><span>Height</span><div class="inp"><input name="ft" type="number" inputmode="numeric" min="4" max="7"><em>ft</em></div></label>
      <label class="field"><span>&nbsp;</span><div class="inp"><input name="in" type="number" inputmode="numeric" min="0" max="11"><em>in</em></div></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Weight now</span><div class="inp"><input name="weight" type="number" inputmode="decimal" min="80" max="600" step="0.1" value="${rcW ?? ''}"><em>lb</em></div>${rcW ? '<small>From Run Coach</small>' : ''}</label>
      <label class="field"><span>Goal</span><div class="inp"><input name="goal" type="number" inputmode="decimal" min="80" max="500"><em>lb</em></div></label>
    </div>
    <label class="field"><span>First stop on the way <small style="display:inline;margin:0">optional</small></span><div class="inp"><input name="stop" type="number" inputmode="decimal" min="80" max="500"><em>lb</em></div></label>
    <span class="eyebrow" style="margin-bottom:6px">Pace</span>
    <div class="seg">${[[0.5, '½ lb a week'], [1, '1 lb a week'], [1.5, '1½ lb a week']].map(([v, l]) => `<button type="button" data-act="ob-seg" data-name="pace" data-v="${v}" aria-pressed="${v === 1}">${l}</button>`).join('')}</div>
    <div class="preview" id="obPrev">Fill in the numbers to see your targets.</div>
    <button class="start" type="submit">Start</button>
    <p class="foot">Everything stays on this phone.</p>
  </form>`;
}

function onboardValues() {
  const f = new FormData($('#onboard'));
  const n = k => Number(f.get(k));
  return {
    profile: { sex: f.get('sex') === 'f' ? 'f' : 'm', age: n('age'), heightIn: n('ft') * 12 + n('in'), goal: n('goal') || null, stop: n('stop') || null, pace: n('pace'), activity: 1.5 },
    weight: n('weight'),
  };
}

function onboardPreview() {
  const v = onboardValues(), p = v.profile;
  const ok = p.age >= 18 && p.age <= 100 && p.heightIn >= 48 && p.heightIn <= 90 && v.weight >= 80 && v.weight <= 600;
  const el = $('#obPrev');
  if (!el) return;
  if (!ok) { el.innerHTML = 'Fill in the numbers to see your targets.'; return; }
  const t = T.suggestTarget(p, v.weight);
  el.innerHTML = `Your start: <b>${fmt(t.kcal)}</b> kcal · <b class="pv">${t.p} g</b> protein a day.<br>
    That’s your resting burn of about ${fmt(t.bmr)} × 1.5 for activity, minus ${fmt(p.pace * 500)} for ${fq(p.pace)} lb a week. Your own weight trend fine-tunes it after 3 weeks.`;
}

// ---- craving -----------------------------------------------------------------------------

function craveHTML() {
  return `<h3>Craving?</h3><p>What’s behind it? There’s no wrong answer.</p>
    <div class="choices">${Object.entries(WHY).map(([k, w]) => `<button class="choice" data-act="crave-why" data-v="${k}"><b>${w.name}</b><small>${w.sub}</small></button>`).join('')}</div>`;
}

function craveOptionsHTML(why) {
  const k = today(), left = dayTarget(k).kcal - T.sumEntries(entriesOn(k)).kcal;
  const opts = eveningOptions(left, why === 'hungry');
  const head = why === 'hungry'
    ? `Real hunger means your body wants fuel. Protein first: it fills you up for longest. <b>${fmt(Math.max(0, left))} kcal</b> left today.`
    : `Planned and logged beats white-knuckling it. <b>${fmt(Math.max(0, left))} kcal</b> left today.`;
  return `<h3>${why === 'hungry' ? 'Eat something real' : why === 'end' ? 'Still want it?' : 'Have it, planned'}</h3><p>${head}</p>
    <ul class="plist">${opts.map(x => `<li><button class="prow" data-act="crave-log" data-key="${x.key}"><span><b>${esc(x.name)}</b><small>${esc(x.serving || '')}${x.kcal > left ? ' · over budget' : ''}</small></span><span><b>${fmt(x.kcal)}</b> kcal<em>${Math.round(x.p)} g</em></span></button></li>`).join('')}</ul>
    <button class="btn ghost wide" data-act="${why === 'end' ? 't-pass' : 'sheet-close'}">${why === 'end' ? 'I’m good now' : 'Never mind'}</button>`;
}

function craveWaitHTML(why) {
  return `<h3>${WHY[why].name}? Give it 10 minutes</h3>
    <p>Cravings from ${why === 'bored' ? 'boredom' : 'stress'} usually fade in 10–20 minutes if you do something else. Pick one:</p>
    <ul class="ideas">${IDEAS[why].map(x => `<li>${x}</li>`).join('')}</ul>
    <div class="sheet-btns"><button class="btn" data-act="crave-now">Have the treat</button><button class="btn primary" data-act="crave-timer">Start 10 minutes</button></div>`;
}

function timerHTML() {
  const t = store.loadTimer();
  if (!t) return '';
  const left = t.end - Date.now();
  if (left > 0) {
    return `<div class="timer">
      <span class="eyebrow">${esc(WHY[t.why]?.name || 'Craving')}</span>
      <h1>Give it ten minutes</h1>
      <div class="clock" id="tClock">${clock(left)}</div>
      <p>Do one thing from the list. If you still want it when the timer ends, have the planned treat. No guilt.</p>
      <div class="row"><button class="btn" data-act="t-pass">I’m good now</button><button class="btn ghost" data-act="t-hide">Hide</button></div>
    </div>`;
  }
  return `<div class="timer">
    <span class="eyebrow">Ten minutes are up</span>
    <h1>Still want it?</h1>
    <p>Then have it: planned, logged and guilt-free. Or let it go.</p>
    <div class="row"><button class="btn primary" data-act="t-options">See options</button><button class="btn" data-act="t-pass">I’m good</button></div>
  </div>`;
}

const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function showTimer() {
  showScreen(timerHTML());
  clearInterval(ticker);
  ticker = setInterval(() => {
    const t = store.loadTimer();
    if (!t || !$('#screen').classList.contains('on')) { clearInterval(ticker); return; }
    const left = t.end - Date.now();
    if (left <= 0) {
      clearInterval(ticker);
      navigator.vibrate?.([250, 120, 250]);
      showScreen(timerHTML());
      return;
    }
    const c = $('#tClock');
    if (c) c.textContent = clock(left);
  }, 500);
}

function lastCraving(outcome) {
  const c = state.cravings[state.cravings.length - 1];
  if (c && !c.outcome && Date.now() - c.t < 3 * 3600e3) c.outcome = outcome;
}

// ---- batch editor ----------------------------------------------------------------------

function batchHTML() {
  const per = batchPortion(batch), tot = batchTotals(batch);
  const q = batch.q.trim().toLowerCase();
  const sugg = q ? Object.entries(ING).filter(([, i]) => i.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const rows = batch.items.map((it, i) => {
    return `<div class="brow"><span><b>${esc(it.ing ? ING[it.ing]?.name ?? it.ing : it.name)}</b><small>${browText(it)}</small></span>
      <div class="inp"><input data-bi="${i}" type="number" inputmode="decimal" min="0" max="5000" value="${it.g}"><em>${it.ing && ING[it.ing]?.ml ? 'ml' : 'g'}</em></div>
      <button class="rm" data-act="b-rm" data-i="${i}" aria-label="Remove">×</button></div>`;
  }).join('');
  return `<div class="scr">
    <div class="scr-top"><button class="back" data-act="b-cancel">‹ Cancel</button><span class="eyebrow">Batch</span></div>
    <h1 class="page-h">${batch.foodId ? 'Edit batch' : 'New batch'}</h1>
    <p class="note">Weigh everything raw as it goes in, then split it into equal portions. The app works out each portion.</p>
    <label class="field"><span>Name</span><div class="inp text"><input id="bName" maxlength="60" value="${esc(batch.name)}" placeholder="e.g. Turkey vindaloo bowl"></div></label>
    <label class="field"><span>Portions</span></label>
    <div class="wstep" style="margin-top:0"><button class="pm" data-act="b-port" data-v="-1">−</button><input id="bPort" type="number" inputmode="numeric" min="1" max="30" value="${batch.portions}"><button class="pm" data-act="b-port" data-v="1">+</button></div>
    <span class="eyebrow" style="margin:6px 0 4px">What goes in</span>
    <div id="bRows">${rows || '<p class="empty">Nothing yet. Add your first ingredient below.</p>'}</div>
    <label class="field" style="margin-top:12px"><span>Add an ingredient</span><div class="inp text"><input id="bQ" placeholder="Search: turkey, sauce, broccoli…" autocomplete="off" value="${esc(batch.q)}"></div></label>
    <div id="bSugg">${suggHTML(sugg)}</div>
    <button class="btn small" data-act="b-custom">+ Something not on the list</button>
    <div class="btotal">
      <div class="qty-total" id="bTot" style="border:0;margin:0;padding:0 0 12px">${btotHTML(per, tot)}</div>
      <button class="btn primary wide" style="margin:0" data-act="b-save">Save</button>
    </div>
  </div>`;
}

function browText(it) {
  const per100 = it.ing ? ING[it.ing] : it;
  return `${fmt((Number(per100?.kcal) || 0) * it.g / 100)} kcal · ${fmt((Number(per100?.p) || 0) * it.g / 100)} g protein`;
}

const btotHTML = (per, tot) => `<div><b>${fmt(per.kcal)}<small>kcal</small></b></div><div><b class="pk">${per.p}<small>g protein</small></b></div><div><small style="color:var(--ink-3);font-size:12px">a portion<br>batch ${fmt(tot.kcal)} kcal</small></div>`;

const suggHTML = sugg => (sugg.length ? `<ul class="suggest">${sugg.map(([id, i]) => `<li><button data-act="b-add" data-id="${id}"><span>${esc(i.name)}</span><small>${fmt(i.kcal)} kcal · ${fmt1(i.p)} g /100 ${i.ml ? 'ml' : 'g'}</small></button></li>`).join('')}</ul>` : '');

function syncBatch() {
  const n = $('#bName'), pt = $('#bPort');
  if (n) batch.name = n.value;
  if (pt) batch.portions = Math.max(1, Math.min(30, Math.round(Number(pt.value) || 1)));
  $$('[data-bi]').forEach(el => { batch.items[+el.dataset.bi].g = Math.max(0, Number(el.value) || 0); });
}

function redrawBatch() {
  syncBatch();
  const y = $('#screen').scrollTop;
  showScreen(batchHTML());
  $('#screen').scrollTop = y;
}

// ---- scanner -----------------------------------------------------------------------------

async function openScanner() {
  closeSheet();
  const can = await Scan.canScan();
  showScreen(`<div class="scr">
    <div class="scr-top"><button class="back" data-act="scan-close">‹ Cancel</button><span class="eyebrow">Scan a barcode</span></div>
    ${can ? '<div class="scan-wrap"><video id="scanV" playsinline muted></video><div class="laser"></div></div><p class="note" style="text-align:center">Hold the barcode inside the box.</p>'
      : '<p class="note warn">This browser can’t read barcodes with the camera. Type the numbers under the barcode instead.</p>'}
    <label class="field"><span>Or type the barcode number</span><div class="inp text"><input id="scanCode" inputmode="numeric" maxlength="14" placeholder="e.g. 055742301234"></div></label>
    <button class="btn primary wide" data-act="scan-look">Look it up</button>
    <div id="scanOut"></div>
  </div>`);
  if (!can) return;
  scanner = new Scan.Scanner($('#scanV'), code => { navigator.vibrate?.(60); lookupCode(code); });
  try {
    await scanner.start();
  } catch (e) {
    console.warn(e);
    $('#scanOut').innerHTML = '<p class="note warn" style="margin-top:12px">Couldn’t open the camera. Allow camera access for this site, or type the number.</p>';
  }
}

function stopScanner() {
  scanner?.stop();
  scanner = null;
}

async function lookupCode(raw) {
  const code = Scan.cleanCode(raw);
  if (code.length < 8) return toast('That doesn’t look like a barcode');
  stopScanner();
  const mine = state.foods.find(f => f.barcode && (f.barcode === code || f.barcode === `0${code}` || `0${f.barcode}` === code));
  if (mine) {
    hideScreen();
    picker = { slot: T.slotAt(nowH()), q: '', step: 'qty', item: itemOfFood(mine), qty: 1 };
    return openSheet(qtyHTML());
  }
  const out = $('#scanOut');
  if (out) out.innerHTML = '<div class="spin"></div><p class="note" style="text-align:center">Looking it up…</p>';
  let r = null;
  try {
    r = await Scan.lookup(code);
  } catch (e) {
    console.warn(e);
    if (out) out.innerHTML = '<p class="note warn" style="margin-top:12px">Couldn’t reach the food database. Check your connection, or type it in from the label.</p><button class="btn wide" data-act="scan-manual" data-code="' + code + '">Type it in</button>';
    return;
  }
  hideScreen();
  if (!r || (!r.per100 && !r.perServing)) {
    return openFoodForm(null, { barcode: code, logAfter: true, prefill: { name: r?.name || '' } });
  }
  const g = r.servingG || 100;
  const kcal = r.per100 ? r.per100.kcal * g / 100 : r.perServing.kcal;
  const p = r.per100 ? r.per100.p * g / 100 : r.perServing.p;
  const brand = r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? r.brand : '';
  const name = [brand, r.name].filter(Boolean).join(' ').slice(0, 60) || 'Scanned food';
  openFoodForm(null, {
    barcode: code, logAfter: true, from: 'off', per100: r.per100,
    prefill: { name, serving: r.servingLabel || `${fmt(g)} g`, kcal: Math.round(kcal), p: round1(p), g: Math.round(g) },
  });
}

// ---- actions -------------------------------------------------------------------------------

const actions = {
  'sheet-close'() { closeSheet(); },
  'close-screen'() { hideScreen(); render(); },
  undo() { const u = toastUndo; toastUndo = null; $('#toast').classList.remove('on'); u?.(); },
  install() { installEvt?.prompt(); },

  // today
  pick(el) { openPicker(el.dataset.slot); },
  qlog(el) { const it = itemOfKey(el.dataset.key); if (it) logAndToast(it, 1, el.dataset.slot); },
  repeat(el) {
    const k = today(), slot = el.dataset.slot;
    const y = entriesOn(T.addDays(k, -1)).filter(e => e.slot === slot);
    const ids = y.map(e => { const c = { ...e, id: uid(), t: Date.now() }; (state.log[k] ||= []).push(c); return c.id; });
    persist();
    render();
    toast(`Logged yesterday’s ${SLOT[slot].name.toLowerCase()}`, () => { ids.forEach(id => removeEntry(k, id)); persist(); render(); });
  },
  entry(el) {
    const k = today(), e = entriesOn(k).find(x => x.id === el.dataset.id);
    if (!e) return;
    const item = { key: keyOfEntry(e), name: e.name, kcal: e.kcal / e.qty, p: e.p / e.qty, food: e.food, recipe: e.recipe, serving: e.food ? foodById(e.food)?.serving : e.recipe ? '1 serving' : '' };
    picker = { slot: e.slot, q: '', step: 'qty', item, qty: e.qty, entry: e.id, k };
    openSheet(qtyHTML());
  },
  train() {
    const k = today(), tr = trainInfo(k), auto = tr.workouts.length > 0;
    const next = !tr.on;
    if (next === auto) delete state.train[k]; else state.train[k] = next;
    persist();
    render();
  },
  'w-step'(el) {
    const i = $(`#${el.dataset.for || 'wIn'}`);
    const v = Number(i.value) || lastWeight() || 0;
    i.value = (Math.round((v + Number(el.dataset.v)) * 10) / 10).toFixed(1);
  },
  'w-save'() {
    const v = Number($('#wIn').value);
    if (!(v >= 80 && v <= 600)) return toast('Weight should be 80–600 lb');
    const k = today();
    state.weights[k] = round1(v);
    persist();
    render();
    const a = T.avg7(state.weights, k);
    toast(`Saved ${fmt1(v)} lb${a !== null ? ` · 7-day average ${fmt1(a)}` : ''}`);
  },
  'w-skip'() { state.seen.weigh = today(); persist(); render(); },
  async 'w-edit'(el) {
    const k = el.dataset.k, cur = state.weights[k];
    openSheet(`<h3>${esc(fmtDay(k))}</h3>
      <div class="wstep"><button class="pm" data-act="w-step" data-for="wIn2" data-v="-0.2">−0.2</button><input id="wIn2" type="number" inputmode="decimal" step="0.1" value="${cur ?? ''}"><button class="pm" data-act="w-step" data-for="wIn2" data-v="0.2">+0.2</button></div>
      <div class="sheet-btns"><button class="btn danger" data-act="w-del" data-k="${k}">Delete</button><button class="btn primary" data-act="w-put" data-k="${k}">Save</button></div>`);
  },
  'w-put'(el) {
    const v = Number($('#wIn2').value);
    if (!(v >= 80 && v <= 600)) return toast('Weight should be 80–600 lb');
    state.weights[el.dataset.k] = round1(v);
    persist();
    closeSheet();
    render();
  },
  'w-del'(el) {
    const k = el.dataset.k, old = state.weights[k];
    delete state.weights[k];
    persist();
    closeSheet();
    render();
    toast('Weigh-in deleted', () => { state.weights[k] = old; persist(); render(); });
  },
  'adj-yes'() {
    const k = today(), a = T.adjustCheck(state, k);
    if (!a) return;
    state.adjust.push({ at: k, from: a.from, to: a.to, rate: round1(a.rate), kind: a.kind });
    state.target = { ...state.target, kcal: a.to, since: k };
    if (a.kind === 'goal') state.profile.pace = 0;
    state.adjustSnooze = null;
    persist();
    render();
    toast(`New target: ${fmt(a.to)} kcal`);
  },
  'adj-no'() { state.adjustSnooze = today(); persist(); render(); toast('Okay. It’ll check again in a week.'); },

  // picker
  'pk-slot'(el) {
    picker.slot = el.dataset.v;
    if (picker.step === 'qty') setSheet(qtyHTML());
    else {
      $$('[data-act=pk-slot]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === picker.slot));
      if ($('#pkList')) $('#pkList').innerHTML = pickListHTML();
    }
  },
  'pk-item'(el) {
    const item = itemOfKey(el.dataset.key);
    if (!item) return;
    Object.assign(picker, { step: 'qty', item, qty: 1 });
    setSheet(qtyHTML());
  },
  'pk-qty'(el) { picker.qty = Number(el.dataset.v); setSheet(qtyHTML()); },
  'pk-step'(el) { picker.qty = Math.max(0.25, Math.min(10, Math.round((picker.qty + Number(el.dataset.v)) * 4) / 4)); setSheet(qtyHTML()); },
  'pk-back'() { picker.step = 'list'; setSheet(pickerHTML()); },
  'est-open'() { openEstimate(); },
  'est-step'(el) {
    const e = picker.est, k = el.dataset.k;
    e[k] = Math.max(0, Math.min(10, e[k] + Number(el.dataset.v)));
    $(`#est-${k}`).textContent = fq(e[k]);
    $('#estTot').innerHTML = estTotHTML(estTotals(e));
  },
  'est-out'(el) {
    picker.est.out = !picker.est.out;
    el.setAttribute('aria-checked', picker.est.out);
    $('#estTot').innerHTML = estTotHTML(estTotals(picker.est));
  },
  'est-save'(el) { picker.est.save = !picker.est.save; el.setAttribute('aria-checked', picker.est.save); },
  'est-log'() {
    const e = picker.est, t = estTotals(e);
    if (!t.kcal) return toast('Add what’s on the plate first');
    const name = $('#estName').value.trim().slice(0, 60) || 'Estimated meal';
    let item = { name, kcal: t.kcal, p: t.p, serving: 'estimated' };
    if (e.save) {
      const f = { id: uid(), name, serving: '1 plate (estimated)', kcal: t.kcal, p: t.p, slot: picker.slot, fav: true,
        est: { palm: e.palm, cup: e.cup, thumb: e.thumb, fist: e.fist, out: e.out } };
      state.foods.push(f);
      item = itemOfFood(f);
    }
    logAndToast(item, 1, picker.slot);
  },
  'pk-log'() {
    const { item, qty, slot } = picker;
    if (picker.entry) {
      const e = entriesOn(picker.k).find(x => x.id === picker.entry);
      if (e) Object.assign(e, { qty, slot, kcal: Math.round(item.kcal * qty), p: round1(item.p * qty) });
      persist();
      closeSheet();
      render();
      return;
    }
    logAndToast(item, qty, slot);
  },
  'en-del'() {
    const k = picker.k, e = entriesOn(k).find(x => x.id === picker.entry);
    if (!e) return closeSheet();
    removeEntry(k, e.id);
    persist();
    closeSheet();
    render();
    toast(`Removed ${esc(e.name)}`, () => { (state.log[k] ||= []).push(e); state.log[k].sort((a, b) => a.t - b.t); persist(); render(); });
  },

  // foods
  'food-new'() { openFoodForm(null, { logAfter: !!picker }); },
  'food-edit'(el) { const f = foodById(el.dataset.id); if (f) openFoodForm(f); },
  'ff-slot'(el) {
    form.slot = form.slot === el.dataset.v ? null : el.dataset.v;
    $$('[data-act=ff-slot]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === form.slot));
  },
  'ff-fav'(el) { form.fav = !form.fav; el.setAttribute('aria-checked', form.fav); },
  'ff-drink'(el) { form.drink = !form.drink; el.setAttribute('aria-checked', form.drink); },
  'ff-save'() {
    const f = readFoodForm();
    if (!f) return;
    let food;
    if (form.id) {
      food = foodById(form.id);
      Object.assign(food, f);
    } else {
      food = { id: uid(), ...f };
      state.foods.push(food);
    }
    persist();
    const logAfter = form.logAfter, slot = form.slot || T.slotAt(nowH());
    closeSheet();
    if (logAfter) return logAndToast(itemOfFood(food), 1, slot);
    render();
    toast(`Saved ${esc(food.name)}`);
  },
  async 'ff-del'() {
    const f = foodById(form.id);
    closeSheet();
    const ok = await ask(`Delete ${esc(f.name)}?`, 'Days you already logged keep their numbers.', [{ label: 'Keep', value: false }, { label: 'Delete', value: true, cls: 'danger' }]);
    if (!ok) return;
    state.foods = state.foods.filter(x => x.id !== f.id);
    persist();
    render();
  },

  // batch
  'batch-new'() {
    closeSheet();
    batch = { foodId: null, name: '', portions: 4, items: [], q: '' };
    showScreen(batchHTML());
  },
  'batch-edit'(el) {
    const f = foodById(el.dataset.id);
    closeSheet();
    batch = { foodId: f.id, name: f.name, portions: f.batch.portions, items: f.batch.items.map(x => ({ ...x })), q: '' };
    showScreen(batchHTML());
  },
  'b-add'(el) {
    syncBatch();
    const i = ING[el.dataset.id];
    batch.items.push({ ing: el.dataset.id, g: i.each ? i.each : 100 });
    batch.q = '';
    redrawBatch();
  },
  'b-rm'(el) { syncBatch(); batch.items.splice(+el.dataset.i, 1); redrawBatch(); },
  'b-port'(el) { syncBatch(); batch.portions = Math.max(1, Math.min(30, batch.portions + Number(el.dataset.v))); redrawBatch(); },
  'b-custom'() {
    syncBatch();
    openSheet(`<h3>Your own ingredient</h3><p>From the label: calories and protein per 100 g.</p>
      <label class="field"><span>Name</span><div class="inp text"><input id="cuName" maxlength="40" placeholder="e.g. Butter chicken sauce"></div></label>
      <div class="grid3">
        <label class="field"><span>Amount</span><div class="inp"><input id="cuG" type="number" inputmode="decimal" value="100"><em>g</em></div></label>
        <label class="field"><span>kcal/100 g</span><div class="inp"><input id="cuK" type="number" inputmode="decimal"></div></label>
        <label class="field"><span>Protein/100 g</span><div class="inp"><input id="cuP" type="number" inputmode="decimal"></div></label>
      </div>
      <div class="sheet-btns"><button class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" data-act="b-custom-add">Add</button></div>`);
  },
  'b-custom-add'() {
    const name = $('#cuName').value.trim(), g = Number($('#cuG').value), kcal = Number($('#cuK').value), p = Number($('#cuP').value);
    if (!name || !(g > 0) || !(kcal >= 0 && kcal <= 900) || !(p >= 0 && p <= 100) || $('#cuK').value === '') return toast('Fill in all four, per 100 g');
    batch.items.push({ name, g, kcal, p: p || 0 });
    closeSheet();
    redrawBatch();
  },
  'b-cancel'() { batch = null; hideScreen(); render(); },
  'b-save'() {
    syncBatch();
    if (!batch.name.trim()) return toast('Give the batch a name');
    if (!batch.items.some(x => x.g > 0)) return toast('Add what goes in first');
    const b = { portions: batch.portions, items: batch.items.filter(x => x.g > 0) };
    const per = batchPortion(b);
    let f = batch.foodId && foodById(batch.foodId);
    if (f) Object.assign(f, { name: batch.name.trim(), batch: b, ...per, serving: '1 portion' });
    else { f = { id: uid(), name: batch.name.trim(), serving: '1 portion', ...per, slot: 'lunch', fav: true, batch: b }; state.foods.push(f); }
    persist();
    batch = null;
    hideScreen();
    render();
    toast(`${esc(f.name)}: ${fmt(per.kcal)} kcal · ${per.p} g a portion`);
  },

  // scan
  scan() { openScanner(); },
  'scan-close'() { stopScanner(); hideScreen(); render(); },
  'scan-look'() { lookupCode($('#scanCode').value); },
  'scan-manual'(el) { hideScreen(); openFoodForm(null, { barcode: el.dataset.code, logAfter: true }); },

  // recipes
  rfilter(el) { rFilter = el.dataset.v; render(); },
  recipe(el) { const r = RECIPE[el.dataset.id]; if (r) showScreen(recipeHTML(r)); },
  'r-log'(el) {
    const r = RECIPE[el.dataset.id];
    hideScreen();
    render();
    const h = nowH();
    const slot = r.when?.includes(T.slotAt(h)) ? T.slotAt(h) : r.when?.[0] || T.slotAt(h);
    picker = { slot, q: '', step: 'qty', item: itemOfRecipe(r), qty: 1 };
    openSheet(qtyHTML());
  },
  'r-usual'(el) {
    const r = RECIPE[el.dataset.id];
    const b = { portions: r.serves, items: r.ing.map(([ing, g]) => ({ ing, g })) };
    state.foods.push({ id: uid(), name: r.name, serving: r.serves > 1 ? '1 portion' : '1 serving', ...perServing(r), slot: r.when?.[0] || null, fav: true, batch: b, recipe: r.id });
    persist();
    el.disabled = true;
    el.textContent = 'In your usuals';
    toast('Added. You can change the amounts in Settings › Your foods.');
  },
  'r-shop'(el) {
    const miss = missing(RECIPE[el.dataset.id]);
    miss.forEach(id => { state.pantry[id] = 'out'; });
    persist();
    const y = $('#screen').scrollTop;
    showScreen(recipeHTML(RECIPE[el.dataset.id]));
    $('#screen').scrollTop = y;
    toast(`Added ${miss.length} to your shopping list`);
  },

  // kitchen
  ktab(el) { kTab = el.dataset.v; kEdit = false; render(); },
  'pan-set'(el) {
    state.pantry[el.dataset.id] = el.dataset.v;
    state.seen.pantry = 1;
    persist();
    render();
  },
  'pan-edit'() { kEdit = !kEdit; render(); },
  'pan-rm'(el) {
    const id = el.dataset.id, old = state.pantry[id];
    delete state.pantry[id];
    persist();
    render();
    toast(`Removed ${esc(itemName(id))}`, () => { state.pantry[id] = old; persist(); render(); });
  },
  'pan-add'() { addThing($('#panAdd').value, 'have'); },
  'shop-add'() { addThing($('#shopAdd').value, 'out'); },
  'shop-got'(el) {
    const id = el.dataset.id;
    if (state.pantry[id]) {
      const old = state.pantry[id];
      state.pantry[id] = 'have';
      persist();
      render();
      toast(`${esc(itemName(id))}: got it`, () => { state.pantry[id] = old; persist(); render(); });
    } else {
      const x = state.shop.find(s => s.id === id);
      state.shop = state.shop.filter(s => s.id !== id);
      persist();
      render();
      if (x) toast(`${esc(x.name)}: got it`, () => { state.shop.push(x); persist(); render(); });
    }
  },
  async 'shop-copy'() {
    const items = shopItems();
    const text = SECS.map(s => {
      const rows = items.filter(x => x.sec === s.id);
      return rows.length ? `${s.name}\n${rows.map(x => `- ${x.name}`).join('\n')}` : '';
    }).filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it anywhere.');
    } catch {
      toast('Couldn’t copy on this browser');
    }
  },

  // craving
  crave() { openSheet(craveHTML()); },
  'crave-why'(el) {
    const why = el.dataset.v;
    state.cravings.push({ t: Date.now(), why });
    persist();
    setSheet(why === 'bored' || why === 'stressed' ? craveWaitHTML(why) : craveOptionsHTML(why));
  },
  'crave-now'() { setSheet(craveOptionsHTML('treat')); },
  'crave-log'(el) {
    const it = itemOfKey(el.dataset.key);
    if (!it) return;
    lastCraving('ate');
    store.saveTimer(null);
    hideScreen();
    logAndToast(it, 1, T.slotAt(nowH()));
  },
  'crave-timer'() {
    const c = state.cravings[state.cravings.length - 1];
    store.saveTimer({ end: Date.now() + 600e3, why: c?.why || 'bored' });
    closeSheet();
    showTimer();
  },
  't-open'() { showTimer(); },
  't-hide'() { clearInterval(ticker); hideScreen(); render(); },
  't-options'() { hideScreen(); render(); openSheet(craveOptionsHTML('end')); },
  't-pass'() {
    lastCraving('passed');
    store.saveTimer(null);
    clearInterval(ticker);
    persist();
    closeSheet();
    hideScreen();
    render();
    toast('Nice. That one passed on its own.');
  },

  // settings
  toggle(el) {
    const p = el.dataset.path;
    setPath(state, p, !getPath(state, p));
    persist();
    el.setAttribute('aria-checked', !!getPath(state, p));
  },
  bonus(el) { state.trainBonus = Number(el.dataset.v); persist(); render(); },
  pace(el) { state.profile.pace = Number(el.dataset.v); persist(); render(); },
  recalc() {
    const p = state.profile, t = T.suggestTarget(p, lastWeight() || p.startLb);
    state.target = { kcal: t.kcal, p: t.p, since: today() };
    persist();
    render();
    toast(`Targets: ${fmt(t.kcal)} kcal · ${t.p} g`);
  },
  export() {
    const blob = new Blob([store.toBackup(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fuel-coach-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  async reset() {
    const ok = await ask('Erase everything?', 'Your log, weigh-ins, foods and pantry. This can’t be undone. Save a backup first if you might want it.', [{ label: 'Keep', value: false }, { label: 'Erase', value: true, cls: 'danger' }]);
    if (!ok) return;
    store.wipe();
    location.reload();
  },
  'ob-seg'(el) {
    $(`#onboard input[name=${el.dataset.name}]`).value = el.dataset.v;
    $$(`[data-act=ob-seg][data-name=${el.dataset.name}]`).forEach(b => b.setAttribute('aria-pressed', b === el));
    onboardPreview();
  },
};

function addThing(raw, status) {
  const name = String(raw || '').trim();
  if (!name) return;
  const id = Object.keys(ING).find(k => ING[k].name.toLowerCase() === name.toLowerCase());
  if (status === 'out' && !id) {
    state.shop.push({ id: uid(), name: name.slice(0, 40) });
  } else if (id) {
    state.pantry[id] = status;
  } else {
    const cid = `c-${uid()}`;
    state.custom[cid] = { name: name.slice(0, 40) };
    state.pantry[cid] = status;
  }
  persist();
  render();
  const i = $(status === 'out' ? '#shopAdd' : '#panAdd');
  i?.focus();
}

function commitBind(el) {
  const path = el.dataset.bind;
  const v = el.value === '' ? null : Number(el.value);
  const lim = [Number(el.min), Number(el.max)];
  if (v !== null && (!Number.isFinite(v) || v < lim[0] || v > lim[1])) {
    el.classList.add('bad');
    return toast(`Should be ${lim[0]}–${lim[1]}`);
  }
  el.classList.remove('bad');
  if (path === 'h-ft' || path === 'h-in') {
    const ft = Number($('[data-bind=h-ft]').value) || 0, inch = Number($('[data-bind=h-in]').value) || 0;
    state.profile.heightIn = ft * 12 + inch;
  } else if (path === 'target.kcal' || path === 'target.p') {
    if (v === null) return;
    setPath(state, path, v);
    state.target.since = today();
  } else if (path === 'evening') {
    state.evening = v ?? 0;
  } else {
    setPath(state, path, v);
  }
  persist();
}

// ---- events -------------------------------------------------------------------------------

document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    view = tab.dataset.tab;
    kEdit = false;
    render();
    scrollTo(0, 0);
    const v = $('#view');
    v.classList.remove('enter');
    void v.offsetWidth;
    v.classList.add('enter');
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  actions[el.dataset.act]?.(el, e);
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'pkQ' && picker) {
    picker.q = el.value;
    $('#pkList').innerHTML = pickListHTML();
  } else if (batch && (el.dataset.bi !== undefined || el.id === 'bPort')) {
    syncBatch();
    if (el.dataset.bi !== undefined) el.closest('.brow').querySelector('small').textContent = browText(batch.items[+el.dataset.bi]);
    $('#bTot').innerHTML = btotHTML(batchPortion(batch), batchTotals(batch));
  } else if (el.id === 'bQ' && batch) {
    batch.q = el.value;
    const q = el.value.trim().toLowerCase();
    $('#bSugg').innerHTML = suggHTML(q ? Object.entries(ING).filter(([, i]) => i.name.toLowerCase().includes(q)).slice(0, 6) : []);
  } else if (el.id === 'ffG' && form?.per100) {
    const g = Number(el.value) || 0;
    $('#ffK').value = Math.round(form.per100.kcal * g / 100);
    $('#ffP').value = round1(form.per100.p * g / 100);
    const sv = $('#ffServ');
    if (!sv.value.trim() || /^[\d.]+ g$/.test(sv.value.trim())) sv.value = `${g} g`;
  } else if (el.closest('#onboard')) {
    onboardPreview();
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'importFile') return importFile(el.files[0]);
  if (el.dataset.bind) commitBind(el);
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 'panAdd') actions['pan-add']();
  else if (id === 'shopAdd') actions['shop-add']();
  else if (id === 'scanCode') actions['scan-look']();
  else if (id === 'wIn' && !$('#sheet').classList.contains('on')) actions['w-save']();
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'onboard') return;
  e.preventDefault();
  const v = onboardValues(), p = v.profile;
  if (!(p.age >= 18 && p.age <= 100)) return toast('Age should be 18–100');
  if (!(p.heightIn >= 48 && p.heightIn <= 90)) return toast('Height should be 4–7 ft');
  if (!(v.weight >= 80 && v.weight <= 600)) return toast('Weight should be 80–600 lb');
  if (p.goal && !(p.goal >= 80 && p.goal < v.weight)) return toast('Goal should be below your weight now');
  if (p.stop && p.goal && !(p.stop > p.goal && p.stop < v.weight)) return toast('First stop should be between now and your goal');
  const t = T.suggestTarget(p, v.weight);
  const k = today();
  state.profile = { ...state.profile, ...p, startLb: v.weight };
  state.target = { kcal: t.kcal, p: t.p, since: k };
  state.weights[k] = round1(v.weight);
  state.onboarded = true;
  persist();
  hideScreen();
  render();
  navigator.storage?.persist?.().catch(() => {});
  toast(`Your targets: ${fmt(t.kcal)} kcal · ${t.p} g protein`);
});

async function importFile(file) {
  if (!file) return;
  try {
    const next = store.fromBackup(await file.text());
    const ok = await ask('Restore this backup?', 'It replaces everything on this phone.', [{ label: 'Cancel', value: false }, { label: 'Restore', value: true, cls: 'primary' }]);
    if (!ok) return;
    state = next;
    persist();
    render();
    toast('Backup restored');
  } catch (e) {
    toast(esc(e.message || 'Couldn’t read that file'));
  }
}

window.addEventListener('popstate', () => {
  guarded = false;
  const on = id => $(id).classList.contains('on');
  if (on('#sheet')) closeSheet();
  else if (on('#screen')) {
    if (!state.onboarded) return guard();
    if (batch) actions['b-cancel']();
    else if (scanner || $('#scanCode')) actions['scan-close']();
    else { clearInterval(ticker); hideScreen(); render(); }
  } else {
    history.back();
    return;
  }
  if (on('#sheet') || on('#screen')) guard();
});

// The pace line moves with the clock, so Today refreshes every minute.
setInterval(() => {
  if (view === 'today' && state.onboarded && !$('#sheet').classList.contains('on') && !$('#screen').classList.contains('on') && document.visibilityState === 'visible'
    && !document.activeElement?.matches('input')) render();
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (state.onboarded && !$('#screen').classList.contains('on') && !$('#sheet').classList.contains('on')) render();
  } else if (scanner) {
    actions['scan-close']();
  }
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvt = e;
  if (state.onboarded) render();
});

window.addEventListener('appinstalled', () => {
  installEvt = null;
  toast('Installed. Open it from your home screen.');
  if (state.onboarded) render();
});

// Updates. An installed app can sit open in the background for days and never
// reload, so check for a new version whenever it comes back on screen, and
// switch to it straight away, unless you're in the middle of something.
let updateReady = false;
function applyUpdate() {
  if (!updateReady || $('#sheet').classList.contains('on') || $('#screen').classList.contains('on')) return;
  updateReady = false;
  location.reload();
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {});
      applyUpdate();
    });
  }).catch(e => console.warn('Service worker failed', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // the very first install: nothing to refresh
    updateReady = true;
    applyUpdate();
  });
}

persist();
render();
const tm = store.loadTimer();
if (state.onboarded && tm && tm.end > Date.now()) showTimer();
