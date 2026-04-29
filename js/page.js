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
})();
