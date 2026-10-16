/* suppliers.js — Suppliers list + add/edit dialog (NLv4 `suppliers`; contact fields from the old Vendors page). */
(function () {
  const { el } = NL;
  const COLORS = ['#2f6fed', '#e8590c', '#0f766e', '#7c5cff', '#c2255c', '#5c940d', '#b08800', '#1971c2', '#d9480f'];

  function edit(id, opts = {}) {
    const s = id ? store.getSupplier(id) : { name: '', category: 'Ingredient Supplier', region: '', rep: '', email: '', phone: '', website: '', notes: '', color: COLORS[store.listSuppliers().length % COLORS.length] };
    const f = {};
    const input = (k, attrs) => (f[k] = el('input.txt', Object.assign({ value: s[k] || '' }, attrs || {})));
    const cat = (f.category = el('select.txt', {}, store.SUPPLIER_CATEGORIES.map((c) => el('option', { value: c, selected: c === s.category }, c))));
    let color = s.color;
    const swatches = el('div.pt-swatches', {});
    const paint = () => NL.fill(swatches, COLORS.map((c) => el('button.pt-swatch' + (c === color ? '.on' : ''), { style: { background: c }, title: c, 'aria-label': 'Color ' + c, onclick: () => { color = c; paint(); } })));
    paint();
    const err = el('div.pt-error', { role: 'alert' });
    const saveIt = () => {
      try {
        const data = { color, category: cat.value, notes: f.notes.value };
        ['name', 'region', 'rep', 'email', 'phone', 'website'].forEach((k) => { data[k] = f[k].value.trim(); });
        const saved = store.saveSupplier(data, id);
        m.close();
        NL.toast(id ? 'Supplier saved.' : saved.name + ' added.');
        opts.onSaved && opts.onSaved(saved);
        NL.app.refresh();
      } catch (e) { err.textContent = e.message; }
    };
    f.notes = el('textarea.txt', { rows: 2 }, s.notes || '');
    const m = NL.modal(id ? 'Edit supplier' : 'New supplier', el('div.pt-form', {},
      el('div.pt-form-row', {}, NL.field('Name *', input('name', { maxLength: 200 }), null, 'grow'), NL.field('Type', cat)),
      el('div.pt-form-row', {}, NL.field('Region', input('region')), NL.field('Website', input('website', { placeholder: 'https://' }))),
      el('div.pt-form-row', {}, NL.field('Sales rep', input('rep')), NL.field('Email', input('email', { type: 'email' })), NL.field('Phone', input('phone'))),
      NL.field('Notes', f.notes),
      el('span.pt-label', {}, 'Color in lists'), swatches,
      err), [el('button.btn', { onclick: () => m.close() }, 'Cancel'), el('button.btn.primary', { onclick: saveIt }, id ? 'Save changes' : 'Add supplier')]);
    f.name.focus();
  }

  function render(state) {
    const q = (state.query || '').trim().toLowerCase();
    const list = store.listSuppliers().filter((s) => !q || [s.name, s.rep, s.region, s.category].some((t) => String(t || '').toLowerCase().includes(q)));
    NL.fill(document.getElementById('main'),
      el('div.pt-head', {},
        el('div', {}, el('h1', {}, 'Suppliers'), el('div.muted', {}, list.length + ' supplier' + (list.length === 1 ? '' : 's'))),
        el('span.spacer'),
        el('button.btn.primary', { onclick: () => edit(null) }, '＋ New supplier')),
      list.length ? el('div.pt-table-wrap', {}, el('table.pt-table', {},
        el('thead', {}, el('tr', {}, ['Supplier', 'Type', 'Region', 'Sales rep', 'Ingredients', 'Prices', ''].map((h, k) => el('th' + (k === 4 || k === 5 ? '.nr' : ''), {}, h)))),
        el('tbody', {}, list.map((s) => el('tr', { onclick: () => NL.app.go({ view: 'all', supplierId: s.id, panel: null }) },
          el('td.pt-supplier', {}, NL.dot(s.color), el('b', {}, s.name)),
          el('td', {}, s.category || '—'), el('td', {}, s.region || '—'),
          el('td', {}, s.rep ? [s.rep, el('div.faint', {}, [s.email, s.phone].filter(Boolean).join(' · '))] : '—'),
          el('td.nr', {}, String(s.ingredientCount)), el('td.nr', {}, String(s.quoteCount)),
          el('td.pt-actions', {},
            el('button.btn.sm', { onclick: (e) => { e.stopPropagation(); NL.app.go({ view: 'all', supplierId: s.id, panel: null }); } }, 'Ingredients'),
            el('button.btn.ghost.sm.pt-more', { title: 'More actions', 'aria-label': 'More actions', onclick: (e) => {
              e.stopPropagation();
              const b = e.currentTarget.getBoundingClientRect();
              NL.menu(b.left - 150, b.bottom + 4, [
                { icon: '✎', label: 'Edit supplier', run: () => edit(s.id) },
                'sep',
                { icon: '⌫', label: 'Delete supplier', danger: true, run: () => {
                  const r = store.recycleSupplier(s.id);
                  if (r.error) NL.alertBox('Can’t delete this supplier', r.error); else NL.app.recycled(r, s.name + ' moved to Recycle Bin.');
                } },
              ]);
            } }, '⋯')))))))
        : el('div.pt-empty', {}, el('div.pt-empty-ic', {}, '⛟'), el('p', {}, q ? 'No suppliers match “' + state.query + '”.' : 'No suppliers yet.'), el('button.btn.primary', { onclick: () => edit(null) }, '＋ New supplier')));
  }

  NL.suppliers = { render, edit };
})();
