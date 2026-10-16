/* duplicates-dialog.js — "Check for duplicates": same name + same supplier (or same name, no supplier). No AI. */
(function () {
  const { el, money } = NL;

  function open() {
    const kept = new Set();
    const body = el('div.pt-dups');
    function render() {
      const groups = store.duplicateReport();
      const both = groups.filter((g) => g.supplierName).length;
      NL.fill(body,
        el('p.muted', {}, groups.length
          ? groups.length + ' matching group' + (groups.length > 1 ? 's' : '') + ' · ' + both + ' share both name and supplier · ' + (groups.length - both) + ' have matching names with no supplier. Keep the right one; delete the others (they go to the Recycle Bin for 3 days).'
          : 'No matching ingredient and supplier rows found.'),
        groups.map((g) => el('div.pt-dup-group', {},
          el('div.pt-dup-head', {},
            el('b', {}, g.name), el('span.pt-chip' + (g.supplierName ? '.review' : ''), {}, g.supplierName ? 'Name + supplier match' : 'Name match — no supplier'),
            el('span.faint', {}, (g.supplierName || 'No supplier attached') + ' · ' + g.rows.length + ' rows')),
          g.rows.map((r, idx) => {
            const k = r.ingredientId + '|' + (r.source ? r.source.supplierId : '');
            const q = r.source && r.source.quote;
            return el('div.pt-dup-row', {},
              el('div', {},
                el('div', {}, el('button.pt-link', { onclick: () => { m.close(); NL.app.openPanel(r.ingredientId, r.source && r.source.supplierId); } }, r.name), ' ', el('span.faint', {}, r.code + (r.category ? ' · ' + r.category : '') + ' · ' + r.status)),
                el('div.faint', {}, 'Row ' + (idx + 1) + (r.source && r.source.preferred ? ' · ★ Preferred' : '') + ' · ' +
                  (q ? (q.price != null ? money(q.price) + ' / ' + (q.packQty != null ? NL.num(q.packQty) + ' ' : '') + q.uom : 'Price not recorded') + ' · ' + NL.date(q.quoteDate) + ' · ' + (r.source.hasNutrition ? 'Spec nutrition available' : 'Spec nutrition incomplete') + (q.sku ? ' · Item ' + q.sku : '') : 'No supplier'))),
              el('span.spacer'),
              kept.has(k) ? el('span.pt-chip.ok', {}, 'Kept') : el('button.btn.sm', { onclick: () => { kept.add(k); render(); } }, 'Keep'),
              el('button.btn.sm.danger-txt', { disabled: kept.has(k), onclick: () => {
                const res = r.source ? store.recycleSupplierRow(r.ingredientId, r.source.supplierId) : store.recycleIngredient(r.ingredientId);
                NL.app.recycled(res, 'Moved to Recycle Bin. Recover within 3 days.');
                render();
              } }, 'Delete'));
          }))));
    }
    const m = NL.modal('Duplicate check', body, [el('button.btn.primary', { onclick: () => m.close() }, 'Done')],
      { wide: true, sub: 'Checks every row by ingredient name and supplier. Names are compared ignoring case and extra spaces. Different suppliers are kept separate.' });
    render();
  }

  NL.duplicates = { open };
})();
