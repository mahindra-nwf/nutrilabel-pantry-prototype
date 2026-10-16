# Handoff: NutriLabel Pantry prototype

Status: **first version done.** Everything the Raw Materials module does (E:\Pantry\Nutrilabel, branch
`feature/duplicate-ingredient-report`) is clickable here with made-up data, plus a few Pantry additions (draft →
approved, Needs review, supplier switcher, Suppliers page). It follows the same rules as the Workspace prototype
(NLv4 `docs/PROTOTYPE_BRIEF.md`) so it can be rebuilt as NLv4's `pantry` module later.

## How it runs
Plain HTML/CSS/JS, no build, no npm. Classic `<script>`s (not modules), so it also works when opened straight from
disk. Each screen file puts one object on `window.NL` with a `render(state)` function.

Local preview: `.claude/launch.json` serves the folder on port 5179 (`npx http-server`), next to the Workspace on 5178.

## Files
| File | What it is |
|---|---|
| `index.html` | Shell: top bar, sidebar, main area, resize divider, Details panel. Loads scripts in order. |
| `base.css` | Design tokens + shared components, copied unchanged from NLv4 `src/styles/base.css`. Don't edit; copy again when it changes. |
| `pantry.css` | All Pantry styles. Colors only via base.css tokens. |
| `store.js` | **The only data layer.** All localStorage access, seed data, shared lists (nutrients, Big 9, tree nuts, units). |
| `ui.js` | Helpers: `el()`, `fill`, `toast` (with Undo), `modal`, `confirm`, `menu`, `combo` (free-text dropdown), `field`, formatting. |
| `app.js` | Screen state, `#/view/ingredientId/supplierId` routing, shared actions (delete with Undo, open editor/price dialog), resizable Details split. |
| `toolbar.js` | Brand, search (name, code, internal code, supplier item number), theme toggle, avatar. |
| `sidebar.js` | ＋ New ingredient; All items, Food, Packaging, Needs review, Drafts; Suppliers; Recycle Bin; Reset demo data. |
| `ingredient-list.js` | The table: one row per ingredient × supplier, filters (category, supplier, allergen), sort, ⋯ row menu. |
| `details-panel.js` | Details: supplier switcher, needs-review list, nutrition per 100 g (click to edit a supplier's spec values), allergens, statement, quality notes, Recipe Builder teaser, weights, price history, product profile, spec sheets. Also `NL.specFiles` (pick/open files). |
| `ingredient-editor.js` | Add / Edit ingredient: name (+ duplicate-name check), category, internal number, item type, supplier & price, pack, weights, statement, Big 9 allergens (tree-nut kinds, fish/shellfish species), nutrition with sanity warnings, spec sheet upload. |
| `quote-dialog.js` | Record new price / Edit price for one supplier: pack, UOM, config, price (or "pricing pending"), item number, MOQ, lead time, date, notes. |
| `duplicates-dialog.js` | Check for duplicates: same name + same supplier, or same name with no supplier. Keep / Delete per row. |
| `suppliers.js` | Suppliers table + New/Edit supplier dialog (type, region, rep, email, phone, website, notes, color). |
| `recycle-bin.js` | Recycle Bin: 72-hour countdown, Restore, Delete permanently. |

## store.js functions, and who calls them
| Function | Used by |
|---|---|
| `listIngredients({ view, query, category, supplierId, allergen })` | ingredient-list |
| `getIngredient(id)` | app, details-panel, ingredient-editor, quote-dialog |
| `counts()` | sidebar |
| `categories()` / `uoms()` / `packConfigs()` | ingredient-list filters, ingredient-editor, quote-dialog |
| `findByName(name, exceptId)` | ingredient-editor (duplicate-name check) |
| `createIngredient` / `updateIngredient` | ingredient-editor; details-panel (notes, teaser, baseline nutrition) |
| `setStatus(id, 'draft'\|'approved')` | details-panel (Approve / Back to draft) |
| `addSpecSheet` / `setCurrentSheet` / `recycleSpecSheet` / `sheetFile` | details-panel, ingredient-editor |
| `listSuppliers` / `getSupplier` / `saveSupplier` / `recycleSupplier` | suppliers, ingredient-list, ingredient-editor, quote-dialog, details-panel |
| `quoteHistory` / `getQuote` / `saveQuote` / `setPreferred` | details-panel, quote-dialog, ingredient-editor, ingredient-list |
| `recycleIngredient` / `recycleSupplierRow` / `recycleQuote` | app (delete actions), duplicates-dialog |
| `listBin` / `restore` / `purge` | recycle-bin, app (Undo) |
| `duplicateReport()` | duplicates-dialog |
| `perUom(quote)` / `perKg(quote, ingredient)` | ingredient-list, details-panel |
| `pref` / `reset` / `me` | app, toolbar |

Objects from `listIngredients` / `getIngredient` carry computed fields: `sources` (one row per supplier: newest
quote, `preferred`, `quoteCount`, `hasNutrition`), `costQuote`, `issues` (needs-review reasons), `currentSheet`,
`updatedByPerson`.

## Data shapes (and how they map to NLv4)
- **Ingredient** → NLv4 `ingredients`. Same: `code`, `name`, `category`, `status` (draft/approved), timestamps.
  Nutrition is `n` per 100 g with the **15** Raw Materials keys (NLv4 has 9 columns today; null = unknown).
  New for Pantry: `itemType`, `allergens`, `allergenStatus`, `allergenSources`, `statement`, `uom`, `packQty`,
  `packConfig`, `netWeightG`, `grossWeightG`, `internalCode`, `qualityNotes`, `teaser`, `specSheets`,
  `currentSheetId`, `preferredSupplierId`. See IDEAS.md.
- **Supplier** → NLv4 `suppliers` (`name`) + contact fields from the old Vendors page.
- **Quote** (one price record) → NLv4 `ingredient_sources` (`supplier_sku`) + price history. The newest quote per
  ingredient × supplier is that supplier's "row"; older ones are its price history.
- **Recycle Bin item** `{ id, kind: ingredient|quotes|spec_sheet|supplier, name, deletedAt, expiresAt, payload }`.

## Differences from Raw Materials (on purpose; check with the team)
- **One row per supplier**, not per price record. A supplier's older prices live in its price history.
  Deleting a row removes that supplier (all its prices) from the ingredient.
- **Pack size and prices in the table come from that supplier's own price**, not from the ingredient
  (Raw Materials showed the ingredient's pack/price on every supplier row).
- **The supplier filter shows only that supplier's rows** (Raw Materials showed every row of matching ingredients).
- **Preferred supplier** is stored on the ingredient (`preferredSupplierId`), not on a single price record, so a new
  price never loses the preferred flag. Costing uses the preferred supplier's newest price, else the newest price.
- **A changed price is a new price record dated today** (history), instead of overwriting the old one.
- **The editor's Price is optional** (blank = "pricing pending"); the price dialog has a "Price not confirmed yet" box.
- **Food / Packaging toggle and Item type are merged** into one choice: Food, Packaging, Prepackaged Food.
- **Details shows every supplier as a switcher** (pills) instead of needing to open it from a table row.
- **Draft → Approved**, **Needs review** and **Drafts** views are new (from NLv4's Pantry contract).
- **"Use as ingredient baseline"** copies a supplier's spec-sheet nutrition into the ingredient's own values.
- **Delete shows an Undo toast** in addition to the Recycle Bin.
- **Renaming an ingredient onto an existing name also triggers the duplicate-name check** (Raw Materials only
  checked new ingredients).

## Faked or not built
- **No AI Populate.** Spec sheets are kept as files (≤ 1.5 MB, as data URLs in localStorage; bigger files keep the
  name only). Seeded spec sheets have no file behind them; a few show sample "extracted details".
- **No login.** Signed in as made-up "Jordan Lee" (admin). No roles are enforced.
- **No recipes**, so there is no "used by these recipes — can't delete" check. In NLv4 the Recipe Builder's
  `recipe_items` reference `ingredients.id`; the real delete must check that.
- **No built-in (system) ingredients**; everything belongs to the organization.
- **No custom units** (`1 cup = 240 g`); the Raw Materials editor always saved them empty.
- **Recycle Bin expiry** is checked when the bin is read (no background cleanup job).
- All ingredients, suppliers, people, prices and emails are made up. Nutrition values are rough generic numbers.
- Seed timestamps are relative to the first page load (and to Reset demo data).
