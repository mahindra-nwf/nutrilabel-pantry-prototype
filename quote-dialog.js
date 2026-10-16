/* quote-dialog.js — Record new price / Edit price for one ingredient + supplier (Raw Materials' VendorQuoteModal). */
(function () {
  const { el, field } = NL;
  const today = () => new Date().toISOString().slice(0, 10);
  const toDay = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  const fromDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };

  function open({ ingredientId, supplierId, quoteId }, opts = {}) {
    const i = store.getIngredient(ingredientId);
    const q = quoteId ? store.getQuote(quoteId) : null;
    const base = q || (supplierId && store.quoteHistory(ingredientId, supplierId)[0]) || null; // a new price starts from the last one's pack details
    const suppliers = store.listSuppliers();

    const supSel = el('select.txt', { disabled: !!q, onchange: () => { if (supSel.value === '__new') NL.suppliers.edit(null, { onSaved: (s) => { supSel.append(el('option', { value: s.id }, s.name)); supSel.value = s.id; } }); } },
      el('option', { value: '' }, '— Select supplier —'),
      suppliers.map((s) => el('option', { value: s.id, selected: s.id === (supplierId || (q && q.supplierId)) }, s.name + (i.sources.some((r) => r.supplierId === s.id) ? '  (current)' : ''))),
      el('option', { value: '__new' }, '＋ New supplier…'));
    const packQty = el('input.txt', { type: 'number', min: 0, step: 'any', value: base ? base.packQty ?? '' : i.packQty ?? '' });
    const uom = NL.combo(base ? base.uom : i.uom, store.uoms());
    const cfg = NL.combo(base ? base.packConfig : i.packConfig, store.packConfigs(), { placeholder: 'case, drum, pail…' });
    const sku = el('input.txt', { value: base ? base.sku || '' : '' });
    const price = el('input.txt', { type: 'number', min: 0, step: '0.0001', value: q && q.price != null ? q.price : '' });
    const pending = el('input', { type: 'checkbox', checked: !!q && q.price == null });
    const perUom = el('div.pt-calc');
    const moq = el('input.txt', { value: base ? base.moq || '' : '', placeholder: 'e.g. 50 lbs' });
    const lead = el('input.txt', { value: base ? base.leadTime || '' : '', placeholder: 'e.g. 2 weeks' });
    const date = el('input.txt', { type: 'date', value: q ? toDay(q.quoteDate) : today(), max: today() });
    const notes = el('textarea.txt', { rows: 2 }, q ? q.notes || '' : '');
    const err = el('div.pt-error', { role: 'alert' });

    const sync = () => {
      price.disabled = pending.checked;
      const p = Number(price.value), n = Number(packQty.value);
      perUom.textContent = !pending.checked && p > 0 && n > 0 ? NL.money(p / n, 4) + ' / ' + (uom.input.value || 'unit') : '—';
    };
    [price, packQty, uom.input, pending].forEach((x) => x.addEventListener('input', sync));
    pending.addEventListener('change', sync);

    function saveIt() {
      const sid = supSel.value;
      if (!sid || sid === '__new') return (err.textContent = 'Please select a supplier.');
      const p = NL.readNum(price.value);
      if (!pending.checked && !(p > 0)) return (err.textContent = 'Price must be greater than 0 (or tick “Price not confirmed yet”).');
      if (!date.value) return (err.textContent = 'Pick the price date.');
      const saved = store.saveQuote({
        ingredientId, supplierId: sid, price: pending.checked ? null : p, packQty: NL.readNum(packQty.value), uom: uom.input.value.trim(), packConfig: cfg.input.value.trim(),
        sku: sku.value.trim(), moq: moq.value.trim(), leadTime: lead.value.trim(), quoteDate: fromDay(date.value), notes: notes.value.trim(),
      }, q && q.id);
      m.close();
      NL.toast(q ? 'Price saved.' : 'New price recorded.');
      opts.onSaved && opts.onSaved(saved);
      NL.app.refresh();
    }

    const m = NL.modal(q ? 'Edit price' : 'Record new price', el('div.pt-form', {},
      field('Supplier *', supSel, suppliers.length ? null : 'No suppliers yet — add one with “＋ New supplier…”.'),
      el('div.pt-form-row', {}, field('Pack size', packQty), field('Unit of measure', uom.node), field('Pack config', cfg.node)),
      el('div.pt-form-row', {}, field('Price / ' + (cfg.input.value || 'pack') + ' *', el('span.pt-money', {}, '$', price)), field('Price / unit (calculated)', perUom)),
      el('label.pt-check', {}, pending, 'Price not confirmed yet (shows as “pricing pending”)'),
      el('div.pt-form-row', {}, field('Item number', sku), field('MOQ', moq), field('Lead time', lead)),
      el('div.pt-form-row', {}, field('Price date', date), el('span.pt-field')),
      field('Notes', notes),
      err), [el('button.btn', { onclick: () => m.close() }, 'Cancel'), el('button.btn.primary', { onclick: saveIt }, q ? 'Save changes' : 'Record price')],
      { sub: i.name + (base && !q ? ' · pack details copied from the last price' : '') });
    sync();
    (q || supplierId ? price : supSel).focus();
  }

  NL.quoteDialog = { open };
})();
