# Fuel Coach

A personal eating coach that sits next to [Run Coach](https://wp57-ux.github.io/run-coach/).
It's a single-user Progressive Web App: no accounts and no server. Your log,
weigh-ins and pantry are stored only on your phone.

**The idea: fix the timing, not the food.** Eat on pace through the day, so
you reach the evening already fed, and give the evening a planned budget
instead of a fight.

**Today**

- Calories and protein left today, against a pace line that moves with the clock
- Five slots (morning, lunch, afternoon snack, dinner, evening) with your
  one-tap usuals and "same as yesterday"
- From 2 pm, a catch-up card when you're well behind pace, with quick
  high-protein fixes from what's at home
- An evening card with what's left for tonight, and drinks counted
- A craving button: hungry, bored, stressed or just want a treat. Bored and
  stressed get a 10-minute timer first
- Training days (a lift or ride logged in Run Coach, or switched on by hand)
  add 150 kcal

**Logging**

- Your usual foods pre-loaded; fix the numbers once from your labels
- Batch recipes: enter the whole pot and the number of portions
- No label? Estimate with your hand: palms of protein, cupped hands of carbs,
  thumbs of fats and fists of veg, plus 20% when eating out
- Barcode scanning with the phone camera (Chrome's BarcodeDetector), looked up
  in [Open Food Facts](https://world.openfoodfacts.org). Only the barcode
  number is sent. Unknown products are typed in from the label once

**Weight**

- Daily weigh-in with a 7-day average, weekly rate, goal dates and an 8-week chart
- Targets start from the Mifflin–St Jeor equation and are checked against your
  own trend after 3 weeks: losing under 0.5 lb a week suggests 150 kcal less,
  over 1.5 suggests 150 more

**Kitchen and recipes**

- A pantry checklist (have, low, out) that builds the shopping list, grouped
  by store section
- 40 recipes for a toaster-oven air fryer, a skillet, a loaf pan and a blender,
  each with calories and protein per serving worked out from the ingredients,
  and the exact oven setting

## Install on Android

1. Open the site in Chrome.
2. Tap **Install app** (or ⋮ → *Add to Home screen*).
3. Launch it from the home-screen icon.

## Develop

```
node tools/serve.mjs
```

Then open http://localhost:5174. Check the recipe data with
`node tools/check-recipes.mjs`, and bump `VERSION` in `sw.js` whenever you
publish, so phones pick up the change.

Not medical or dietetic advice.
