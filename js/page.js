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
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        form.hidden = true;
        success.hidden = false;
        const f = success.querySelector('button, a');
        if (f) f.focus();
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
