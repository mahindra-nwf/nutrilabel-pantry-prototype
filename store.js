/* store.js — the ONLY file that touches storage.
   Playground: everything in this browser (localStorage), made-up data.
   Live (inside the Northwest Frozen app): the organization's database through /api/pantry — the same ingredients the
   Recipe Builder uses. The data stays in memory here exactly as in Playground; every save() sends what changed
   (puts and deletes of ingredients, suppliers, prices and Recycle Bin items), and opening the page loads it all.
   Screens call these functions and get plain copies back; they never mutate store data directly. */
(function () {
  // Live vs Playground: inside the Northwest Frozen app (/pantry/) the Home page toggle sets the nl_mode cookie.
  // Playground (and this site on its own) = the demo with made-up ingredients and suppliers. Live = the same screens
  // on the organization's real data (database), starting empty until it has loaded.
  const LIVE = location.pathname.startsWith('/pantry/') && !/(?:^|; )nl_mode=playground(?:;|$)/.test(document.cookie);

  // Playground inside the company site: say so loudly, every time. Nothing here reaches the database or other people,
  // and the choice sticks in this browser (a cookie set on Home), so it is easy to forget.
  if (!LIVE && location.pathname.startsWith('/pantry/')) {
    const banner = () => {
      if (document.getElementById('playgroundBanner')) return;
      const b = document.createElement('div');
      b.id = 'playgroundBanner'; b.className = 'playground-banner'; b.setAttribute('role', 'status');
      b.innerHTML = '<span><b>Playground:</b> sample data, saved only in this browser. Nobody else sees it, and nothing here is saved for your team.</span>';
      const live = document.createElement('button');
      live.type = 'button'; live.textContent = 'Switch to Live';
      live.onclick = () => {
        document.cookie = 'nl_mode=live; path=/; max-age=31536000; samesite=lax' + (location.protocol === 'https:' ? '; secure' : '');
        location.reload();
      };
      b.append(live);
      document.body.prepend(b);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner();
  }
  const KEY = LIVE ? 'nlpantry.live.v1' : 'nlpantry.v1';
  const PREF = 'nlpantry.pref.';
  let ME = 'u1';
  const H = 3600e3, D = 24 * H;
  const BIN_HOURS = 72;

  /* ---------- shared constants (same lists as the Raw Materials module) ---------- */
  const NUTRIENTS = [
    { key: 'cal', label: 'Calories', unit: 'kcal', indent: 0 },
    { key: 'fat', label: 'Total Fat', unit: 'g', indent: 0 },
    { key: 'sat_fat', label: 'Saturated Fat', unit: 'g', indent: 1 },
    { key: 'trans_fat', label: 'Trans Fat', unit: 'g', indent: 1 },
    { key: 'chol', label: 'Cholesterol', unit: 'mg', indent: 0 },
    { key: 'sod', label: 'Sodium', unit: 'mg', indent: 0 },
    { key: 'carbs', label: 'Total Carbohydrate', unit: 'g', indent: 0 },
    { key: 'fiber', label: 'Dietary Fiber', unit: 'g', indent: 1 },
    { key: 'sugars', label: 'Total Sugars', unit: 'g', indent: 1 },
    { key: 'add_sug', label: 'Added Sugars', unit: 'g', indent: 2 },
    { key: 'prot', label: 'Protein', unit: 'g', indent: 0 },
    { key: 'vit_d', label: 'Vitamin D', unit: 'mcg', indent: 0 },
    { key: 'calc', label: 'Calcium', unit: 'mg', indent: 0 },
    { key: 'iron', label: 'Iron', unit: 'mg', indent: 0 },
    { key: 'potas', label: 'Potassium', unit: 'mg', indent: 0 },
  ];
  const ALLERGENS = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soybeans', 'Sesame'];
  const TREE_NUTS = ['Almonds', 'Cashews', 'Walnuts', 'Pecans', 'Pistachios', 'Hazelnuts', 'Macadamia Nuts', 'Brazil Nuts', 'Pine Nuts', 'Chestnuts'];
  const STANDARD_UOMS = ['g', 'oz', 'lbs', 'kg', 'each', 'packs', 'packets', 'pouches', 'pucks', 'bowls', 'cups', 'trays', 'boxes',
    'cartons', 'cases', 'bags', 'sheets', 'labels', 'lids', 'meters', 'ft', 'impressions', 'pieces', 'pallet'];
  const WEIGHT_UOMS = ['g', 'oz', 'lb', 'lbs', 'kg'];
  const UNIT_TO_G = { g: 1, oz: 28.3495, lb: 453.592, lbs: 453.592, kg: 1000, cup: 240, tbsp: 14.787, tsp: 4.929, ml: 1, l: 1000 };
  const SUPPLIER_CATEGORIES = ['Ingredient Supplier', 'Packaging Supplier', 'Distributor', 'Broker', 'Co-manufacturer', 'Other'];
  const ITEM_TYPES = [
    { key: 'food', label: 'Food', hint: 'Raw ingredient or recipe component' },
    { key: 'packaging', label: 'Packaging', hint: 'Packaging material only (no food content)' },
    { key: 'prepackaged_food', label: 'Prepackaged Food', hint: 'Food in packaging, measured per unit (e.g. soy sauce sachet)' },
  ];

  let db;

  function load() {
    if (LIVE) return seed(); // filled from the database by sync() below
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* private mode etc. — fall back to seed */ }
    return seed();
  }
  function save() {
    if (LIVE) return push();
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; } // quota: big spec-sheet files
  }
  // Live ids are database ids (uuid)
  const uid = (p) => (LIVE ? crypto.randomUUID() : p + Math.random().toString(36).slice(2, 9));
  const copy = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const norm = (s) => String(s || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const blankN = () => Object.fromEntries(NUTRIENTS.map((x) => [x.key, null]));
  const ing = (id) => db.ingredients.find((i) => i.id === id);
  const sup = (id) => db.suppliers.find((s) => s.id === id);
  const person = (id) => db.people.find((p) => p.id === id);
  const isFood = (i) => i.itemType !== 'packaging';
  const nComplete = (n) => !!n && NUTRIENTS.every((x) => n[x.key] != null);
  const nMissing = (n) => NUTRIENTS.filter((x) => !n || n[x.key] == null).length;

  /* ---------- seed ---------- */
  function seed() {
    const now = Date.now();
    if (LIVE) return { version: 1, people: [{ id: ME, name: 'You', email: '', role: 'viewer', title: 'Northwest Frozen', initials: 'Y', color: '#2f6fed' }],
      suppliers: [], ingredients: [], categories: [], categoryFeature: false, quotes: [], bin: [], seq: 0 };
    const people = [
      { id: 'u1', name: 'Jordan Lee', email: 'jordan@example.com', role: 'admin', title: 'Head of R&D', initials: 'JL', color: '#2f6fed' },
      { id: 'u2', name: 'Ana Ruiz', email: 'ana@example.com', role: 'editor', title: 'Sous chef', initials: 'AR', color: '#e8590c' },
      { id: 'u4', name: 'Priya Shah', email: 'priya@example.com', role: 'editor', title: 'Food technologist', initials: 'PS', color: '#7c5cff' },
    ];
    const S = (id, name, category, region, rep, color) =>
      ({ id, name, category, region, rep, email: rep.split(' ')[0].toLowerCase() + '@example.com', phone: '(555) 01' + id.slice(1).padStart(2, '0'), website: '', notes: '', color, createdAt: now - 400 * D });
    const suppliers = [
      S('s1', 'Cascade Valley Produce', 'Ingredient Supplier', 'Pacific Northwest', 'Dana Holt', '#5c940d'),
      S('s2', 'Summit Foodservice', 'Distributor', 'National', 'Rick Alvarez', '#1971c2'),
      S('s3', 'Harbor Fresh Seafood', 'Ingredient Supplier', 'Pacific Northwest', 'Mei Tanaka', '#0f766e'),
      S('s4', 'Prairie Mills', 'Ingredient Supplier', 'Midwest', 'Owen Becker', '#b08800'),
      S('s5', 'Golden Hive Sweeteners', 'Ingredient Supplier', 'California', 'Tess Moreau', '#e8590c'),
      S('s6', 'Spice Route Trading', 'Ingredient Supplier', 'National', 'Arjun Mehta', '#c2255c'),
      S('s7', 'Greenline Packaging', 'Packaging Supplier', 'Pacific Northwest', 'Sam Okoro', '#7c5cff'),
      S('s8', 'Northfield Dairy Co-op', 'Ingredient Supplier', 'Pacific Northwest', 'Lars Jensen', '#2f6fed'),
      S('s9', 'Pacific Rim Imports', 'Broker', 'West Coast', 'Kim Nguyen', '#d9480f'),
    ];
    const ingredients = [], quotes = [];
    const N = (a) => (a ? Object.fromEntries(NUTRIENTS.map((x, i) => [x.key, a[i] === undefined ? null : a[i]])) : blankN());
    let seq = 0;

    // [supplierId, price per pack (null = pricing pending), days ago, extra]
    function add(name, category, nut, o, qs) {
      o = o || {};
      seq++;
      const id = 'i' + seq;
      const type = o.type || 'food';
      const al = o.al || [];
      const n = type === 'packaging' ? N([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) : N(nut);
      const ago = (o.ago == null ? 20 + seq * 3 : o.ago) * D;
      const item = {
        id, code: 'ING-' + String(seq).padStart(4, '0'), name, category, status: o.draft ? 'draft' : 'approved', itemType: type,
        n, allergens: al,
        allergenStatus: type === 'packaging' ? null : o.st || (al.length ? 'declared' : 'confirmed_none'),
        allergenSources: o.src || {},
        statement: type === 'packaging' ? '' : (o.stmt == null ? name.replace(/,.*$/, '') + '.' : o.stmt),
        uom: o.uom || 'lbs', packQty: o.pack == null ? 40 : o.pack, packConfig: o.cfg || 'case',
        netWeightG: o.net || null, grossWeightG: o.gross || null, internalCode: o.internal || '',
        qualityNotes: o.notes || '', teaser: o.teaser || '',
        specSheets: [], currentSheetId: null, preferredSupplierId: null,
        createdAt: now - ago - 60 * D, createdBy: o.by || 'u1', updatedAt: now - ago, updatedBy: o.by || 'u1',
      };
      if (o.sheet) {
        const sh = { id: uid('sh'), fileName: o.sheet, uploadedAt: now - ago - 2 * D, size: 180000 + seq * 7919 % 400000, supplierId: (qs && qs[0] && qs[0][0]) || null, details: o.details || null };
        item.specSheets.push(sh);
        if (o.oldSheet) item.specSheets.push({ id: uid('sh'), fileName: o.oldSheet, uploadedAt: now - ago - 300 * D, size: 150000, supplierId: sh.supplierId, details: null });
        item.currentSheetId = sh.id;
      }
      ingredients.push(item);
      const latest = {};
      (qs || []).forEach(([sid, price, days, x]) => {
        x = x || {};
        const q = {
          id: uid('q'), ingredientId: id, supplierId: sid,
          sku: x.sku || sid.toUpperCase() + '-' + (1000 + seq * 37 + quotes.length),
          price, uom: x.uom || item.uom, packQty: x.pack == null ? item.packQty : x.pack, packConfig: x.cfg || item.packConfig,
          moq: x.moq || '', leadTime: x.lead || '', quoteDate: now - days * D,
          n: null, teaser: x.teaser || '', description: x.desc || '', internalNotes: x.inotes || '', notes: x.notes || '',
          createdAt: now - days * D,
        };
        quotes.push(q);
        if (!latest[sid] || latest[sid].quoteDate < q.quoteDate) latest[sid] = q;
        q._spec = x.spec;
      });
      // the newest quote per supplier carries that supplier's spec-sheet nutrition, unless told otherwise
      Object.values(latest).forEach((q) => { if (q._spec !== false && type !== 'packaging') q.n = q._spec === 'partial' ? Object.assign(copy(n), { vit_d: null, potas: null, add_sug: null }) : copy(n); });
      quotes.forEach((q) => delete q._spec);
      item.preferredSupplierId = o.pref === null ? null : o.pref || (qs && qs[0] ? qs[0][0] : null);
      return item;
    }

    const specDetails = (product, extra) => ({
      extractedAt: now - 30 * D,
      warnings: extra && extra.warn ? [extra.warn] : [],
      sections: [
        { title: 'Product', category: 'product', entries: [['Product name', product], ['Country of origin', 'USA'], ['Shelf life', extra && extra.life || '12 months']] },
        { title: 'Storage', category: 'storage', entries: [['Storage', extra && extra.store || 'Keep frozen at 0 °F (-18 °C) or below']] },
        { title: 'Microbiology', category: 'microbiology', entries: [['Total plate count', '< 100,000 CFU/g'], ['E. coli', '< 10 CFU/g'], ['Salmonella', 'Negative / 25 g']] },
      ],
    });

    // name, category, [cal, fat, sat, trans, chol, sod, carbs, fiber, sugars, add_sug, prot, vit_d, calc, iron, potas] per 100 g
    add('Chicken Breast, raw', 'Meat & Poultry', [120, 2.6, 0.6, 0, 73, 45, 0, 0, 0, 0, 22.5, 0.1, 5, 0.4, 334],
      { stmt: 'Boneless skinless chicken breast.', sheet: 'Chicken-Breast-Spec-2026.pdf', oldSheet: 'Chicken-Breast-Spec-2024.pdf', details: specDetails('IQF Boneless Skinless Chicken Breast'), notes: 'Audit 2026-08: supplier HACCP plan on file.', teaser: 'Lean, all-natural chicken' },
      [['s2', 89.5, 12, { moq: '10 cases', lead: '1 week' }], ['s2', 84, 140], ['s2', 79.25, 320], ['s1', 94, 40, { spec: false }]]);
    add('Ground Beef 85/15', 'Meat & Poultry', [215, 15, 5.9, 0.9, 68, 66, 0, 0, 0, 0, 18.6, 0.1, 18, 2.1, 270],
      { stmt: 'Ground beef.', pack: 10, cfg: 'case' }, [['s2', 52.8, 25]]);
    add('Pork Shoulder, boneless', 'Meat & Poultry', [186, 11, 3.9, 0, 72, 65, 0, 0, 0, 0, 19.7, 0.6, 16, 1.1, 320],
      { stmt: 'Pork.', pack: 60 }, [['s2', 141, 200]]);
    add('Atlantic Salmon Fillet', 'Seafood', [208, 13, 3.1, 0, 55, 59, 0, 0, 0, 0, 20, 11, 9, 0.3, 363],
      { al: ['Fish'], src: { Fish: 'Atlantic salmon' }, stmt: 'Atlantic salmon.', pack: 10, sheet: 'Salmon-Fillet-Spec.pdf', details: specDetails('Atlantic Salmon Fillet, skin-off'), teaser: 'Rich, buttery salmon' },
      [['s3', 112, 8, { moq: '5 cases', lead: '3 days' }], ['s3', 104, 95]]);
    add('Shrimp, peeled & deveined', 'Seafood', [85, 0.5, 0.1, 0, 161, 119, 0, 0, 0, 0, 20, 0, 64, 0.2, 264],
      { al: ['Shellfish'], src: { Shellfish: 'White shrimp' }, stmt: 'Shrimp, salt, sodium tripolyphosphate.', pack: 10 }, [['s3', 96, 60], ['s9', 88.4, 15]]);
    add('Liquid Whole Eggs', 'Dairy & Eggs', [143, 9.5, 3.1, 0, 372, 142, 0.7, 0, 0.4, 0, 12.6, 2, 56, 1.8, 138],
      { al: ['Eggs'], stmt: 'Whole eggs, citric acid.', pack: 30, cfg: 'case' }, [['s8', 61.2, 18]]);
    add('Whole Milk', 'Dairy & Eggs', [61, 3.3, 1.9, 0, 10, 43, 4.8, 0, 5.1, 0, 3.2, 1.3, 113, 0, 132],
      { al: ['Milk'], stmt: 'Milk, vitamin D3.', uom: 'gal', pack: 4, cfg: 'case', net: 3900 }, [['s8', 18.4, 9]]);
    add('Heavy Cream 36%', 'Dairy & Eggs', [340, 36, 23, 1.1, 113, 27, 2.8, 0, 2.9, 0, 2.8, 1.6, 66, 0, 95],
      { al: ['Milk'], stmt: 'Cream, carrageenan.', uom: 'qt', pack: 12, net: 950 }, [['s8', 46.8, 33], ['s2', 49.9, 70]]);
    add('Unsalted Butter', 'Dairy & Eggs', [717, 81, 51, 3.3, 215, 11, 0.1, 0, 0.1, 0, 0.9, 1.5, 24, 0, 24],
      { al: ['Milk'], stmt: 'Cream.', pack: 36 }, [['s8', 118.8, 21]]);
    add('Cheddar Cheese, shredded', 'Dairy & Eggs', [403, 33, 19, 1.1, 99, 653, 1.3, 0, 0.5, 0, 23, 0.6, 710, 0.1, 76],
      { al: ['Milk'], stmt: 'Cheddar cheese (pasteurized milk, cheese culture, salt, enzymes, annatto), potato starch.', pack: 20, cfg: 'case' }, [['s8', 74, 50]]);
    add('Parmesan, grated', 'Dairy & Eggs', [420, 28, 17, 0, 86, 1800, 14, 0, 0.9, 0, 28, 0.5, 853, 0.5, 180],
      { al: ['Milk'], stmt: 'Parmesan cheese (pasteurized milk, cheese culture, salt, enzymes), cellulose.', pack: 10 }, [['s8', 68.5, 400]]);
    add('All-Purpose Flour', 'Grains & Flours', [364, 1, 0.2, 0, 0, 2, 76, 2.7, 0.3, 0, 10, 0, 15, 4.6, 107],
      { al: ['Wheat'], stmt: 'Bleached wheat flour, niacin, reduced iron, thiamine mononitrate, riboflavin, folic acid.', pack: 50, cfg: 'bag', sheet: 'AP-Flour-Spec.pdf' },
      [['s4', 21.5, 30, { moq: '1 pallet', lead: '2 weeks' }], ['s2', 24.75, 65]]);
    add('Rolled Oats', 'Grains & Flours', [379, 6.5, 1.1, 0, 0, 6, 68, 10, 1, 0, 13, 0, 52, 4.3, 362],
      { stmt: 'Whole grain rolled oats.', pack: 50, cfg: 'bag', st: 'not_declared', notes: 'Ask supplier about wheat cross-contact.' }, [['s4', 38, 44]]);
    add('Long-Grain White Rice', 'Grains & Flours', [365, 0.7, 0.2, 0, 0, 5, 80, 1.3, 0.1, 0, 7.1, 0, 28, 0.8, 115],
      { stmt: 'Enriched long grain rice.', pack: 50, cfg: 'bag' }, [['s2', 33.9, 14]]);
    add('Semolina Pasta, dry', 'Grains & Flours', [371, 1.5, 0.3, 0, 0, 6, 75, 3.2, 2.7, 0, 13, 0, 21, 3.3, 223],
      { al: ['Wheat'], stmt: 'Durum wheat semolina, niacin, iron, thiamine, riboflavin, folic acid.', pack: 20 }, [['s2', 27.2, 80]]);
    add('Panko Breadcrumbs', 'Grains & Flours', [395, 4.7, 1, 0, 0, 620, 75, 3.8, 5, 4, 13, 0, 90, 4.8, 180],
      { al: ['Wheat', 'Soybeans'], stmt: 'Wheat flour, sugar, yeast, soybean oil, salt.', pack: 25, cfg: 'case' }, [['s9', 41.6, 120, { spec: 'partial' }]]);
    add('Yellow Onion', 'Produce', [40, 0.1, 0, 0, 0, 4, 9.3, 1.7, 4.2, 0, 1.1, 0, 23, 0.2, 146],
      { stmt: 'Onion.', pack: 50, cfg: 'bag' }, [['s1', 24, 6], ['s1', 21.5, 90], ['s2', 27.8, 30]]);
    add('Garlic, peeled', 'Produce', [149, 0.5, 0.1, 0, 0, 17, 33, 2.1, 1, 0, 6.4, 0, 181, 1.7, 401],
      { stmt: 'Garlic.', pack: 5, cfg: 'jar' }, [['s1', 22.75, 11]]);
    add('Carrots, diced', 'Produce', [41, 0.2, 0, 0, 0, 69, 9.6, 2.8, 4.7, 0, 0.9, 0, 33, 0.3, 320],
      { stmt: 'Carrots.', pack: 30 }, [['s1', 26.4, 16]]);
    add('Roma Tomatoes', 'Produce', [18, 0.2, 0, 0, 0, 5, 3.9, 1.2, 2.6, 0, 0.9, 0, 10, 0.3, 237],
      { stmt: 'Tomatoes.', pack: 25 }, [['s1', 31, 4]]);
    add('Russet Potatoes', 'Produce', [79, 0.1, 0, 0, 0, 6, 18, 1.3, 0.6, 0, 2.1, 0, 13, 0.9, 417],
      { stmt: 'Potatoes.', pack: 50, cfg: 'bag' }, [['s1', 22, 27]]);
    add('Baby Spinach', 'Produce', [23, 0.4, 0.1, 0, 0, 79, 3.6, 2.2, 0.4, 0, 2.9, 0, 99, 2.7, 558],
      { stmt: 'Spinach.', pack: 4, cfg: 'case' }, [['s1', 19.6, 3]]);
    add('Fresh Ginger', 'Produce', [80, 0.8, 0.2, 0, 0, 13, 18, 2, 1.7, 0, 1.8, 0, 16, 0.6, 415],
      { stmt: 'Ginger.', pack: 30 }, [['s1', 68, 52], ['s9', 61.5, 23]], );
    add('Butternut Squash, cubed', 'Produce', [45, 0.1, 0, 0, 0, 4, 12, 2, 2.2, 0, 1, 0, 48, 0.7, 352],
      { stmt: 'Butternut squash.', pack: 20, teaser: 'Sweet roasted squash' }, [['s1', 35, 190]]);
    add('Canola Oil', 'Oils & Fats', [884, 100, 7.4, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      { stmt: 'Canola oil.', uom: 'lbs', pack: 35, cfg: 'jug' }, [['s2', 42.5, 35]]);
    add('Extra Virgin Olive Oil', 'Oils & Fats', [884, 100, 14, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1, 0.6, 1],
      { stmt: 'Extra virgin olive oil.', uom: 'l', pack: 3, cfg: 'tin' }, [['s9', 39.9, 60]]);
    add('Toasted Sesame Oil', 'Oils & Fats', [884, 100, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      { al: ['Sesame'], stmt: 'Toasted sesame oil.', uom: 'l', pack: 1.8, cfg: 'bottle' }, [['s9', 21.2, 75]]);
    add('Granulated Sugar', 'Sweeteners', [387, 0, 0, 0, 0, 1, 100, 0, 100, 100, 0, 0, 1, 0, 2],
      { stmt: 'Sugar.', pack: 50, cfg: 'bag' }, [['s5', 36.5, 20], ['s2', 39, 45]]);
    add('Clover Honey', 'Sweeteners', [304, 0, 0, 0, 0, 4, 82, 0.2, 82, 82, 0.3, 0, 6, 0.4, 52],
      { stmt: 'Honey.', pack: 60, cfg: 'pail', sheet: 'Clover-Honey-COA.pdf' }, [['s5', 189, 13]]);
    add('Pure Maple Syrup', 'Sweeteners', [260, 0.1, 0, 0, 0, 12, 67, 0, 60, 60, 0, 0, 102, 0.1, 212],
      { stmt: 'Pure maple syrup.', uom: 'gal', pack: 1, cfg: 'jug', net: 5000 }, [['s5', 58, 210]]);
    add('Kosher Salt', 'Spices & Seasonings', [0, 0, 0, 0, 0, 38758, 0, 0, 0, 0, 0, 0, 24, 0.3, 8],
      { stmt: 'Salt.', pack: 3, cfg: 'box' }, [['s6', 4.1, 33]]);
    add('Black Pepper, ground', 'Spices & Seasonings', [251, 3.3, 1.4, 0, 0, 20, 64, 25, 0.6, 0, 10, 0, 443, 9.7, 1329],
      { stmt: 'Black pepper.', pack: 5, cfg: 'tub' }, [['s6', 44.5, 66]]);
    add('Smoked Paprika', 'Spices & Seasonings', [282, 13, 2.1, 0, 0, 68, 54, 35, 10, 0, 14, 0, 229, 21, 2280],
      { stmt: 'Smoked paprika.', pack: 5, cfg: 'tub' }, [['s6', 52, 150]]);
    add('Ground Cumin', 'Spices & Seasonings', [375, 22, 1.5, 0, 0, 168, 44, 11, 2.3, 0, 18, 0, 931, 66, 1788],
      { stmt: 'Cumin.', pack: 5, cfg: 'tub' }, [['s6', 47.8, 58]]);
    add('Soy Sauce', 'Sauces & Condiments', [53, 0.6, 0.1, 0, 0, 5493, 4.9, 0.8, 0.4, 0, 8.1, 0, 33, 1.5, 435],
      { al: ['Soybeans', 'Wheat'], stmt: 'Water, wheat, soybeans, salt.', uom: 'gal', pack: 5, cfg: 'pail', net: 4400 }, [['s9', 31.5, 26]]);
    add('White Miso Paste', 'Sauces & Condiments', [198, 6, 1, 0, 0, 3728, 26, 5.4, 6.2, 0, 12, 0, 57, 2.5, 210],
      { al: ['Soybeans'], stmt: 'Water, rice, soybeans, salt, alcohol.', pack: 22, cfg: 'tub', teaser: 'Mellow, savory miso' }, [['s9', 72.6, 41]]);
    add('Sriracha', 'Sauces & Condiments', [93, 0.9, 0.1, 0, 0, 2124, 19, 2.2, 15, 13, 1.9, 0, 18, 1.6, 321],
      { stmt: 'Chili, sugar, salt, garlic, distilled vinegar, potassium sorbate, sodium bisulfite, xanthan gum.', pack: 12, cfg: 'case', uom: 'each', net: 482 }, [['s9', 38.2, 17]]);
    add('Dijon Mustard', 'Sauces & Condiments', [66, 3.3, 0.2, 0, 0, 1135, 5.8, 3.3, 0.9, 0, 4.4, 0, 58, 1.6, 138],
      { stmt: 'Water, mustard seed, vinegar, salt, citric acid.', uom: 'gal', pack: 4, cfg: 'case', net: 4200 }, [['s2', 54, 101]]);
    add('Peanut Butter, creamy', 'Nuts & Seeds', [588, 50, 10, 0, 0, 429, 20, 6, 9.2, 6, 25, 0, 43, 1.7, 649],
      { al: ['Peanuts'], stmt: 'Peanuts, sugar, hydrogenated vegetable oil, salt.', pack: 35, cfg: 'pail' }, [['s2', 98, 37]]);
    add('Sliced Almonds', 'Nuts & Seeds', [579, 50, 3.8, 0, 0, 1, 22, 12.5, 4.4, 0, 21, 0, 269, 3.7, 733],
      { al: ['Tree Nuts'], src: { 'Tree Nuts': ['Almonds'] }, stmt: 'Almonds.', pack: 25 }, [['s2', 162.5, 59]]);
    add('Tahini', 'Nuts & Seeds', [595, 54, 7.5, 0, 0, 115, 21, 9.3, 0.5, 0, 17, 0, 426, 8.9, 414],
      { al: ['Sesame'], stmt: 'Sesame seeds.', pack: 35, cfg: 'pail' }, [['s9', 129, 84]]);
    add('Firm Tofu', 'Plant Proteins', [144, 8.7, 1.3, 0, 0, 14, 2.8, 2.3, 0.6, 0, 17.3, 0, 683, 2.7, 237],
      { al: ['Soybeans'], stmt: 'Water, soybeans, calcium sulfate.', pack: 12, cfg: 'case', by: 'u4' }, [['s9', 28.8, 7]]);
    add('Chickpeas, cooked', 'Plant Proteins', [164, 2.6, 0.3, 0, 0, 7, 27, 7.6, 4.8, 0, 8.9, 0, 49, 2.9, 291],
      { stmt: 'Chickpeas, water, salt.', pack: 6, cfg: 'case', uom: 'each', net: 2950 }, [['s2', 27, 48]]);
    add('Black Beans, cooked', 'Plant Proteins', [132, 0.5, 0.1, 0, 0, 1, 24, 8.7, 0.3, 0, 8.9, 0, 27, 2.1, 355],
      { stmt: 'Black beans, water, salt.', pack: 6, cfg: 'case', uom: 'each', net: 2950 }, [['s2', 25.5, 48]]);
    add('Cornstarch', 'Baking', [381, 0.1, 0, 0, 0, 9, 91, 0.9, 0, 0, 0.3, 0, 2, 0.5, 3],
      { stmt: 'Cornstarch.', pack: 50, cfg: 'bag' }, [['s4', 44, 130]]);
    add('Apple Cider Vinegar', 'Sauces & Condiments', [21, 0, 0, 0, 0, 5, 0.9, 0, 0.4, 0, 0, 0, 7, 0.2, 73],
      { stmt: 'Apple cider vinegar.', uom: 'gal', pack: 4, cfg: 'case', net: 3800 }, [['s2', 19.9, 160]]);
    add('Coconut Milk, canned', 'Sauces & Condiments', [197, 21, 19, 0, 0, 13, 2.8, 0, 1.6, 0, 2, 0, 18, 3.3, 220],
      { stmt: 'Coconut, water, guar gum.', pack: 6, cfg: 'case', uom: 'each', net: 2900 }, [['s9', null, 2, { notes: 'Waiting on new price list.' }]]);
    // needs-review examples: unknown nutrition values, unverified allergens, no supplier
    add('Vegetable Stock Base', 'Sauces & Condiments', [220, 9, 1.2, 0, 0, 14800, 30, 1.5, 12, 8, 4, null, null, null, null],
      { st: 'not_declared', stmt: 'Vegetables (carrot, onion, celery), salt, sugar, yeast extract, vegetable oil, natural flavor.', pack: 12, cfg: 'case', draft: true, by: 'u2', ago: 1 },
      [['s2', 64.8, 1, { spec: 'partial' }]]);
    add('Chicken Bouillon Paste', 'Sauces & Condiments', null,
      { st: 'not_declared', stmt: '', pack: 12, cfg: 'case', draft: true, by: 'u4', ago: 0.2 }, [['s2', null, 0.2, { spec: false }]]);
    add('Dark Chocolate Chips 60%', 'Baking', [500, 30, 18, null, 5, 10, 58, 7, 46, 46, 5, null, 50, 8, 560],
      { al: ['Milk', 'Soybeans'], stmt: 'Sugar, chocolate liquor, cocoa butter, milkfat, soy lecithin, vanilla.', pack: 25, draft: true, by: 'u2', ago: 3 }, []);
    // duplicate-check examples (same name as an existing item, same supplier / no supplier)
    add('Garlic, Peeled ', 'Produce', [149, 0.5, 0.1, 0, 0, 17, 33, 2.1, 1, 0, 6.4, 0, 181, 1.7, 401],
      { stmt: 'Garlic.', pack: 5, cfg: 'jar', draft: true, by: 'u2', ago: 4 }, [['s1', 23.1, 4]]);
    add('Canola oil', 'Oils & Fats', [884, 100, 7.4, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      { stmt: 'Canola oil.', pack: 35, cfg: 'jug', draft: true, by: 'u4', ago: 6 }, [['s2', 41, 6]]);
    // packaging
    add('12 oz Kraft Stand-Up Pouch', 'Packaging', null, { type: 'packaging', uom: 'each', pack: 1000, cfg: 'case', gross: 18 }, [['s7', 212, 45, { moq: '20 cases', lead: '4 weeks' }]]);
    add('8x8 Aluminum Foil Tray', 'Packaging', null, { type: 'packaging', uom: 'each', pack: 500, cfg: 'case', gross: 45 }, [['s7', 168, 70], ['s2', 175.5, 25]]);
    add('Corrugated Shipper, 12-count', 'Packaging', null, { type: 'packaging', uom: 'each', pack: 250, cfg: 'bundle', gross: 410 }, [['s7', 147.5, 210]]);
    add('Soy Sauce Packet 9 ml', 'Sauces & Condiments', [53, 0.6, 0.1, 0, 0, 5493, 4.9, 0.8, 0.4, 0, 8.1, 0, 33, 1.5, 435],
      { type: 'prepackaged_food', al: ['Soybeans', 'Wheat'], stmt: 'Water, wheat, soybeans, salt, sodium benzoate.', uom: 'packets', pack: 500, cfg: 'case', gross: 10 }, [['s9', 23.9, 52]]);

    // something already in the Recycle Bin, so the bin isn't empty on first look
    const gone = {
      id: 'i-old', code: 'ING-0900', name: 'Seafood Seasoning Blend', category: 'Spices & Seasonings', status: 'approved', itemType: 'food',
      n: N([210, 3, 0.2, 0, 0, 22000, 40, 12, 2, 0, 8, 0, 600, 20, 900]), allergens: [], allergenStatus: 'confirmed_none', allergenSources: {},
      statement: 'Salt, celery seed, mustard, paprika, spices.', uom: 'lbs', packQty: 5, packConfig: 'tub', netWeightG: null, grossWeightG: null,
      internalCode: '', qualityNotes: '', teaser: '', specSheets: [], currentSheetId: null, preferredSupplierId: 's6',
      createdAt: now - 500 * D, createdBy: 'u1', updatedAt: now - 100 * D, updatedBy: 'u1',
    };
    const goneQ = { id: 'q-old', ingredientId: 'i-old', supplierId: 's6', sku: 'S6-0900', price: 39.5, uom: 'lbs', packQty: 5, packConfig: 'tub', moq: '', leadTime: '',
      quoteDate: now - 100 * D, n: copy(gone.n), teaser: '', description: '', internalNotes: '', notes: '', createdAt: now - 100 * D };
    const bin = [
      { id: 'b1', kind: 'ingredient', name: gone.name, deletedAt: now - 69 * H, deletedBy: 'u2', expiresAt: now - 69 * H + BIN_HOURS * H, payload: { ingredient: gone, quotes: [goneQ] } },
    ];

    return { version: 1, people, suppliers, ingredients, categories: [], quotes, bin, seq };
  }

  db = load();
  db.categories = db.categories || [];

  /* ---------- helpers that build what screens see ---------- */
  function supplierRows(ingId) {
    const i = ing(ingId);
    const by = {};
    db.quotes.filter((q) => q.ingredientId === ingId).forEach((q) => {
      const r = by[q.supplierId] || (by[q.supplierId] = { supplierId: q.supplierId, quotes: [] });
      r.quotes.push(q);
    });
    return Object.values(by).map((r) => {
      r.quotes.sort((a, b) => b.quoteDate - a.quoteDate || (a.id < b.id ? -1 : 1));
      const s = sup(r.supplierId) || { name: 'Unknown supplier', color: '#9aa1b0' };
      const q = r.quotes[0];
      return {
        supplierId: r.supplierId, supplierName: s.name, supplierColor: s.color,
        preferred: !!i && i.preferredSupplierId === r.supplierId,
        quote: copy(q), quoteCount: r.quotes.length, hasNutrition: nComplete(q.n),
      };
    }).sort((a, b) => (b.preferred - a.preferred) || (b.quote.quoteDate - a.quote.quoteDate));
  }

  // the quote used for costing: preferred supplier's newest priced quote, else the newest priced quote
  function costQuote(rows) {
    const priced = rows.filter((r) => r.quote.price != null);
    return (priced.find((r) => r.preferred) || priced[0] || {}).quote || null;
  }

  function reviewIssues(i, rows) {
    const out = [];
    if (isFood(i)) {
      const miss = nMissing(i.n);
      if (miss) out.push(miss + ' nutrition value' + (miss > 1 ? 's' : '') + ' unknown');
      if (i.allergenStatus === 'not_declared' || !i.allergenStatus) out.push('Allergens not verified');
      if (!String(i.statement || '').trim()) out.push('No ingredient statement');
    }
    if (!rows.length) out.push('No supplier');
    else {
      const cq = costQuote(rows);
      if (!cq) out.push('No price yet');
      else if (Date.now() - cq.quoteDate > 180 * D) out.push('Price older than 6 months');
    }
    if (!out.length) out.push('Review required');
    return out;
  }

  function deco(i) {
    const rows = supplierRows(i.id);
    const o = copy(i);
    o.sources = rows;
    o.costQuote = costQuote(rows);
    o.issues = i.reviewedAt ? [] : reviewIssues(i, rows);
    o.updatedByPerson = copy(person(i.updatedBy));
    o.reviewedByPerson = i.reviewedBy ? copy(person(i.reviewedBy)) : null;
    o.currentSheet = copy(i.specSheets.find((s) => s.id === i.currentSheetId) || null);
    o.specSheets = o.specSheets.map((s) => { delete s.dataUrl; s.hasFile = !!(db.files && db.files[s.id]); return s; });
    if (o.currentSheet) { delete o.currentSheet.dataUrl; o.currentSheet.hasFile = !!(db.files && db.files[o.currentSheet.id]); }
    return o;
  }

  function touch(i) {
    i.updatedAt = Date.now(); i.updatedBy = ME;
    i.reviewedAt = null; i.reviewedBy = null; i.reviewerName = null;
    // Live: an editor's change awaits a manager's Reviewed or Undo (the database keeps the version before it)
    const p = person(ME);
    if (LIVE && p && p.role === 'editor' && !i.changeReview) i.changeReview = { id: null, action: 'changed', editors: [p.name], lastChangedAt: Date.now() };
  }

  /* ---------- ingredients ---------- */
  function listIngredients(f) {
    f = f || {};
    const q = norm(f.query);
    return db.ingredients.map(deco).filter((i) => {
      if (f.view === 'food' && i.itemType === 'packaging') return false;
      if (f.view === 'packaging' && i.itemType !== 'packaging') return false;
      if (f.view === 'review' && !i.issues.length) return false;
      if (f.view === 'changes' && !i.changeReview) return false; // an editor's change waiting for a manager
      if (f.category && i.category !== f.category && !(i.categoryIds || []).includes(f.category)) return false;
      if (f.allergens && f.allergens.length && !f.allergens.some((a) => i.allergens.includes(a))) return false;
      if (f.supplierId && !i.sources.some((r) => r.supplierId === f.supplierId)) return false;
      if (q && ![i.name, i.code, i.internalCode, ...i.sources.map((r) => r.quote.sku)].some((t) => norm(t).includes(q))) return false;
      return true;
    });
  }
  function counts() {
    const all = db.ingredients.map(deco);
    return {
      all: all.length, food: all.filter((i) => i.itemType !== 'packaging').length, packaging: all.filter((i) => i.itemType === 'packaging').length,
      review: all.filter((i) => i.issues.length).length, changes: all.filter((i) => i.changeReview).length,
      suppliers: db.suppliers.length, bin: listBin().length,
    };
  }
  function getIngredient(id) { const i = ing(id); return i ? deco(i) : null; }
  const distinct = (vals) => [...new Set(vals.filter((v) => v && String(v).trim()))].sort((a, b) => a.localeCompare(b));
  function categories() { return distinct(db.ingredients.map((i) => i.category)); }
  function supportsCategories() { return !LIVE || !!db.categoryFeature; }
  function customCategories() { return copy(db.categories).sort((a, b) => a.name.localeCompare(b.name)); }
  function createCategory(name, visibility) {
    if (!supportsCategories()) throw new Error('Categories are not available on this app version yet.');
    name = String(name || '').trim();
    if (!name || name.length > 100) throw new Error('Enter a category name (up to 100 characters).');
    if (!['private', 'shared'].includes(visibility)) throw new Error('Choose private or shared.');
    if (db.categories.some((c) => norm(c.name) === norm(name) && c.visibility === visibility && (visibility === 'shared' || c.ownerId === ME)))
      throw new Error('That category already exists.');
    const c = { id: uid('c'), name, visibility, ownerId: ME };
    db.categories.push(c);
    if (!save()) throw new Error('Could not save category.');
    return copy(c);
  }
  function updateCategory(id, data) {
    const c = db.categories.find((x) => x.id === id);
    if (!c || c.ownerId !== ME) throw new Error('Only the category creator can change it.');
    const name = String(data.name || '').trim();
    if (!name || name.length > 100) throw new Error('Enter a category name (up to 100 characters).');
    if (!['private', 'shared'].includes(data.visibility)) throw new Error('Choose private or shared.');
    if (db.categories.some((x) => x.id !== id && norm(x.name) === norm(name) && x.visibility === data.visibility && (data.visibility === 'shared' || x.ownerId === ME)))
      throw new Error('That category already exists.');
    c.name = name; c.visibility = data.visibility;
    if (!save()) throw new Error('Could not save category.');
  }
  function deleteCategory(id) {
    const c = db.categories.find((x) => x.id === id);
    if (!c || c.ownerId !== ME) throw new Error('Only the category creator can delete it.');
    db.categories = db.categories.filter((x) => x.id !== id);
    db.ingredients.forEach((i) => { i.categoryIds = (i.categoryIds || []).filter((x) => x !== id); });
    if (!save()) throw new Error('Could not delete category.');
  }
  function uoms() { return distinct([...STANDARD_UOMS, ...db.ingredients.map((i) => i.uom), ...db.quotes.map((q) => q.uom)]); }
  function packConfigs() { return distinct([...db.ingredients.map((i) => i.packConfig), ...db.quotes.map((q) => q.packConfig)]); }

  // Surface likely duplicates without treating different ingredients as definitely the same.
  function findByName(name, exceptId) {
    const key = (s) => norm(s).replace(/(\p{L})(\p{N})/gu, '$1 $2').replace(/(\p{N})(\p{L})/gu, '$1 $2')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const query = key(name);
    if (!query) return [];
    const words = query.split(' ');
    const numbers = (parts) => parts.filter((w) => /\p{N}/u.test(w)).sort().join(' ');
    const distance = (a, b) => {
      let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 0; i < a.length; i++) {
        const next = [i + 1];
        for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, prev[j + 1] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)));
        prev = next;
      }
      return prev[b.length];
    };
    return db.ingredients.flatMap((i) => {
      if (i.id === exceptId) return [];
      const candidate = key(i.name);
      const other = candidate.split(' ');
      if (numbers(words) !== numbers(other)) return [];
      const same = candidate === query;
      const reordered = words.length > 1 && words.length === other.length && [...words].sort().join(' ') === [...other].sort().join(' ');
      const [short, long] = words.length < other.length ? [words, other] : [other, words];
      const addedWord = short.length >= 2 && long.length === short.length + 1 && short.every((w) => long.includes(w));
      const typo = !same && !reordered && !addedWord && query.length >= 6 && Math.abs(query.length - candidate.length) <= 2 && distance(query, candidate) <= (query.length < 15 ? 1 : 2);
      if (!same && !reordered && !addedWord && !typo) return [];
      return [{ id: i.id, name: i.name, code: i.code, category: i.category, match: same ? 'Same name' : 'Similar name', rank: same ? 0 : reordered ? 1 : typo ? 2 : 3 }];
    }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).slice(0, 5);
  }

  const FIELDS = ['name', 'category', 'categoryIds', 'itemType', 'n', 'allergens', 'allergenStatus', 'allergenSources', 'statement', 'uom', 'packQty', 'packConfig',
    'netWeightG', 'grossWeightG', 'internalCode', 'qualityNotes', 'teaser'];
  function pick(data) { const o = {}; FIELDS.forEach((k) => { if (k in data) o[k] = copy(data[k]); }); return o; }

  function createIngredient(data) {
    db.seq = LIVE ? Math.max(0, ...db.ingredients.map((x) => Number((/^ING-(\d+)$/.exec(x.code) || [])[1]) || 0)) + 1
      : (db.seq || db.ingredients.length) + 1;
    const now = Date.now();
    const i = Object.assign({
      id: uid('i'), code: 'ING-' + String(db.seq).padStart(4, '0'), name: '', category: '', categoryIds: [], status: 'draft', itemType: 'food', n: blankN(),
      allergens: [], allergenStatus: 'not_declared', allergenSources: {}, statement: '', uom: '', packQty: null, packConfig: '',
      netWeightG: null, grossWeightG: null, internalCode: '', qualityNotes: '', teaser: '',
      specSheets: [], currentSheetId: null, preferredSupplierId: null, createdAt: now, createdBy: ME, updatedAt: now, updatedBy: ME,
    }, pick(data));
    i.name = i.name.trim();
    db.ingredients.push(i);
    save();
    return getIngredient(i.id);
  }
  function updateIngredient(id, data) {
    const i = ing(id); if (!i) return null;
    Object.assign(i, pick(data));
    if ('name' in data) i.name = i.name.trim();
    touch(i); save();
    return getIngredient(id);
  }
  async function reviewIngredient(id) {
    const i = ing(id); if (!i) throw new Error('Ingredient not found.');
    if (LIVE) {
      const res = await fetch('/api/pantry/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredientId: id }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save the review.');
      await sync();
      return;
    }
    const at = Date.now(), reviewer = person(ME);
    i.status = 'approved'; touch(i);
    i.reviewedAt = at; i.reviewedBy = ME; i.reviewerName = reviewer ? reviewer.name : 'You';
    i.reviewHistory = [{ id: uid('rv'), reviewedAt: at, reviewedBy: ME, reviewerName: i.reviewerName }, ...(i.reviewHistory || [])];
    save();
  }
  // An editor's change (Live, managers): Accept keeps it; Undo puts the ingredient, its prices and its categories back
  async function resolveChange(reviewId, undo) {
    const res = await fetch('/api/pantry/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId, undo }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || (undo ? 'Could not undo the change.' : 'Could not accept the change.'));
    await sync();
  }
  const undoChange = (reviewId) => resolveChange(reviewId, true);
  const acceptChange = (reviewId) => resolveChange(reviewId, false);
  function returnToReview(id) {
    const i = ing(id); if (!i) throw new Error('Ingredient not found.');
    i.status = 'draft';
    touch(i);
    save();
    return getIngredient(id);
  }

  /* ---------- spec sheets ---------- */
  async function addSpecSheet(ingId, file) {
    const i = ing(ingId); if (!i) return null;
    if (LIVE) {
      const prepared = await fetch('/api/pantry/spec-sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', ingredientId: ingId, supplierId: file.supplierId || null, fileName: file.fileName, size: file.size }) });
      const ready = await prepared.json();
      if (!prepared.ok) throw new Error(ready.error || 'Could not prepare the upload.');
      const form = new FormData();
      form.append('cacheControl', '3600');
      form.append('', file.file.slice(0, file.file.size, ready.contentType), file.fileName);
      const uploaded = await fetch(ready.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form });
      if (!uploaded.ok) throw new Error('Could not upload the spec sheet.');
      const attached = await fetch('/api/pantry/spec-sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach', ingredientId: ingId, supplierId: file.supplierId || null, sheet: ready.sheet }) });
      const done = await attached.json();
      if (!attached.ok) throw new Error(done.error || 'Could not attach the spec sheet.');
      i.specSheets.unshift(done.sheet);
      i.currentSheetId = done.sheet.id;
      touch(i);
      return { sheet: copy(done.sheet), stored: true };
    }
    const sh = { id: uid('sh'), fileName: file.fileName, uploadedAt: Date.now(), size: file.size || 0, supplierId: file.supplierId || null, details: null };
    i.specSheets.unshift(sh);
    i.currentSheetId = sh.id;
    let stored = false;
    if (file.dataUrl) {
      db.files = db.files || {};
      db.files[sh.id] = file.dataUrl;
      stored = save();
      if (!stored) { delete db.files[sh.id]; } // too big for this browser's storage: keep the name only
    }
    touch(i); save();
    return { sheet: copy(sh), stored };
  }
  function sheetFile(sheetId) {
    const sheet = db.ingredients.flatMap((i) => i.specSheets || []).find((s) => s.id === sheetId);
    return (sheet && sheet.url) || (db.files && db.files[sheetId]) || null;
  }
  function setCurrentSheet(ingId, sheetId) { const i = ing(ingId); if (!i) return; i.currentSheetId = sheetId; touch(i); save(); }

  /* ---------- suppliers ---------- */
  function listSuppliers() {
    return db.suppliers.map((s) => {
      const qs = db.quotes.filter((q) => q.supplierId === s.id);
      return Object.assign(copy(s), { quoteCount: qs.length, ingredientCount: new Set(qs.map((q) => q.ingredientId)).size });
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  function getSupplier(id) { return copy(sup(id)); }
  function saveSupplier(data, id) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Supplier name is required.');
    if (db.suppliers.some((s) => s.id !== id && norm(s.name) === norm(name))) throw new Error('A supplier named “' + name + '” already exists.');
    const keys = ['category', 'region', 'rep', 'email', 'phone', 'website', 'notes', 'color'];
    let s = id && sup(id);
    if (!s) { s = { id: uid('s'), createdAt: Date.now(), color: '#2f6fed' }; db.suppliers.push(s); }
    s.name = name;
    keys.forEach((k) => { if (k in data) s[k] = data[k]; });
    save();
    return copy(s);
  }

  /* ---------- quotes (ingredient_sources + price history) ---------- */
  function quoteHistory(ingId, supplierId) {
    return copy(db.quotes.filter((q) => q.ingredientId === ingId && q.supplierId === supplierId).sort((a, b) => b.quoteDate - a.quoteDate));
  }
  function getQuote(id) { return copy(db.quotes.find((q) => q.id === id)); }
  function saveQuote(data, id) {
    let q = id && db.quotes.find((x) => x.id === id);
    if (!q) {
      q = { id: uid('q'), ingredientId: data.ingredientId, supplierId: data.supplierId, n: null, teaser: '', description: '', internalNotes: '', createdAt: Date.now() };
      // a new price for a supplier keeps that supplier's spec nutrition and product profile
      const prev = quoteHistory(data.ingredientId, data.supplierId)[0];
      if (prev) Object.assign(q, { n: prev.n, teaser: prev.teaser, description: prev.description, internalNotes: prev.internalNotes });
      db.quotes.push(q);
      const i = ing(data.ingredientId);
      if (i && !i.preferredSupplierId) i.preferredSupplierId = data.supplierId;
    }
    ['supplierId', 'sku', 'price', 'uom', 'packQty', 'packConfig', 'moq', 'leadTime', 'quoteDate', 'notes', 'n', 'teaser', 'description', 'internalNotes']
      .forEach((k) => { if (k in data) q[k] = copy(data[k]); });
    if (q.quoteDate == null) q.quoteDate = Date.now();
    const i = ing(q.ingredientId); if (i) touch(i);
    save();
    return copy(q);
  }
  function setPreferred(ingId, supplierId) { const i = ing(ingId); if (!i) return; i.preferredSupplierId = supplierId; touch(i); save(); }

  /* ---------- Recycle Bin (72 hours, like Raw Materials) ---------- */
  function toBin(kind, name, payload) {
    const now = Date.now();
    const item = { id: uid('b'), kind, name, deletedAt: now, deletedBy: ME, expiresAt: now + BIN_HOURS * H, payload };
    db.bin.push(item);
    return item.id;
  }
  function recycleIngredient(id) {
    const i = ing(id); if (!i) return null;
    const qs = db.quotes.filter((q) => q.ingredientId === id);
    const files = {};
    i.specSheets.forEach((s) => { if (db.files && db.files[s.id]) files[s.id] = db.files[s.id]; });
    const binId = toBin('ingredient', i.name, { ingredient: copy(i), quotes: copy(qs), files });
    db.ingredients = db.ingredients.filter((x) => x.id !== id);
    db.quotes = db.quotes.filter((q) => q.ingredientId !== id);
    if (db.files) Object.keys(files).forEach((k) => delete db.files[k]);
    save();
    return { binId, wholeIngredient: true };
  }
  // one supplier row = all of that supplier's quotes for the ingredient. Last row → the whole ingredient goes.
  function recycleSupplierRow(ingId, supplierId) {
    const i = ing(ingId); if (!i) return null;
    const mine = db.quotes.filter((q) => q.ingredientId === ingId && q.supplierId === supplierId);
    const others = db.quotes.filter((q) => q.ingredientId === ingId && q.supplierId !== supplierId);
    if (!others.length) return recycleIngredient(ingId);
    const s = sup(supplierId);
    const binId = toBin('quotes', i.name + ' — ' + (s ? s.name : 'supplier'), { ingredientId: ingId, supplierId, wasPreferred: i.preferredSupplierId === supplierId, quotes: copy(mine) });
    db.quotes = db.quotes.filter((q) => !mine.includes(q));
    if (i.preferredSupplierId === supplierId) i.preferredSupplierId = (supplierRows(ingId).find((r) => r.quote.price != null) || supplierRows(ingId)[0] || {}).supplierId || null;
    touch(i); save();
    return { binId, wholeIngredient: false };
  }
  // one older price record (from the price history); the newest one is removed through the row
  function recycleQuote(quoteId) {
    const q = db.quotes.find((x) => x.id === quoteId); if (!q) return null;
    const sameSupplier = db.quotes.filter((x) => x.ingredientId === q.ingredientId && x.supplierId === q.supplierId);
    if (sameSupplier.length === 1) return recycleSupplierRow(q.ingredientId, q.supplierId);
    const i = ing(q.ingredientId), s = sup(q.supplierId);
    const binId = toBin('quotes', (i ? i.name : 'Ingredient') + ' — ' + (s ? s.name : 'supplier') + ' price', { ingredientId: q.ingredientId, supplierId: q.supplierId, wasPreferred: false, quotes: [copy(q)] });
    db.quotes = db.quotes.filter((x) => x !== q);
    if (i) touch(i);
    save();
    return { binId, wholeIngredient: false };
  }
  function recycleSpecSheet(ingId, sheetId) {
    const i = ing(ingId); if (!i) return null;
    const sh = i.specSheets.find((s) => s.id === sheetId); if (!sh) return null;
    const file = db.files && db.files[sheetId];
    const binId = toBin('spec_sheet', sh.fileName + ' (' + i.name + ')', { ingredientId: ingId, ingredientName: i.name, sheet: copy(sh), wasCurrent: i.currentSheetId === sheetId, file: file || null });
    i.specSheets = i.specSheets.filter((s) => s !== sh);
    if (i.currentSheetId === sheetId) i.currentSheetId = null;
    if (file) delete db.files[sheetId];
    touch(i); save();
    return { binId };
  }
  function recycleSupplier(id) {
    const s = sup(id); if (!s) return { error: 'Supplier not found.' };
    const used = new Set(db.quotes.filter((q) => q.supplierId === id).map((q) => q.ingredientId)).size;
    if (used) return { error: 'Can’t delete — ' + s.name + ' is attached to ' + used + ' ingredient' + (used > 1 ? 's' : '') + '. Remove it from those first.' };
    const binId = toBin('supplier', s.name, { supplier: copy(s) });
    db.suppliers = db.suppliers.filter((x) => x !== s);
    save();
    return { binId };
  }

  function purgeExpired() {
    const now = Date.now();
    const before = db.bin.length;
    db.bin = db.bin.filter((b) => b.expiresAt > now);
    if (db.bin.length !== before) save();
  }
  const KIND_LABEL = { ingredient: 'Ingredient with its supplier rows and spec sheets', quotes: 'Supplier row and price history', spec_sheet: 'Spec sheet', supplier: 'Supplier' };
  function listBin() {
    purgeExpired();
    return db.bin.slice().sort((a, b) => b.deletedAt - a.deletedAt).map((b) => ({
      id: b.id, kind: b.kind, kindLabel: KIND_LABEL[b.kind] || b.kind, name: b.name, deletedAt: b.deletedAt, expiresAt: b.expiresAt, deletedBy: copy(person(b.deletedBy)),
    }));
  }
  // Same rules as Raw Materials: never overwrite, restore parents first, report why.
  function restore(binId) {
    purgeExpired();
    const b = db.bin.find((x) => x.id === binId);
    if (!b) return { ok: false, message: 'This item is no longer in the Recycle Bin (it may have expired).' };
    const p = b.payload;
    if (b.kind === 'ingredient') {
      if (ing(p.ingredient.id)) return { ok: false, message: 'The original ingredient is already active. Your saved copy is still in the Recycle Bin; nothing was overwritten.' };
      const clash = db.ingredients.find((i) => i.name.trim().toLocaleLowerCase() === p.ingredient.name.trim().toLocaleLowerCase());
      if (clash) return { ok: false, message: 'Another ingredient already uses the name “' + clash.name + '”. Rename that ingredient, then restore this saved copy. Nothing was overwritten.' };
      const missing = [...new Set(p.quotes.map((q) => q.supplierId))].filter((sid) => !sup(sid));
      if (missing.length) return { ok: false, message: 'Restore its supplier first (it is in the Recycle Bin too), then restore this ingredient.' };
      db.ingredients.push(p.ingredient);
      db.quotes.push(...p.quotes);
      if (p.files) { db.files = db.files || {}; Object.assign(db.files, p.files); }
    } else if (b.kind === 'quotes') {
      const i = ing(p.ingredientId);
      if (!i) return { ok: false, message: 'Restore the ingredient first, then restore this supplier row.' };
      if (!sup(p.supplierId)) return { ok: false, message: 'Restore the supplier first, then restore this supplier row.' };
      if (p.quotes.some((q) => db.quotes.some((x) => x.id === q.id))) return { ok: false, message: 'These prices are already active. Nothing was overwritten.' };
      db.quotes.push(...p.quotes);
      if (p.wasPreferred) i.preferredSupplierId = p.supplierId;
      touch(i);
    } else if (b.kind === 'spec_sheet') {
      const i = ing(p.ingredientId);
      if (!i) return { ok: false, message: 'Restore the ingredient first, then restore this spec sheet.' };
      i.specSheets.unshift(p.sheet);
      if (p.wasCurrent && !i.currentSheetId) i.currentSheetId = p.sheet.id;
      if (p.file) { db.files = db.files || {}; db.files[p.sheet.id] = p.file; }
      touch(i);
    } else if (b.kind === 'supplier') {
      if (db.suppliers.some((s) => s.id === p.supplier.id || norm(s.name) === norm(p.supplier.name))) return { ok: false, message: 'An active supplier already uses this name. Nothing was overwritten.' };
      db.suppliers.push(p.supplier);
    }
    db.bin = db.bin.filter((x) => x !== b);
    save();
    return { ok: true, message: b.name + ' restored.' };
  }
  function purge(binId) { db.bin = db.bin.filter((x) => x.id !== binId); save(); }

  /* ---------- duplicate check (same rules as Raw Materials, no AI) ---------- */
  function duplicateReport() {
    const groups = {};
    db.ingredients.forEach((i) => {
      const nk = norm(i.name); if (!nk) return;
      const rows = supplierRows(i.id);
      const recs = rows.length ? rows.map((r) => ({ supplierKey: norm(r.supplierName) || r.supplierId, row: r })) : [{ supplierKey: null, row: null }];
      recs.forEach(({ supplierKey, row }) => {
        const key = nk + '|' + (supplierKey ? 'supplier|' + supplierKey : 'no-supplier');
        const g = groups[key] || (groups[key] = { key, name: i.name.trim(), supplierName: row ? row.supplierName : null, rows: [] });
        g.rows.push({ ingredientId: i.id, name: i.name, code: i.code, category: i.category, status: i.status, source: row ? copy(row) : null });
      });
    });
    return Object.values(groups).filter((g) => g.rows.length > 1)
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.supplierName).localeCompare(String(b.supplierName)));
  }

  /* ---------- money ---------- */
  function perUom(q) { return q && q.price != null && q.packQty > 0 ? q.price / q.packQty : null; }
  function perKg(q, i) {
    if (!q || q.price == null || !(q.price > 0)) return null;
    const per = q.price / (q.packQty || 1);
    let g = UNIT_TO_G[q.uom];
    if (!g && i && i.netWeightG) g = i.netWeightG; // count units with a known net weight
    return g ? per / g * 1000 : null;
  }

  /* ---------- misc ---------- */
  function pref(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(PREF + k));
      localStorage.setItem(PREF + k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function reset() { if (LIVE) return; db = seed(); save(); }
  function me() { return copy(person(ME)); }


  /* ---------- Live: the database (/api/pantry) ----------
     shortcut: saving is a synchronous request so the screens' simple synchronous store calls keep working; fine for a
     prototype. What was last loaded or saved is remembered per item; save() sends only the differences. */
  const COLLECTIONS = { category: 'categories', ingredient: 'ingredients', supplier: 'suppliers', quote: 'quotes', bin: 'bin' };
  let synced = null; // { ingredient: Map(id -> JSON), ... }
  // an ingredient also tells the Recipe Builder its supplier and cost per kg (Pantry's costing rule)
  function forServer(t, x) {
    if (t !== 'ingredient') return x;
    const cq = costQuote(supplierRows(x.id));
    const s = cq && sup(cq.supplierId);
    return Object.assign({}, x, { vendor: s ? s.name : null, pricePerKg: cq ? perKg(cq, x) : null });
  }
  function snapshot() {
    const out = {};
    Object.entries(COLLECTIONS).forEach(([t, key]) => { out[t] = new Map(db[key].map((x) => [x.id, JSON.stringify(forServer(t, x))])); });
    return out;
  }
  function push() {
    if (!synced) return true; // still loading: nothing to compare with yet
    const now = snapshot(), ops = [];
    Object.keys(COLLECTIONS).forEach((t) => {
      now[t].forEach((json, id) => {
        if (synced[t].get(id) === json) return;
        const v = JSON.parse(json);
        if (t === 'ingredient') {
          const before = new Set(synced[t].has(id) ? JSON.parse(synced[t].get(id)).categoryIds || [] : []);
          const after = new Set(v.categoryIds || []);
          v.categoryAddIds = [...after].filter((x) => !before.has(x));
          v.categoryRemoveIds = [...before].filter((x) => !after.has(x));
          delete v.categoryIds; // never put private assignments in the shared ingredient row
        }
        ops.push({ t, op: 'put', v });
      });
      synced[t].forEach((_, id) => { if (!now[t].has(id)) ops.push({ t, op: 'del', id }); });
    });
    if (!ops.length) return true;
    const x = new XMLHttpRequest();
    x.open('POST', '/api/pantry', false);
    x.setRequestHeader('Content-Type', 'application/json');
    try { x.send(JSON.stringify({ ops })); } catch (e) { /* offline */ }
    if (x.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return false; }
    if (x.status >= 200 && x.status < 300) { synced = now; return true; }
    let msg = 'Not saved: the server did not accept that change.';
    try { msg = 'Not saved: ' + JSON.parse(x.responseText).error; } catch (e) { if (!x.status) msg = 'Not saved: no connection. Check your internet and try again.'; }
    // put the screen back to what the database has
    sync().then(() => { if (window.NL && NL.toast) NL.toast(msg); });
    return false;
  }
  const PAL = ['#2f6fed', '#e8590c', '#0f766e', '#7c5cff', '#c2255c', '#5c940d', '#b08800', '#1971c2'];
  const initials = (name) => String(name).replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  async function sync() {
    let s;
    try {
      const res = await fetch('/api/pantry', { cache: 'no-store' });
      if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
      if (res.status === 403) { noAccess('Pantry'); return; }
      if (!res.ok) return;
      s = await res.json();
    } catch (e) { return; } // offline: keep what we have
    ME = s.me.id;
    db = {
      version: 1, seq: 0, files: db.files,
      // your own entry uses your Pantry level (s.me.role), not your organization role, so Pantry managers see Reviewed
      people: s.people.map((p, k) => ({ id: p.id, name: p.name, email: p.email, role: p.id === ME ? s.me.role : p.role, title: p.role, initials: initials(p.name), color: PAL[k % PAL.length] })),
      ingredients: s.ingredients, categories: s.categories || [], categoryFeature: Array.isArray(s.categories), suppliers: s.suppliers, quotes: s.quotes, bin: s.bin,
    };
    if (!person(ME)) db.people.push({ id: ME, name: 'You', email: '', role: s.me.role, title: s.me.role, initials: 'Y', color: PAL[0] });
    synced = snapshot();
    if (window.NL && NL.app) NL.app.refresh();
  }

  // Live: who may use this app is set on the Members page; without access, show a short message instead of the app
  function noAccess(app) {
    const show = () => {
      document.body.innerHTML = '<main style="max-width:520px;margin:15vh auto;padding:24px;font:15px/1.5 system-ui,sans-serif">' +
        '<h1 style="font-size:22px;margin:0 0 8px">No access to ' + app + '</h1>' +
        '<p style="margin:0 0 16px;color:#667085">Ask an administrator to give you access on the Members page.</p>' +
        '<a href="/" style="font-weight:600">← Home</a></main>';
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
  }
  if (LIVE) {
    sync();
    // back to the tab: show what others (or the Recipe Builder, or an import) changed meanwhile
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  }

  window.store = {
    /** Live (clean) or Playground (demo data); see LIVE at the top */
    isLive: LIVE,
    NUTRIENTS, ALLERGENS, TREE_NUTS, WEIGHT_UOMS, UNIT_TO_G, SUPPLIER_CATEGORIES, ITEM_TYPES, BIN_HOURS,
    me, listIngredients, counts, getIngredient, categories, supportsCategories, customCategories, createCategory, updateCategory, deleteCategory, uoms, packConfigs, findByName,
    createIngredient, updateIngredient, reviewIngredient, returnToReview, undoChange, acceptChange,
    addSpecSheet, sheetFile, setCurrentSheet, recycleSpecSheet,
    listSuppliers, getSupplier, saveSupplier, recycleSupplier,
    quoteHistory, getQuote, saveQuote, setPreferred, recycleQuote, recycleSupplierRow, recycleIngredient,
    listBin, restore, purge, duplicateReport,
    perUom, perKg, nMissing, nComplete, pref, reset,
  };
})();
