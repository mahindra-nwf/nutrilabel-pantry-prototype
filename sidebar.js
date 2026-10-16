/* sidebar.js — ＋ New (item / ingredient / packaging, following the tab), the list views, Suppliers, Recycle Bin, Reset demo data. */
(function () {
  const { el } = NL;

  function render(state) {
    const c = store.counts();
    const item = (view, ic, label, n, warn) => el('button' + (state.view === view ? '.on' : ''), {
      onclick: () => NL.app.go({ view, panel: null }), 'aria-current': state.view === view ? 'page' : null,
    }, el('span.ic', {}, ic), el('span.lbl', {}, label), n != null ? el('span.pt-count' + (warn && n ? '.warn' : ''), {}, String(n)) : null);

    NL.fill(document.getElementById('sidebar'),
      el('button.pt-new', { onclick: () => NL.app.newIngredient() }, el('span.plus', {}, '＋'), NL.app.newLabel()),
      el('nav.pt-nav', { 'aria-label': 'Pantry' },
        el('div.pt-nav-h', {}, 'Ingredients'),
        item('all', '▤', 'All items', c.all),
        item('food', '◍', 'Food', c.food),
        item('packaging', '▢', 'Packaging', c.packaging),
        item('review', '⚠', 'Needs review', c.review, true),
        item('drafts', '✎', 'Drafts', c.drafts),
        el('div.pt-nav-h', {}, 'More'),
        item('suppliers', '⛟', 'Suppliers', c.suppliers),
        item('bin', '♻', 'Recycle Bin', c.bin)),
      el('div.pt-side-foot', {},
        el('span.faint', {}, 'Made-up data, saved in this browser only.'),
        el('button.btn.ghost.sm', { onclick: () => NL.app.resetDemo() }, '↺ Reset demo data')));
  }

  NL.sidebar = { render };
})();
