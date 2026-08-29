/**
 * AUTOFORUM subpages — wspólna logika
 * - zdejmuje page-reveal po skończonej animacji
 * - sticky topbar z efektem scrolled
 * - reveal-on-scroll przez IntersectionObserver
 * - delikatny parallax na hero image
 */

(() => {
  // --- remove the curtain after the reveal animation finishes --------------
  const curtain = document.querySelector('.page-reveal');
  if (curtain) {
    window.setTimeout(() => {
      curtain.remove();
    }, 1500);
  }

  // --- topbar shrink on scroll ---------------------------------------------
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 60) {
            topbar.classList.add('scrolled');
          } else {
            topbar.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // --- reveal on scroll ----------------------------------------------------
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in-view'));
  }

  // --- parallax on hero ----------------------------------------------------
  const heroImg = document.querySelector('[data-parallax]');
  if (heroImg) {
    let ticking2 = false;
    window.addEventListener('scroll', () => {
      if (!ticking2) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY;
          heroImg.style.transform = `translateY(${y * 0.25}px) scale(${1.05 + y * 0.0001})`;
          ticking2 = false;
        });
        ticking2 = true;
      }
    }, { passive: true });
  }

  // --- image fallback: jeśli zewnętrzne URLy padną, wstaw gradient ---------
  document.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', function handle() {
      this.removeEventListener('error', handle);
      const fallback = this.getAttribute('data-fallback');
      if (fallback) {
        this.src = fallback;
      } else {
        // ostateczny fallback - ukryj img, zostaw gradient z parenta
        this.style.display = 'none';
      }
    });
  });

  // --- booking modal -------------------------------------------------------
  const modal = document.getElementById('book-modal');
  if (modal) {
    const dialog = modal.querySelector('.af-modal__dialog');
    const form = modal.querySelector('.af-modal__form');
    const success = modal.querySelector('.af-modal__success');
    let lastFocused = null;

    const open = () => {
      lastFocused = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const first = modal.querySelector('input, textarea, button');
      if (first) window.setTimeout(() => first.focus(), 60);
    };

    const close = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      // reset do stanu formularza po zamknięciu
      window.setTimeout(() => {
        if (form && success) {
          form.hidden = false;
          success.hidden = true;
          form.reset();
        }
      }, 300);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    };

    document.querySelectorAll('[data-modal-open]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    });

    modal.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', close);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });

    // prosty focus-trap w obrębie dialogu
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = dialog.querySelectorAll(
        'a[href], button:not([disabled]), input, textarea, select'
      );
      const list = Array.prototype.slice.call(f).filter((el) => el.offsetParent !== null);
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    });

    if (form) {
      // --- zgłoszenie → Supabase (tabela cms_leads, RLS: anon = tylko INSERT) ---
      const SB_URL = 'https://wjxatkkftxuztgsvrnkl.supabase.co';
      const SB_KEY = 'sb_publishable_g1ViZZHf6mUXxw9e5DOaeQ_GQZmgFfa';
      const submitBtn = form.querySelector('.af-modal__submit');
      const submitLabel = submitBtn ? submitBtn.querySelector('.btn-label') : null;
      const submitText = submitLabel ? submitLabel.textContent : '';
      const txt = (sel) => {
        const el = form.querySelector(sel);
        return el ? el.textContent.trim() : '';
      };
      const val = (name) => {
        const el = form.elements[name];
        return el ? String(el.value || '').trim() : '';
      };
      const chk = (name) => {
        const el = form.elements[name];
        return !!(el && el.checked);
      };
      const showError = () => {
        let err = form.querySelector('.af-modal__error');
        if (!err) {
          err = document.createElement('p');
          err.className = 'af-modal__error';
          form.appendChild(err);
        }
        const phoneEl = document.querySelector('[data-cms$=".footer.phone.label"]');
        const phone = phoneEl ? phoneEl.textContent.trim() : '';
        err.textContent = 'Nie udało się wysłać zgłoszenia. ';
        if (phone) {
          err.appendChild(document.createTextNode('Prosimy o telefon: '));
          const a = document.createElement('a');
          a.href = 'tel:' + phone.replace(/\s+/g, '');
          a.textContent = phone;
          err.appendChild(a);
          err.appendChild(document.createTextNode('.'));
        } else {
          err.appendChild(document.createTextNode('Prosimy spróbować ponownie za chwilę.'));
        }
      };
      const setBusy = (busy) => {
        if (!submitBtn) return;
        submitBtn.disabled = busy;
        if (submitLabel) submitLabel.textContent = busy ? 'Wysyłanie…' : submitText;
      };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        if (val('website')) return; // honeypot — bot
        if (!chk('consent_privacy')) {
          form.reportValidity();
          return;
        }
        const oldErr = form.querySelector('.af-modal__error');
        if (oldErr) oldErr.remove();

        const payload = {
          page: document.body.dataset.cmsPage || location.pathname.replace(/^.*\//, '').replace(/\.html$/, '') || 'unknown',
          brand: document.body.classList.contains('mh-page') ? 'maybach' : 'mercedes',
          name: val('name'),
          phone: val('phone'),
          email: val('email') || null,
          model: val('model') || null,
          preferred_date: val('date') || null,
          message: val('message') || null,
          consent_privacy: chk('consent_privacy'),
          consent_marketing_email: chk('consent_marketing_email'),
          consent_marketing_phone: chk('consent_marketing_phone'),
          consent_texts: {
            rodo_info: txt('[data-cms="global.form.rodo_info"]'),
            consent_privacy: txt('[data-cms="global.form.consent_privacy"]'),
            consent_marketing_email: txt('[data-cms="global.form.consent_marketing_email"]'),
            consent_marketing_phone: txt('[data-cms="global.form.consent_marketing_phone"]')
          },
          source_url: location.href,
          user_agent: navigator.userAgent
        };

        setBusy(true);
        fetch(SB_URL + '/rest/v1/cms_leads', {
          method: 'POST',
          headers: {
            apikey: SB_KEY,
            Authorization: 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(payload)
        }).then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          form.reset();
          form.hidden = true;
          success.hidden = false;
          const f = success.querySelector('button, a');
          if (f) f.focus();
        }).catch((err) => {
          console.warn('[lead] send failed', err);
          showError();
        }).finally(() => setBusy(false));
      });
    }
  }

  // --- mobile hamburger nav ------------------------------------------------
  const burger = document.querySelector('.topbar-burger');
  const bar = document.querySelector('.topbar');
  if (burger && bar) {
    const closeNav = () => {
      bar.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-locked');
    };
    burger.addEventListener('click', () => {
      const open = bar.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('nav-locked', open);
    });
    bar.querySelectorAll('.topbar-nav a').forEach((a) => {
      a.addEventListener('click', closeNav);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bar.classList.contains('nav-open')) closeNav();
    });
  }
})();
