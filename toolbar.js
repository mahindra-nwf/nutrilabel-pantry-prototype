/* toolbar.js — top bar: brand, search, theme, who is signed in. */
(function () {
  const { el } = NL;
  let built = false;

  function render(state) {
    const bar = document.getElementById('topbar');
    if (!built) {
      built = true;
      const search = el('input.pt-search-input', {
        id: 'search', type: 'search', placeholder: 'Search ingredients, codes and supplier item numbers', autocomplete: 'off',
        oninput: (e) => NL.app.go({ query: e.target.value, view: NL.app.isList() ? state.view : 'all' }, { replace: true }),
        onkeydown: (e) => { if (e.key === 'Escape') { e.target.value = ''; NL.app.go({ query: '' }, { replace: true }); e.target.blur(); } },
      });
      const me = store.me();
      bar.replaceChildren(
        el('a.btn', { href: location.pathname.startsWith('/pantry/') ? '/' : '../nutrilabel-home-prototype/', title: 'All apps' }, '← Home'),
        el('a.brand', { href: '#/all' }, 'Northwest Frozen ', el('small', {}, 'Pantry')),
        el('label.pt-search', {}, el('span.ic', {}, '⌕'), search),
        el('span.spacer'),
        store.isLive ? el('span.tag', { title: 'Saved in this browser for now' }, 'Live')
          : el('span.tag', { title: 'Made-up data stored in this browser only' }, 'Playground'),
        el('button.btn.theme-btn', { id: 'themeBtn', title: 'Light / dark', onclick: () => NL.app.toggleTheme() }),
        el('span.pt-me', { title: me.name + ' · ' + me.title }, el('span.avatar', { style: { background: me.color } }, me.initials)));
    }
    const search = document.getElementById('search');
    if (document.activeElement !== search) search.value = state.query;
    document.getElementById('themeBtn').textContent = state.theme === 'dark' ? '☀' : '☾';
  }

  NL.toolbar = { render };
})();
