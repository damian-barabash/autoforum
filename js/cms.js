/**
 * AUTOFORUM CMS — public client.
 *
 * On every page load:
 *   1. Fetch cms_strings, cms_media (global), and cms_blocks (current page only) from Supabase.
 *   2. Patch DOM nodes annotated with data-cms* attributes (Tier 1 — edit-only).
 *   3. Render dynamic blocks into [data-cms-region] containers (Tier 2 — add blocks).
 *
 * Inline HTML fallback is kept: if Supabase is unreachable, the script simply
 * exits and the page renders with the values hardcoded in HTML (last known good).
 * Design is not affected — we only swap textContent/innerHTML/src/href on
 * existing elements and render blocks using existing CSS classes.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://wjxatkkftxuztgsvrnkl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_g1ViZZHf6mUXxw9e5DOaeQ_GQZmgFfa';

  const body = document.body;
  const page = body && body.dataset && body.dataset.cmsPage;
  if (!page) return;

  const isMaybachBrand = body.classList.contains('mh-page');

  // ====== Fetch helpers ======
  function fetchJSON(path) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    }).then(function (r) {
      if (!r.ok) throw new Error('Supabase ' + r.status);
      return r.json();
    });
  }

  // ====== DOM helpers ======
  function $el(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v);
      }
    }
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c) el.appendChild(c);
      }
    }
    return el;
  }

  // ====== Patch strings / hrefs / attrs / maps ======
  function patchStrings(stringsByKey) {
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      const row = stringsByKey.get(el.dataset.cms);
      if (!row) return;
      if (row.kind === 'html') el.innerHTML = row.value;
      else el.textContent = row.value;
    });

    document.querySelectorAll('[data-cms-href]').forEach(function (el) {
      const row = stringsByKey.get(el.dataset.cmsHref);
      if (row) el.href = row.value;
    });

    document.querySelectorAll('[data-cms-attr]').forEach(function (el) {
      const spec = el.dataset.cmsAttr;
      const idx = spec.indexOf(':');
      if (idx < 0) return;
      const attrName = spec.slice(0, idx).trim();
      const key = spec.slice(idx + 1).trim();
      const row = stringsByKey.get(key);
      if (row) el.setAttribute(attrName, row.value);
    });

    document.querySelectorAll('[data-cms-map-src]').forEach(function (el) {
      const row = stringsByKey.get(el.dataset.cmsMapSrc);
      if (!row) return;
      const q = encodeURIComponent(row.value);
      el.src = 'https://www.google.com/maps?q=' + q + '&z=16&hl=pl&output=embed';
    });

    document.querySelectorAll('[data-cms-map-href]').forEach(function (el) {
      const row = stringsByKey.get(el.dataset.cmsMapHref);
      if (!row) return;
      const q = encodeURIComponent(row.value);
      el.href = 'https://www.google.com/maps/search/?api=1&query=' + q;
    });
  }

  // ====== Patch media (src + background-image) ======
  function patchMedia(mediaByKey) {
    document.querySelectorAll('[data-cms-src]').forEach(function (el) {
      const url = mediaByKey.get(el.dataset.cmsSrc);
      if (url) el.src = url;
    });

    document.querySelectorAll('[data-cms-bg]').forEach(function (el) {
      const url = mediaByKey.get(el.dataset.cmsBg);
      if (!url) return;
      // Preserve any existing gradient overlay; replace only the url(...) part.
      const current = el.style.backgroundImage;
      if (current && /url\([^)]+\)/.test(current)) {
        el.style.backgroundImage = current.replace(/url\([^)]+\)/, "url('" + url + "')");
      } else {
        el.style.backgroundImage = "url('" + url + "')";
      }
    });
  }

  // ====== Block templates ======
  function staggerClass(idx) {
    const n = (idx || 0) % 3;
    return n === 0 ? '' : ' reveal-delay-' + n;
  }

  const TEMPLATES = {
    model_card: function (d, idx) {
      const size = d.size || 'sm';
      const a = $el('a', {
        class: 'mb-model mb-model--' + size + ' reveal' + staggerClass(idx),
        href: d.href || '#',
        target: '_blank',
        rel: 'noopener noreferrer'
      });
      a.appendChild($el('img', { class: 'mb-model__img', src: d.image_url || '', alt: d.alt || d.name || '' }));
      a.appendChild($el('div', { class: 'mb-model__shade' }));
      const bodyDiv = $el('div', { class: 'mb-model__body' });
      bodyDiv.appendChild($el('div', { class: 'mb-model__series', text: d.series || '' }));
      bodyDiv.appendChild($el('h3', { class: 'mb-model__name', text: d.name || '' }));
      const price = $el('div', { class: 'mb-model__price' });
      price.appendChild($el('span', { text: d.price || '' }));
      price.appendChild($el('span', { class: 'arrow', 'aria-hidden': 'true' }));
      bodyDiv.appendChild(price);
      a.appendChild(bodyDiv);
      return a;
    },

    team_member: function (d) {
      const art = $el('article', { class: 'team-member' });
      const ph = $el('div', { class: 'team-member__ph', 'aria-hidden': 'true' });
      if (d.portrait_url) {
        ph.style.backgroundImage = "url('" + d.portrait_url + "')";
        ph.style.backgroundSize = 'cover';
        ph.style.backgroundPosition = 'center';
      } else {
        ph.appendChild($el('span', { class: 'team-ph__lead', text: 'Portret' }));
        ph.appendChild($el('span', { class: 'team-ph__sub', text: 'Stand in' }));
      }
      art.appendChild(ph);
      const info = $el('div', { class: 'team-member__info' });
      info.appendChild($el('h2', { class: 'team-member__name', text: d.name || '' }));
      const p = $el('p', { class: 'team-member__contact' });
      p.appendChild(document.createTextNode(d.email || ''));
      p.appendChild($el('br'));
      p.appendChild(document.createTextNode(d.phone || ''));
      info.appendChild(p);
      art.appendChild(info);
      return art;
    },

    promo_strip: function (d) {
      const isLink = !!(d.link_href);
      const tag = isLink ? 'a' : 'div';
      const attrs = { class: 'cms-promo-strip cms-promo-strip--' + (d.color || 'default') };
      if (isLink) {
        attrs.href = d.link_href;
        if (/^https?:/i.test(d.link_href)) { attrs.target = '_blank'; attrs.rel = 'noopener noreferrer'; }
      }
      const el = $el(tag, attrs);
      el.appendChild($el('span', { class: 'cms-promo-strip__text', text: d.text || '' }));
      if (d.link_label && isLink) {
        el.appendChild($el('span', { class: 'cms-promo-strip__cta', text: d.link_label }));
      }
      return el;
    },

    quote_ribbon: function (d) {
      if (isMaybachBrand) {
        const sec = $el('section', { class: 'mh-quote' });
        sec.appendChild($el('blockquote', { class: 'mh-quote__text reveal', text: d.text || '' }));
        return sec;
      }
      const sec = $el('section', { class: 'mb-section', style: { padding: '6rem 6vw' } });
      sec.appendChild($el('blockquote', {
        class: 'mb-section__title reveal',
        style: { textAlign: 'center', maxWidth: '900px', margin: '0 auto' },
        text: d.text || ''
      }));
      return sec;
    },

    image_full: function (d) {
      const sec = $el('section', { class: isMaybachBrand ? 'mh-standin' : 'mb-feature', style: { display: 'block', padding: '0' } });
      const img = $el('img', {
        src: d.image_url || '',
        alt: d.alt || '',
        class: isMaybachBrand ? 'mh-standin__img' : '',
        style: { width: '100%', height: 'auto', display: 'block' }
      });
      sec.appendChild(img);
      if (d.caption) {
        sec.appendChild($el('p', {
          class: isMaybachBrand ? 'mh-eyebrow' : 'eyebrow',
          style: { textAlign: 'center', margin: '1.5rem 0 3rem' },
          text: d.caption
        }));
      }
      return sec;
    },

    cta_section: function (d) {
      const sec = $el('section', { class: isMaybachBrand ? 'mh-visit' : 'mb-visit' });
      const h2 = $el('h2', { class: 'reveal' });
      if (d.title) h2.appendChild(document.createTextNode(d.title + (d.title_bold ? ' ' : '')));
      if (d.title_bold) h2.appendChild($el('b', { text: d.title_bold }));
      sec.appendChild(h2);
      if (d.sub) sec.appendChild($el('p', { class: 'reveal reveal-delay-1', text: d.sub }));
      if (d.button_label) {
        const btnClass = isMaybachBrand
          ? 'btn btn--bronze reveal reveal-delay-2'
          : 'btn mb-visit__btn reveal reveal-delay-2';
        const a = $el('a', { class: btnClass, href: d.button_href || '#' });
        a.appendChild($el('span', { class: 'btn-label', text: d.button_label }));
        a.appendChild($el('span', { class: 'btn-arrow', 'aria-hidden': 'true', text: '→' }));
        sec.appendChild(a);
      }
      return sec;
    },

    text_section: function (d) {
      if (isMaybachBrand) {
        const sec = $el('section', { class: 'mh-headline' });
        if (d.eyebrow) sec.appendChild($el('span', { class: 'mh-eyebrow reveal', text: d.eyebrow }));
        if (d.title || d.title_bold) {
          const h2 = $el('h2', { class: 'mh-headline__title reveal reveal-delay-1' });
          if (d.title) h2.appendChild(document.createTextNode(d.title + (d.title_bold ? ' ' : '')));
          if (d.title_bold) h2.appendChild($el('b', { text: d.title_bold }));
          sec.appendChild(h2);
        }
        (d.body_paragraphs || []).forEach(function (p) {
          sec.appendChild($el('p', { class: 'reveal reveal-delay-2', style: { maxWidth: '760px', margin: '1.5rem auto 0' }, text: p }));
        });
        return sec;
      }
      const sec = $el('section', { class: 'mb-section' });
      const head = $el('header', { class: 'mb-section__head' });
      if (d.eyebrow) head.appendChild($el('span', { class: 'eyebrow reveal', text: d.eyebrow }));
      if (d.title || d.title_bold) {
        const h2 = $el('h2', { class: 'mb-section__title reveal reveal-delay-1' });
        if (d.title) h2.appendChild(document.createTextNode(d.title + (d.title_bold ? ' ' : '')));
        if (d.title_bold) h2.appendChild($el('b', { text: d.title_bold }));
        head.appendChild(h2);
      }
      sec.appendChild(head);
      (d.body_paragraphs || []).forEach(function (p) {
        sec.appendChild($el('p', { class: 'mb-section__lede reveal reveal-delay-2', text: p }));
      });
      return sec;
    },

    feature_split: function (d) {
      const sec = $el('section', { class: isMaybachBrand ? 'mh-split' : 'mb-feature' });
      const mediaCls = isMaybachBrand ? 'mh-split__media reveal' : 'mb-feature__media reveal';
      const copyCls = isMaybachBrand ? 'mh-split__copy reveal reveal-delay-1' : 'mb-feature__copy reveal reveal-delay-1';

      const mediaDiv = $el('div', { class: mediaCls });
      if (isMaybachBrand) {
        mediaDiv.appendChild($el('img', { src: d.image_url || '', alt: d.alt || '' }));
      } else if (d.image_url) {
        mediaDiv.style.backgroundImage =
          "linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.22)), url('" + d.image_url + "')";
      }

      const copyDiv = $el('div', { class: copyCls });
      if (d.eyebrow) copyDiv.appendChild($el('span', { class: isMaybachBrand ? 'mh-eyebrow' : 'eyebrow', text: d.eyebrow }));
      if (d.title || d.title_bold) {
        const h2 = $el('h2');
        if (isMaybachBrand) h2.className = 'mh-split__title';
        if (d.title) h2.appendChild(document.createTextNode(d.title + (d.title_bold ? ' ' : '')));
        if (d.title_bold) h2.appendChild($el('b', { text: d.title_bold }));
        copyDiv.appendChild(h2);
      }
      if (d.body_p1) copyDiv.appendChild($el('p', { text: d.body_p1 }));
      if (d.body_p2) copyDiv.appendChild($el('p', { text: d.body_p2 }));
      if (d.list_items && d.list_items.length) {
        const ul = $el('ul');
        d.list_items.forEach(function (li) { ul.appendChild($el('li', { text: li })); });
        copyDiv.appendChild(ul);
      }
      if (isMaybachBrand) copyDiv.appendChild($el('span', { class: 'mh-split__rule', 'aria-hidden': 'true' }));

      // Image position (default: left/top — image first)
      if (d.image_position === 'right') {
        sec.appendChild(copyDiv);
        sec.appendChild(mediaDiv);
      } else {
        sec.appendChild(mediaDiv);
        sec.appendChild(copyDiv);
      }
      return sec;
    }
  };

  function renderBlock(block, idx) {
    const tpl = TEMPLATES[block.type];
    if (!tpl) {
      console.warn('[cms] unknown block type:', block.type);
      return null;
    }
    try {
      return tpl(block.data || {}, idx);
    } catch (e) {
      console.warn('[cms] template error for', block.type, e);
      return null;
    }
  }

  // Reveal blocks rendered AFTER page.js already wired its IntersectionObserver.
  // page.js observes only the .reveal nodes present at load; our async-rendered
  // blocks are added later, so without this they'd stay at opacity:0 (invisible).
  function revealNewBlocks(root) {
    const els = root.querySelectorAll('.reveal:not(.in-view)');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  function patchBlocks(blocksByRegion) {
    document.querySelectorAll('[data-cms-region]').forEach(function (el) {
      const region = el.dataset.cmsRegion;
      const blocks = blocksByRegion.get(region) || [];
      el.innerHTML = '';
      blocks.forEach(function (b, i) {
        const node = renderBlock(b, i);
        if (node) el.appendChild(node);
      });
      revealNewBlocks(el);
    });
  }

  // ====== Main ======
  (function init() {
    Promise.all([
      fetchJSON('cms_strings?select=key,value,kind'),
      fetchJSON('cms_media?select=key,url'),
      fetchJSON('cms_blocks?select=id,region,type,data,order_index&page=eq.' + encodeURIComponent(page) +
                '&visible=eq.true&order=region.asc,order_index.asc')
    ]).then(function (results) {
      const strings = results[0];
      const media = results[1];
      const blocks = results[2];

      const stringsByKey = new Map(strings.map(function (r) { return [r.key, r]; }));
      const mediaByKey = new Map(media.map(function (r) { return [r.key, r.url]; }));
      const blocksByRegion = new Map();
      blocks.forEach(function (b) {
        const arr = blocksByRegion.get(b.region) || [];
        arr.push(b);
        blocksByRegion.set(b.region, arr);
      });

      patchStrings(stringsByKey);
      patchMedia(mediaByKey);
      patchBlocks(blocksByRegion);

      document.documentElement.classList.add('cms-loaded');
    }).catch(function (e) {
      console.warn('[cms] fetch failed — keeping inline fallback', e);
    });
  })();
})();
