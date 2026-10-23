/* details-panel.js — right-hand Details: nutrition (per supplier), allergens, statement, notes, spec sheets,
   price history, product profile. Click-to-edit fields save straight away, like Raw Materials. */
(function () {
  const { el, field, money } = NL;
  let editingN = null;   // quote id whose nutrition table is in edit mode
  let lastKey = null;

  /* ---------- pick a spec-sheet file (shared with the editor) ---------- */
  const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.xls,.xlsx';
  const KEEP_MAX = 1.5 * 1048576; // Playground only: browser storage is small
  const UPLOAD_MAX = 25 * 1048576;
  function pickFile() {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept: ACCEPT, style: { display: 'none' } });
      input.addEventListener('change', () => { const f = input.files[0]; input.remove(); f ? readFile(f).then(resolve) : resolve(null); });
      document.body.append(input);
      input.click();
    });
  }
  function readFile(f) {
    return new Promise((resolve) => {
      if (store.isLive && f.size > UPLOAD_MAX) { NL.toast('Use a supported file up to 25 MB.'); return resolve(null); }
      if (store.isLive) return resolve({ fileName: f.name, size: f.size, file: f });
      if (f.size > KEEP_MAX) return resolve({ fileName: f.name, size: f.size, dataUrl: null });
      const r = new FileReader();
      r.onload = () => resolve({ fileName: f.name, size: f.size, dataUrl: r.result });
      r.onerror = () => resolve({ fileName: f.name, size: f.size, dataUrl: null });
      r.readAsDataURL(f);
    });
  }
  function openSheet(sh) {
    const url = store.sheetFile(sh.id);
    if (url) NL.openDataUrl(url);
    else NL.toast(sh.size > KEEP_MAX ? 'This file was too big to keep in the prototype; only its name was saved.' : 'Sample spec sheet: there is no real file behind it in the prototype.');
  }
  NL.specFiles = { pickFile, readFile, openSheet, ACCEPT, KEEP_MAX, UPLOAD_MAX };

  /* ---------- small building blocks ---------- */
  const section = (title, ...kids) => el('section.pt-sec', {}, el('h3', {}, title), ...kids);

  // click-to-edit text (input or textarea). onSave(value|'') → store call.
  function inlineText(value, opts) {
    const wrap = el('div.pt-inline');
    const show = () => NL.fill(wrap, el('button.pt-inline-view' + (value ? '' : '.empty'), { onclick: edit, title: 'Click to edit' }, value || opts.empty || 'Click to add'));
    function edit() {
      const input = opts.multiline
        ? el('textarea.txt', { rows: 3, placeholder: opts.placeholder || '' }, value || '')
        : el('input.txt', { value: value || '', placeholder: opts.placeholder || '', maxLength: opts.max || 500 });
      const counter = opts.max ? el('span.faint.pt-counter', {}, (value || '').length + '/' + opts.max) : null;
      if (counter) input.addEventListener('input', () => { counter.textContent = input.value.length + '/' + opts.max; });
      const saveIt = () => { value = input.value.trim(); opts.onSave(value); show(); NL.app.refresh(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); show(); } if (e.key === 'Enter' && !opts.multiline) saveIt(); });
      NL.fill(wrap, input, el('div.pt-inline-btns', {}, counter, el('span.spacer'), el('button.btn.sm', { onclick: show }, 'Cancel'), el('button.btn.sm.primary', { onclick: saveIt }, 'Save')));
      input.focus();
    }
    show();
    return wrap;
  }

  function nutritionTable(n, editable, onEdit) {
    return el('table.pt-nut' + (editable ? '.editable' : ''), { onclick: editable ? onEdit : null, title: editable ? 'Click to edit' : null },
      el('tbody', {}, store.NUTRIENTS.map((x) => el('tr.ind' + x.indent, {},
        el('td', {}, x.label),
        el('td.nr', {}, n && n[x.key] != null ? NL.num(n[x.key]) + ' ' + x.unit : el('span.pt-review-txt', {}, 'Needs review'))))));
  }
  const gramBasis = (value) => {
    const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*(?:g|gram|grams)$/i);
    return match && Number(match[1]) > 0 ? Number(match[1]) : null;
  };
  function nutritionEditor(q, seedN) {
    const inputs = {};
    const basis = el('input.txt', { value: q.nutritionBasis || '100 g', maxLength: 100, placeholder: 'e.g. 100 g, 1 packet (6 ml), 1/4 cup' });
    const conversionNote = el('div', { 'aria-live': 'polite' });
    let displayedGrams = gramBasis(basis.value);
    const grid = el('div.pt-nut-edit', {}, store.NUTRIENTS.map((x) => {
      inputs[x.key] = el('input.txt.num-in', { type: 'number', min: 0, step: 'any', placeholder: 'Unknown', value: seedN && seedN[x.key] != null ? seedN[x.key] : '' });
      return el('label.ind' + x.indent, {}, el('span', {}, x.label + ' (' + x.unit + ')'), inputs[x.key]);
    }));
    basis.addEventListener('input', () => {
      const nextGrams = gramBasis(basis.value);
      if (!nextGrams || !displayedGrams) {
        return NL.fill(conversionNote, el('p.pt-note.warn', {}, 'Automatic conversion skipped. Enter the values printed for this portion because its gram weight is unknown.'));
      }
      if (nextGrams !== displayedGrams) {
        const factor = nextGrams / displayedGrams;
        store.NUTRIENTS.forEach((x) => {
          const value = NL.readNum(inputs[x.key].value);
          if (value != null) inputs[x.key].value = Math.round(value * factor * 10000) / 10000;
        });
        NL.fill(conversionNote, el('p.pt-note', {}, 'Values recalculated from ' + displayedGrams + ' g to ' + nextGrams + ' g.'));
        displayedGrams = nextGrams;
      }
    });
    const saveIt = () => {
      const nutritionBasis = basis.value.trim();
      if (!nutritionBasis) { basis.focus(); return NL.toast('Enter what these nutrition values are based on.'); }
      const n = {}; store.NUTRIENTS.forEach((x) => { n[x.key] = NL.readNum(inputs[x.key].value); });
      store.saveQuote({ n, nutritionBasis }, q.id);
      editingN = null; NL.app.refresh(); NL.toast('Spec sheet nutrition saved.');
    };
    return el('div', {}, field('Values shown per', basis, 'Gram portions are recalculated automatically. Other portions stay unchanged for QA to enter from the sheet.'), conversionNote, grid,
      el('div.pt-inline-btns', {}, el('span.faint', {}, 'Blank = unknown. Enter 0 only if it is known to be zero.'), el('span.spacer'),
      el('button.btn.sm', { onclick: () => { editingN = null; NL.app.refresh(); } }, 'Cancel'), el('button.btn.sm.primary', { onclick: saveIt }, 'Save')));
  }

  function allergenBlock(i) {
    if (i.itemType === 'packaging') return el('p.faint', {}, 'Packaging: no food content.');
    if (i.allergens.length) {
      return el('div.pt-chips', {}, i.allergens.map((a) => {
        const s = i.allergenSources && i.allergenSources[a];
        return el('span.pt-allergen', {}, a + (s && (Array.isArray(s) ? s.length : s) ? ': ' + (Array.isArray(s) ? s.join(', ') : s) : ''));
      }));
    }
    return i.allergenStatus === 'confirmed_none'
      ? el('p.pt-ok-txt', {}, '✓ No Big 9 allergens — confirmed')
      : el('p.pt-review-txt', {}, 'Not declared / not verified — needs review');
  }

  function specSheets(i) {
    const upload = async () => {
      const f = await pickFile(); if (!f) return;
      const supplierId = NL.app.state.panel && NL.app.state.panel.supplierId;
      try {
        const res = await store.addSpecSheet(i.id, Object.assign(f, { supplierId }));
        NL.app.refresh();
        NL.toast(store.isLive ? 'Spec sheet uploaded for your R&D team.'
          : res.stored || !f.dataUrl ? (f.dataUrl ? 'Spec sheet added.' : 'Spec sheet added (name only — file too big for the prototype).') : 'Spec sheet added (name only — browser storage is full).');
      } catch (e) { NL.toast(e.message || 'Could not upload the spec sheet.'); }
    };
    const list = i.specSheets.slice().sort((a, b) => b.uploadedAt - a.uploadedAt);
    const supName = (id) => { const s = id && store.getSupplier(id); return s ? s.name : null; };
    return section('Spec sheets',
      list.length ? el('ul.pt-sheets', {}, list.map((sh) => {
        const current = sh.id === i.currentSheetId;
        return el('li' + (current ? '.current' : ''), {},
          el('div.pt-sheet-line', {},
            el('button.pt-link', { onclick: () => openSheet(sh) }, '📄 ' + sh.fileName),
            current ? el('span.pt-chip.ok', {}, 'Current') : null,
            el('span.spacer'),
            !current ? el('button.btn.ghost.sm', { onclick: () => { store.setCurrentSheet(i.id, sh.id); NL.app.refresh(); } }, 'Make current') : null,
            el('button.btn.ghost.sm.danger-txt', { onclick: async () => {
              if (await NL.confirm('Move this spec sheet to the Recycle Bin?', 'Move ' + sh.fileName + ' to the Recycle Bin? You can restore it for 3 days. The ingredient’s values stay as they are.', { ok: 'Move to Recycle Bin', danger: true })) {
                NL.app.recycled(store.recycleSpecSheet(i.id, sh.id), 'Spec sheet moved to Recycle Bin.');
              }
            } }, 'Delete')),
          el('div.faint.pt-sheet-meta', {}, 'Uploaded ' + NL.date(sh.uploadedAt) + ' · ' + NL.kb(sh.size || 0) + (supName(sh.supplierId) ? ' · from ' + supName(sh.supplierId) : '')),
          sh.details ? el('details.pt-extract', {},
            el('summary', {}, 'Extracted spec sheet details (' + sh.details.sections.length + ' sections)'),
            el('p.faint', {}, 'Saved with this version. Automatic reading can miss characters — check against the original sheet.'),
            sh.details.sections.map((s) => el('div.pt-extract-sec', {}, el('b', {}, s.title), el('dl', {}, s.entries.map(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))))) : null);
      })) : el('p.faint', {}, 'No spec sheet yet.'),
      el('button.btn.sm', { onclick: upload }, '⇪ Upload spec sheet'));
  }

  function priceHistory(i, supplierId) {
    if (!supplierId) {
      return section('Price history',
        i.sources.length ? el('p.faint', {}, 'Pick a supplier above to see its prices.') : el('p.faint', {}, 'No supplier yet.'),
        el('button.btn.sm', { onclick: () => NL.app.recordPrice(i.id, null) }, '＋ Add supplier & price'));
    }
    const hist = store.quoteHistory(i.id, supplierId);
    const row = i.sources.find((r) => r.supplierId === supplierId);
    const s = store.getSupplier(supplierId) || {};
    const card = (q, idx) => {
      const perKg = store.perKg(q, i);
      return el('div.pt-quote' + (idx === 0 ? '.active' : ''), {},
        el('div.pt-quote-top', {},
          idx === 0 ? el('b', {}, 'Active price') : null,
          idx === 0 && row.preferred ? el('span.pt-chip.pref', {}, '★ Preferred') : null,
          el('span.spacer'),
          el('span.pt-age.' + NL.ageClass(q.quoteDate), {}, NL.date(q.quoteDate) + ' · ' + NL.timeAgo(q.quoteDate))),
        el('div.pt-quote-price', {}, q.price == null ? el('i.pt-pending', {}, 'Pricing pending')
          : [money(q.price) + ' / ' + (q.packQty != null ? NL.num(q.packQty) + ' ' : '') + (q.uom || 'unit') + (q.packConfig ? ' ' + q.packConfig : ''),
            el('span.muted', {}, '  ' + (store.perUom(q) != null ? money(store.perUom(q), 4) + '/' + q.uom : '') + (perKg != null ? ' · ' + money(perKg) + '/kg' : ''))]),
        el('div.faint', {}, [q.sku ? 'Item ' + q.sku : null, q.moq ? 'MOQ ' + q.moq : null, q.leadTime ? 'Lead ' + q.leadTime : null].filter(Boolean).join(' · ') || ' '),
        q.notes ? el('div.muted', {}, q.notes) : null,
        el('div.pt-quote-btns', {},
          idx === 0 && !row.preferred && q.price != null ? el('button.btn.ghost.sm', { onclick: () => { store.setPreferred(i.id, supplierId); NL.app.refresh(); NL.toast(s.name + ' is now the preferred supplier.'); } }, '★ Set preferred') : null,
          el('button.btn.ghost.sm', { onclick: () => NL.app.editQuote(q.id) }, 'Edit'),
          el('button.btn.ghost.sm.danger-txt', { onclick: () => NL.app.deleteQuote(q.id) }, 'Delete')));
    };
    return section('Price history — ' + s.name,
      el('div.faint.pt-rep', {}, [s.rep, s.email, s.phone].filter(Boolean).join(' · ')),
      hist.map(card),
      el('div.pt-row-btns', {},
        el('button.btn.sm.primary', { onclick: () => NL.app.recordPrice(i.id, supplierId) }, '＋ Record new price'),
        el('button.btn.sm.danger-txt', { onclick: () => NL.app.deleteRow(i.id, supplierId) }, 'Remove supplier')));
  }

  function productProfile(q) {
    const saveQ = (k) => (v) => store.saveQuote({ [k]: v }, q.id);
    return section('Product profile (this supplier)',
      el('div.pt-label', {}, 'Product teaser (max 50)'), inlineText(q.teaser, { max: 50, placeholder: 'e.g. Juicy carrot', onSave: saveQ('teaser') }),
      el('div.pt-label', {}, 'Product description'), inlineText(q.description, { multiline: true, onSave: saveQ('description') }),
      el('div.pt-label', {}, 'Internal notes'), inlineText(q.internalNotes, { multiline: true, onSave: saveQ('internalNotes') }));
  }

  /* ---------- render ---------- */
  function render(state) {
    const box = document.getElementById('details');
    const i = store.getIngredient(state.panel.ingredientId);
    if (!i) return;
    const supplierId = state.panel.supplierId;
    const key = i.id + '|' + supplierId;
    if (key !== lastKey) { editingN = null; lastKey = key; box.scrollTop = 0; }
    const row = supplierId && i.sources.find((r) => r.supplierId === supplierId);
    const q = row && row.quote;
    const food = i.itemType !== 'packaging';

    // supplier switcher: ingredient baseline + each supplier row
    const pill = (id, label, color, extra) => el('button.pt-pill' + ((supplierId || null) === id ? '.on' : ''), { onclick: () => NL.app.openPanel(i.id, id) }, color ? NL.dot(color) : null, label, extra || null);
    const switcher = el('div.pt-pills', {},
      pill(null, 'Ingredient'),
      i.sources.map((r) => pill(r.supplierId, r.supplierName, r.supplierColor, r.preferred && i.sources.length > 1 ? el('span.pt-star', {}, '★') : null)),
      el('button.pt-pill.add', { onclick: () => NL.app.recordPrice(i.id, null), title: 'Add a supplier' }, '＋'));

    // nutrition: the supplier's spec values when there are any, else the ingredient baseline
    let nutrition = null;
    if (food) {
      const supN = q && q.n && Object.values(q.n).some((v) => v != null) ? q.n : null;
      const title = q ? (supN ? 'Nutrition Facts — ' + row.supplierName + ' spec sheet' : 'Nutrition Facts (ingredient baseline)') : 'Nutrition Facts';
      const basis = supN ? (q.nutritionBasis || '100 g') : '100 g';
      const isPer100g = basis.trim().toLocaleLowerCase().replace(/\s+/g, '') === '100g';
      nutrition = section(title + ' · per ' + basis,
        supN && !isPer100g ? el('p.pt-note.warn', {}, 'Notice: these values are shown per ' + basis + ', not per 100 g.' + (gramBasis(basis) ? ' Pantry can recalculate them when QA changes the gram portion.' : ' Automatic conversion was skipped because the gram weight is unknown.')) : null,
        q && !supN ? el('p.pt-note.warn', {}, 'No spec sheet nutrition for this supplier. Values below are the ingredient baseline.') : null,
        editingN && q && editingN === q.id ? nutritionEditor(q, supN || i.n)
          : nutritionTable(supN || i.n, !!q, () => { editingN = q.id; NL.app.refresh(); }),
        q && editingN !== q.id ? el('div.faint.pt-under', {}, 'Click the table to edit this supplier’s spec sheet nutrition.')
          : !q ? el('div.faint.pt-under', {}, 'Baseline values. Change them with Edit below.') : null,
        supN && isPer100g && editingN !== q.id && JSON.stringify(supN) !== JSON.stringify(i.n) ? el('button.btn.sm.pt-under', {
          title: 'Copy these values into the ingredient’s own nutrition (used when no supplier is chosen)',
          onclick: async () => {
            if (!(await NL.confirm('Use as ingredient baseline?', 'Replace ' + i.name + '’s baseline nutrition with ' + row.supplierName + '’s spec sheet values?', { ok: 'Use these values' }))) return;
            store.updateIngredient(i.id, { n: supN }); NL.app.refresh(); NL.toast('Baseline nutrition updated.');
          } }, '⇩ Use as ingredient baseline') : null);
    }

    const canReview = store.me().role === 'admin';
    const reviewAction = !i.reviewedAt && canReview
      ? el('button.btn.sm', { title: 'Confirm the current information, clear its review warnings, and approve it', onclick: async (e) => {
          const button = e.currentTarget;
          const warning = i.issues.length ? ' Current warnings: ' + i.issues.join('; ') + '.' : '';
          if (!(await NL.confirm('Mark as reviewed?', 'This clears the current warnings. Your name and the review time will be saved in the audit trail.' + warning, { ok: 'Reviewed' }))) return;
          button.disabled = true; button.textContent = 'Saving review…';
          try { await store.reviewIngredient(i.id); NL.app.refresh(); NL.toast(i.name + ' marked as reviewed.'); }
          catch (error) { button.disabled = false; button.textContent = 'Reviewed'; NL.toast(error.message || 'Could not save the review.'); }
        } }, 'Reviewed')
      : i.reviewedAt && canReview ? el('button.btn.ghost.sm', { onclick: async () => {
          if (!(await NL.confirm('Return to review?', 'The item will show its warnings again. The earlier review remains in the audit trail.', { ok: 'Return to review' }))) return;
          store.returnToReview(i.id); NL.app.refresh(); NL.toast(i.name + ' returned to Needs review.');
        } }, 'Return to review') : null;
    const reviewHistory = canReview && i.reviewHistory && i.reviewHistory.length
      ? section('Review history', el('ul.pt-sheets', {}, i.reviewHistory.map((r) => el('li', {},
          el('b', {}, r.reviewerName || 'Unknown user'), el('div.faint', {}, NL.dateTime(r.reviewedAt))))))
      : null;

    const left = el('div.pt-col', {},
      nutrition,
      food ? section('Allergens', allergenBlock(i)) : null,
      food ? section('Ingredient statement', i.statement ? el('p', {}, i.statement) : el('p.faint', {}, el('i', {}, 'Not set'))) : null,
      section('Detailed quality notes', inlineText(i.qualityNotes, { multiline: true, placeholder: 'Quality audit notes, tracking details…', empty: 'Click to add notes', onSave: (v) => store.updateIngredient(i.id, { qualityNotes: v }) })),
      section('Recipe Builder teaser (max 50)', inlineText(i.teaser, { max: 50, placeholder: 'e.g. Juicy carrot', empty: 'Click to add teaser', onSave: (v) => store.updateIngredient(i.id, { teaser: v }) })),
      reviewHistory,
      i.netWeightG || i.grossWeightG ? section('Weights', el('p', {},
        i.netWeightG ? 'Net weight: ' + NL.num(i.netWeightG) + ' g per ' + (i.uom || 'unit') : null,
        i.netWeightG && i.grossWeightG ? el('br') : null,
        i.grossWeightG ? 'Gross weight: ' + NL.num(i.grossWeightG) + ' g per ' + (i.uom || 'unit') : null)) : null);

    const right = el('div.pt-col', {},
      priceHistory(i, supplierId),
      q ? productProfile(q) : null,
      specSheets(i));

    NL.fill(box,
      el('div.pt-det-head', {},
        el('div.pt-det-title', {},
          el('h2', {}, i.name + (row ? ' — ' + row.supplierName : '')),
          el('button.pt-x', { title: 'Close details', 'aria-label': 'Close details', onclick: () => NL.app.closePanel() }, '✕')),
        el('div.pt-chips', {},
          i.category ? el('span.pt-chip', {}, i.category) : null,
          store.customCategories().filter((c) => (i.categoryIds || []).includes(c.id)).map((c) =>
            el('span.pt-chip', { title: c.visibility === 'private' ? 'Private — only you can see this category' : 'Shared with Pantry members' },
              c.name + (c.visibility === 'private' ? ' · Private' : ''))),
          el('span.pt-chip', {}, store.ITEM_TYPES.find((t) => t.key === i.itemType).label),
          reviewAction),
        el('div.faint', {}, i.code + (i.internalCode ? ' · internal ' + i.internalCode : '') + ' · updated ' + NL.timeAgo(i.updatedAt) + (i.updatedByPerson ? ' by ' + i.updatedByPerson.name : '')),
        switcher),
      i.reviewedAt ? el('p.pt-ok-txt', {}, 'Reviewed by ' + (i.reviewerName || (i.reviewedByPerson && i.reviewedByPerson.name) || 'Unknown user') + ' · ' + NL.dateTime(i.reviewedAt)) : null,
      i.issues.length ? el('div.pt-note.warn.pt-issues', {}, el('b', {}, 'Needs review'), el('ul', {}, i.issues.map((t) => el('li', {}, t)))) : null,
      el('div.pt-det-body', {}, left, right),
      el('div.pt-det-foot', {},
        el('button.btn.primary', { onclick: () => NL.app.editIngredient(i.id, supplierId) }, '✎ Edit'),
        el('span.spacer'),
        el('button.btn.danger-txt', { onclick: () => NL.app.deleteIngredient(i.id) }, '⌫ Delete ingredient')));
  }

  NL.details = { render };
})();
