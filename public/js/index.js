import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDd8w3D3i0fehq-uvyCzag3PbtknAuV0jQ",
  authDomain: "roots-weekly.firebaseapp.com",
  projectId: "roots-weekly",
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "roots-weekly.firebasestorage.app",
  messagingSenderId: "844033965231",
  appId: "1:844033965231:web:2269218005bc40d86be85a",
  measurementId: "G-YJZY8XN577"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ALL_APPS = [
  {
    id: "roots_cod_dashboard",
    href: "/roots_cod_dashboard",
    icon: "💰",
    title: "COD Dashboard"
  },
  {
    id: "pickup_tracker",
    href: "/pickup_tracker",
    icon: "🚚",
    title: "Pickup Tracker"
  },
  {
    id: "cases_tracker",
    href: "/cases_tracker",
    icon: "📋",
    title: "Cases Tracker"
  },
  {
    id: "kpi_dashboard",
    href: "https://roots-c2c-sla.netlify.app/",
    icon: "📊",
    title: "KPI Dashboard",
    external: true
  },
  {
    id: "shift_tracker",
    href: "/shift_tracker",
    icon: "⏱️",
    title: "Shift Tracker"
  }
];

const checkLogin = async () => {
  const user = localStorage.getItem("roots-user");
  const navbar = document.getElementById("navbar");
  if (user) {
    if (window.injectNavbar) await window.injectNavbar();
    if (navbar) navbar.style.display = "block";
    document.getElementById("global-login-screen").style.display = "none";
    document.getElementById("dashboard-container").style.display = "block";
    document.getElementById("welcome-message").textContent = `Welcome, ${user}`;
    await loadDashboard(user);
  } else {
    if (navbar) navbar.style.display = "none";
    document.getElementById("global-login-screen").style.display = "flex";
    document.getElementById("dashboard-container").style.display = "none";
  }
};

const loadDashboard = async (username) => {
  const grid = document.getElementById("apps-grid");
  grid.innerHTML = "";
  
  try {
    const snapshot = await get(ref(db, `users/${username}`));
    const data = snapshot?.val() || { apps: {} };
    
    const appsObj = data.apps || {};
    let rendered = 0;
    
    ALL_APPS.forEach(appInfo => {
      if (appsObj[appInfo.id] || username === "Roots") {
        grid.innerHTML += `
          <a href="${appInfo.href}" class="option-card" ${appInfo.external ? 'target="_blank"' : ''}>
            <div class="icon-wrap">${appInfo.icon}</div>
            <h2 class="card-title">${appInfo.title}</h2>
          </a>
        `;
        rendered++;
      }
    });

    // Admin Portal
    if (username === "Roots" || localStorage.getItem("roots-isAdmin") === "true") {
      grid.innerHTML += `
        <a href="/admin.html" class="option-card" style="border: 1px solid var(--accent);">
          <div class="icon-wrap" style="color: var(--accent); background: var(--accent-dim);">⚙️</div>
          <h2 class="card-title">Admin Portal</h2>
        </a>
      `;
    }

  } catch (e) {
    console.error("Failed to fetch apps", e);
  }
};

document.getElementById("global-login-btn").addEventListener("click", async () => {
  const userInp = document.getElementById("global-username");
  const passInp = document.getElementById("global-password");
  const username = userInp.value.trim();
  const password = passInp.value;
  const err = document.getElementById("global-login-error");
  
  if (!username) return;

  // Master Admin Bypass
  if (username.toLowerCase() === "roots" && password === "RootsOpsJo@25") {
    localStorage.setItem("roots-user", "Roots");
    localStorage.setItem("roots-isAdmin", "true");
    err.style.display = "none";
    userInp.value = "";
    passInp.value = "";
    checkLogin();
    return;
  }

  // Normal User Check
  const snapshot = await get(ref(db, `users`));
  let data = null;
  let realUsername = username;
  
  if (snapshot.exists()) {
    const allUsers = snapshot.val();
    const foundKey = Object.keys(allUsers).find(k => k.toLowerCase() === username.toLowerCase());
    if (foundKey) {
      data = allUsers[foundKey];
      realUsername = foundKey;
    }
  }

  if (data) {
    if (data.password === password) {
      localStorage.setItem("roots-user", realUsername);
      if (data.isAdmin) {
        localStorage.setItem("roots-isAdmin", "true");
      } else {
        localStorage.removeItem("roots-isAdmin");
      }
      err.style.display = "none";
      userInp.value = "";
      passInp.value = "";
      checkLogin();
    } else {
      err.textContent = "Invalid password";
      err.style.display = "block";
    }
  } else {
    err.textContent = "User not found";
    err.style.display = "block";
  }
});

const passInput = document.getElementById("global-password");
if (passInput) {
  passInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("global-login-btn").click();
  });
}

const toggleBtn = document.getElementById("toggle-password");
if (toggleBtn && passInput) {
  toggleBtn.addEventListener("click", () => {
    if (passInput.type === "password") {
      passInput.type = "text";
    } else {
      passInput.type = "password";
    }
  });
}

const userInput = document.getElementById("global-username");
if (userInput) {
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("global-login-btn").click();
  });
}

checkLogin();
