/* ui.js — small shared helpers (DOM builder, formatting, toast, dialogs, menu). No data access here.
   el/fill/toast/modal/menu are the Workspace prototype's helpers, renamed ws- → pt-. */
window.NL = window.NL || {};
(function () {
  // el('div.card', { onclick }, child, 'text', …)
  function el(tag, attrs, ...kids) {
    const [name, ...cls] = tag.split('.');
    const n = document.createElement(name || 'div');
    if (cls.length) n.className = cls.join(' ');
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) { if (p.startsWith('--')) n.style.setProperty(p, x); else n.style[p] = x; }
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k in n && k !== 'list') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  // replaceChildren() that skips null/false
  const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

  const DAY = 86400e3;
  function timeAgo(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    if (d < 7) return d === 1 ? 'yesterday' : d + ' days ago';
    return d + ' days ago';
  }
  const date = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const dateTime = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const money = (n, dp = 2) => (n == null ? '—' : '$' + Number(n).toFixed(dp));
  const ageClass = (t) => { const d = (Date.now() - t) / DAY; return d < 90 ? 'fresh' : d < 180 ? 'aging' : 'stale'; };
  const num = (v) => (v == null ? '' : String(+Number(v).toFixed(4)));
  const kb = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  // a number input's value → number | null (blank or invalid = unknown)
  function readNum(v) { const s = String(v).trim(); if (!s) return null; const x = Number(s); return Number.isFinite(x) && x >= 0 ? x : null; }

  let toastTimer;
  function toast(msg, action) {
    let t = document.querySelector('.pt-toast');
    if (!t) { t = el('div.pt-toast', { role: 'status' }); document.body.append(t); }
    t.replaceChildren(el('span', {}, msg));
    if (action) t.append(el('button', { onclick: () => { t.classList.remove('show'); action.run(); } }, action.label));
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2800);
  }

  // Modal dialog shell. Returns { close, box }. onClose runs once however it closes (✕, Esc, backdrop, close()).
  function modal(title, body, foot, opts = {}) {
    let done = false;
    const close = () => { if (done) return; done = true; ov.remove(); document.removeEventListener('keydown', onKey, true); opts.onClose && opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape' && ov === [...document.querySelectorAll('.nl-prompt-ov')].pop()) { e.stopPropagation(); close(); } };
    const box = el('div.pt-dialog' + (opts.wide ? '.wide' : '') + (opts.cls ? '.' + opts.cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div.pt-dialog-head', {}, el('h2', {}, title), opts.sub ? el('p.muted', {}, opts.sub) : null, el('button.pt-x', { title: 'Close', 'aria-label': 'Close', onclick: close }, '✕')),
      el('div.pt-dialog-body', {}, body),
      foot ? el('div.pt-dialog-foot', {}, foot) : null);
    const ov = el('div.nl-prompt-ov', { onmousedown: (e) => { if (e.target === ov && !opts.sticky) close(); } }, box);
    document.body.append(ov);
    document.addEventListener('keydown', onKey, true);
    return { close, box };
  }

  // confirm('Title', 'text', { ok: 'Delete', danger: true }) → Promise<boolean>
  function confirm(title, text, opts = {}) {
    return new Promise((resolve) => {
      let answer = false;
      const m = modal(title, el('p.pt-confirm-text', {}, text), [
        el('button.btn', { onclick: () => m.close() }, opts.cancel || 'Cancel'),
        el('button.btn.primary' + (opts.danger ? '.danger' : ''), { onclick: () => { answer = true; m.close(); } }, opts.ok || 'OK'),
      ], { cls: 'small', onClose: () => resolve(answer) });
      m.box.querySelector('.btn.primary').focus();
    });
  }
  function alertBox(title, text) { return confirm(title, text, { ok: 'OK', cancel: 'Close' }); }

  // Floating menu: items = [{ label, icon, run, danger, disabled }] | 'sep'
  function menu(x, y, items) {
    closeMenu();
    const m = el('div.pt-menu', { role: 'menu' }, items.map((it) => it === 'sep' ? el('div.pt-menu-sep') :
      el('button' + (it.danger ? '.danger' : ''), { role: 'menuitem', disabled: it.disabled, onclick: () => { closeMenu(); it.run(); } },
        it.icon ? el('span.ic', {}, it.icon) : null, it.label)));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    function onDoc(e) { if (!m.contains(e.target)) closeMenu(); }
    m._off = () => document.removeEventListener('mousedown', onDoc);
  }
  function closeMenu() { document.querySelectorAll('.pt-menu').forEach((m) => { m._off && m._off(); m.remove(); }); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // Combobox: a text input with a suggestion list (free text allowed), like the Raw Materials ComboBox
  function combo(value, options, attrs = {}) {
    const id = 'dl-' + Math.random().toString(36).slice(2, 8);
    const input = el('input.txt', Object.assign({ value: value || '', autocomplete: 'off' }, attrs));
    input.setAttribute('list', id);
    const list = el('datalist', { id }, options.map((o) => el('option', { value: o })));
    return { node: el('span.pt-combo', {}, input, list), input };
  }

  // labelled form field
  const field = (label, control, hint, cls) => el('label.pt-field' + (cls ? '.' + cls : ''), {}, el('span.pt-label', {}, label), control, hint ? el('span.pt-hint', {}, hint) : null);

  // supplier color dot
  const dot = (color) => el('span.pt-dot', { style: { background: color || 'var(--faint)' } });

  // open a stored file (data URL) in a new tab; browsers block data: URLs as top-level pages, so go through a blob
  async function openDataUrl(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  }

  Object.assign(NL, { el, fill, timeAgo, date, dateTime, money, ageClass, num, kb, readNum, toast, modal, confirm, alertBox, menu, closeMenu, combo, field, dot, openDataUrl });
})();
