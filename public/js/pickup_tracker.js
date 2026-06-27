import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const trackerRef = ref(db, "trackers/pickup-tracker-v2");

// --- State ---
let state = {
  config: { drivers: [], locations: [], rates: {} },
  pickups: [],
  currentUser: null,
  tab: "dashboard",
  editingPickupId: null
};

// --- Icons (Same as JSX) ---
const I = {
  trash: `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  edit: `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`
};

// --- Utils ---
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function fmtCur(n) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "JOD", minimumFractionDigits: 2 }).format(n); }

function flash(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 2200);
}

// --- Firebase Sync ---
onValue(trackerRef, (snapshot) => {
  if (snapshot.exists()) {
    const data = snapshot.val();
    state.config = data.config || { drivers: [], locations: [], rates: {} };
    // Convert pickups object to array if it's an object from Firebase
    const pickupsData = data.pickups || {};
    state.pickups = Object.values(pickupsData);
    renderAll();
  } else {
    // Initial setup if database is empty
    state.config = { drivers: [], locations: [], rates: {} };
    state.pickups = [];
    renderAll();
  }
});

async function cloudUpdate(path, value) {
  try {
    const rtdbPath = path.replace(/\./g, "/");
    await update(trackerRef, { [rtdbPath]: value });
  } catch (e) {
    console.error("Sync failed", e);
  }
}

// --- Actions ---
window.addDriver = async (name) => {
  if (!name.trim()) return;
  const drivers = [...(state.config.drivers || []), { id: uid(), name: name.trim() }];
  await cloudUpdate("config/drivers", drivers);
  flash("Driver added");
};

window.rmDriver = async (id) => {
  const drivers = (state.config.drivers || []).filter(d => d.id !== id);
  await cloudUpdate("config/drivers", drivers);
  flash("Driver removed");
};

window.addLocation = async (name, rate) => {
  if (!name.trim()) return;
  const id = uid();
  const locations = [...(state.config.locations || []), { id, name: name.trim() }];
  const rates = { ...(state.config.rates || {}), [id]: parseFloat(rate) || 0 };
  await update(trackerRef, {
    "config/locations": locations,
    [`config/rates/${id}`]: parseFloat(rate) || 0
  });
  flash("Location added");
};

window.rmLocation = async (id) => {
  const locations = (state.config.locations || []).filter(l => l.id !== id);
  const rates = { ...(state.config.rates || {}) };
  delete rates[id];
  await update(trackerRef, {
    "config/locations": locations,
    [`config/rates/${id}`]: null
  });
  flash("Location removed");
};

window.setRate = async (id, v) => {
  await cloudUpdate(`config/rates/${id}`, parseFloat(v) || 0);
};

window.addPickup = async (p) => {
  const id = uid();
  const rate = state.config.rates[p.locationId] || 0;
  
  let createdAt;
  try {
    const chosenDateStr = p.date || new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    createdAt = new Date(`${chosenDateStr}T${timeStr}`).toISOString();
  } catch (e) {
    createdAt = new Date().toISOString();
  }

  const newPickup = {
    id,
    ...p,
    cost: rate,
    loggedBy: state.currentUser,
    createdAt: createdAt,
    arrivalTime: p.arrivalTime || ""
  };
  delete newPickup.date;

  await cloudUpdate(`pickups/${id}`, newPickup);
  flash("Pickup logged ✓");
  closeModal();
};

window.editPickup = (id) => {
  const p = state.pickups.find(x => x.id === id);
  if (!p) return;
  
  state.editingPickupId = id;
  
  // Open modal which builds selects
  openModal();
  
  // Change Title and Button text
  document.querySelector("#pickup-modal .modal-title").textContent = "Edit Pickup";
  document.getElementById("confirm-pickup-btn").textContent = "Save Changes";
  
  // Set values
  document.getElementById("modal-driver").value = p.driverId;
  document.getElementById("modal-location").value = p.locationId;
  document.getElementById("modal-items").value = p.items || "";
  document.getElementById("modal-notes").value = p.notes || "";
  document.getElementById("modal-arrival").value = p.arrivalTime || "";
  
  // Format local date for input calendar
  const dateObj = new Date(p.createdAt);
  const offset = dateObj.getTimezoneOffset();
  const localDate = new Date(dateObj.getTime() - (offset*60*1000));
  const localISODate = localDate.toISOString().split('T')[0];
  document.getElementById("modal-date").value = localISODate;
  
  updateModalCost();
};

window.saveEditedPickup = async (p) => {
  const rate = state.config.rates[p.locationId] || 0;
  
  let createdAt;
  try {
    const chosenDateStr = p.date || new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    createdAt = new Date(`${chosenDateStr}T${timeStr}`).toISOString();
  } catch (e) {
    createdAt = new Date().toISOString();
  }

  const updatedPickup = {
    driverId: p.driverId,
    locationId: p.locationId,
    items: p.items,
    notes: p.notes,
    arrivalTime: p.arrivalTime || "",
    cost: rate,
    createdAt: createdAt
  };

  const original = state.pickups.find(x => x.id === p.id);
  if (original) {
    updatedPickup.loggedBy = original.loggedBy || state.currentUser;
    updatedPickup.id = p.id;
  }

  await cloudUpdate(`pickups/${p.id}`, updatedPickup);
  flash("Pickup updated ✓");
  closeModal();
};

window.rmPickup = async (id) => {
  if (!confirm("Delete this log?")) return;
  await remove(ref(db, `trackers/pickup-tracker-v2/pickups/${id}`));
  flash("Deleted");
};

window.togglePaid = async (id, val) => {
  const isPaid = val === 'paid';
  await cloudUpdate(`pickups/${id}/paid`, isPaid);
  flash(isPaid ? "Marked as Paid" : "Marked as Not Paid");
};

window.resetAll = async () => {
  if (!confirm("⚠️ This will delete ALL shared data for every team member. Continue?")) return;
  await set(trackerRef, null);
  flash("All data reset");
};

// --- UI Handlers ---
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".view-section").forEach(view => {
    view.classList.toggle("active", view.id === `view-${tab}`);
  });
  renderAll();
}

function openModal() {
  const modal = document.getElementById("pickup-modal");
  const form = document.getElementById("modal-form");
  const setupReq = document.getElementById("modal-setup-required");

  if (!state.config.drivers.length || !state.config.locations.length) {
    form.style.display = "none";
    setupReq.style.display = "block";
  } else {
    form.style.display = "block";
    setupReq.style.display = "none";
    
    // Fill selects
    const dSel = document.getElementById("modal-driver");
    dSel.innerHTML = state.config.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
    
    const lSel = document.getElementById("modal-location");
    lSel.innerHTML = state.config.locations.map(l => `<option value="${l.id}">${l.name} — ${fmtCur(state.config.rates[l.id] || 0)}</option>`).join("");
    
    // Default time
    const now = new Date();
    document.getElementById("modal-arrival").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    
    // Default date to today
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset*60*1000));
    const localISODate = localDate.toISOString().split('T')[0];
    document.getElementById("modal-date").value = localISODate;

    // Reset Title and Button text for Log mode
    if (!state.editingPickupId) {
      document.querySelector("#pickup-modal .modal-title").textContent = "Log Pickup";
      document.getElementById("confirm-pickup-btn").textContent = "Confirm Pickup";
      
      // Clear inputs
      document.getElementById("modal-items").value = "";
      document.getElementById("modal-notes").value = "";
    }
    
    updateModalCost();
  }
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("pickup-modal").style.display = "none";
  document.body.style.overflow = "";
  state.editingPickupId = null;
}

function updateModalCost() {
  const lId = document.getElementById("modal-location").value;
  const rate = state.config.rates[lId] || 0;
  document.getElementById("modal-cost-display").textContent = fmtCur(rate);
}

// --- Rendering ---
function renderAll() {
  if (!state.currentUser) return;
  
  if (state.tab === "dashboard") renderDashboard();
  else if (state.tab === "history") renderHistory();
  else if (state.tab === "setup") renderSetup();
}

function renderDashboard() {
  const statsEl = document.getElementById("dashboard-stats");
  const chartsEl = document.getElementById("dashboard-charts");
  const recentEl = document.getElementById("recent-activity-list");
  const recentCard = document.getElementById("recent-activity-card");
  const emptyEl = document.getElementById("dashboard-empty");

  if (state.pickups.length === 0) {
    statsEl.innerHTML = "";
    chartsEl.innerHTML = "";
    recentCard.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  const totalCost = state.pickups.reduce((s, p) => s + p.cost, 0);
  const now = new Date();
  const monthPicks = state.pickups.filter(p => {
    const d = new Date(p.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthCost = monthPicks.reduce((s, p) => s + p.cost, 0);

  // Stats
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Pickups</div>
      <div class="stat-value">${state.pickups.length}</div>
      <div class="stat-sub">all time</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Cost</div>
      <div class="stat-value">${fmtCur(totalCost)}</div>
      <div class="stat-sub">all time</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">This Month</div>
      <div class="stat-value" style="color: var(--accent)">${fmtCur(monthCost)}</div>
      <div class="stat-sub">${monthPicks.length} pickups</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg / Trip</div>
      <div class="stat-value" style="color: var(--green)">${fmtCur(totalCost / state.pickups.length)}</div>
      <div class="stat-sub">overall</div>
    </div>
  `;

  // Charts Logic
  const byDriver = {};
  const byLoc = {};
  const tripsByDriver = {};
  const tripsByLoc = {};
  state.pickups.forEach(p => {
    byDriver[p.driverId] = (byDriver[p.driverId] || 0) + p.cost;
    byLoc[p.locationId] = (byLoc[p.locationId] || 0) + p.cost;
    tripsByDriver[p.driverId] = (tripsByDriver[p.driverId] || 0) + 1;
    tripsByLoc[p.locationId] = (tripsByLoc[p.locationId] || 0) + 1;
  });
  const maxD = Math.max(...Object.values(byDriver), 1);
  const maxL = Math.max(...Object.values(byLoc), 1);

  chartsEl.innerHTML = `
    <div class="chart-card">
      <div class="chart-title">Cost by Driver</div>
      ${state.config.drivers.map(d => {
        const cost = byDriver[d.id] || 0;
        const trips = tripsByDriver[d.id] || 0;
        return `
          <div class="bar-row">
            <div class="bar-info">
              <span class="bar-name">${d.name}</span>
              <span class="bar-val" style="color: var(--accent)">${fmtCur(cost)} <span style="color: var(--dim); font-family: var(--font)">(${trips})</span></span>
            </div>
            <div class="bar-bg">
              <div class="bar-fill" style="width: ${(cost / maxD) * 100}%; background: linear-gradient(90deg, var(--accent), var(--accent-glow))"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="chart-card">
      <div class="chart-title">Cost by Location</div>
      ${state.config.locations.map(l => {
        const cost = byLoc[l.id] || 0;
        const trips = tripsByLoc[l.id] || 0;
        return `
          <div class="bar-row">
            <div class="bar-info">
              <span class="bar-name">${l.name}</span>
              <span class="bar-val" style="color: var(--green)">${fmtCur(cost)} <span style="color: var(--dim); font-family: var(--font)">(${trips})</span></span>
            </div>
            <div class="bar-bg">
              <div class="bar-fill" style="width: ${(cost / maxL) * 100}%; background: linear-gradient(90deg, var(--green), rgba(52,211,153,.25))"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  // Recent Activity
  const recent = [...state.pickups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  if (recent.length > 0) {
    recentCard.style.display = "block";
    recentEl.innerHTML = recent.map(p => {
      const driver = state.config.drivers.find(d => d.id === p.driverId)?.name || "?";
      const loc = state.config.locations.find(l => l.id === p.locationId)?.name || "?";
      return `
        <div class="activity-item">
          <div>
            <div class="activity-main">${driver} <span style="color: var(--dim); fontWeight: 400">→</span> ${loc}</div>
            <div class="activity-meta">${fmtDate(p.createdAt)} · ${fmtTime(p.createdAt)}${p.arrivalTime ? ` · 🏭 ${p.arrivalTime}` : ""}${p.loggedBy ? ` · by ${p.loggedBy}` : ""}</div>
          </div>
          <span class="activity-cost">${fmtCur(p.cost)}</span>
        </div>
      `;
    }).join("");
  } else {
    recentCard.style.display = "none";
  }
}

function renderHistory() {
  const dF = document.getElementById("filter-driver").value;
  const lF = document.getElementById("filter-location").value;
  const mF = document.getElementById("filter-month").value;
  const dateF = document.getElementById("filter-date").value;
  const groupF = document.getElementById("group-by").value;

  // Update filter options dynamically from database
  const dSel = document.getElementById("filter-driver");
  const lSel = document.getElementById("filter-location");
  const mSel = document.getElementById("filter-month");

  dSel.innerHTML = '<option value="all">All Drivers</option>';
  state.config.drivers.forEach(d => dSel.add(new Option(d.name, d.id)));
  [...new Set(state.pickups.map(p => p.driverId))].forEach(id => {
    if (!state.config.drivers.some(d => d.id === id)) dSel.add(new Option("Deleted Driver", id));
  });
  if (Array.from(dSel.options).some(o => o.value === dF)) dSel.value = dF;

  lSel.innerHTML = '<option value="all">All Locations</option>';
  state.config.locations.forEach(l => lSel.add(new Option(l.name, l.id)));
  [...new Set(state.pickups.map(p => p.locationId))].forEach(id => {
    if (!state.config.locations.some(l => l.id === id)) lSel.add(new Option("Deleted Location", id));
  });
  if (Array.from(lSel.options).some(o => o.value === lF)) lSel.value = lF;
  
  const uniqueMonths = [...new Set(state.pickups.map(p => {
    const d = new Date(p.createdAt);
    return `${d.getFullYear()}-${d.getMonth()}`;
  }))].sort().reverse();
  
  mSel.innerHTML = '<option value="all">All Months</option>';
  uniqueMonths.forEach(m => {
    const [y, mo] = m.split("-");
    const label = new Date(parseInt(y), parseInt(mo)).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    mSel.add(new Option(label, m));
  });
  if (Array.from(mSel.options).some(o => o.value === mF)) mSel.value = mF;

  const filtered = state.pickups.filter(p => {
    if (dF !== "all" && p.driverId !== dF) return false;
    if (lF !== "all" && p.locationId !== lF) return false;
    if (mF !== "all") {
      const d = new Date(p.createdAt);
      if (`${d.getFullYear()}-${d.getMonth()}` !== mF) return false;
    }
    if (dateF) {
      const pDate = p.date || new Date(p.createdAt).toISOString().split('T')[0];
      if (pDate !== dateF) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = filtered.reduce((s, p) => s + p.cost, 0);
  document.getElementById("history-stats").textContent = `${filtered.length} pickups · ${fmtCur(total)}`;

  const listEl = document.getElementById("history-list");
  const emptyEl = document.getElementById("history-empty");

  const renderCards = (arr) => arr.map(p => {
    const driver = state.config.drivers.find(d => d.id === p.driverId)?.name || "?";
    const loc = state.config.locations.find(l => l.id === p.locationId)?.name || "?";
    return `
      <div class="history-card">
        <div class="hist-info">
          <div class="hist-title">
            <span>${driver}</span>
            <span style="color: var(--dim); font-size: 12px">→</span>
            <span style="color: var(--text); font-weight: 500">${loc}</span>
          </div>
          <div class="hist-meta">
            <span>${fmtDate(p.createdAt)} ${fmtTime(p.createdAt)}</span>
            ${p.arrivalTime ? `<span style="color: var(--green)">🏭 Arrived: ${p.arrivalTime}</span>` : ""}
            ${p.items ? `<span>📦 ${p.items}</span>` : ""}
            ${p.loggedBy ? `<span style="color: var(--blue)">by ${p.loggedBy}</span>` : ""}
            ${p.notes ? `<span style="font-style: italic">"${p.notes}"</span>` : ""}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px">
          <select onchange="togglePaid('${p.id}', this.value)" style="color: ${p.paid ? 'var(--green)' : 'var(--red)'}; background: ${p.paid ? 'rgba(52,211,153,.15)' : 'rgba(239,68,68,.15)'}; border: 1px solid ${p.paid ? 'var(--green)' : 'var(--red)'}; border-radius: 6px; padding: 4px 8px; font-size: 12px; font-weight: 600; cursor: pointer; outline: none;">
            <option value="unpaid" ${!p.paid ? 'selected' : ''} style="color: var(--text); background: var(--card);">Not Paid</option>
            <option value="paid" ${p.paid ? 'selected' : ''} style="color: var(--text); background: var(--card);">Paid</option>
          </select>
          <span class="hist-cost">${fmtCur(p.cost)}</span>
          <div style="display: flex; gap: 6px">
            <button class="btn-transparent" onclick="editPickup('${p.id}')" style="background: var(--accent-dim); color: var(--accent); padding: 6px; border-radius: 6px" title="Edit Log">${I.edit}</button>
            <button class="btn-red-dim" onclick="rmPickup('${p.id}')" style="padding: 6px; border-radius: 6px" title="Delete Log">${I.trash}</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
  } else {
    emptyEl.style.display = "none";
    if (groupF === "day") {
      const grouped = {};
      filtered.forEach(p => {
        const pDate = p.date || new Date(p.createdAt).toISOString().split('T')[0];
        if (!grouped[pDate]) grouped[pDate] = [];
        grouped[pDate].push(p);
      });
      const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
      listEl.innerHTML = sortedDays.map(day => {
        const dStr = new Date(day).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const dayCost = grouped[day].reduce((s, p) => s + p.cost, 0);
        return `
          <div style="font-weight: 700; margin: 20px 0 10px; color: var(--text); border-bottom: 2px solid var(--border-light); padding-bottom: 6px; display: flex; justify-content: space-between;">
            <span>📅 ${dStr}</span>
            <span style="color: var(--dim)">${fmtCur(dayCost)}</span>
          </div>
          ${renderCards(grouped[day])}
        `;
      }).join("");
    } else {
      listEl.innerHTML = renderCards(filtered);
    }
  }
}

function renderSetup() {
  const dList = document.getElementById("drivers-list");
  const lList = document.getElementById("locations-list");

  dList.innerHTML = state.config.drivers.length === 0 ? `<div style="color: var(--dim); font-size: 13px; padding: 6px 0">No drivers yet</div>` :
    state.config.drivers.map(d => `
      <div class="setup-row">
        <span style="font-size: 14px; font-weight: 600">${d.name}</span>
        <button class="btn-transparent" onclick="rmDriver('${d.id}')" style="color: var(--red); padding: 4px">${I.trash}</button>
      </div>
    `).join("");

  lList.innerHTML = state.config.locations.length === 0 ? `<div style="color: var(--dim); font-size: 13px; padding: 6px 0">No locations yet</div>` :
    state.config.locations.map(l => `
      <div class="setup-row">
        <span style="font-size: 14px; font-weight: 600; flex: 1">${l.name}</span>
        <input type="number" value="${state.config.rates[l.id] || 0}" onchange="setRate('${l.id}', this.value)" style="width: 100px; text-align: right; font-family: var(--mono)">
        <span style="font-size: 12px; color: var(--muted)">JOD</span>
        <button class="btn-transparent" onclick="rmLocation('${l.id}')" style="color: var(--red); padding: 4px">${I.trash}</button>
      </div>
    `).join("");
}

// --- Init ---
function init() {
  const savedUser = localStorage.getItem("roots-user");
  if (savedUser) {
    state.currentUser = savedUser;
    showApp();
  } else {
    window.location.href = "/";
    return;
  }

  // Event Listeners
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  document.getElementById("open-log-btn").onclick = () => {
    state.editingPickupId = null;
    openModal();
  };
  document.getElementById("close-modal-btn").onclick = closeModal;
  document.getElementById("modal-setup-ok").onclick = closeModal;
  
  document.getElementById("pickup-modal").addEventListener("click", (e) => {
    if (e.target.id === "pickup-modal") closeModal();
  });
  
  document.getElementById("add-driver-btn").onclick = () => {
    const input = document.getElementById("new-driver-name");
    window.addDriver(input.value);
    input.value = "";
  };

  document.getElementById("add-location-btn").onclick = () => {
    const nameInp = document.getElementById("new-location-name");
    const rateInp = document.getElementById("new-location-rate");
    window.addLocation(nameInp.value, rateInp.value);
    nameInp.value = "";
    rateInp.value = "";
  };

  document.getElementById("reset-all-btn").onclick = window.resetAll;
  document.getElementById("refresh-btn").onclick = () => { renderAll(); flash("Refreshed"); };

  document.getElementById("confirm-pickup-btn").onclick = () => {
    const driverId = document.getElementById("modal-driver").value;
    const locationId = document.getElementById("modal-location").value;
    const items = document.getElementById("modal-items").value;
    const notes = document.getElementById("modal-notes").value;
    const arrivalTime = document.getElementById("modal-arrival").value;
    const date = document.getElementById("modal-date").value;
    
    if (state.editingPickupId) {
      window.saveEditedPickup({ id: state.editingPickupId, driverId, locationId, items, notes, arrivalTime, date });
    } else {
      window.addPickup({ driverId, locationId, items, notes, arrivalTime, date });
    }
  };

  document.getElementById("modal-location").onchange = updateModalCost;

  document.getElementById("filter-driver").onchange = renderHistory;
  document.getElementById("filter-location").onchange = renderHistory;
  document.getElementById("filter-month").onchange = renderHistory;
  document.getElementById("filter-date").onchange = renderHistory;
  document.getElementById("group-by").onchange = renderHistory;
  
  document.getElementById("export-csv-btn").onclick = exportCSV;
}

function showApp() {
  renderAll();
}

function exportCSV() {
  const h = "Date,Time,Driver,Location,Items,Cost (JOD),Arrival at Roots,Notes,Logged By\n";
  const rows = state.pickups.map(p => {
    const d = state.config.drivers.find(x => x.id === p.driverId)?.name || "";
    const l = state.config.locations.find(x => x.id === p.locationId)?.name || "";
    return `"${fmtDate(p.createdAt)}","${fmtTime(p.createdAt)}","${d}","${l}","${p.items || ""}",${p.cost},"${p.arrivalTime || ""}","${p.notes || ""}","${p.loggedBy || ""}"`;
  }).join("\n");
  const blob = new Blob([h + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pickups_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  flash("CSV exported");
}

init();
