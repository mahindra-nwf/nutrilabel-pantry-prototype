/* app.js — screen state, routing (#/view[/ingredientId[/supplierId]]), shared actions, the resizable Details split.
   Every data change goes through store.*; then we re-render. */
(function () {
  const { el } = NL;
  const LIST_VIEWS = ['all', 'food', 'packaging', 'review', 'drafts'];
  const VIEWS = [...LIST_VIEWS, 'suppliers', 'bin'];
  const PANEL_MIN = 320, PANEL_DEFAULT = 580;

  const state = {
    view: 'all', query: '', category: '', supplierId: '', allergen: '',
    sort: { key: 'name', dir: 'asc' },
    panel: null,            // { ingredientId, supplierId|null }
    panelWidth: store.pref('panelWidth') || PANEL_DEFAULT,
    theme: store.pref('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  };
  const isList = () => LIST_VIEWS.includes(state.view);

  /* ---------- routing ---------- */
  function readHash() {
    const [, view, ingId, supId] = location.hash.split('/');
    state.view = VIEWS.includes(view) ? view : 'all';
    state.panel = isList() && ingId && store.getIngredient(ingId) ? { ingredientId: ingId, supplierId: supId || null } : null;
  }
  function hashFor() {
    return '#/' + state.view + (state.panel ? '/' + state.panel.ingredientId + (state.panel.supplierId ? '/' + state.panel.supplierId : '') : '');
  }
  function go(patch, opts = {}) {
    const prevView = state.view;
    Object.assign(state, patch);
    if (!isList()) state.panel = null;
    if (state.view !== prevView && !('query' in patch)) { /* keep search + filters when moving between list views */ }
    const h = hashFor();
    if (location.hash !== h) { if (opts.replace) history.replaceState(null, '', h); else history.pushState(null, '', h); }
    refresh();
  }
  addEventListener('popstate', () => { readHash(); refresh(); });
  addEventListener('hashchange', () => { readHash(); refresh(); });

  /* ---------- render ---------- */
  function refresh() {
    document.documentElement.dataset.theme = state.theme;
    // drop a panel whose ingredient is gone (recycled) or whose supplier row is gone
    if (state.panel) {
      const i = store.getIngredient(state.panel.ingredientId);
      if (!i) state.panel = null;
      else if (state.panel.supplierId && !i.sources.some((r) => r.supplierId === state.panel.supplierId)) state.panel.supplierId = null;
      const h = hashFor(); if (location.hash !== h) history.replaceState(null, '', h);
    }
    NL.toolbar.render(state);
    NL.sidebar.render(state);
    const shell = document.querySelector('.pt-shell');
    shell.classList.toggle('panel-open', !!state.panel);
    if (state.view === 'suppliers') NL.suppliers.render(state);
    else if (state.view === 'bin') NL.bin.render(state);
    else NL.list.render(state);
    renderPanel();
  }

  function renderPanel() {
    const box = document.getElementById('details');
    const div = document.getElementById('divider');
    box.hidden = div.hidden = !state.panel;
    if (!state.panel) return;
    applyWidth();
    NL.details.render(state);
  }

  /* ---------- resizable Details split (same limits as Raw Materials) ---------- */
  function maxWidth() { return Math.max(PANEL_MIN, Math.min(960, document.querySelector('.pt-shell').clientWidth - document.getElementById('sidebar').offsetWidth - 428)); }
  function applyWidth() {
    state.panelWidth = Math.min(Math.max(state.panelWidth, PANEL_MIN), maxWidth());
    document.getElementById('details').style.width = state.panelWidth + 'px';
    document.getElementById('divider').setAttribute('aria-valuenow', String(Math.round(state.panelWidth)));
  }
  function setWidth(w) { state.panelWidth = w; applyWidth(); store.pref('panelWidth', Math.round(state.panelWidth)); }
  (function wireDivider() {
    const div = document.getElementById('divider');
    div.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      div.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = state.panelWidth;
      document.body.classList.add('resizing');
      const move = (m) => setWidth(w0 + (x0 - m.clientX));
      const up = () => { div.removeEventListener('pointermove', move); div.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); };
      div.addEventListener('pointermove', move);
      div.addEventListener('pointerup', up);
    });
    div.addEventListener('keydown', (e) => {
      const k = { ArrowLeft: 24, ArrowRight: -24 }[e.key];
      if (k) { e.preventDefault(); setWidth(state.panelWidth + k); }
      if (e.key === 'Home') { e.preventDefault(); setWidth(PANEL_MIN); }
      if (e.key === 'End') { e.preventDefault(); setWidth(maxWidth()); }
    });
    addEventListener('resize', () => { if (state.panel) applyWidth(); });
  })();

  /* ---------- actions ---------- */
  function openPanel(ingredientId, supplierId) { go({ panel: { ingredientId, supplierId: supplierId || null } }); }
  function closePanel() { go({ panel: null }); }

  // the New button follows the tab: Food → ingredient (food types only), Packaging → packaging, anywhere else → any item
  const newKind = () => (state.view === 'food' || state.view === 'packaging' ? state.view : null);
  const newLabel = () => ({ food: 'New ingredient', packaging: 'New packaging' })[newKind()] || 'New item';
  function newIngredient() { NL.editor.open(null, { kind: newKind(), onSaved: (i, supId) => { if (!isList()) state.view = 'all'; openPanel(i.id, supId); } }); }
  function editIngredient(id, supplierId) { NL.editor.open(id, { supplierId, onSaved: (i, supId) => openPanel(i.id, supId || supplierId) }); }
  function recordPrice(ingredientId, supplierId) { NL.quoteDialog.open({ ingredientId, supplierId }, { onSaved: (q) => openPanel(ingredientId, q.supplierId) }); }
  function editQuote(quoteId) { const q = store.getQuote(quoteId); NL.quoteDialog.open({ ingredientId: q.ingredientId, supplierId: q.supplierId, quoteId }, { onSaved: () => refresh() }); }

  // toast with Undo = restore from the Recycle Bin
  function recycled(res, msg) {
    if (!res) return;
    refresh();
    NL.toast(msg, { label: 'Undo', run: () => { const r = store.restore(res.binId); NL.toast(r.ok ? 'Restored.' : r.message); refresh(); } });
  }

  async function deleteRow(ingredientId, supplierId) {
    const i = store.getIngredient(ingredientId);
    const row = supplierId && i.sources.find((r) => r.supplierId === supplierId);
    const last = !row || i.sources.length === 1;
    const ok = await NL.confirm('Move to Recycle Bin?',
      row ? 'Move ' + i.name + ' — ' + row.supplierName + ' (' + row.quoteCount + ' price record' + (row.quoteCount > 1 ? 's' : '') + ') to the Recycle Bin? You can restore it for 3 days.' +
        (last ? ' This is its last supplier row, so the ingredient and its spec sheets move too.' : '')
        : 'Move ' + i.name + ' and its spec sheets to the Recycle Bin? You can restore it for 3 days.',
      { ok: 'Move to Recycle Bin', danger: true });
    if (!ok) return;
    const res = row ? store.recycleSupplierRow(ingredientId, supplierId) : store.recycleIngredient(ingredientId);
    recycled(res, res && res.wholeIngredient ? 'Moved to Recycle Bin. Recover within 3 days.' : 'Row moved to Recycle Bin. Recover within 3 days.');
  }
  async function deleteIngredient(id) {
    const i = store.getIngredient(id);
    const n = i.sources.length;
    const ok = await NL.confirm('Move to Recycle Bin?',
      'Move ' + i.name + (n ? ', its ' + n + ' supplier row' + (n > 1 ? 's' : '') : '') + ' and its spec sheets to the Recycle Bin? You can restore them for 3 days.',
      { ok: 'Move to Recycle Bin', danger: true });
    if (ok) recycled(store.recycleIngredient(id), 'Moved to Recycle Bin. Recover within 3 days.');
  }
  async function deleteQuote(quoteId) {
    const ok = await NL.confirm('Move this price to the Recycle Bin?', 'Move this price record to the Recycle Bin for 3 days? If it is the last price from this supplier, the supplier row moves with it (and the ingredient, if it was the last row).', { ok: 'Move to Recycle Bin', danger: true });
    if (ok) recycled(store.recycleQuote(quoteId), 'Price moved to Recycle Bin. Recover within 3 days.');
  }

  function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; store.pref('theme', state.theme); refresh(); }
  async function resetDemo() {
    if (!(await NL.confirm('Reset demo data?', 'Put back the original sample ingredients, suppliers and prices? Everything you added or changed in this browser is lost.', { ok: 'Reset', danger: true }))) return;
    store.reset();
    Object.assign(state, { query: '', category: '', supplierId: '', allergen: '', panel: null });
    go({ view: 'all' });
    NL.toast('Demo data reset.');
  }

  NL.app = { state, go, refresh, openPanel, closePanel, newIngredient, newLabel, editIngredient, recordPrice, editQuote, deleteRow, deleteIngredient, deleteQuote, recycled, toggleTheme, resetDemo, isList };

  readHash();
  refresh();
  // the Recycle Bin countdown and "N days ago" labels stay current
  setInterval(() => { if (state.view === 'bin') NL.bin.render(state); }, 30e3);
})();
