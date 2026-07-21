/*
 * ZAŚLEPKA "COMING SOON" — tymczasowa.
 * Jak usunąć: skasuj ten plik + linijkę <script src="js/coming-soon.js"></script>
 * z <head> w: index.html, mercedes.html, maybach.html,
 * zespol-mercedes.html, zespol-maybach.html. Nic więcej nie zmieniano.
 */
(function () {
  var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var isIndex = file === '' || file === 'index.html';

  if (!isIndex) {
    location.replace('index.html');
    return;
  }

  document.title = 'Autoforum Warszawa — Coming soon';

  var style = document.createElement('style');
  style.textContent =
    'html, body { overflow: hidden !important; }' +
    'body > *:not(#af-stub) { visibility: hidden !important; }' +
    '#af-stub {' +
      'position: fixed; inset: 0; z-index: 999999;' +
      'display: flex; flex-direction: column; align-items: center; justify-content: center;' +
      'gap: 42px; background: #f3f3f3; text-align: center; padding: 24px;' +
    '}' +
    '#af-stub .af-stub__wordmark { position: absolute; top: 34px; left: 40px; height: 22px; width: auto; }' +
    '#af-stub .af-stub__star { width: clamp(96px, 14vw, 150px); height: auto; filter: brightness(0); opacity: 0.88; }' +
    '#af-stub .af-stub__text {' +
      "font-family: 'Corporate A', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;" +
      'font-weight: 400; font-style: normal; color: #0a0a0a;' +
      'font-size: clamp(1.15rem, 2.6vw, 1.9rem);' +
      'letter-spacing: 0.24em; text-transform: uppercase;' +
      'margin: 0; padding-left: 0.24em;' +
    '}' +
    '#af-stub .af-stub__sub {' +
      "font-family: 'Inter', sans-serif; font-weight: 400; color: #6e7780;" +
      'font-size: 0.78rem; letter-spacing: 0.11em; text-transform: uppercase;' +
      'margin: -26px 0 0; padding-left: 0.11em;' +
    '}' +
    '@media (max-width: 640px) { #af-stub .af-stub__wordmark { top: 24px; left: 24px; height: 18px; } }';
  document.head.appendChild(style);

  function mount() {
    if (document.getElementById('af-stub')) return;
    var stub = document.createElement('div');
    stub.id = 'af-stub';
    stub.innerHTML =
      '<img class="af-stub__wordmark" src="assets/img/autoforumlogo.png" alt="Auto Forum">' +
      '<img class="af-stub__star" src="assets/img/Mercedes-Logo.svg.png" alt="Mercedes-Benz">' +
      '<p class="af-stub__text">Coming soon</p>' +
      '<p class="af-stub__sub">Autoforum Warszawa</p>';
    document.body.appendChild(stub);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
