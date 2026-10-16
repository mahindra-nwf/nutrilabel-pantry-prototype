/* recycle-bin.js — deleted items wait here 72 hours: Restore or Delete permanently. */
(function () {
  const { el } = NL;
  const H = 3600e3;

  function left(t) {
    const h = (t - Date.now()) / H;
    return h < 1 ? 'Less than 1 hour left' : 'Up to ' + Math.ceil(h) + ' hours left';
  }

  function render() {
    const items = store.listBin();
    NL.fill(document.getElementById('main'),
      el('div.pt-head', {},
        el('div', {}, el('h1', {}, 'Recycle Bin'),
          el('div.muted', {}, 'Deleted ingredients, supplier rows, prices, spec sheets and suppliers wait here for 3 days (72 hours). Restore puts them back where they were; restore a parent first (the ingredient before its supplier row).'))),
      items.length ? el('div.pt-bin', {}, items.map((b) => el('div.pt-bin-card' + ((b.expiresAt - Date.now()) < 6 * H ? '.soon' : ''), {},
        el('div.pt-bin-main', {},
          el('b', {}, b.name),
          el('div.faint', {}, b.kindLabel + ' · deleted ' + NL.dateTime(b.deletedAt) + (b.deletedBy ? ' by ' + b.deletedBy.name : '')),
          el('div.pt-bin-left', {}, 'Recover before ' + NL.dateTime(b.expiresAt) + ' · ' + left(b.expiresAt))),
        el('div.pt-bin-btns', {},
          el('button.btn.sm.primary', { onclick: () => {
            const r = store.restore(b.id);
            if (r.ok) { NL.toast(r.message); NL.app.refresh(); } else NL.alertBox('Couldn’t restore', r.message);
          } }, '↺ Restore'),
          el('button.btn.sm.danger-txt', { onclick: async () => {
            if (await NL.confirm('Delete permanently?', 'Permanently delete ' + b.name + '? This removes its saved copy and can’t be undone.', { ok: 'Delete permanently', danger: true })) {
              store.purge(b.id); NL.toast(b.name + ' permanently deleted.'); NL.app.refresh();
            }
          } }, 'Delete permanently')))))
        : el('div.pt-empty', {}, el('div.pt-empty-ic', {}, '♻'), el('p', {}, 'Your Recycle Bin is empty.')),
      el('p.faint.pt-bin-foot', {}, 'After the deadline, items are removed for good automatically.'));
  }

  NL.bin = { render };
})();
