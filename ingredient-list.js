/* ingredient-list.js — the Raw Materials table: one row per ingredient × supplier, filters, sort, row actions. */
(function () {
  const { el, money } = NL;
  const TITLES = { all: 'All items', food: 'Food', packaging: 'Packaging', review: 'Needs review', drafts: 'Drafts' };
  const SUBS = {
    review: 'Unknown nutrition values, unverified allergens, missing statements, no supplier, no price or a price older than 6 months.',
    drafts: 'Added but not approved yet. The Recipe Builder labels these “draft”.',
  };

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
      : key === 'date' ? (x.r ? x.r.quote.quoteDate : 0)
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
    const any = state.category || state.supplierId || state.allergen || state.query;
    return el('div.pt-filters', {},
      sel('category', 'All categories', store.categories().map((c) => [c, c])),
      sel('supplierId', 'All suppliers', store.listSuppliers().map((s) => [s.id, s.name])),
      sel('allergen', 'All allergens', store.ALLERGENS.map((a) => [a, a])),
      any ? el('button.btn.ghost.sm', { onclick: () => NL.app.go({ category: '', supplierId: '', allergen: '', query: '' }, { replace: true }) }, '✕ Clear filters') : null);
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
        { icon: 'ⓘ', label: 'Details', run: open },
        { icon: '✎', label: 'Edit ingredient', run: () => NL.app.editIngredient(i.id, r && r.supplierId) },
        { icon: '$', label: r ? 'Record new price' : 'Add supplier & price', run: () => NL.app.recordPrice(i.id, r && r.supplierId) },
        r && !r.preferred && i.sources.length > 1 ? { icon: '★', label: 'Make preferred supplier', run: () => { store.setPreferred(i.id, r.supplierId); NL.app.refresh(); NL.toast(r.supplierName + ' is now the preferred supplier.'); } } : null,
        'sep',
        { icon: '⌫', label: r ? 'Delete this supplier row' : 'Delete ingredient', danger: true, run: () => NL.app.deleteRow(i.id, r && r.supplierId) },
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
      el('td', {}, q ? el('span.pt-age.' + NL.ageClass(q.quoteDate), { title: NL.date(q.quoteDate) }, NL.timeAgo(q.quoteDate)) : '—'),
      el('td.pt-spec', {}, i.currentSheet ? el('span', { title: i.currentSheet.fileName }, '📄') : el('span.faint', {}, '—')),
      el('td.pt-actions', {},
        el('button.btn.sm', { onclick: (e) => { e.stopPropagation(); open(); } }, 'Details'),
        el('button.btn.ghost.sm.pt-more', { title: 'More actions', 'aria-label': 'More actions', onclick: more }, '⋯')));
  }

  function render(state) {
    const main = document.getElementById('main');
    const total = store.listIngredients({ view: state.view });
    const items = store.listIngredients({ view: state.view, query: state.query, category: state.category, supplierId: state.supplierId, allergen: state.allergen });
    const rows = rowsOf(items, state);
    let lastId = null, stripe = false;

    const body = rows.length
      ? el('div.pt-table-wrap', {}, el('table.pt-table', {},
          el('thead', {}, el('tr', {},
            th(state, 'name', 'Ingredient'), th(state, 'supplier', 'Supplier'), th(state, null, 'Pack size', 'nr'), th(state, null, 'Price / pack', 'nr'),
            th(state, 'perUom', 'Price / UOM', 'nr'), th(state, null, '$ / kg', 'nr pt-perkg'), th(state, 'date', 'Price date'), th(state, null, 'Spec'), th(state, null, ''))),
          el('tbody', {}, rows.map((x) => { if (x.i.id !== lastId) { stripe = !stripe; lastId = x.i.id; } return row(state, x, stripe); }))))
      : el('div.pt-empty', {},
          el('div.pt-empty-ic', {}, total.length ? '⌕' : state.view === 'review' ? '✓' : '▤'),
          el('p', {}, total.length ? 'No ingredients match the current filters.' : state.view === 'review' ? 'Nothing needs review. Nice.' : 'No ingredients here yet.'),
          total.length ? el('button.btn', { onclick: () => NL.app.go({ category: '', supplierId: '', allergen: '', query: '' }) }, 'Clear filters')
            : NL.app.newLabel() ? el('button.btn.primary', { onclick: () => NL.app.newIngredient() }, '＋ ' + NL.app.newLabel()) : null);

    NL.fill(main,
      el('div.pt-head', {},
        el('div', {},
          el('h1', {}, TITLES[state.view]),
          el('div.muted', {}, items.length + ' of ' + total.length + ' ingredient' + (total.length === 1 ? '' : 's') + (rows.length !== items.length ? ' · ' + rows.length + ' supplier rows' : '')),
          SUBS[state.view] ? el('div.faint.pt-head-sub', {}, SUBS[state.view]) : null),
        el('span.spacer'),
        el('button.btn', { onclick: () => NL.duplicates.open() }, '⧉ Check for duplicates'),
        NL.app.newLabel() ? el('button.btn.primary', { onclick: () => NL.app.newIngredient() }, '＋ ' + NL.app.newLabel()) : null),
      filters(state),
      body);
  }

  NL.list = { render };
})();
