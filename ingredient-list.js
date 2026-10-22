/* ingredient-list.js — the Raw Materials table: one row per ingredient × supplier, filters, sort, row actions. */
(function () {
  const { el, money } = NL;
  const TITLES = { all: 'All items', food: 'Food', packaging: 'Packaging', review: 'Needs review', drafts: 'Drafts' };
  const SUBS = {
    review: 'Unknown nutrition values, unverified allergens, missing statements, no supplier, no price or a price older than 6 months.',
    drafts: 'Added but not approved yet. The Recipe Builder labels these “draft”.',
  };
  const resetFilters = () => NL.app.go({ category: '', supplierId: '', allergens: [], query: '' }, { replace: true });

  function rowsOf(items, state) {
    const rows = [];
    items.forEach((i) => {
      const src = state.supplierId ? i.sources.filter((r) => r.supplierId === state.supplierId) : i.sources;
      if (!src.length) rows.push({ i, r: null });
      else src.forEach((r) => rows.push({ i, r }));
    });
    const { key, dir } = state.sort;
    const val = (x) => key === 'supplier' ? (x.r ? x.r.supplierName : '￿').toLowerCase()
      : key === 'category' ? (x.i.category || '').toLowerCase()
      : key === 'review' ? x.i.issues.length
      : key === 'perUom' ? (x.r ? store.perUom(x.r.quote) ?? Infinity : Infinity)
      : x.i.name.trim().toLowerCase();
    rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'number' ? va - vb : va.localeCompare(vb);
      return (dir === 'asc' ? c : -c) || a.i.name.localeCompare(b.i.name);
    });
    return rows;
  }

  function filters(state) {
    const sel = (key, all, opts) => el('select.pt-select' + (state[key] ? '.on' : ''), {
      'aria-label': all, onchange: (e) => NL.app.go({ [key]: e.target.value }, { replace: true }),
    }, el('option', { value: '' }, all), opts.map(([v, l]) => el('option', { value: v, selected: state[key] === v }, l)));
    const selected = state.allergens || [];
    const allergenFilter = el('button.pt-select' + (selected.length ? '.on' : ''), {
      type: 'button', 'aria-haspopup': 'dialog', onclick: () => {
        const boxes = store.ALLERGENS.map((a) => {
          const input = el('input', { type: 'checkbox', checked: selected.includes(a) });
          return { a, input, node: el('label.pt-check', {}, input, a) };
        });
        const m = NL.modal('Filter by allergens', el('div.pt-al-grid', {}, boxes.map((x) => x.node)), [
          el('button.btn', { onclick: () => m.close() }, 'Cancel'),
          el('button.btn.primary', { onclick: () => {
            NL.app.go({ allergens: boxes.filter((x) => x.input.checked).map((x) => x.a) }, { replace: true });
            m.close();
          } }, 'Apply filters'),
        ], { cls: 'small' });
      },
    }, selected.length === 0 ? 'All allergens' : selected.length === 1 ? selected[0] : selected.length + ' allergens');
    const any = state.category || state.supplierId || selected.length || state.query;
    return el('div.pt-filters', {},
      sel('category', 'All categories', [
        ...store.categories().map((c) => [c, c + ' · Main']),
        ...store.customCategories().map((c) => [c.id, c.name + (c.visibility === 'private' ? ' · Private' : ' · Shared')]),
      ]),
      sel('supplierId', 'All suppliers', store.listSuppliers().map((s) => [s.id, s.name])),
      allergenFilter,
      state.view === 'review' ? el('button.btn', {
        'aria-pressed': state.sort.key === 'review' ? 'true' : 'false',
        title: 'Click to sort by review count; click again to reverse',
        onclick: () => NL.app.go({ sort: { key: 'review', dir: state.sort.key === 'review' && state.sort.dir === 'desc' ? 'asc' : 'desc' } }, { replace: true }),
      }, state.sort.key === 'review' ? 'Review count ' + (state.sort.dir === 'desc' ? '↓' : '↑') : 'Sort by review count') : null,
      el('button.btn.ghost.sm', { disabled: !any, onclick: resetFilters }, 'Reset filters'));
  }

  function th(state, key, label, cls) {
    if (!key) return el('th' + (cls ? '.' + cls : ''), {}, label);
    const on = state.sort.key === key;
    return el('th.sortable' + (cls ? '.' + cls : ''), { 'aria-sort': on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      el('button', { onclick: () => NL.app.go({ sort: { key, dir: on && state.sort.dir === 'asc' ? 'desc' : 'asc' } }, { replace: true }) },
        label, el('span.pt-sort', {}, on ? (state.sort.dir === 'asc' ? '↑' : '↓') : '↕')));
  }

  function supplierCell(i, r) {
    if (!r) return el('td.pt-supplier', {}, el('span.faint', {}, '— no supplier —'));
    return el('td.pt-supplier', {},
      NL.dot(r.supplierColor), el('span', {}, r.supplierName),
      r.preferred && i.sources.length > 1 ? el('span.pt-badge.pref', { title: 'Preferred supplier (used for costing)' }, '★') : null,
      r.quote.price == null ? el('i.pt-pending', {}, 'pricing pending') : null,
      !r.hasNutrition && i.itemType !== 'packaging' ? el('span.pt-warn-ic', { title: 'No spec sheet nutrition from this supplier' }, '⚠') : null);
  }

  function row(state, { i, r }, stripe) {
    const q = r && r.quote;
    const active = state.panel && state.panel.ingredientId === i.id && (state.panel.supplierId || null) === (r ? r.supplierId : null);
    const open = () => NL.app.openPanel(i.id, r && r.supplierId);
    const perUom = store.perUom(q), perKg = store.perKg(q, i);
    const more = (e) => {
      e.stopPropagation();
      const b = e.currentTarget.getBoundingClientRect();
      NL.menu(b.left - 150, b.bottom + 4, [
        { label: 'Details', run: open },
        { label: 'Edit ingredient', run: () => NL.app.editIngredient(i.id, r && r.supplierId) },
        { label: r ? 'Record new price' : 'Add supplier & price', run: () => NL.app.recordPrice(i.id, r && r.supplierId) },
        r && !r.preferred && i.sources.length > 1 ? { label: 'Make preferred supplier', run: () => { store.setPreferred(i.id, r.supplierId); NL.app.refresh(); NL.toast(r.supplierName + ' is now the preferred supplier.'); } } : null,
        'sep',
        { label: r ? 'Delete this supplier' : 'Delete ingredient', danger: true, run: () => NL.app.deleteRow(i.id, r && r.supplierId) },
      ].filter(Boolean));
    };
    return el('tr' + (stripe ? '.stripe' : '') + (active ? '.active' : ''), { onclick: open, dataset: { id: i.id } },
      el('td.pt-name', {},
        el('div.pt-name-line', {},
          el('b', {}, i.name),
          i.status === 'draft' ? el('span.pt-chip.draft', { title: 'Not approved yet' }, 'draft') : null,
          i.issues.length ? el('span.pt-chip.review', { title: i.issues.join('\n') }, '⚠ ' + i.issues.length) : null),
        el('div.pt-sub', {}, i.code + (i.category ? ' · ' + i.category : ''))),
      supplierCell(i, r),
      el('td.nr', {}, q && q.packQty != null ? NL.num(q.packQty) + ' ' + (q.uom || '') + (q.packConfig ? ' / ' + q.packConfig : '') : '—'),
      el('td.nr', {}, q ? money(q.price) : '—'),
      el('td.nr', {}, perUom != null ? money(perUom, 4) + '/' + q.uom : '—'),
      el('td.nr.pt-perkg', {}, perKg != null ? money(perKg) + '/kg' : '—'),
      el('td.pt-spec', {}, i.currentSheet ? el('button.pt-link', {
        title: 'Open ' + i.currentSheet.fileName,
        'aria-label': 'Open spec sheet for ' + i.name,
        onclick: (e) => { e.stopPropagation(); NL.specFiles.openSheet(i.currentSheet); },
      }, '📄') : el('span.faint', {}, '—')),
      el('td.pt-actions', {},
        el('button.btn.sm', { onclick: (e) => { e.stopPropagation(); open(); } }, 'Details'),
        el('button.btn.ghost.sm.pt-more', { title: 'More actions', 'aria-label': 'More actions', onclick: more }, '⋯')));
  }

  function render(state) {
    const main = document.getElementById('main');
    const total = store.listIngredients({ view: state.view });
    const items = store.listIngredients({ view: state.view, query: state.query, category: state.category, supplierId: state.supplierId, allergens: state.allergens });
    const rows = rowsOf(items, state);
    let lastId = null, stripe = false;

    const body = rows.length
      ? el('div.pt-table-wrap', {}, el('table.pt-table', {},
          el('thead', {}, el('tr', {},
            th(state, 'name', 'Ingredient'), th(state, 'supplier', 'Supplier'), th(state, null, 'Pack size', 'nr'), th(state, null, 'Price / pack', 'nr'),
            th(state, 'perUom', 'Price / UOM', 'nr'), th(state, null, '$ / kg', 'nr pt-perkg'), th(state, null, 'Spec'), th(state, null, ''))),
          el('tbody', {}, rows.map((x) => { if (x.i.id !== lastId) { stripe = !stripe; lastId = x.i.id; } return row(state, x, stripe); }))))
      : el('div.pt-empty', {},
          el('div.pt-empty-ic', {}, total.length ? '⌕' : state.view === 'review' ? '✓' : '▤'),
          el('p', {}, total.length ? 'No ingredients match the current filters.' : state.view === 'review' ? 'Nothing needs review. Nice.' : 'No ingredients here yet.'),
          total.length ? el('button.btn', { onclick: resetFilters }, 'Reset filters')
            : NL.app.newLabel() ? el('button.btn.primary', { onclick: () => NL.app.newIngredient() }, '＋ ' + NL.app.newLabel()) : null);

    NL.fill(main,
      el('div.pt-head', {},
        el('div', {},
          el('h1', {}, TITLES[state.view]),
          el('div.muted', {}, items.length + ' of ' + total.length + ' ingredient' + (total.length === 1 ? '' : 's') + (rows.length !== items.length ? ' · ' + rows.length + ' supplier rows' : '')),
          SUBS[state.view] ? el('div.faint.pt-head-sub', {}, SUBS[state.view]) : null),
        el('span.spacer'),
        NL.app.newLabel() ? el('button.btn.primary', { onclick: () => NL.app.newIngredient() }, '＋ ' + NL.app.newLabel()) : null),
      filters(state),
      body);
  }

  NL.list = { render };
})();
