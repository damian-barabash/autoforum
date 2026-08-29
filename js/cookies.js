/**
 * AUTOFORUM — zgoda na cookies
 * - baner przy pierwszym wejściu, decyzja w localStorage (`af_cookie_consent`)
 * - kategorie: niezbędne (zawsze), funkcjonalne (mapy Google), analityczne, marketingowe
 * - blokada osadzonych map Google do czasu zgody na "funkcjonalne"
 * - `[data-cookie-settings]` w stopce otwiera baner z ustawieniami
 * - teksty z CMS (klucze global.cookies.*) przez zdarzenie `cms:loaded`
 * API: window.AFCookies = { get(), set(obj), open() }; event `cookie-consent-changed`
 */
(function () {
  'use strict';

  var KEY = 'af_cookie_consent';
  var VERSION = 1;

  var T = {
    title: 'Pliki cookies',
    text: 'Używamy plików cookies i podobnych technologii, aby zapewnić prawidłowe działanie strony oraz — za Twoją zgodą — osadzać mapy Google i mierzyć ruch.',
    btn_all: 'Akceptuj wszystkie',
    btn_necessary: 'Tylko niezbędne',
    btn_settings: 'Ustawienia',
    btn_save: 'Zapisz wybór',
    cat_necessary: 'Niezbędne',
    cat_functional: 'Funkcjonalne (mapy Google)',
    cat_analytics: 'Analityczne',
    cat_marketing: 'Marketingowe',
    map_text: 'Mapa Google wymaga zgody na cookies funkcjonalne.',
    map_btn: 'Włącz mapę'
  };

  // ---- storage ------------------------------------------------------------
  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || c.v !== VERSION) return null;
      return c;
    } catch (e) { return null; }
  }
  function write(c) {
    var full = {
      v: VERSION,
      necessary: true,
      functional: !!c.functional,
      analytics: !!c.analytics,
      marketing: !!c.marketing,
      ts: new Date().toISOString()
    };
    try { window.localStorage.setItem(KEY, JSON.stringify(full)); } catch (e) {}
    consent = full;
    applyGates();
    try { document.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: full })); } catch (e) {}
    return full;
  }
  var consent = read();

  // ---- banner -------------------------------------------------------------
  var banner = null;

  function build() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'ck-title');
    banner.setAttribute('aria-describedby', 'ck-text');
    banner.innerHTML =
      '<h2 class="cookie-banner__title" id="ck-title" data-ck="title"></h2>' +
      '<p class="cookie-banner__text" id="ck-text"><span data-ck="text"></span> ' +
        'Szczegóły: <a href="cookies.html">Cookies</a> · <a href="ochrona-danych.html">Ochrona danych</a>.</p>' +
      '<div class="cookie-banner__settings" hidden>' +
        cat('necessary', true) + cat('functional') + cat('analytics') + cat('marketing') +
      '</div>' +
      '<div class="cookie-banner__actions">' +
        '<button type="button" class="btn btn--solid" data-ck-act="all"><span class="btn-label" data-ck="btn_all"></span></button>' +
        '<button type="button" class="btn" data-ck-act="necessary"><span class="btn-label" data-ck="btn_necessary"></span></button>' +
        '<button type="button" class="btn btn--solid" data-ck-act="save" hidden><span class="btn-label" data-ck="btn_save"></span></button>' +
        '<button type="button" class="cookie-banner__link" data-ck-act="settings" data-ck="btn_settings"></button>' +
      '</div>';
    document.body.appendChild(banner);
    applyTexts();

    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ck-act]');
      if (!b) return;
      var act = b.getAttribute('data-ck-act');
      if (act === 'all') { write({ functional: true, analytics: true, marketing: true }); close(); }
      else if (act === 'necessary') { write({}); close(); }
      else if (act === 'settings') { showSettings(true); }
      else if (act === 'save') {
        write({
          functional: banner.querySelector('[name="functional"]').checked,
          analytics: banner.querySelector('[name="analytics"]').checked,
          marketing: banner.querySelector('[name="marketing"]').checked
        });
        close();
      }
    });
    return banner;
  }

  function cat(name, locked) {
    return '<label class="cookie-cat">' +
      '<input type="checkbox" name="' + name + '"' + (locked ? ' checked disabled' : '') + ' />' +
      '<span class="cookie-cat__box" aria-hidden="true"></span>' +
      '<span class="cookie-cat__label" data-ck="cat_' + name + '"></span>' +
      '</label>';
  }

  function applyTexts() {
    if (!banner) return;
    banner.querySelectorAll('[data-ck]').forEach(function (el) {
      var k = el.getAttribute('data-ck');
      if (T[k]) el.textContent = T[k];
    });
    document.querySelectorAll('.map-consent [data-ck]').forEach(function (el) {
      var k = el.getAttribute('data-ck');
      if (T[k]) el.textContent = T[k];
    });
  }

  function showSettings(on) {
    var s = banner.querySelector('.cookie-banner__settings');
    s.hidden = !on;
    banner.querySelector('[data-ck-act="save"]').hidden = !on;
    banner.querySelector('[data-ck-act="settings"]').hidden = on;
    if (on) {
      var c = consent || {};
      ['functional', 'analytics', 'marketing'].forEach(function (n) {
        banner.querySelector('[name="' + n + '"]').checked = !!c[n];
      });
    }
  }

  function open(withSettings) {
    build();
    showSettings(!!withSettings);
    banner.classList.add('is-open');
    var f = banner.querySelector('button:not([hidden])');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
  }
  function close() {
    if (banner) banner.classList.remove('is-open');
  }

  // ---- gating: Google Maps embeds -----------------------------------------
  function applyGates() {
    var ok = !!(consent && consent.functional);
    document.querySelectorAll('iframe[src*="google.com/maps"], iframe[data-src*="google.com/maps"]').forEach(function (fr) {
      var parent = fr.parentElement;
      if (!parent) return;
      var overlay = parent.querySelector(':scope > .map-consent');
      if (ok) {
        if (fr.dataset.src && !fr.getAttribute('src')) fr.setAttribute('src', fr.dataset.src);
        if (overlay) overlay.remove();
      } else {
        if (fr.getAttribute('src')) {
          fr.dataset.src = fr.getAttribute('src');
          fr.removeAttribute('src');
        }
        if (!overlay) {
          if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
          overlay = document.createElement('div');
          overlay.className = 'map-consent';
          overlay.innerHTML =
            '<p class="map-consent__text" data-ck="map_text">' + T.map_text + '</p>' +
            '<button type="button" class="btn btn--solid"><span class="btn-label" data-ck="map_btn">' + T.map_btn + '</span></button>';
          overlay.querySelector('button').addEventListener('click', function () {
            var c = consent || {};
            write({ functional: true, analytics: c.analytics, marketing: c.marketing });
          });
          parent.appendChild(overlay);
        }
      }
    });
  }

  // cms.js może nadpisać data-cms-map-src → iframe.src po naszym gate'owaniu;
  // obserwujemy atrybut src i ponownie blokujemy, jeśli brak zgody.
  function watchMaps() {
    if (!('MutationObserver' in window)) return;
    var mo = new MutationObserver(function (muts) {
      var need = false;
      muts.forEach(function (m) {
        if (m.type === 'attributes' && m.attributeName === 'src') need = true;
        if (m.type === 'childList') need = true;
      });
      if (need && !(consent && consent.functional)) applyGates();
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  }

  // ---- CMS strings --------------------------------------------------------
  document.addEventListener('cms:loaded', function (e) {
    var strings = e && e.detail && e.detail.strings;
    if (!strings) return;
    var get = typeof strings.get === 'function'
      ? function (k) { var r = strings.get(k); return r && (typeof r === 'string' ? r : r.value); }
      : function (k) { var r = strings[k]; return r && (typeof r === 'string' ? r : r.value); };
    Object.keys(T).forEach(function (k) {
      var v = get('global.cookies.' + k);
      if (v) T[k] = v;
    });
    applyTexts();
  });

  // ---- boot ---------------------------------------------------------------
  function boot() {
    applyGates();
    watchMaps();
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-cookie-settings]');
      if (!a) return;
      e.preventDefault();
      open(true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && banner && banner.classList.contains('is-open') && consent) close();
    });
    if (!consent) window.setTimeout(function () { open(false); }, 600);
  }

  window.AFCookies = {
    get: function () { return consent ? Object.assign({}, consent) : null; },
    set: function (obj) { return write(obj || {}); },
    open: function () { open(true); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
