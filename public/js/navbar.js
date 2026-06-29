(async function() {
  // --- Dark Mode Setup ---
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const darkThemeStyle = document.createElement('style');
  darkThemeStyle.innerHTML = `
    html[data-theme="dark"] {
      --bg: #121212 !important;
      --surface: #1e1e1e !important;
      --card: #1e1e1e !important;
      --border: #333333 !important;
      --border-light: #2a2a2a !important;
      --text: #e0e0e0 !important;
      --muted: #a0a0a0 !important;
      --dim: #808080 !important;
      --dark: #e0e0e0 !important;
    }
    
    html[data-theme="dark"] body {
      background: var(--bg) !important;
      color: var(--text) !important;
    }

    html[data-theme="dark"] input, html[data-theme="dark"] select, html[data-theme="dark"] textarea {
      background: #2a2a2a !important;
      color: #fff !important;
      border-color: #444 !important;
    }
    html[data-theme="dark"] .global-nav {
      background: #18181b !important;
      border-bottom: 1px solid #27272a !important;
      box-shadow: none !important;
    }
    html[data-theme="dark"] .modal-content, 
    html[data-theme="dark"] .card, 
    html[data-theme="dark"] .stat-card,
    html[data-theme="dark"] .option-card,
    html[data-theme="dark"] .sc,
    html[data-theme="dark"] .transfer-box,
    html[data-theme="dark"] .mc,
    html[data-theme="dark"] .orders-box,
    html[data-theme="dark"] .drop-card {
      background: #1e1e1e !important;
      border: 1px solid #333 !important;
      color: var(--text) !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    }
    
    html[data-theme="dark"] .option-card:hover {
      background: #252525 !important;
    }
    html[data-theme="dark"] .option-card p {
      color: var(--muted) !important;
    }
    html[data-theme="dark"] .sc-v {
      color: #fff !important;
    }

    html[data-theme="dark"] table th,
    html[data-theme="dark"] thead tr.hrow,
    html[data-theme="dark"] thead tr.hrow th,
    html[data-theme="dark"] thead tr.frow th {
      background: #1a1a1a !important;
      color: #a0a0a0 !important;
      border-bottom: 1px solid #333 !important;
    }
    html[data-theme="dark"] table td { border-bottom: 1px solid #333 !important; color: var(--text) !important; }
    html[data-theme="dark"] .cases-table tr:hover,
    html[data-theme="dark"] tbody tr:hover td { 
      background: rgba(255,255,255,0.03) !important; 
    }
    
    html[data-theme="dark"] .merchant-item,
    html[data-theme="dark"] .tmc,
    html[data-theme="dark"] .sbox,
    html[data-theme="dark"] .di,
    html[data-theme="dark"] .otab { 
      background: #252525 !important; 
      border-color: #333 !important; 
      color: var(--text) !important;
    }
    
    html[data-theme="dark"] .hbtn {
      background: #2a2a2a !important;
      border-color: #444 !important;
      color: #e0e0e0 !important;
    }
    html[data-theme="dark"] .hbtn.active {
      background: var(--orange) !important;
      border-color: var(--orange) !important;
      color: #fff !important;
    }
    
    html[data-theme="dark"] .orders-hdr,
    html[data-theme="dark"] .otbar,
    html[data-theme="dark"] hr.mcd {
      border-color: #333 !important;
    }
    
    .theme-toggle-btn {
      background: transparent;
      border: none;
      color: #fff;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .theme-toggle-btn:hover { background: rgba(255,255,255,0.1); }
  `;
  document.head.appendChild(darkThemeStyle);
  // ----------------------

  async function injectNavbar() {
    const navContainer = document.getElementById('navbar');
    if (!navContainer) return;

    const username = localStorage.getItem("roots-user");
    if (!username) return; // Not logged in, no navbar

    // Fetch user permissions
    let userApps = {};
    if (username === "Roots" && localStorage.getItem("roots-isAdmin") === "true") {
      // Master admin sees all
      userApps = {
        'roots_cod_dashboard': true,
        'pickup_tracker': true,
        'cases_tracker': true,
        'kpi_dashboard': true,
        'shift_tracker': true
      };
    } else {
      try {
        const res = await fetch(`https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app/users/${username}.json`);
        const data = await res.json();
        userApps = (data && data.apps) ? data.apps : {};
      } catch (e) {
        console.error("Failed to fetch permissions for navbar", e);
      }
    }

    const currentPath = window.location.pathname;
    const fileName = decodeURIComponent(currentPath.split('/').pop()) || '';

    const isActive = (name) => {
      if (name === 'index' && (fileName === '' || fileName === 'index.html' || fileName === 'index')) return 'active-home';
      // Normalize fileName (remove .html for matching)
      const cleanFileName = fileName.replace('.html', '');
      if (cleanFileName.includes(name)) return 'active-link';
      return '';
    };

    const firstLetter = username.charAt(0).toUpperCase();

    let centerLinks = '';
    
    if (userApps['roots_cod_dashboard']) {
      centerLinks += `<a href="/roots_cod_dashboard" class="${isActive('roots_cod_dashboard')}">COD Dashboard</a>`;
    }
    if (userApps['pickup_tracker']) {
      centerLinks += `<a href="/pickup_tracker" class="${isActive('pickup_tracker')}">Pickup Tracker</a>`;
    }
    if (userApps['cases_tracker']) {
      centerLinks += `<a href="/cases_tracker" class="${isActive('cases_tracker')}">Cases Tracker</a>`;
    }
    if (userApps['kpi_dashboard']) {
      centerLinks += `<a href="https://roots-c2c-sla.netlify.app/" target="_blank">KPI Tracking</a>`;
    }
    if (userApps['shift_tracker']) {
      centerLinks += `<a href="/shift_tracker" class="${isActive('shift_tracker')}">Shift Tracker</a>`;
    }

    if (username === "Roots" || localStorage.getItem("roots-isAdmin") === "true") {
      centerLinks += `<a href="/admin" class="${isActive('admin')}">Admin Portal</a>`;
    }

    const navHtml = `
      <nav class="global-nav">
        <div class="g-nav-left">
          <a href="/" class="${isActive('index')}">Roots AI apps</a>
        </div>
        <div class="g-nav-center">
          ${centerLinks}
        </div>
        <div class="g-nav-right" style="display: flex; align-items: center; gap: 16px;">
          <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Dark Mode">
            <svg id="theme-icon-sun" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: ${savedTheme === 'dark' ? 'block' : 'none'};"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <svg id="theme-icon-moon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: ${savedTheme === 'dark' ? 'none' : 'block'};"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
          </button>
          
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; border: 1px solid rgba(255, 255, 255, 0.2);" title="Logged in as ${username}">
              ${firstLetter}
            </div>
            <button id="nav-logout-btn" style="background: #F37828; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 14px;">Log Out</button>
          </div>
        </div>
      </nav>
    `;

    navContainer.innerHTML = navHtml;

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("theme", nextTheme);
        
        document.getElementById("theme-icon-sun").style.display = nextTheme === "dark" ? "block" : "none";
        document.getElementById("theme-icon-moon").style.display = nextTheme === "dark" ? "none" : "block";
      });
    }

    const logoutBtn = document.getElementById("nav-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("roots-user");
        localStorage.removeItem("roots-isAdmin");
        window.location.href = "/";
      });
    }
  }

  // Expose it globally so other scripts (like index.js login) can trigger it
  window.injectNavbar = injectNavbar;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNavbar);
  } else {
    injectNavbar();
  }
})();
