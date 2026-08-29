/**
 * AUTOFORUM — edytor wizualny (tryb "WordPress na stronie").
 *
 * Ładowany przez cms.js tylko przy `?edit=1` i zalogowanym edytorze
 * (token z admin.html w localStorage['cms.auth']).
 *
 *  - teksty  : każdy [data-cms] → contenteditable (kind text / html z cms_strings)
 *  - linki   : [data-cms-href] → chip „Edytuj link”
 *  - media   : [data-cms-src] / [data-cms-bg] → chip „Wymień media” (zdjęcie / wideo / URL)
 *  - bloki   : [data-cms-region] → „+ Dodaj blok” (paleta), pasek ↑ ↓ ◉ ✎ ✕, pola inline
 *  - meta    : tytuł + opis strony (data-cms na <title> / data-cms-attr na <meta>)
 *  - Zapisz  : publikuje od razu (PATCH/POST/DELETE przez REST z tokenem edytora)
 */
(function () {
  'use strict';

  var A = window.AFCMS;
  if (!A || !A.editMode) return;
  if (window.__afEditorBooted) return;
  window.__afEditorBooted = true;

  var URL_ = A.SUPABASE_URL;
  var KEY = A.SUPABASE_KEY;
  var BUCKET = 'cms-media';
  var PAGE = A.page;
  var isMH = A.isMaybachBrand;

  var PAGE_NAMES = {
    landing: 'Strona główna', mercedes: 'Mercedes-Benz', maybach: 'Mercedes-Maybach',
    'zespol-mercedes': 'Zespół — Mercedes', 'zespol-maybach': 'Zespół — Maybach',
    'legal-dostawca-serwisu': 'Dostawca serwisu', 'legal-cookies': 'Cookies',
    'legal-ochrona-danych': 'Ochrona danych', 'legal-informacje-prawne': 'Informacje prawne',
    'legal-warunki-korzystania': 'Warunki korzystania'
  };

  // ============================================================
  // Auth
  // ============================================================
  var auth = null;
  try { auth = JSON.parse(localStorage.getItem('cms.auth')); } catch (_) { auth = null; }
  if (!auth || !auth.access_token) { toAdmin(); return; }

  function toAdmin() {
    var file = location.pathname.split('/').pop() || 'index.html';
    location.replace('admin.html?next=' + encodeURIComponent(file));
  }
  function saveAuth(a) { auth = a; localStorage.setItem('cms.auth', JSON.stringify(a)); }
  function jwtExp(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; }
    catch (_) { return 0; }
  }
  function ensureAuth() {
    if (jwtExp(auth.access_token) > Date.now() + 60000) return Promise.resolve(true);
    if (!auth.refresh_token) return Promise.resolve(false);
    return fetch(URL_ + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refresh_token })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.access_token) { saveAuth(j); return true; }
      return false;
    }).catch(function () { return false; });
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ apikey: KEY, Authorization: 'Bearer ' + auth.access_token }, opts.headers || {});
    var body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (opts.prefer) headers['Prefer'] = opts.prefer;
    return fetch(URL_ + path, { method: opts.method || 'GET', headers: headers, body: body }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = 'HTTP ' + r.status;
          try { var j = JSON.parse(t); msg = j.message || j.error_description || j.error || msg; } catch (_) {}
          var err = new Error(msg); err.status = r.status; throw err;
        });
      }
      var ct = r.headers.get('content-type') || '';
      return ct.indexOf('json') >= 0 ? r.json() : null;
    });
  }

  function uploadFile(file, onProgress) {
    var ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    var safe = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'media';
    var path = Date.now() + '_' + safe + '.' + ext;
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', URL_ + '/storage/v1/object/' + BUCKET + '/' + encodeURIComponent(path));
      xhr.setRequestHeader('apikey', KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + auth.access_token);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'false');
      if (xhr.upload && onProgress) xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(URL_ + '/storage/v1/object/public/' + BUCKET + '/' + encodeURIComponent(path));
        } else {
          var msg = 'Upload ' + xhr.status;
          try { msg = JSON.parse(xhr.responseText).message || msg; } catch (_) {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = function () { reject(new Error('Błąd sieci podczas wgrywania')); };
      xhr.send(file);
    });
  }

  // ============================================================
  // Małe helpery DOM
  // ============================================================
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else el.setAttribute(k, v);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isDark(el) {
    try {
      var c = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
      if (!c) return false;
      var l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      return l > 140;
    } catch (_) { return false; }
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ============================================================
  // UI chrome: gate, bar, toast, chip, panel
  // ============================================================
  var gate = h('div', { class: 'cms-gate cms-ed', text: 'Ładowanie edytora…' });
  document.body.appendChild(gate);

  var toastEl = h('div', { class: 'cms-toast cms-ed' });
  document.body.appendChild(toastEl);
  var toastT;
  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('is-error', !!isErr);
    toastEl.classList.add('is-visible');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-visible'); }, isErr ? 5000 : 2600);
  }

  var statusEl, statusText, saveBtn;
  var bar = h('div', { class: 'cms-bar cms-ed' }, [
    h('span', { class: 'cms-bar__brand', text: 'Autoforum · Edytor' }),
    h('span', { class: 'cms-bar__page', text: PAGE_NAMES[PAGE] || PAGE }),
    (statusEl = h('span', { class: 'cms-bar__status saved' }, [h('span', { class: 'dot' }), (statusText = h('span', { text: 'Zapisano' }))])),
    h('span', { class: 'cms-bar__spacer' }),
    h('span', { class: 'cms-bar__user', text: (auth.user && auth.user.email) || '' }),
    h('button', { class: 'cms-btn cms-btn--ghost', type: 'button', text: 'Meta / SEO', on: { click: openMeta } }),
    h('a', { class: 'cms-btn cms-btn--ghost', href: 'admin.html', text: 'Panel' }),
    h('a', { class: 'cms-btn', href: location.pathname + '?v=' + Date.now(), target: '_blank', rel: 'noopener', text: 'Podgląd ↗' }),
    (saveBtn = h('button', { class: 'cms-btn cms-btn--solid', type: 'button', text: 'Zapisz', on: { click: save } })),
    h('button', { class: 'cms-btn cms-btn--ghost', type: 'button', text: 'Wyloguj', on: { click: function () { localStorage.removeItem('cms.auth'); location.href = 'admin.html'; } } })
  ]);
  document.body.appendChild(bar);

  var STATUS = { saved: 'Zapisano', dirty: 'Niezapisane', saving: 'Zapisywanie…', error: 'Błąd zapisu' };
  function setStatus(s) {
    statusEl.className = 'cms-bar__status ' + s;
    statusText.textContent = STATUS[s];
    saveBtn.disabled = (s === 'saving');
  }

  // Panel (modal)
  var panel = h('div', { class: 'cms-panel cms-ed' });
  document.body.appendChild(panel);
  panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel(); });
  function openPanel(opts) {
    panel.innerHTML = '';
    var box = h('div', { class: 'cms-panel__box' + (opts.small ? ' cms-panel__box--sm' : '') });
    if (opts.eyebrow) box.appendChild(h('span', { class: 'cms-panel__eyebrow', text: opts.eyebrow }));
    if (opts.title) box.appendChild(h('h2', { class: 'cms-panel__title', text: opts.title }));
    if (opts.desc) box.appendChild(h('p', { class: 'cms-panel__desc', text: opts.desc }));
    if (opts.body) box.appendChild(opts.body);
    if (opts.buttons && opts.buttons.length) {
      var foot = h('div', { class: 'cms-panel__foot' });
      opts.buttons.forEach(function (b) {
        foot.appendChild(h('button', { class: 'cms-btn ' + (b.cls || ''), type: 'button', text: b.label, on: { click: function () { if (b.onClick) b.onClick(); else closePanel(); } } }));
      });
      box.appendChild(foot);
    }
    panel.appendChild(box);
    panel.classList.add('is-open');
    var f = box.querySelector('input, textarea, select, button');
    if (f && opts.focus !== false) setTimeout(function () { f.focus(); }, 30);
    return box;
  }
  function closePanel() { panel.classList.remove('is-open'); panel.innerHTML = ''; }
  function confirmPanel(title, desc, okLabel, onOk) {
    openPanel({
      small: true, title: title, desc: desc, focus: false,
      buttons: [{ label: 'Anuluj' }, { label: okLabel || 'Usuń', cls: 'cms-btn--danger', onClick: function () { closePanel(); onOk(); } }]
    });
  }

  // Pływający chip (media / link)
  var chip = h('div', { class: 'cms-chip cms-ed' });
  document.body.appendChild(chip);
  var chipTarget = null, chipHide;
  function showChip(target, label, onClick) {
    clearTimeout(chipHide);
    chipTarget = target;
    chip.textContent = label;
    chip.onclick = function (e) { e.preventDefault(); e.stopPropagation(); onClick(target); };
    positionChip();
    chip.classList.add('is-visible');
  }
  function positionChip() {
    if (!chipTarget) return;
    var r = chipTarget.getBoundingClientRect();
    var top = Math.max(84, Math.min(window.innerHeight - 110, r.top + 12));
    var left = Math.max(8, Math.min(window.innerWidth - 220, r.left + 12));
    chip.style.top = top + 'px';
    chip.style.left = left + 'px';
  }
  function hideChipSoon() { clearTimeout(chipHide); chipHide = setTimeout(function () { chip.classList.remove('is-visible'); chipTarget = null; }, 250); }
  chip.addEventListener('mouseenter', function () { clearTimeout(chipHide); });
  chip.addEventListener('mouseleave', hideChipSoon);
  window.addEventListener('scroll', function () { if (chipTarget) positionChip(); }, { passive: true });

  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest ? e.target.closest('[data-cms-src],[data-cms-bg],[data-cms-href],.cms-embed[data-cms-src]') : null;
    if (!t || t.closest('.cms-ed') || t.closest('[data-block-type]')) return;
    if (t.hasAttribute('data-cms-src') || t.hasAttribute('data-cms-bg')) {
      showChip(t, '⟳ Wymień media', openMediaChooserFor);
    } else if (t.hasAttribute('data-cms-href')) {
      showChip(t, '✎ Edytuj link', openHrefEditor);
    }
  });
  document.addEventListener('mouseout', function (e) {
    var t = e.target.closest ? e.target.closest('[data-cms-src],[data-cms-bg],[data-cms-href]') : null;
    if (t && t === chipTarget) hideChipSoon();
  });

  // ============================================================
  // Stan
  // ============================================================
  var baseline = '';
  var stringsBase = new Map();   // key -> value at load (DOM)
  var mediaChanged = new Map();  // key -> url
  var mediaExisting = new Set(); // keys istniejące w cms_media
  var regions = new Map();       // regionId -> [{id, type, data, visible, order_index, _deleted, _dirty, _orig}]
  var metaState = {};            // key -> value (title/meta)

  var checkDirty = debounce(function () {
    var now = serialize();
    if (now === baseline) { if (!statusEl.classList.contains('saving')) setStatus('saved'); }
    else setStatus('dirty');
  }, 150);

  function serialize() {
    var o = { s: collectStrings(), m: Array.from(mediaChanged.entries()), meta: metaState, b: {} };
    regions.forEach(function (list, id) {
      o.b[id] = list.map(function (b) { return { id: b.id, type: b.type, data: b.data, visible: b.visible, del: !!b._deleted }; });
    });
    return JSON.stringify(o);
  }

  window.addEventListener('beforeunload', function (e) {
    if (statusEl.classList.contains('dirty')) { e.preventDefault(); e.returnValue = ''; }
  });

  // ============================================================
  // Teksty (data-cms)
  // ============================================================
  var ALLOWED_TAGS = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, UL: 1, OL: 1, LI: 1, H2: 1, H3: 1, H4: 1, A: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1, SUP: 1 };
  function sanitize(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType !== 1) { if (c.nodeType === 8) c.remove(); return; }
        if (c.tagName === 'SCRIPT' || c.tagName === 'STYLE') { c.remove(); return; }
        walk(c);
        if (!ALLOWED_TAGS[c.tagName]) {
          // rozpakuj (span, div, font…)
          while (c.firstChild) node.insertBefore(c.firstChild, c);
          c.remove();
          return;
        }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var ok = (c.tagName === 'A' && (a.name === 'href' || a.name === 'target' || a.name === 'rel'));
          if (!ok) c.removeAttribute(a.name);
        });
        if (c.tagName === 'A' && /^https?:/i.test(c.getAttribute('href') || '') && !c.getAttribute('target')) {
          c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener');
        }
      });
    })(tpl.content);
    return tpl.innerHTML.trim();
  }

  function kindOf(key, el) {
    var row = A.strings.get(key);
    if (row && row.kind) return row.kind;
    return el.children.length ? 'html' : 'text';
  }

  function valueOf(el) {
    var key = el.getAttribute('data-cms');
    var k = kindOf(key, el);
    if (k === 'html') return sanitize(el.innerHTML);
    return el.textContent.replace(/\s+/g, ' ').trim();
  }

  function enhanceText(el) {
    if (el._afEnh) return; el._afEnh = true;
    var tag = el.tagName;
    if (tag === 'TITLE' || tag === 'META' || tag === 'SCRIPT') return;
    var key = el.getAttribute('data-cms');
    var k = kindOf(key, el);
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('data-placeholder', 'Tekst…');
    if (isDark(el)) el.classList.add('cms-on-dark');
    el.addEventListener('input', checkDirty);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && k !== 'html' && k !== 'longtext') { e.preventDefault(); el.blur(); }
      if (e.key === 'Enter' && k === 'longtext') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    });
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    if (tag === 'A') el.addEventListener('click', function (e) { e.preventDefault(); });
  }

  function collectStrings() {
    var out = {};
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      if (el.tagName === 'TITLE' || el.closest('.cms-ed') || el.closest('[data-block-type]')) return;
      var key = el.getAttribute('data-cms');
      if (out[key] !== undefined) return;
      out[key] = valueOf(el);
    });
    return out;
  }

  // ---- Linki (data-cms-href) ----
  function openHrefEditor(a) {
    var key = a.getAttribute('data-cms-href');
    var input = h('input', { type: 'url', value: a.getAttribute('href') || '' });
    var body = h('div', { class: 'cms-form' }, [
      h('div', { class: 'cms-field' }, [h('label', { text: 'Adres linku' }), input,
        h('div', { class: 'hint', text: 'Pełny URL (https://…), „#kotwica” na tej stronie, „tel:” lub „mailto:”.' })])
    ]);
    openPanel({
      eyebrow: 'Link', title: (a.textContent || '').trim().slice(0, 60) || key, body: body,
      buttons: [{ label: 'Anuluj' }, { label: 'Zastosuj', cls: 'cms-btn--solid', onClick: function () {
        a.setAttribute('href', input.value.trim());
        hrefChanged.set(key, input.value.trim());
        closePanel(); checkDirty();
      } }]
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); body.parentNode.querySelector('.cms-btn--solid').click(); } });
  }
  var hrefChanged = new Map();

  // ---- Meta / SEO ----
  function openMeta() {
    var titleEl = document.querySelector('title[data-cms]');
    var metaEl = document.querySelector('meta[name="description"][data-cms-attr]');
    var tKey = titleEl && titleEl.getAttribute('data-cms');
    var mKey = metaEl && (metaEl.getAttribute('data-cms-attr').split(':')[1] || '').trim();
    var tIn = h('input', { type: 'text', value: titleEl ? titleEl.textContent : '' });
    var mIn = h('textarea', { text: metaEl ? (metaEl.getAttribute('content') || '') : '' });
    var body = h('div', { class: 'cms-form' }, [
      tKey ? h('div', { class: 'cms-field' }, [h('label', { text: 'Tytuł strony (zakładka przeglądarki, Google)' }), tIn]) : null,
      mKey ? h('div', { class: 'cms-field' }, [h('label', { text: 'Opis strony (wynik Google)' }), mIn, h('div', { class: 'hint', text: 'Ok. 150–160 znaków.' })]) : null
    ]);
    if (!tKey && !mKey) { toast('Ta strona nie ma edytowalnych meta-danych.', true); return; }
    openPanel({
      eyebrow: 'Meta / SEO', title: PAGE_NAMES[PAGE] || PAGE, body: body,
      buttons: [{ label: 'Anuluj' }, { label: 'Zastosuj', cls: 'cms-btn--solid', onClick: function () {
        if (tKey) { titleEl.textContent = tIn.value.trim(); metaState[tKey] = tIn.value.trim(); }
        if (mKey) { metaEl.setAttribute('content', mIn.value.trim()); metaState[mKey] = mIn.value.trim(); }
        closePanel(); checkDirty();
      } }]
    });
  }

  // ============================================================
  // Media (data-cms-src / data-cms-bg) — zdjęcie LUB wideo
  // ============================================================
  function mediaChooser(current, onPick, opts) {
    opts = opts || {};
    var progress = h('div', { class: 'cms-progress' }, [h('i')]);
    var body = h('div', { class: 'cms-media-choice' });
    var fileIn = h('input', { type: 'file', style: 'display:none' });
    function pickFile(accept, kindLabel) {
      fileIn.accept = accept;
      fileIn.onchange = function () {
        var f = fileIn.files && fileIn.files[0]; if (!f) return;
        if (f.size > 50 * 1024 * 1024) { toast('Plik jest większy niż 50 MB.', true); return; }
        progress.classList.add('is-on');
        Array.prototype.forEach.call(body.querySelectorAll('button'), function (b) { b.disabled = true; });
        ensureAuth().then(function (ok) {
          if (!ok) { toAdmin(); return; }
          return uploadFile(f).then(function (url) {
            closePanel();
            toast(kindLabel + ' wgrane ✓');
            onPick(url);
          });
        }).catch(function (e) {
          progress.classList.remove('is-on');
          Array.prototype.forEach.call(body.querySelectorAll('button'), function (b) { b.disabled = false; });
          toast('Błąd wgrywania: ' + e.message, true);
        });
      };
      fileIn.value = '';
      fileIn.click();
    }
    body.appendChild(h('button', { type: 'button', on: { click: function () { pickFile('image/*', 'Zdjęcie'); } } }, [
      h('span', { class: 'nm', text: 'Zdjęcie z dysku' }), h('span', { class: 'ds', text: 'JPG, PNG, WebP. Najlepiej 1600–2400 px szerokości.' })]));
    body.appendChild(h('button', { type: 'button', on: { click: function () { pickFile('video/mp4,video/webm,video/quicktime', 'Wideo'); } } }, [
      h('span', { class: 'nm', text: 'Wideo z dysku' }), h('span', { class: 'ds', text: 'MP4 lub WebM, do 50 MB. Odtwarzane automatycznie, w pętli, bez dźwięku.' })]));
    var urlIn = h('input', { type: 'url', value: current || '', placeholder: 'https://… (zdjęcie, plik wideo, YouTube, Vimeo)' });
    body.appendChild(h('div', { class: 'cms-field' }, [h('label', { text: 'Albo adres URL' }), urlIn,
      h('div', { class: 'hint', text: 'Link do zdjęcia / pliku wideo albo film z YouTube lub Vimeo.' })]));
    body.appendChild(fileIn);
    body.appendChild(progress);
    openPanel({
      eyebrow: opts.eyebrow || 'Media', title: opts.title || 'Wymień zdjęcie lub wideo', desc: opts.desc, body: body,
      buttons: [{ label: 'Anuluj' }, { label: 'Użyj adresu URL', cls: 'cms-btn--solid', onClick: function () {
        var u = urlIn.value.trim();
        if (!/^https?:\/\//i.test(u)) { toast('Podaj pełny adres zaczynający się od https://', true); return; }
        closePanel(); onPick(u);
      } }]
    });
  }

  function openMediaChooserFor(el) {
    var isBg = el.hasAttribute('data-cms-bg');
    var key = isBg ? el.getAttribute('data-cms-bg') : el.getAttribute('data-cms-src');
    var current = el.getAttribute('data-cms-url') || (el.tagName === 'IMG' || el.tagName === 'VIDEO' ? el.getAttribute('src') : '');
    chip.classList.remove('is-visible');
    mediaChooser(current, function (url) {
      if (isBg) A.applyBgMedia(el, url);
      else A.applyMedia(el, url);
      mediaChanged.set(key, url);
      checkDirty();
    }, { title: isBg ? 'Wymień tło sekcji' : 'Wymień zdjęcie lub wideo', desc: 'Klucz: ' + key });
  }

  // ============================================================
  // Bloki
  // ============================================================
  var TYPES = {
    model_card: { label: 'Karta modelu', ic: '▣', desc: 'Zdjęcie + linia + nazwa + cena + link (siatka modeli).', regions: ['mercedes.models'],
      make: function () { return { image_url: '', alt: '', series: 'Linia · Nadwozie · 2026', name: 'Nazwa modelu', price: 'od 000 000 zł', href: 'https://www.mercedes-benz.pl/', size: 'sm' }; },
      fields: [
        { key: 'image_url', label: 'Zdjęcie', kind: 'image', hint: '~1200×800 px.' },
        { key: 'alt', label: 'Tekst alternatywny', kind: 'text' },
        { key: 'series', label: 'Linia (etykieta nad nazwą)', kind: 'text' },
        { key: 'name', label: 'Nazwa modelu', kind: 'text' },
        { key: 'price', label: 'Cena', kind: 'text' },
        { key: 'href', label: 'Link', kind: 'url' },
        { key: 'size', label: 'Wielkość karty', kind: 'select', options: [['xl', 'XL — duża'], ['md', 'MD — średnia'], ['sm', 'SM — mała']] }
      ] },
    team_member: { label: 'Doradca', ic: '◉', desc: 'Portret + imię + e-mail + telefon.', regions: ['zespol-mercedes.team-list', 'zespol-maybach.team-list'],
      make: function () { return { portrait_url: '', name: 'Imię Nazwisko', email: 'imie.nazwisko@autoforum.pl', phone: '+48 22 400 00 00' }; },
      fields: [
        { key: 'portrait_url', label: 'Portret', kind: 'image', hint: 'Pion, ~600×800 px. Puste = placeholder.' },
        { key: 'name', label: 'Imię i nazwisko', kind: 'text' },
        { key: 'email', label: 'E-mail', kind: 'text' },
        { key: 'phone', label: 'Telefon', kind: 'text' }
      ] },
    promo_strip: { label: 'Pasek promocyjny', ic: '▬', desc: 'Wąski pasek z tekstem i opcjonalnym linkiem.', universal: true,
      make: function () { return { text: 'Otwarcie salonu — zapraszamy', link_label: 'Więcej', link_href: '', color: 'default' }; },
      fields: [
        { key: 'text', label: 'Tekst paska', kind: 'text' },
        { key: 'link_label', label: 'Etykieta linku', kind: 'text' },
        { key: 'link_href', label: 'Link', kind: 'url' },
        { key: 'color', label: 'Kolor', kind: 'select', options: [['default', 'Czarny'], ['cream', 'Jasny szary']] }
      ] },
    feature_split: { label: 'Sekcja split', ic: '◧', desc: 'Zdjęcie po jednej stronie, tekst + lista po drugiej.', universal: true,
      make: function () { return { image_url: '', image_position: 'left', eyebrow: 'Etykieta', title: 'Tytuł sekcji', title_bold: '', body_p1: 'Pierwszy akapit opisu.', body_p2: '', list_items: ['Atut pierwszy', 'Atut drugi'] }; },
      fields: [
        { key: 'image_url', label: 'Zdjęcie', kind: 'image' },
        { key: 'image_position', label: 'Pozycja zdjęcia', kind: 'select', options: [['left', 'Po lewej'], ['right', 'Po prawej']] },
        { key: 'eyebrow', label: 'Etykieta', kind: 'text' },
        { key: 'title', label: 'Tytuł', kind: 'text' },
        { key: 'title_bold', label: 'Tytuł — druga część', kind: 'text' },
        { key: 'body_p1', label: 'Akapit 1', kind: 'longtext' },
        { key: 'body_p2', label: 'Akapit 2', kind: 'longtext' },
        { key: 'list_items', label: 'Lista (jedna pozycja w linii)', kind: 'lines' }
      ] },
    quote_ribbon: { label: 'Cytat', ic: '❝', desc: 'Jedno zdanie wycentrowane na pełną szerokość.', universal: true,
      make: function () { return { text: 'Cytat lub hasło.' }; },
      fields: [{ key: 'text', label: 'Tekst cytatu', kind: 'text' }] },
    media: { label: 'Media — zdjęcie lub wideo', ic: '▶', desc: 'Zdjęcie, plik wideo albo YouTube / Vimeo na pełną szerokość.', universal: true,
      make: function () { return { src: '', alt: '', caption: '', layout: 'full', controls: '' }; },
      fields: [
        { key: 'src', label: 'Zdjęcie lub wideo', kind: 'media', hint: 'Plik z dysku (JPG/PNG/WebP, MP4/WebM do 50 MB) albo link, także YouTube / Vimeo.' },
        { key: 'alt', label: 'Tekst alternatywny', kind: 'text' },
        { key: 'caption', label: 'Podpis', kind: 'text' },
        { key: 'layout', label: 'Układ', kind: 'select', options: [['full', 'Na całą szerokość'], ['contained', 'Z marginesami']] },
        { key: 'controls', label: 'Sterowanie wideo', kind: 'select', options: [['', 'Autoodtwarzanie w pętli'], ['1', 'Przyciski odtwarzania']] }
      ] },
    cta_section: { label: 'Sekcja CTA', ic: '➔', desc: 'Tytuł, opis i przycisk (np. „Umów wizytę”).', universal: true,
      make: function () { return { title: 'Zapraszamy do', title_bold: 'salonu.', sub: 'Krótki opis zachęty.', button_label: 'Umów wizytę', button_href: '#book-modal' }; },
      fields: [
        { key: 'title', label: 'Tytuł', kind: 'text' },
        { key: 'title_bold', label: 'Tytuł — druga część', kind: 'text' },
        { key: 'sub', label: 'Opis', kind: 'longtext' },
        { key: 'button_label', label: 'Etykieta przycisku', kind: 'text' },
        { key: 'button_href', label: 'Link przycisku', kind: 'url', hint: '„#book-modal” otwiera okno rezerwacji.' }
      ] },
    text_section: { label: 'Sekcja tekstowa', ic: '¶', desc: 'Etykieta + tytuł + akapity, bez zdjęcia.', universal: true,
      make: function () { return { eyebrow: 'Etykieta', title: 'Tytuł sekcji', title_bold: '', body_paragraphs: ['Pierwszy akapit.'] }; },
      fields: [
        { key: 'eyebrow', label: 'Etykieta', kind: 'text' },
        { key: 'title', label: 'Tytuł', kind: 'text' },
        { key: 'title_bold', label: 'Tytuł — druga część', kind: 'text' },
        { key: 'body_paragraphs', label: 'Akapity (jeden w linii)', kind: 'lines' }
      ] },
    image_full: { label: 'Duże zdjęcie', ic: '▭', desc: 'Starszy typ — użyj „Media”.', legacy: true, universal: true,
      make: function () { return { image_url: '', alt: '', caption: '' }; },
      fields: [
        { key: 'image_url', label: 'Zdjęcie', kind: 'image' },
        { key: 'alt', label: 'Tekst alternatywny', kind: 'text' },
        { key: 'caption', label: 'Podpis', kind: 'text' }
      ] }
  };

  function allowedTypes(region) {
    return Object.keys(TYPES).filter(function (t) {
      var m = TYPES[t];
      if (m.legacy) return false;
      return m.universal || (m.regions || []).indexOf(region) >= 0;
    });
  }

  function regionEl(id) { return document.querySelector('[data-cms-region="' + id + '"]'); }

  function renderRegion(id) {
    var el = regionEl(id);
    if (!el) return;
    var list = regions.get(id) || [];
    el.innerHTML = '';
    list.forEach(function (b, i) {
      if (b._deleted) return;
      var node = A.renderBlock({ type: b.type, data: b.data }, i);
      if (!node) node = h('div', { text: 'Nieznany typ bloku: ' + b.type });
      node.setAttribute('data-block-type', b.type);
      node.classList.toggle('cms-hidden', !b.visible);
      node._block = b;
      b._node = node;
      el.appendChild(node);
      enhanceBlock(node, b);
    });
    var dark = isDark(el);
    var add = h('button', { class: 'cms-add cms-ed' + (dark ? ' cms-add--dark' : ''), type: 'button', text: '＋ Dodaj blok', on: { click: function () { openPalette(id); } } });
    el.appendChild(add);
    A.revealNewBlocks(el);
    el.querySelectorAll('.reveal').forEach(function (r) { r.classList.add('in-view'); });
  }

  function openPalette(regionId) {
    var grid = h('div', { class: 'cms-palette' });
    allowedTypes(regionId).forEach(function (t) {
      var m = TYPES[t];
      grid.appendChild(h('button', { type: 'button', on: { click: function () { addBlock(regionId, t); closePanel(); } } }, [
        h('span', { class: 'ic', text: m.ic }), h('span', { class: 'nm', text: m.label }), h('span', { class: 'ds', text: m.desc })]));
    });
    openPanel({ eyebrow: 'Dodaj blok', title: 'Wybierz rodzaj bloku', desc: 'Blok pojawi się na końcu tego miejsca na stronie. Potem możesz go przesunąć strzałkami, edytować tekst bezpośrednio albo przez „✎”.', body: grid, buttons: [{ label: 'Anuluj' }], focus: false });
  }

  function addBlock(regionId, type) {
    var list = regions.get(regionId) || [];
    var b = { id: null, type: type, data: TYPES[type].make(), visible: true, _dirty: true };
    list.push(b);
    regions.set(regionId, list);
    renderRegion(regionId);
    checkDirty();
    if (b._node) b._node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var needsMedia = (type === 'media' || type === 'model_card' || type === 'team_member' || type === 'feature_split');
    if (needsMedia) setTimeout(function () { openFields(b); }, 400);
  }

  function moveBlock(b, dir) {
    var list = regions.get(b._region);
    var vis = list.filter(function (x) { return !x._deleted; });
    var i = vis.indexOf(b);
    var j = i + dir;
    if (j < 0 || j >= vis.length) return;
    var a = list.indexOf(vis[i]), c = list.indexOf(vis[j]);
    list[a] = vis[j]; list[c] = vis[i];
    vis[i]._dirty = true; vis[j]._dirty = true;
    renderRegion(b._region);
    checkDirty();
    if (b._node) b._node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function enhanceBlock(node, b) {
    var region = node.parentNode.getAttribute('data-cms-region');
    b._region = region;
    var list = regions.get(region).filter(function (x) { return !x._deleted; });
    var idx = list.indexOf(b);
    var tb = h('div', { class: 'cms-tb cms-ed' }, [
      h('span', { class: 'cms-tb__label', text: TYPES[b.type] ? TYPES[b.type].label : b.type }),
      h('button', { type: 'button', title: 'W górę', text: '↑', disabled: idx === 0 ? '' : null, on: { click: function (e) { e.stopPropagation(); moveBlock(b, -1); } } }),
      h('button', { type: 'button', title: 'W dół', text: '↓', disabled: idx === list.length - 1 ? '' : null, on: { click: function (e) { e.stopPropagation(); moveBlock(b, 1); } } }),
      h('button', { type: 'button', class: b.visible ? '' : 'is-on', title: b.visible ? 'Ukryj' : 'Pokaż', text: '◉', on: { click: function (e) { e.stopPropagation(); b.visible = !b.visible; b._dirty = true; renderRegion(region); checkDirty(); } } }),
      h('button', { type: 'button', title: 'Edytuj pola', text: '✎', on: { click: function (e) { e.stopPropagation(); openFields(b); } } }),
      h('button', { type: 'button', class: 'del', title: 'Usuń blok', text: '✕', on: { click: function (e) {
        e.stopPropagation();
        confirmPanel('Usunąć blok?', 'Blok „' + (TYPES[b.type] ? TYPES[b.type].label : b.type) + '” zniknie ze strony po zapisaniu.', 'Usuń', function () {
          if (b.id) { b._deleted = true; } else { var l = regions.get(region); l.splice(l.indexOf(b), 1); }
          renderRegion(region); checkDirty();
        });
      } } })
    ]);
    node.appendChild(tb);
    mapInlineFields(node, b);
  }

  // ---- Pola inline w blokach ----
  function wrapFirstText(parent, field) {
    if (!parent) return null;
    var tn = null;
    for (var i = 0; i < parent.childNodes.length; i++) {
      if (parent.childNodes[i].nodeType === 3 && parent.childNodes[i].textContent.trim()) { tn = parent.childNodes[i]; break; }
    }
    var span = h('span', { 'data-f': field });
    if (tn) { span.textContent = tn.textContent.trim(); parent.replaceChild(span, tn); }
    else parent.insertBefore(span, parent.firstChild);
    return span;
  }
  function tag(el, field) { if (el) el.setAttribute('data-f', field); return el; }

  function mapInlineFields(node, b) {
    var t = b.type, d = b.data;
    switch (t) {
      case 'model_card':
        tag(node.querySelector('.mb-model__series'), 'series');
        tag(node.querySelector('.mb-model__name'), 'name');
        tag(node.querySelector('.mb-model__price span'), 'price');
        break;
      case 'team_member':
        tag(node.querySelector('.team-member__name'), 'name');
        var p = node.querySelector('.team-member__contact');
        if (p) {
          p.innerHTML = '';
          p.appendChild(h('span', { 'data-f': 'email', text: d.email || '' }));
          p.appendChild(h('br'));
          p.appendChild(h('span', { 'data-f': 'phone', text: d.phone || '' }));
        }
        break;
      case 'promo_strip':
        tag(node.querySelector('.cms-promo-strip__text'), 'text');
        tag(node.querySelector('.cms-promo-strip__cta'), 'link_label');
        break;
      case 'quote_ribbon':
        tag(node.querySelector('blockquote'), 'text');
        break;
      case 'media':
      case 'image_full':
        tag(node.querySelector('.cms-media-block__caption, .eyebrow, .mh-eyebrow'), 'caption');
        break;
      case 'cta_section':
        var h2 = node.querySelector('h2');
        if (h2) { wrapFirstText(h2, 'title'); tag(h2.querySelector('b'), 'title_bold'); }
        tag(node.querySelector('p'), 'sub');
        tag(node.querySelector('.btn-label'), 'button_label');
        break;
      case 'text_section':
        tag(node.querySelector('.eyebrow, .mh-eyebrow'), 'eyebrow');
        var h2b = node.querySelector('h2');
        if (h2b) { wrapFirstText(h2b, 'title'); tag(h2b.querySelector('b'), 'title_bold'); }
        node.querySelectorAll('p:not(.eyebrow)').forEach(function (p, i) { p.setAttribute('data-f', 'body_paragraphs[]'); });
        break;
      case 'feature_split':
        tag(node.querySelector('.eyebrow, .mh-eyebrow'), 'eyebrow');
        var h2c = node.querySelector('h2');
        if (h2c) { wrapFirstText(h2c, 'title'); tag(h2c.querySelector('b'), 'title_bold'); }
        var ps = node.querySelectorAll('p');
        if (ps[0]) ps[0].setAttribute('data-f', 'body_p1');
        if (ps[1]) ps[1].setAttribute('data-f', 'body_p2');
        node.querySelectorAll('li').forEach(function (li) { li.setAttribute('data-f', 'list_items[]'); });
        break;
    }
    node.querySelectorAll('[data-f]').forEach(function (el) {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      el.setAttribute('data-placeholder', '…');
      if (isDark(el)) el.classList.add('cms-on-dark');
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      el.addEventListener('paste', function (e) {
        e.preventDefault();
        document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
      });
      el.addEventListener('click', function (e) { e.stopPropagation(); });
      el.addEventListener('input', function () { readInline(node, b); b._dirty = true; checkDirty(); });
    });
  }

  function readInline(node, b) {
    var arrays = {};
    node.querySelectorAll('[data-f]').forEach(function (el) {
      var f = el.getAttribute('data-f');
      var v = el.textContent.replace(/\s+/g, ' ').trim();
      if (/\[\]$/.test(f)) { var k = f.slice(0, -2); (arrays[k] = arrays[k] || []).push(v); }
      else b.data[f] = v;
    });
    Object.keys(arrays).forEach(function (k) { b.data[k] = arrays[k].filter(Boolean); });
  }

  // ---- Formularz pól bloku (✎) ----
  function mediaField(f, draft) {
    var wrap = h('div', { class: 'cms-media-field' });
    var prev = h('div', { class: 'prev' });
    function setPrev(u) {
      prev.innerHTML = '';
      if (!u) { prev.textContent = 'brak'; return; }
      var k = A.mediaKind(u);
      if (k === 'video') { var v = h('video', { src: u, muted: '', playsinline: '' }); v.muted = true; prev.appendChild(v); }
      else if (k === 'embed') prev.textContent = '▶ YouTube / Vimeo';
      else prev.appendChild(h('img', { src: u, alt: '' }));
    }
    setPrev(draft[f.key]);
    var urlIn = h('input', { type: 'url', value: draft[f.key] || '', placeholder: 'https://…' });
    urlIn.addEventListener('input', function () { draft[f.key] = urlIn.value.trim(); setPrev(draft[f.key]); });
    var fileIn = h('input', { type: 'file', style: 'display:none', accept: f.kind === 'media' ? 'image/*,video/mp4,video/webm,video/quicktime' : 'image/*' });
    var upBtn = h('button', { class: 'cms-btn', type: 'button', text: f.kind === 'media' ? 'Wgraj zdjęcie / wideo' : 'Wgraj zdjęcie', on: { click: function () { fileIn.value = ''; fileIn.click(); } } });
    var note = h('div', { class: 'note', text: f.hint || '' });
    fileIn.addEventListener('change', function () {
      var file = fileIn.files && fileIn.files[0]; if (!file) return;
      if (file.size > 50 * 1024 * 1024) { toast('Plik jest większy niż 50 MB.', true); return; }
      upBtn.disabled = true; upBtn.textContent = 'Wgrywam… 0%';
      ensureAuth().then(function (ok) {
        if (!ok) { toAdmin(); return; }
        return uploadFile(file, function (p) { upBtn.textContent = 'Wgrywam… ' + Math.round(p * 100) + '%'; }).then(function (url) {
          draft[f.key] = url; urlIn.value = url; setPrev(url); toast('Wgrane ✓');
        });
      }).catch(function (e) { toast('Błąd wgrywania: ' + e.message, true); })
        .then(function () { upBtn.disabled = false; upBtn.textContent = f.kind === 'media' ? 'Wgraj zdjęcie / wideo' : 'Wgraj zdjęcie'; });
    });
    wrap.appendChild(prev);
    wrap.appendChild(h('div', { class: 'ctl' }, [h('div', { class: 'row' }, [upBtn]), urlIn, note, fileIn]));
    return wrap;
  }

  function openFields(b) {
    var meta = TYPES[b.type];
    if (!meta) { toast('Nieznany typ bloku.', true); return; }
    var draft = JSON.parse(JSON.stringify(b.data || {}));
    var form = h('div', { class: 'cms-form' });
    meta.fields.forEach(function (f) {
      var field = h('div', { class: 'cms-field' }, [h('label', { text: f.label })]);
      if (f.kind === 'image' || f.kind === 'media') {
        field.appendChild(mediaField(f, draft));
      } else if (f.kind === 'longtext' || f.kind === 'lines') {
        var ta = h('textarea');
        ta.value = f.kind === 'lines' ? (Array.isArray(draft[f.key]) ? draft[f.key].join('\n') : (draft[f.key] || '')) : (draft[f.key] || '');
        ta.addEventListener('input', function () {
          draft[f.key] = f.kind === 'lines' ? ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : ta.value;
        });
        field.appendChild(ta);
        if (f.hint) field.appendChild(h('div', { class: 'hint', text: f.hint }));
      } else if (f.kind === 'select') {
        var sel = h('select');
        f.options.forEach(function (o) { sel.appendChild(h('option', { value: o[0], text: o[1] })); });
        sel.value = (draft[f.key] === undefined || draft[f.key] === null) ? f.options[0][0] : String(draft[f.key]);
        if (sel.value !== String(draft[f.key] || '')) draft[f.key] = sel.value;
        sel.addEventListener('change', function () { draft[f.key] = sel.value; });
        field.appendChild(sel);
      } else {
        var inp = h('input', { type: f.kind === 'url' ? 'url' : 'text', value: draft[f.key] || '' });
        inp.addEventListener('input', function () { draft[f.key] = inp.value; });
        field.appendChild(inp);
        if (f.hint) field.appendChild(h('div', { class: 'hint', text: f.hint }));
      }
      form.appendChild(field);
    });
    openPanel({
      eyebrow: 'Blok', title: meta.label, desc: meta.desc, body: form,
      buttons: [{ label: 'Anuluj' }, { label: 'Zastosuj', cls: 'cms-btn--solid', onClick: function () {
        if (b.type === 'media' && draft.src) draft.kind = A.mediaKind(draft.src);
        if (b.type === 'media') draft.controls = draft.controls ? true : false;
        b.data = draft; b._dirty = true;
        closePanel(); renderRegion(b._region); checkDirty();
      } }]
    });
  }

  // ============================================================
  // Zapis
  // ============================================================
  function isJwtError(e) { return e && (e.status === 401 || /JWT|token|expired/i.test(e.message || '')); }

  function save() {
    if (statusEl.classList.contains('saving')) return;
    setStatus('saving');
    ensureAuth().then(function (ok) {
      if (!ok) { toAdmin(); return; }
      return saveStrings()
        .then(saveHrefs)
        .then(saveMeta)
        .then(saveMedia)
        .then(saveBlocks)
        .then(reloadBlocks)
        .then(function () {
          baseline = serialize();
          setStatus('saved');
          toast('Opublikowano na stronie ✓');
        });
    }).catch(function (e) {
      console.error('[editor] save', e);
      setStatus('error');
      if (isJwtError(e)) { toast('Sesja wygasła — zaloguj się ponownie.', true); setTimeout(toAdmin, 1500); return; }
      toast('Błąd zapisu: ' + e.message, true);
    });
  }

  function upsertString(key, value, kind) {
    var now = new Date().toISOString();
    return api('/rest/v1/cms_strings?key=eq.' + encodeURIComponent(key), {
      method: 'PATCH', prefer: 'return=representation',
      body: { value: value, updated_at: now, updated_by: auth.user.id }
    }).then(function (rows) {
      if (rows && rows.length) return;
      return api('/rest/v1/cms_strings', {
        method: 'POST', prefer: 'return=minimal',
        body: { key: key, value: value, page: PAGE, label: key, kind: kind || 'text', sort_index: 999, updated_at: now, updated_by: auth.user.id }
      });
    });
  }

  function seq(items, fn) {
    return items.reduce(function (p, it) { return p.then(function () { return fn(it); }); }, Promise.resolve());
  }

  function saveStrings() {
    var cur = collectStrings();
    var changed = Object.keys(cur).filter(function (k) { return cur[k] !== stringsBase.get(k); });
    return seq(changed, function (k) {
      var el = document.querySelector('[data-cms="' + k + '"]');
      var kind = el ? kindOf(k, el) : 'text';
      return upsertString(k, cur[k], kind).then(function () {
        stringsBase.set(k, cur[k]);
        var row = A.strings.get(k) || { key: k, kind: kind };
        row.value = cur[k]; A.strings.set(k, row);
      });
    });
  }

  function saveHrefs() {
    var items = Array.from(hrefChanged.entries());
    return seq(items, function (kv) {
      return upsertString(kv[0], kv[1], 'href').then(function () { hrefChanged.delete(kv[0]); });
    });
  }

  function saveMeta() {
    var items = Object.keys(metaState).map(function (k) { return [k, metaState[k]]; });
    return seq(items, function (kv) {
      return upsertString(kv[0], kv[1], 'text').then(function () { delete metaState[kv[0]]; });
    });
  }

  function saveMedia() {
    var items = Array.from(mediaChanged.entries());
    var now = new Date().toISOString();
    return seq(items, function (kv) {
      var key = kv[0], url = kv[1];
      return api('/rest/v1/cms_media?key=eq.' + encodeURIComponent(key), {
        method: 'PATCH', prefer: 'return=representation',
        body: { url: url, updated_at: now, updated_by: auth.user.id }
      }).then(function (rows) {
        if (rows && rows.length) return;
        return api('/rest/v1/cms_media', {
          method: 'POST', prefer: 'return=minimal',
          body: { key: key, url: url, page: PAGE, label: key, updated_at: now, updated_by: auth.user.id }
        });
      }).then(function () { mediaChanged.delete(key); A.media.set(key, url); });
    });
  }

  function saveBlocks() {
    var ops = [];
    var now = new Date().toISOString();
    regions.forEach(function (list, region) {
      var order = 0;
      list.forEach(function (b) {
        if (b._deleted) {
          if (b.id) ops.push(function () { return api('/rest/v1/cms_blocks?id=eq.' + b.id, { method: 'DELETE', prefer: 'return=minimal' }); });
          return;
        }
        order += 1;
        var orderChanged = b.order_index !== order;
        if (!b.id) {
          ops.push(function () {
            return api('/rest/v1/cms_blocks', {
              method: 'POST', prefer: 'return=representation',
              body: { page: PAGE, region: region, type: b.type, data: b.data, order_index: order, visible: b.visible, updated_by: auth.user.id }
            }).then(function (rows) { if (rows && rows[0]) { b.id = rows[0].id; } b.order_index = order; b._dirty = false; });
          });
        } else if (b._dirty || orderChanged) {
          ops.push(function () {
            return api('/rest/v1/cms_blocks?id=eq.' + b.id, {
              method: 'PATCH', prefer: 'return=minimal',
              body: { data: b.data, order_index: order, visible: b.visible, updated_at: now, updated_by: auth.user.id }
            }).then(function () { b.order_index = order; b._dirty = false; });
          });
        }
      });
    });
    return seq(ops, function (op) { return op(); });
  }

  function loadBlocks() {
    return api('/rest/v1/cms_blocks?select=id,region,type,data,order_index,visible&page=eq.' + encodeURIComponent(PAGE) + '&order=region.asc,order_index.asc');
  }

  function applyBlocks(rows) {
    regions = new Map();
    document.querySelectorAll('[data-cms-region]').forEach(function (el) { regions.set(el.getAttribute('data-cms-region'), []); });
    (rows || []).forEach(function (r) {
      if (!regions.has(r.region)) return;
      regions.get(r.region).push({ id: r.id, type: r.type, data: r.data || {}, visible: r.visible !== false, order_index: r.order_index, _dirty: false });
    });
    regions.forEach(function (_, id) { renderRegion(id); });
  }

  function reloadBlocks() { return loadBlocks().then(applyBlocks); }

  // ============================================================
  // Boot
  // ============================================================
  function boot() {
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      if (el.closest('.cms-ed') || el.closest('[data-cms-region]')) return;
      enhanceText(el);
    });
    var cur = collectStrings();
    Object.keys(cur).forEach(function (k) { stringsBase.set(k, cur[k]); });

    // wideo w hero itp. nie powinno "uciekać" spod kursora
    document.querySelectorAll('video').forEach(function (v) { v.controls = false; });

    return ensureAuth().then(function (ok) {
      if (!ok) { toAdmin(); return; }
      return loadBlocks().then(applyBlocks).catch(function (e) {
        if (isJwtError(e)) { toAdmin(); return; }
        console.warn('[editor] blocks', e);
        applyBlocks(A.rawBlocks || []);
        toast('Nie udało się pobrać bloków: ' + e.message, true);
      });
    }).then(function () {
      baseline = serialize();
      setStatus('saved');
      gate.classList.add('is-hidden');
      setTimeout(function () { gate.remove(); }, 400);
      toast('Tryb edycji: kliknij tekst, zdjęcie lub „+ Dodaj blok”.');
    });
  }

  // klik w link-kotwicę w trybie edycji nie nawiguje
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a, [data-modal-open]');
    if (a && !a.closest('.cms-ed')) { e.preventDefault(); if (a.hasAttribute('data-modal-open')) e.stopPropagation(); }
  }, true);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) {}

  boot();
})();
