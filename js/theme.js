// Samme mekanisme som website_skogvoll_com_builder/js/theme.js (ui-style-dark-panel-grid).
(function () {
  var STORAGE_KEY = 'theme';
  var toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;

  function apply(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Bytt til lyst tema' : 'Bytt til mørkt tema');
    document.dispatchEvent(new CustomEvent('themechange'));
  }

  var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  apply(current);

  toggle.addEventListener('click', function () {
    current = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(STORAGE_KEY, current); } catch (e) {}
    apply(current);
  });
})();
