/* sidebar.js — the list views, Suppliers, Recycle Bin, and Reset demo data. */
(function () {
  const { el } = NL;

  function render(state) {
    const c = store.counts();
    const item = (view, ic, label, n, warn) => el('button' + (state.view === view ? '.on' : ''), {
      onclick: () => NL.app.go({ view, panel: null }), 'aria-current': state.view === view ? 'page' : null,
    }, el('span.ic', {}, ic), el('span.lbl', {}, label), n != null ? el('span.pt-count' + (warn && n ? '.warn' : ''), {}, String(n)) : null);

    NL.fill(document.getElementById('sidebar'),
      el('nav.pt-nav', { 'aria-label': 'Pantry' },
        el('div.pt-nav-h', {}, 'Ingredients'),
        item('all', '▤', 'All items', c.all),
        item('food', '◍', 'Food', c.food),
        item('packaging', '▢', 'Packaging', c.packaging),
        item('review', '⚠', 'Needs review', c.review, true),
        el('div.pt-nav-h', {}, 'More'),
        item('suppliers', '⛟', 'Suppliers', c.suppliers),
        item('bin', '♻', 'Recycle Bin', c.bin)),
      store.isLive
        ? el('div.pt-side-foot', {}, el('span.faint', {}, 'Live · shared with your team and the Recipe Builder.'))
        : el('div.pt-side-foot', {},
          el('span.faint', {}, 'Made-up data, saved in this browser only.'),
          el('button.btn.ghost.sm', { onclick: () => NL.app.resetDemo() }, '↺ Reset demo data')));
  }

  NL.sidebar = { render };
})();
