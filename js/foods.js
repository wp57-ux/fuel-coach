// Your usual foods, pre-loaded. The numbers are estimates: fix them once
// from your labels and the app remembers.
import { ING } from './ingredients.js';
import { RECIPES } from './recipes.js';

// slot = where it usually goes; fav = shows in your one-tap usuals.
// from = built as a batch from that recipe, so you can change the amounts.
export const DEFAULT_FOODS = [
  { id: 'latte', name: 'Protein latte', serving: '1 latte', kcal: 115, p: 12, slot: 'morning', fav: true },
  { id: 'latte-double', name: 'Double-protein latte', serving: '1 big latte', kcal: 200, p: 30, slot: 'morning', fav: true },
  { id: 'vindaloo-bowl', name: 'Turkey vindaloo bowl', serving: '1 bowl', kcal: 430, p: 38, slot: 'lunch', fav: true, from: 'turkey-vindaloo' },
  { id: 'pizza', name: 'Toaster-oven pizza', serving: '1 pizza', kcal: 610, p: 30, slot: 'dinner', fav: true, from: 'pepperoni-pizza' },
  { id: 'smoothie', name: 'Berry-banana smoothie', serving: '1 smoothie', kcal: 240, p: 25, slot: 'snack', fav: true, from: 'berry-smoothie' },
  { id: 'cookie-dough', name: 'Protein cookie dough', serving: '1 bowl', kcal: 325, p: 28, slot: 'evening', fav: true, from: 'cookie-dough' },
  { id: 'quest-chips', name: 'Quest protein chips', serving: '1 bag (32 g)', kcal: 140, p: 19, slot: 'evening', fav: true },
  { id: 'built-puff', name: 'Built Puff bar', serving: '1 bar', kcal: 140, p: 17, slot: 'snack', fav: true },
  { id: 'tequila-citrus', name: 'Tequila + fresh citrus', serving: '1 drink', kcal: 100, p: 0, slot: 'evening', fav: true, drink: true, from: 'tequila-citrus' },
  { id: 'ipa', name: 'Tallboy IPA', serving: '473 ml can', kcal: 280, p: 2, slot: 'evening', fav: true, drink: true },
  { id: 'ice-cream', name: 'Ice cream', serving: '½ cup', kcal: 140, p: 2, slot: 'evening' },
  { id: 'eggs', name: 'Eggs', serving: '2 large', kcal: 145, p: 13, slot: 'morning' },
  { id: 'tuna', name: 'Tuna in water', serving: '1 can, drained', kcal: 110, p: 25 },
  { id: 'nuggets', name: 'Chicken nuggets', serving: '5 pieces', kcal: 325, p: 12 },
];

// A batch: items are { ing, g } from the ingredient list, or your own
// { name, g, kcal, p } with kcal and protein per 100 g.
export function batchTotals(b) {
  let kcal = 0, p = 0, g = 0;
  for (const it of b.items || []) {
    const per = it.ing ? ING[it.ing] : it;
    if (!per || !(it.g > 0)) continue;
    kcal += (Number(per.kcal) || 0) * it.g / 100;
    p += (Number(per.p) || 0) * it.g / 100;
    g += it.g;
  }
  return { kcal, p, g };
}

export function batchPortion(b) {
  const t = batchTotals(b);
  const n = Math.max(1, Number(b.portions) || 1);
  return { kcal: Math.round(t.kcal / n / 5) * 5, p: Math.round(t.p / n) };
}

export function seedFoods() {
  return DEFAULT_FOODS.map(f => {
    const { from, ...food } = f;
    const r = from && RECIPES.find(x => x.id === from);
    if (!r) return { ...food };
    const batch = { portions: r.serves, items: r.ing.map(([ing, g]) => ({ ing, g })) };
    return { ...food, batch, recipe: r.id, ...batchPortion(batch) };
  });
}
