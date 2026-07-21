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

  document.title = 'Nowy Świat — Zapraszamy wkrótce';

  var style = document.createElement('style');
  style.textContent =
    'html, body { overflow: hidden !important; background: #000 !important; }' +
    'body > *:not(#af-stub) { visibility: hidden !important; }' +
    '#af-stub {' +
      'position: fixed; inset: 0; z-index: 999999;' +
      'display: flex; flex-direction: column; align-items: center; justify-content: center;' +
      'background: #000; text-align: center; padding: 24px;' +
    '}' +
    '#af-stub .af-stub__star {' +
      'width: clamp(110px, 10vw, 150px); height: auto;' +
      'filter: brightness(0) invert(1); margin-top: -10vh;' +
    '}' +
    '#af-stub .af-stub__text {' +
      "font-family: 'Corporate A', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;" +
      'font-weight: 400; font-style: normal; color: #fff;' +
      'font-size: clamp(2rem, 3.4vw, 3.1rem);' +
      'letter-spacing: 0.03em;' +
      'margin: 40px 0 0;' +
    '}' +
    '#af-stub .af-stub__sub {' +
      "font-family: 'Corporate A', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;" +
      'font-weight: 400; font-style: normal; color: #fff;' +
      'font-size: clamp(1.1rem, 1.7vw, 1.6rem);' +
      'letter-spacing: 0.025em;' +
      'position: absolute; left: 0; right: 0; bottom: 13vh; margin: 0;' +
    '}';
  document.head.appendChild(style);

  function mount() {
    if (document.getElementById('af-stub')) return;
    var stub = document.createElement('div');
    stub.id = 'af-stub';
    stub.innerHTML =
      '<img class="af-stub__star" src="assets/img/Mercedes-Logo.svg.png" alt="Mercedes-Benz">' +
      '<p class="af-stub__text">Nowy Świat</p>' +
      '<p class="af-stub__sub">Zapraszamy wkrótce</p>';
    document.body.appendChild(stub);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
