(function() {
  function injectNavbar() {
    const navContainer = document.getElementById('navbar');
    if (!navContainer) return;

    const currentPath = window.location.pathname;
    const fileName = decodeURIComponent(currentPath.split('/').pop()) || '';

    const isActive = (name) => {
      if (name === 'index' && (fileName === '' || fileName === 'index.html' || fileName === 'index')) return 'active-home';
      if (fileName.includes(name)) return 'active-link';
      return '';
    };

    const navHtml = `
      <nav class="global-nav">
        <div class="g-nav-left">
          <a href="/" class="${isActive('index')}">Roots AI apps</a>
        </div>
        <div class="g-nav-center">
          <a href="/Roots Weekly Cycle Dashboard.html" class="${isActive('Roots Weekly Cycle Dashboard')}">Weekly Cycle</a>
          <a href="/roots_cod_dashboard.html" class="${isActive('roots_cod_dashboard')}">COD Dashboard</a>
          <a href="/pickup_tracker.html" class="${isActive('pickup_tracker')}">Pickup Tracker</a>
          <a href="https://roots-c2c-sla.netlify.app/" target="_blank">KPI Tracking</a>
        </div>
        <div class="g-nav-right"></div>
      </nav>
    `;

    navContainer.innerHTML = navHtml;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNavbar);
  } else {
    injectNavbar();
  }
})();
