# Ideas log: what Pantry needs that NLv4 doesn't have yet

One line each, with why it matters to chefs and R&D. This list becomes the NLv4 database work for the `pantry` module.

## Ingredients (`ingredients` table)
- **15 nutrients, null = unknown** (NLv4 has 9 columns, default 0): labels need vitamin D, calcium, iron, potassium, trans fat and added sugars; "unknown" must not print as 0.
- **Item type: food / packaging / prepackaged food**: packaging carries weight and cost but no nutrition.
- **Allergens (Big 9) + status (declared / confirmed none / not verified) + sources** (which tree nuts, which fish or shellfish): FDA labeling needs the species; "unchecked" must not mean "allergen-free".
- **Ingredient statement**: the sub-ingredient text the label generator will roll up.
- **Pack defaults: UOM, pack size, pack config; net weight per unit; gross weight for packaging**: cost per kg for count units (gallons, each).
- **Internal product number, quality notes, Recipe Builder teaser (50 chars)**: tracking and the short line chefs see in the picker.
- **Preferred supplier** on the ingredient: decides which price the Recipe Builder's cost uses.
- **Needs review** (computed): unknown nutrition, unverified allergens, missing statement, no supplier, no price or a price older than 6 months. Gives QA one place to work through.
- **Approve with open issues asks first**: a draft becomes "approved" only on purpose.

## Suppliers and prices (`suppliers`, `ingredient_sources`)
- **Supplier contact fields** (type, region, rep, email, phone, website, notes, color).
- **Price history per ingredient × supplier** (price, UOM, pack, config, item number, MOQ, lead time, date, notes): see price changes over time; never overwrite a price.
- **"Pricing pending"** (price null): a supplier can be attached before the quote arrives.
- **Supplier spec-sheet nutrition** per price record, and "use as ingredient baseline": different suppliers' products differ.
- **Product profile per supplier** (teaser, description, internal notes).
- **Price age colors** (green < 90 days, amber < 180, red older): stale costs are visible at a glance.

## Documents
- **Spec sheets with versions** (one current, history kept, delete to Recycle Bin), linked to the supplier they came from.
- **Extracted spec-sheet details** (sections of label/value pairs), for AI Populate later.

## Safety nets
- **Recycle Bin for 72 hours** for ingredients, supplier rows, single prices, spec sheets and suppliers; restore never overwrites and says what to restore first.
- **Duplicate check** (same name + same supplier) and a **duplicate-name warning** when adding or renaming.
- **Undo** right after a delete.
