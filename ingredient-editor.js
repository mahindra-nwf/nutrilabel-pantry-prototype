/* ingredient-editor.js — Add / Edit ingredient dialog: basics, supplier & price, item type and weights,
   statement, Big 9 allergens, nutrition per 100 g, spec sheet. Same fields and checks as the Raw Materials editor. */
(function () {
  const { el, field } = NL;

  function open(id, opts = {}) {
    const existing = id ? store.getIngredient(id) : null;
    // which item types fit: Food tab (or a food item) → Food / Prepackaged Food; Packaging → Packaging only; elsewhere → all
    const kind = existing ? (existing.itemType === 'packaging' ? 'packaging' : 'food') : opts.kind || null;
    const types = store.ITEM_TYPES.filter((t) => !kind || (kind === 'packaging' ? t.key === 'packaging' : t.key !== 'packaging'));
    const noun = { food: 'ingredient', packaging: 'packaging' }[kind] || 'item';
    const i = existing || { name: '', category: kind === 'packaging' ? 'Packaging' : '', itemType: types[0].key, n: Object.fromEntries(store.NUTRIENTS.map((x) => [x.key, null])), allergens: [], allergenStatus: 'not_declared',
      allergenSources: {}, statement: '', uom: kind === 'packaging' ? 'each' : 'lbs', packQty: null, packConfig: '', netWeightG: null, grossWeightG: null, internalCode: '', sources: [] };
    const startSupplier = opts.supplierId || (existing && existing.sources[0] && existing.sources[0].supplierId) || '';
    let dupAck = false;         // "I checked; continue with a separate ingredient"
    let staged = null;          // spec-sheet file to add on save
    const al = new Set(i.allergens);
    const alSrc = JSON.parse(JSON.stringify(i.allergenSources || {}));
    let alStatus = i.allergenStatus || (al.size ? 'declared' : 'not_declared');

    /* --- basics --- */
    const name = el('input.txt', { value: i.name, placeholder: 'e.g. Chicken Breast, raw', maxLength: 200 });
    const cat = NL.combo(i.category, store.categories(), { placeholder: 'Select or type new…' });
    const selectedCategories = new Set(i.categoryIds || []);
    const categoryBox = el('div');
    const categoryName = el('input.txt', { maxLength: 100, placeholder: 'New category name', 'aria-label': 'New category name' });
    const categoryVisibility = el('select.txt', { 'aria-label': 'Who can see this category' },
      el('option', { value: 'private' }, 'Private — only me'), el('option', { value: 'shared' }, 'Shared — everyone in Pantry'));
    const categoryError = el('div.pt-error', { role: 'alert' });
    function renderCategories() {
      const items = store.customCategories();
      NL.fill(categoryBox, items.length ? items.map((c) => el('div.pt-category-choice', {},
        el('label.pt-check', {}, el('input', { type: 'checkbox', checked: selectedCategories.has(c.id), onchange: (e) => {
          e.target.checked ? selectedCategories.add(c.id) : selectedCategories.delete(c.id);
        } }), c.name + (c.visibility === 'private' ? ' · Private' : ' · Shared')),
        c.ownerId === store.me().id ? el('button.btn.ghost.sm', { type: 'button', onclick: () => editCategory(c) }, 'Edit') : null))
        : el('p.faint', {}, 'No custom categories yet.'));
    }
    async function editCategory(c) {
      const editName = el('input.txt', { value: c.name, maxLength: 100 });
      const editVisibility = el('select.txt', {},
        el('option', { value: 'private', selected: c.visibility === 'private' }, 'Private — only me'),
        el('option', { value: 'shared', selected: c.visibility === 'shared' }, 'Shared — everyone in Pantry'));
      const error = el('div.pt-error', { role: 'alert' });
      const dialog = NL.modal('Edit category', el('div.pt-form', {}, field('Name', editName), field('Visibility', editVisibility), error), [
        el('button.btn.danger-txt', { onclick: async () => {
          if (!await NL.confirm('Delete category?', 'Remove “' + c.name + '” from all ingredients?', { ok: 'Delete category', danger: true })) return;
          try { store.deleteCategory(c.id); selectedCategories.delete(c.id); dialog.close(); renderCategories(); NL.toast('Category deleted.'); }
          catch (e) { error.textContent = e.message; }
        } }, 'Delete'),
        el('button.btn', { onclick: () => dialog.close() }, 'Cancel'),
        el('button.btn.primary', { onclick: async () => {
          if (c.visibility === 'private' && editVisibility.value === 'shared' &&
            !await NL.confirm('Share this category?', 'Everyone with Pantry access will see this category and the ingredients you put in it.', { ok: 'Share category' })) return;
          try { store.updateCategory(c.id, { name: editName.value, visibility: editVisibility.value }); dialog.close(); renderCategories(); NL.toast('Category updated.'); }
          catch (e) { error.textContent = e.message; }
        } }, 'Save category'),
      ], { cls: 'small' });
    }
    renderCategories();
    const internal = el('input.txt', { value: i.internalCode || '', placeholder: 'Your own tracking code, if used' });
    const typeRadios = el('div.pt-radios', {}, types.map((t) => el('label.pt-radio', {},
      el('input', { type: 'radio', name: 'itemType', value: t.key, checked: i.itemType === t.key, onchange: () => sync() }),
      el('span', {}, el('b', {}, t.label), el('span.faint', {}, t.hint)))));
    const itemType = () => typeRadios.querySelector('input:checked').value;

    /* --- supplier & price --- */
    const suppliers = store.listSuppliers();
    const supSel = el('select.txt', { onchange: () => { prefillQuote(); sync(); } },
      el('option', { value: '' }, '— No supplier (optional) —'),
      suppliers.map((s) => el('option', { value: s.id, selected: s.id === startSupplier }, s.name)));
    const packQty = el('input.txt', { type: 'number', min: 0, step: 'any', placeholder: '30', value: i.packQty ?? '' });
    const uom = NL.combo(i.uom, store.uoms(), { placeholder: 'lbs, each, cases…' });
    const cfg = NL.combo(i.packConfig, store.packConfigs(), { placeholder: 'case, drum, pail…' });
    const sku = el('input.txt', { placeholder: 'Supplier item number' });
    const price = el('input.txt', { type: 'number', min: 0, step: '0.0001', placeholder: '0.00' });
    const perUom = el('div.pt-calc');
    const supHint = el('span.pt-hint');
    const netW = el('input.txt', { type: 'number', min: 0, step: 'any', value: i.netWeightG ?? '' });
    const grossW = el('input.txt', { type: 'number', min: 0, step: 'any', value: i.grossWeightG ?? '' });
    const netField = field('Net weight per unit (g)', netW, 'Grams in one unit, so cost per kg and nutrition can be worked out.');
    const grossField = field('Gross weight per unit (g) *', grossW, 'Required for packaging and prepackaged food.');

    function latestQuote(sid) { return sid && existing ? store.quoteHistory(existing.id, sid)[0] || null : null; }
    function prefillQuote() {
      const q = latestQuote(supSel.value);
      sku.value = q ? q.sku || '' : '';
      price.value = q && q.price != null ? q.price : '';
      if (q) { packQty.value = q.packQty ?? ''; uom.input.value = q.uom || ''; cfg.input.value = q.packConfig || ''; }
    }
    prefillQuote();

    /* --- statement + allergens --- */
    const stmt = el('textarea.txt', { rows: 3, placeholder: 'As printed on the supplier label, e.g. “Water, wheat, soybeans, salt.”' }, i.statement || '');
    const alBox = el('div');
    function renderAllergens() {
      const none = el('label.pt-check', {}, el('input', { type: 'checkbox', checked: alStatus === 'confirmed_none', disabled: al.size > 0,
        onchange: (e) => { alStatus = e.target.checked ? 'confirmed_none' : 'not_declared'; renderAllergens(); sync(); } }), 'No Big 9 allergens — confirmed from source information');
      NL.fill(alBox,
        alStatus === 'not_declared' && !al.size ? el('p.pt-note.warn', {}, 'Needs review — allergen information is not declared or has not been verified. Unchecked boxes do not mean allergen-free.') : null,
        !al.size ? none : null,
        el('div.pt-al-grid', {}, store.ALLERGENS.map((a) => el('label.pt-check', {}, el('input', { type: 'checkbox', checked: al.has(a), onchange: (e) => {
          if (e.target.checked) al.add(a); else { al.delete(a); delete alSrc[a]; }
          alStatus = al.size ? 'declared' : 'not_declared';
          renderAllergens(); sync();
        } }), a))),
        al.has('Tree Nuts') ? el('div.pt-al-sub', {}, el('span.pt-label', {}, 'Which tree nuts? (required for labeling)'),
          el('div.pt-al-grid', {}, store.TREE_NUTS.map((t) => el('label.pt-check', {}, el('input', { type: 'checkbox', checked: (alSrc['Tree Nuts'] || []).includes(t), onchange: (e) => {
            const s = new Set(alSrc['Tree Nuts'] || []); e.target.checked ? s.add(t) : s.delete(t); alSrc['Tree Nuts'] = [...s];
          } }), t)))) : null,
        ['Fish', 'Shellfish'].filter((a) => al.has(a)).map((a) => field(a + ' species', el('input.txt', { value: alSrc[a] || '', placeholder: a === 'Fish' ? 'e.g. Atlantic salmon' : 'e.g. White shrimp', oninput: (e) => { alSrc[a] = e.target.value; } }))));
    }
    renderAllergens();

    /* --- nutrition --- */
    const nIn = {};
    const nGrid = el('div.pt-nut-edit.two', {}, store.NUTRIENTS.map((x) => {
      nIn[x.key] = el('input.txt.num-in', { type: 'number', min: 0, step: 'any', placeholder: 'Unknown', value: i.n[x.key] ?? '', oninput: () => sync() });
      return el('label.ind' + x.indent, {}, el('span', {}, x.label + ' (' + x.unit + ')'), nIn[x.key]);
    }));
    const nNotes = el('div');
    const readN = () => Object.fromEntries(store.NUTRIENTS.map((x) => [x.key, NL.readNum(nIn[x.key].value)]));

    /* --- spec sheet --- */
    const specBox = el('div');
    function renderSpec() {
      const cur = existing && existing.currentSheet;
      NL.fill(specBox,
        staged ? el('div.pt-file', {}, '📄 ' + staged.fileName + ' · ' + NL.kb(staged.size) + (staged.dataUrl ? '' : ' (name only)'), el('button.btn.ghost.sm', { onclick: () => { staged = null; renderSpec(); } }, '✕'))
          : cur ? el('div.pt-file', {}, '📄 ' + cur.fileName + ' · uploaded ' + NL.date(cur.uploadedAt)) : el('p.faint', {}, 'No spec sheet yet.'),
        el('button.btn.sm', { onclick: async () => { const f = await NL.specFiles.pickFile(); if (f) { staged = f; renderSpec(); } } }, staged || cur ? 'Upload a newer version' : '⇪ Upload spec sheet'),
        el('p.pt-hint', {}, 'PDF, images, Word or Excel. Kept as a new version; older versions stay in the history. (Prototype: files over 1.5 MB keep their name only.)'));
    }
    renderSpec();

    /* --- duplicate name + errors --- */
    const dupBox = el('div');
    const errBox = el('div.pt-error', { role: 'alert' });

    /* --- sections that depend on type / supplier --- */
    const foodOnly = el('div', {},
      el('h3.pt-form-h', {}, 'Ingredient statement'), stmt,
      el('h3.pt-form-h', {}, 'Allergens (Big 9)'), alBox,
      el('h3.pt-form-h', {}, 'Nutrition per 100 g'), nNotes, nGrid);

    function sync() {
      const t = itemType();
      const food = t !== 'packaging';
      name.placeholder = t === 'packaging' ? 'e.g. 12 oz Pouch, Cardboard Box' : 'e.g. Chicken Breast, raw';
      foodOnly.hidden = !food;
      grossField.hidden = t === 'food';
      netField.hidden = !(t === 'food' && !store.WEIGHT_UOMS.includes(uom.input.value.trim()));
      sku.disabled = !supSel.value;
      // price per unit
      const p = Number(price.value), qn = Number(packQty.value);
      perUom.textContent = p > 0 && qn > 0 ? NL.money(p / qn, 4) + ' / ' + (uom.input.value || 'unit') : '—';
      // supplier hint
      const has = existing && existing.sources.some((r) => r.supplierId === supSel.value);
      supHint.textContent = !supSel.value ? (existing && existing.sources.length ? 'Clearing this field doesn’t remove a supplier — use Remove supplier in Details.' : 'Optional. You can add suppliers and prices later.')
        : has ? 'Already a supplier for this ingredient. A changed price is saved as a new price record dated today.'
        : 'This supplier will be added when you save. Price is optional (“pricing pending”).';
      // nutrition notes
      if (food) {
        const n = readN();
        const miss = store.nMissing(n);
        const warn = [];
        const v = (k) => n[k] || 0;
        if (v('sat_fat') + v('trans_fat') > v('fat') + 0.001) warn.push('Saturated + trans fat is more than total fat.');
        if (v('add_sug') > v('sugars') + 0.001) warn.push('Added sugars are more than total sugars.');
        if (v('fiber') > v('carbs') + 0.001) warn.push('Fiber is more than total carbohydrate.');
        NL.fill(nNotes,
          miss ? el('p.pt-note.warn', {}, 'Needs review — ' + miss + ' nutrition value' + (miss > 1 ? 's are' : ' is') + ' unknown. You can save now; label generation needs them resolved. Enter 0 only if the value is known to be zero.') : null,
          warn.map((w) => el('p.pt-note', {}, '⚠ ' + w)));
      }
      // duplicate name (new ingredients, or a rename onto another name)
      const matches = (!existing || name.value.trim().toLocaleLowerCase() !== existing.name.trim().toLocaleLowerCase()) ? store.findByName(name.value, existing && existing.id) : [];
      NL.fill(dupBox, matches.length && !dupAck ? el('div.pt-note.warn', {},
        el('b', {}, 'An ingredient with this name already exists:'),
        el('ul', {}, matches.map((m) => el('li', {}, m.name + ' (' + m.code + (m.category ? ', ' + m.category : '') + ')'))),
        el('p', {}, 'Check the existing ingredient before creating another one.'),
        el('button.btn.sm', { onclick: () => { dupAck = true; sync(); } }, 'I checked; continue with a separate ingredient')) : null);
      saveBtn.disabled = !name.value.trim() || (matches.length > 0 && !dupAck);
    }
    name.addEventListener('input', () => { dupAck = false; sync(); });
    [packQty, price].forEach((x) => x.addEventListener('input', sync));
    uom.input.addEventListener('input', sync);

    /* --- save --- */
    async function doSave() {
      errBox.textContent = '';
      const t = itemType();
      const food = t !== 'packaging';
      if (!name.value.trim()) return (errBox.textContent = 'Name is required.');
      const gross = NL.readNum(grossW.value);
      if (t !== 'food' && !(gross > 0)) return (errBox.textContent = 'Enter a gross weight greater than 0.');
      const priceV = NL.readNum(price.value);
      const qtyV = NL.readNum(packQty.value);
      const sid = supSel.value;

      // switching to a new supplier when others exist: replace or keep both (Raw Materials asks the same)
      let replace = false;
      if (existing && sid && existing.sources.length && !existing.sources.some((r) => r.supplierId === sid)) {
        const newName = suppliers.find((s) => s.id === sid).name;
        const oldNames = existing.sources.map((r) => r.supplierName).join(', ');
        const choice = await new Promise((resolve) => {
          let v = null;
          const m = NL.modal('Add or switch supplier?', el('p.pt-confirm-text', {}, 'This ingredient already has prices from ' + oldNames + '. Add ' + newName + ' as another supplier, or replace? Replacing moves the old supplier rows and their price history to the Recycle Bin for 3 days.'), [
            el('button.btn', { onclick: () => m.close() }, 'Cancel'),
            el('button.btn', { onclick: () => { v = 'replace'; m.close(); } }, 'Replace with ' + newName),
            el('button.btn.primary', { onclick: () => { v = 'keep'; m.close(); } }, 'Keep both'),
          ], { cls: 'small', onClose: () => resolve(v) });
        });
        if (!choice) return;
        replace = choice === 'replace';
      }

      const data = {
        name: name.value, category: cat.input.value.trim(), categoryIds: [...selectedCategories], itemType: t, internalCode: internal.value.trim(),
        uom: uom.input.value.trim(), packQty: qtyV, packConfig: cfg.input.value.trim(),
        netWeightG: t === 'food' && !store.WEIGHT_UOMS.includes(uom.input.value.trim()) ? NL.readNum(netW.value) : null,
        grossWeightG: t !== 'food' ? gross : null,
        statement: food ? stmt.value.trim() : '',
        allergens: food ? [...al] : [], allergenSources: food ? alSrc : {}, allergenStatus: food ? alStatus : null,
        n: food ? readN() : Object.fromEntries(store.NUTRIENTS.map((x) => [x.key, 0])),
      };
      const saved = existing ? store.updateIngredient(existing.id, data) : store.createIngredient(data);

      if (sid) {
        const last = latestQuote(sid);
        const qd = { ingredientId: saved.id, supplierId: sid, sku: sku.value.trim(), uom: data.uom, packQty: qtyV, packConfig: data.packConfig };
        if (!last) store.saveQuote(Object.assign(qd, { price: priceV, quoteDate: Date.now(), n: food && store.nMissing(data.n) < store.NUTRIENTS.length ? data.n : null }));
        else if (priceV !== last.price || qtyV !== last.packQty || data.uom !== last.uom) store.saveQuote(Object.assign(qd, { price: priceV, quoteDate: Date.now() }));
        else store.saveQuote({ sku: qd.sku, packConfig: qd.packConfig }, last.id);
        if (replace) existing.sources.forEach((r) => store.recycleSupplierRow(saved.id, r.supplierId));
        if (replace || !existing || !existing.sources.length) store.setPreferred(saved.id, sid);
      }
      if (staged) store.addSpecSheet(saved.id, Object.assign(staged, { supplierId: sid || null }));
      m.close();
      NL.toast(existing ? 'Ingredient saved.' : saved.name + ' added as a draft.');
      opts.onSaved && opts.onSaved(saved, sid || null);
      NL.app.refresh();
    }

    const saveBtn = el('button.btn.primary', { onclick: doSave }, existing ? 'Save changes' : 'Add ' + noun);
    const body = el('div.pt-form', {},
      dupBox,
      el('div.pt-form-row', {},
        el('div.pt-form-col', {},
          field('Name *', name),
          el('div.pt-form-row', {}, field('Main category', cat.node, 'Visible to the team. Use a private custom category below for your own grouping.'), field('Internal product number', internal))),
        el('div.pt-form-col.narrow', {}, el('span.pt-label', {}, 'Spec sheet'), specBox)),
      el('h3.pt-form-h', {}, 'Custom categories'),
      el('p.pt-hint', {}, 'Choose any number. Private categories are only visible to you. Changes to categories save immediately.'),
      categoryBox,
      el('div.pt-form-row', {}, field('New category', categoryName), field('Visibility', categoryVisibility),
        el('button.btn', { type: 'button', onclick: () => {
          categoryError.textContent = '';
          try { const created = store.createCategory(categoryName.value, categoryVisibility.value); selectedCategories.add(created.id); categoryName.value = ''; renderCategories(); NL.toast('Category created.'); }
          catch (e) { categoryError.textContent = e.message; }
        } }, 'Create category')),
      categoryError,
      types.length > 1 ? [el('h3.pt-form-h', {}, 'Item type'), typeRadios] : null, // one choice (packaging): nothing to pick
      types.length > 1 ? null : el('div', { hidden: true }, typeRadios),
      el('h3.pt-form-h', {}, 'Supplier & price'),
      el('div.pt-form-row', {}, field('Supplier', supSel, null, 'grow'), field('Item number', sku)),
      supHint,
      el('div.pt-form-row', {}, field('Pack size', packQty), field('Unit of measure', uom.node), field('Pack config', cfg.node)),
      el('div.pt-form-row', {}, field('Price / pack', el('span.pt-money', {}, '$', price)), field('Price / unit (calculated)', perUom)),
      el('div.pt-form-row', {}, netField, grossField),
      foodOnly,
      errBox);
    const m = NL.modal((existing ? 'Edit ' : 'Add ') + noun, body, [el('button.btn', { onclick: () => m.close() }, 'Cancel'), saveBtn],
      { wide: true, sticky: true, sub: existing ? existing.code + ' · ' + existing.status : 'New items start as drafts until someone approves them.' });
    sync();
    name.focus();
  }

  NL.editor = { open };
})();
