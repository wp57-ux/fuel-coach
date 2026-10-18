// Checks the recipe and ingredient data. Run from the project folder:
//   node tools/check-recipes.mjs           (warnings are printed, exit 0)
//   node tools/check-recipes.mjs --strict  (warnings also fail)
import { SECTIONS, ING } from '../js/ingredients.js';
import { RECIPES, perServing } from '../js/recipes.js';

const REQUIRED_IDS = [
  'eggs', 'milk', 'oats', 'oat-flour', 'protein-powder', 'vanilla', 'salt', 'pepper', 'chicken-nuggets',
  'spinach-frozen', 'blueberries-frozen', 'banana-frozen', 'tuna', 'turkey-ground', 'chicken-ground',
  'vindaloo-sauce', 'broccoli', 'zucchini', 'mushrooms', 'bell-pepper', 'pizza-crust', 'pizza-sauce',
  'cheddar', 'turkey-pepperoni', 'feta', 'choc-chips', 'sweetener', 'tequila', 'orange', 'lemon', 'lime',
  'greek-yogurt', 'chicken-thighs', 'chicken-breast',
];
const CATS = ['batch', 'oven', 'breakfast', 'snack', 'drink'];
const WHENS = ['morning', 'lunch', 'snack', 'dinner', 'evening'];
const TAGS = ['spicy', 'crunchy', 'cheesy', 'saucy', 'lebanese', 'pizza', 'sweet', 'quick', 'no-cook', 'keeps', 'freezes'];
const MODES = ['Air Fry', 'Bake', 'Convection Bake', 'Broil'];
const TOOLS = ['basket', 'sheet pan', 'loaf pan', 'ramekin'];
const RACKS = ['top', 'middle', 'bottom'];
const BANNED = /beef|buffalo/i;
const ALCOHOL = ['tequila'];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

// ── Ingredients ──
const secIds = new Set(SECTIONS.map((s) => s.id));
for (const id of REQUIRED_IDS) if (!ING[id]) fail(`required ingredient id missing: ${id}`);
for (const [id, x] of Object.entries(ING)) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(`ingredient id not kebab-case: ${id}`);
  if (!x.name) fail(`${id}: no name`);
  if (BANNED.test(x.name) || BANNED.test(id)) fail(`${id}: mentions beef/buffalo`);
  if (!isNum(x.kcal) || x.kcal < 0 || x.kcal > 900) fail(`${id}: kcal out of range (${x.kcal})`);
  if (!isNum(x.p) || x.p < 0 || x.p > 100) fail(`${id}: protein out of range (${x.p})`);
  if (isNum(x.kcal) && isNum(x.p) && x.p * 4 > x.kcal + 1) fail(`${id}: protein calories exceed total calories`);
  if (!secIds.has(x.sec)) fail(`${id}: unknown section ${x.sec}`);
  if (!x.src) fail(`${id}: no src`);
  if ((x.each === undefined) !== (x.eachName === undefined)) fail(`${id}: each and eachName go together`);
  if (x.each !== undefined && !(isNum(x.each) && x.each > 0)) fail(`${id}: bad each`);
  for (const k of ['ml', 'basic']) if (x[k] !== undefined && x[k] !== true) fail(`${id}: ${k} should be true or absent`);
}
const crust = ING['pizza-crust'];
if (crust) {
  const k = crust.kcal * crust.each / 100;
  if (Math.abs(k - 360) > 20) fail(`pizza-crust: one crust is ${Math.round(k)} kcal, expected about 360`);
}
if (ING['protein-powder'] && (ING['protein-powder'].each !== 30 || ING['protein-powder'].eachName !== 'scoop')) {
  fail('protein-powder: should be each 30, eachName scoop');
}

// ── Recipes ──
if (!Array.isArray(RECIPES)) fail('RECIPES is not an array');
if (RECIPES.length < 38) fail(`only ${RECIPES.length} recipes (need 38+)`);
const seen = new Set();
const used = new Set();
for (const r of RECIPES) {
  const at = r.id || '(no id)';
  if (!r.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) fail(`${at}: id missing or not kebab-case`);
  if (seen.has(r.id)) fail(`${at}: duplicate id`);
  seen.add(r.id);
  if (!r.name) fail(`${at}: no name`);
  if (BANNED.test(r.name || '') || BANNED.test(r.id || '')) fail(`${at}: name mentions beef/buffalo`);
  const text = [...(r.steps || []), r.note || ''].join(' ');
  if (BANNED.test(text)) fail(`${at}: steps or note mention beef/buffalo`);
  if (!CATS.includes(r.cat)) fail(`${at}: bad cat ${r.cat}`);
  if (!Array.isArray(r.when) || !r.when.length) fail(`${at}: when is empty`);
  for (const w of r.when || []) if (!WHENS.includes(w)) fail(`${at}: bad when ${w}`);
  if (!Number.isInteger(r.serves) || r.serves < 1) fail(`${at}: bad serves`);
  if (!isNum(r.hands) || r.hands < 1) fail(`${at}: bad hands`);
  else if (r.hands > 30) fail(`${at}: hands-on ${r.hands} min is over 30`);
  if (!isNum(r.total) || r.total < r.hands) fail(`${at}: total must be a number ≥ hands`);
  if (![0, 1, 2, 3].includes(r.spice)) fail(`${at}: spice must be 0–3`);
  if (!Array.isArray(r.tags)) fail(`${at}: tags is not an array`);
  for (const t of r.tags || []) if (!TAGS.includes(t)) fail(`${at}: bad tag ${t}`);
  if (new Set(r.tags).size !== (r.tags || []).length) fail(`${at}: duplicate tag`);
  if ((r.tags || []).includes('spicy') && r.spice < 1) fail(`${at}: tagged spicy but spice is 0`);

  if (!Array.isArray(r.ing) || !r.ing.length) fail(`${at}: no ingredients`);
  const ids = new Set();
  for (const pair of r.ing || []) {
    const [id, g] = Array.isArray(pair) ? pair : [];
    if (!ING[id]) { fail(`${at}: unknown ingredient ${id}`); continue; }
    if (!isNum(g) || g <= 0) fail(`${at}: bad amount for ${id}`);
    if (ids.has(id)) fail(`${at}: ${id} listed twice`);
    ids.add(id);
    used.add(id);
  }

  if (!Array.isArray(r.oven)) fail(`${at}: oven must be an array`);
  for (const o of r.oven || []) {
    if (!MODES.includes(o.mode)) fail(`${at}: bad oven mode ${o.mode}`);
    if (!TOOLS.includes(o.tool)) fail(`${at}: bad oven tool ${o.tool}`);
    if (!RACKS.includes(o.rack)) fail(`${at}: bad oven rack ${o.rack}`);
    if (o.temp === null) { if (o.mode !== 'Broil') fail(`${at}: only Broil may use temp null`); }
    else if (!isNum(o.temp) || o.temp < 200 || o.temp > 450) fail(`${at}: oven temp ${o.temp}°F out of range`);
    if (!isNum(o.min) || o.min <= 0 || o.min > 90) fail(`${at}: bad oven minutes`);
    if (o.flip !== undefined && !(isNum(o.flip) && o.flip > 0 && o.flip < o.min)) fail(`${at}: flip must be inside the cook time`);
  }
  const usesOvenWords = /\b(air fry|bake|broil)\b/i.test((r.steps || []).join(' '));
  if (usesOvenWords && !(r.oven || []).length) fail(`${at}: steps use the oven but there are no oven settings`);
  if ((r.oven || []).some((o) => o.tool === 'basket') && !/air fry/i.test((r.steps || []).join(' '))) {
    warn(`${at}: basket setting but the steps never say "air fry"`);
  }
  const meat = (r.ing || []).some(([id]) => ['chicken-breast', 'chicken-thighs', 'chicken-ground', 'turkey-ground'].includes(id));
  if (meat && !/165°F/.test((r.steps || []).join(' ') + (r.oven || []).map((o) => o.note || '').join(' '))) {
    fail(`${at}: raw chicken or turkey but no 165°F doneness cue`);
  }

  if (!Array.isArray(r.steps) || r.steps.length < 3 || r.steps.length > 7) fail(`${at}: needs 3–7 steps`);
  if (r.note !== undefined && typeof r.note !== 'string') fail(`${at}: note must be a string`);
}

// ── Table ──
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const rows = [];
for (const r of RECIPES) {
  if (!(r.ing || []).every(([id]) => ING[id])) continue;
  const { kcal, p } = perServing(r);
  const per100 = kcal ? (p / kcal * 100) : 0;
  rows.push({ r, kcal, p, per100 });
  const alcohol = r.ing.some(([id]) => ALCOHOL.includes(id));
  if (r.cat === 'batch' || r.cat === 'oven') {
    if (p < 30) warn(`${r.id}: main with only ${p} g protein per serving`);
    if (kcal > 650) warn(`${r.id}: main with ${kcal} kcal per serving`);
  }
  if (r.cat === 'snack') {
    if (kcal > 350) warn(`${r.id}: snack with ${kcal} kcal`);
    if (p < 12) warn(`${r.id}: snack with only ${p} g protein`);
  }
  if (r.cat === 'drink' && alcohol && kcal > 150) warn(`${r.id}: evening drink with ${kcal} kcal`);
}

console.log(`${pad('id', 32)}${pad('cat', 11)}${lpad('serves', 6)}${lpad('kcal', 7)}${lpad('prot', 6)}${lpad('g/100kcal', 11)}${lpad('hands', 7)}`);
console.log('-'.repeat(80));
for (const { r, kcal, p, per100 } of rows) {
  console.log(`${pad(r.id, 32)}${pad(r.cat, 11)}${lpad(r.serves, 6)}${lpad(kcal, 7)}${lpad(p + ' g', 6)}${lpad(per100.toFixed(1), 11)}${lpad(r.hands, 7)}`);
}
console.log('-'.repeat(80));
const counts = CATS.map((c) => `${c} ${RECIPES.filter((r) => r.cat === c).length}`).join(' · ');
console.log(`${RECIPES.length} recipes: ${counts}`);
const unused = Object.keys(ING).filter((id) => !used.has(id));
console.log(`${Object.keys(ING).length} ingredients${unused.length ? ` (not used in any recipe: ${unused.join(', ')})` : ''}`);

// His own recipes against the numbers he gave (information only)
const HIS = [
  ['turkey-vindaloo', 'vindaloo bowl', 400, 480, 38, 45],
  ['pepperoni-pizza', 'pizza', 580, 640, null, null],
  ['cookie-dough', 'cookie dough', 300, 350, 26, 30],
  ['berry-smoothie', 'smoothie', 220, 260, 23, 27],
  ['tequila-citrus', 'tequila-citrus', 80, 120, null, null],
];
console.log('\nHis recipes vs his estimates:');
for (const [id, label, kLo, kHi, pLo, pHi] of HIS) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) { console.log(`  ${label}: recipe ${id} not found`); continue; }
  if (!(r.ing || []).every(([x]) => ING[x])) { console.log(`  ${label}: skipped (unknown ingredient)`); continue; }
  const { kcal, p } = perServing(r);
  const kOk = kcal >= kLo && kcal <= kHi;
  const pOk = pLo === null || (p >= pLo && p <= pHi);
  const range = `${kLo}–${kHi} kcal${pLo === null ? '' : `, ${pLo}–${pHi} g`}`;
  console.log(`  ${kOk && pOk ? 'ok  ' : 'diff'} ${pad(label, 16)} ${kcal} kcal, ${p} g   (his: ${range})`);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
if (warnings.length && process.argv.includes('--strict')) process.exit(1);
console.log('\nAll checks passed.');
