/**
 * AUTOFORUM landing — split screen logic
 * - delegujemy hover (CSS robi gros pracy przez :hover + :has())
 * - obsługa kliknięcia z animacją "expansion" przed nawigacją
 * - subtelny parallax tła zależnie od pozycji kursora
 */

(() => {
  const halves = document.querySelectorAll('.half');
  const split = document.querySelector('.split');
  if (!split) return;

  // --- click expand & navigate ---------------------------------------------
  halves.forEach((half) => {
    half.addEventListener('click', (e) => {
      e.preventDefault();
      const href = half.getAttribute('href');
      if (!href) return;

      // mark this half as clicked → CSS handles the expansion
      half.classList.add('half--clicked');
      // hide siblings
      halves.forEach((h) => {
        if (h !== half) h.classList.add('half--dimmed');
      });

      // give the animation time to play before navigating
      window.setTimeout(() => {
        window.location.href = href;
      }, 1000);
    });
  });

  // --- subtle parallax on background images --------------------------------
  let frame = null;
  split.addEventListener('mousemove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      const rect = split.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      halves.forEach((half) => {
        const bg = half.querySelector('.half-bg');
        if (!bg) return;
        bg.style.setProperty('--px', `${x * -10}px`);
        bg.style.setProperty('--py', `${y * -10}px`);
        bg.style.transform = `scale(1.06) translate(${x * -16}px, ${y * -16}px)`;
      });
      frame = null;
    });
  });

  split.addEventListener('mouseleave', () => {
    halves.forEach((half) => {
      const bg = half.querySelector('.half-bg');
      if (bg) bg.style.transform = '';
    });
  });

  // --- keyboard accessibility ----------------------------------------------
  halves.forEach((half) => {
    half.setAttribute('tabindex', '0');
    half.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        half.click();
      }
    });
  });
})();
