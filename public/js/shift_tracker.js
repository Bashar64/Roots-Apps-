import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, push, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const currentUser = localStorage.getItem("roots-user");
const isAdmin = currentUser === "Roots" || localStorage.getItem("roots-isAdmin") === "true";

if (!currentUser) {
  window.location.href = "/";
}

let activeShiftData = null;
let timerInterval = null;
let historicalShifts = [];

const JOD_PER_HOUR = 2.0;

// ── DOM Elements ──
const punchBtn = document.getElementById("punch-btn");
const punchBtnText = document.getElementById("punch-btn-text");
const punchTimerEl = document.getElementById("punch-timer");
const punchStatusEl = document.getElementById("punch-status");

// Admin Elements
const adminTabsNav = document.getElementById("admin-tabs");
const viewPunch = document.getElementById("view-punch");
const viewAdmin = document.getElementById("view-admin");
const activeShiftsContainer = document.getElementById("active-shifts-container");
const historyTbody = document.getElementById("history-tbody");
const filterUser = document.getElementById("filter-user");
const filterWeek = document.getElementById("filter-week");
const totalPayEl = document.getElementById("history-total-pay");
const selectAllBtn = document.getElementById("select-all-shifts");
const deleteSelectedBtn = document.getElementById("delete-selected-btn");

// ── Tabs Logic ──
if (isAdmin) {
  adminTabsNav.style.display = "flex";
  
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const target = btn.getAttribute("data-tab");
      if (target === "punch") {
        viewPunch.style.display = "block";
        viewAdmin.style.display = "none";
      } else {
        viewPunch.style.display = "none";
        viewAdmin.style.display = "block";
      }
    });
  });
}

// ── Helpers ──
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDatetimeLocal(timestamp) {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  return d.toLocaleString('en-GB', { hour12: true, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getWeekIdentifier(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  let daysToFriday = 5 - day;
  if (daysToFriday < 0) daysToFriday += 7; 
  d.setDate(d.getDate() + daysToFriday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dateStr = String(d.getDate()).padStart(2, '0');
  return `Week ending ${year}-${month}-${dateStr}`;
}

function calculatePay(durationMs) {
  const hours = durationMs / 3600000;
  return (hours * JOD_PER_HOUR).toFixed(2);
}

// ── Punch Clock Logic ──
// Use localStorage as an immediate fallback so the timer is robust against offline page reloads
const localStartTime = localStorage.getItem("roots-active-shift-start");
if (localStartTime) {
  activeShiftData = { startTime: parseInt(localStartTime) };
  setPunchedInState();
}

function startLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (activeShiftData) {
      const diff = Date.now() - activeShiftData.startTime;
      punchTimerEl.textContent = formatTime(diff);
    }
  }, 1000);
}

function stopLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  punchTimerEl.textContent = "00:00:00";
}

function setPunchedInState() {
  punchStatusEl.textContent = "Currently Punched In";
  punchStatusEl.classList.add("active");
  punchBtn.classList.remove("btn-green");
  punchBtn.classList.add("btn-red");
  punchBtnText.textContent = "PUNCH OUT";
  startLocalTimer();
}

function setPunchedOutState() {
  punchStatusEl.textContent = "Currently Punched Out";
  punchStatusEl.classList.remove("active");
  punchBtn.classList.remove("btn-red");
  punchBtn.classList.add("btn-green");
  punchBtnText.textContent = "PUNCH IN";
  stopLocalTimer();
}

// Listen to my active shift
onValue(ref(db, `shifts/active/${currentUser}`), (snapshot) => {
  if (snapshot.exists()) {
    activeShiftData = snapshot.val();
    localStorage.setItem("roots-active-shift-start", activeShiftData.startTime);
    setPunchedInState();
  } else {
    activeShiftData = null;
    localStorage.removeItem("roots-active-shift-start");
    setPunchedOutState();
  }
});

punchBtn.addEventListener("click", async () => {
  punchBtn.disabled = true; // prevent double clicks
  try {
    if (activeShiftData) {
      // Punch Out
      const endTime = Date.now();
      const startTime = activeShiftData.startTime;
      const durationMs = endTime - startTime;
      const pay = calculatePay(durationMs);
      
      const newShift = {
        username: currentUser,
        date: new Date(startTime).toISOString().split('T')[0],
        startTime: startTime,
        endTime: endTime,
        durationFormatted: formatTime(durationMs),
        pay: parseFloat(pay),
        weekIdentifier: getWeekIdentifier(new Date(startTime))
      };
      
      // Save to history
      await push(ref(db, 'shifts/history'), newShift);
      
      // Remove from active
      await remove(ref(db, `shifts/active/${currentUser}`));
      
      activeShiftData = null;
      setPunchedOutState();
    } else {
      // Punch In
      const startTime = Date.now();
      await set(ref(db, `shifts/active/${currentUser}`), {
        startTime: startTime
      });
    }
  } catch (error) {
    console.error("Error toggling shift:", error);
    alert("Failed to update shift. Please try again.");
  }
  punchBtn.disabled = false;
});

// ── Admin Logic ──
if (isAdmin) {
  // Live Active Shifts
  let adminActiveShiftsInterval = null;
  let allActiveShifts = {};
  
  onValue(ref(db, 'shifts/active'), (snapshot) => {
    allActiveShifts = snapshot.val() || {};
    renderActiveShifts();
    
    if (adminActiveShiftsInterval) clearInterval(adminActiveShiftsInterval);
    adminActiveShiftsInterval = setInterval(renderActiveShifts, 1000);
  });
  
  function renderActiveShifts() {
    const keys = Object.keys(allActiveShifts);
    if (keys.length === 0) {
      activeShiftsContainer.innerHTML = '<div class="empty-msg">No active shifts.</div>';
      return;
    }
    
    activeShiftsContainer.innerHTML = keys.map(user => {
      const shift = allActiveShifts[user];
      const diff = Date.now() - shift.startTime;
      return `
        <div class="active-shift-card">
          <div class="active-shift-user">${user}</div>
          <div class="active-shift-timer">${formatTime(diff)}</div>
          <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Since ${new Date(shift.startTime).toLocaleTimeString()}</div>
          <button class="btn-action admin-stop-shift" data-user="${user}" style="margin-top: 12px; background: rgba(235, 87, 87, 0.1); color: var(--red); width: 100%; font-size: 12px; font-weight: 700;">STOP SHIFT</button>
        </div>
      `;
    }).join("");
  }

  activeShiftsContainer.addEventListener("click", async (e) => {
    const btn = e.target.closest(".admin-stop-shift");
    if (btn) {
      const user = btn.getAttribute("data-user");
      const shift = allActiveShifts[user];
      if (!shift) return;
      
      if (confirm(`Are you sure you want to stop the shift for ${user}?`)) {
        btn.disabled = true;
        try {
          const endTime = Date.now();
          const startTime = shift.startTime;
          const durationMs = endTime - startTime;
          const pay = calculatePay(durationMs);
          
          const newShift = {
            username: user,
            date: new Date(startTime).toISOString().split('T')[0],
            startTime: startTime,
            endTime: endTime,
            durationFormatted: formatTime(durationMs),
            pay: parseFloat(pay),
            weekIdentifier: getWeekIdentifier(new Date(startTime))
          };
          
          await push(ref(db, 'shifts/history'), newShift);
          await remove(ref(db, `shifts/active/${user}`));
        } catch (error) {
          console.error(error);
          alert("Failed to stop shift.");
          btn.disabled = false;
        }
      }
    }
  });
  
  // History & Payroll
  onValue(ref(db, 'shifts/history'), (snapshot) => {
    const data = snapshot.val() || {};
    historicalShifts = Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    })).sort((a, b) => b.startTime - a.startTime); // newest first
    
    populateFilters();
    renderHistoryTable();
  });
  
  function populateFilters() {
    const users = new Set();
    const weeks = new Set();
    
    historicalShifts.forEach(shift => {
      users.add(shift.username);
      weeks.add(shift.weekIdentifier);
    });
    
    const currUserVal = filterUser.value;
    filterUser.innerHTML = '<option value="all">All Users</option>';
    Array.from(users).sort().forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      filterUser.appendChild(opt);
    });
    if (users.has(currUserVal)) filterUser.value = currUserVal;
    
    const currWeekVal = filterWeek.value;
    filterWeek.innerHTML = '<option value="all">All Weeks</option>';
    Array.from(weeks).sort().reverse().forEach(w => {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = w;
      filterWeek.appendChild(opt);
    });
    if (weeks.has(currWeekVal)) filterWeek.value = currWeekVal;
  }
  
  function renderHistoryTable() {
    const selectedUser = filterUser.value;
    const selectedWeek = filterWeek.value;
    
    const filtered = historicalShifts.filter(shift => {
      if (selectedUser !== "all" && shift.username !== selectedUser) return false;
      if (selectedWeek !== "all" && shift.weekIdentifier !== selectedWeek) return false;
      return true;
    });
    
    let totalPay = 0;
    
    if (filtered.length === 0) {
      historyTbody.innerHTML = `<tr><td colspan="9" class="empty-msg">No shifts found.</td></tr>`;
      totalPayEl.textContent = `0.00 JOD`;
      if (selectAllBtn) {
        selectAllBtn.checked = false;
        selectAllBtn.indeterminate = false;
      }
      updateBulkDeleteButton();
      return;
    }

    const weeksMap = {};
    filtered.forEach(shift => {
      const wk = shift.weekIdentifier || "Unknown Week";
      if (!weeksMap[wk]) weeksMap[wk] = { shifts: [], weekTotal: 0 };
      weeksMap[wk].shifts.push(shift);
      weeksMap[wk].weekTotal += (shift.pay || 0);
      totalPay += (shift.pay || 0);
    });

    const weekKeys = Object.keys(weeksMap).sort().reverse();
    
    let html = "";
    weekKeys.forEach(wk => {
      const weekObj = weeksMap[wk];
      
      html += `
        <tr class="week-separator" style="pointer-events: none;">
          <td colspan="9" style="background: rgba(39, 174, 96, 0.05); padding: 8px 16px; border-bottom: 2px solid var(--border); border-top: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 11px; color: var(--green); text-transform: uppercase;">
              <span>${wk}</span>
              <span>Subtotal: ${weekObj.weekTotal.toFixed(2)} JOD</span>
            </div>
          </td>
        </tr>
      `;
      
      html += weekObj.shifts.map(shift => {
        const dayStr = new Date(shift.startTime).toLocaleDateString("en-US", { weekday: "long" });
        return `
          <tr>
            <td><input type="checkbox" class="shift-checkbox" data-id="${shift.id}" style="pointer-events: auto;"></td>
            <td style="font-weight: 600;">${shift.username}</td>
            <td>${shift.date}</td>
            <td style="color: var(--dim); font-size: 13px;">${dayStr}</td>
            <td>${formatDatetimeLocal(shift.startTime)}</td>
            <td>${formatDatetimeLocal(shift.endTime)}</td>
            <td style="font-family: var(--mono); font-weight: 600;">${shift.durationFormatted}</td>
            <td style="font-weight: 600; color: var(--accent);">${(shift.pay || 0).toFixed(2)}</td>
            <td><button class="btn-action btn-delete" data-id="${shift.id}" title="Delete Shift" style="pointer-events: auto;">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button></td>
          </tr>
        `;
      }).join("");
    });
    
    historyTbody.innerHTML = html;
    
    totalPayEl.textContent = `${totalPay.toFixed(2)} JOD`;

    if (selectAllBtn) {
      selectAllBtn.checked = false;
      selectAllBtn.indeterminate = false;
    }
    updateBulkDeleteButton();
  }
  
  filterUser.addEventListener("change", renderHistoryTable);
  filterWeek.addEventListener("change", renderHistoryTable);

  function updateBulkDeleteButton() {
    if (!deleteSelectedBtn) return;
    const checkedCount = document.querySelectorAll(".shift-checkbox:checked").length;
    if (checkedCount > 0) {
      deleteSelectedBtn.style.display = "inline-block";
      deleteSelectedBtn.textContent = `Delete Selected (${checkedCount})`;
    } else {
      deleteSelectedBtn.style.display = "none";
    }
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      const checkboxes = document.querySelectorAll(".shift-checkbox");
      checkboxes.forEach(cb => cb.checked = isChecked);
      updateBulkDeleteButton();
    });
  }

  if (historyTbody) {
    historyTbody.addEventListener("change", (e) => {
      if (e.target.classList.contains("shift-checkbox")) {
        updateBulkDeleteButton();
        
        const checkboxes = document.querySelectorAll(".shift-checkbox");
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        if (selectAllBtn) {
          selectAllBtn.checked = allChecked;
          selectAllBtn.indeterminate = someChecked && !allChecked;
        }
      }
    });

    historyTbody.addEventListener("click", async (e) => {
      const deleteBtn = e.target.closest(".btn-delete");
      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-id");
        if (confirm("Are you sure you want to delete this shift?")) {
          try {
            await remove(ref(db, `shifts/history/${id}`));
          } catch (error) {
            console.error(error);
            alert("Failed to delete shift.");
          }
        }
      }
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const checkedBoxes = document.querySelectorAll(".shift-checkbox:checked");
      if (checkedBoxes.length === 0) return;
      
      if (confirm(`Are you sure you want to delete ${checkedBoxes.length} shift(s)?`)) {
        try {
          const promises = Array.from(checkedBoxes).map(cb => {
            const id = cb.getAttribute("data-id");
            return remove(ref(db, `shifts/history/${id}`));
          });
          await Promise.all(promises);
        } catch (error) {
          console.error(error);
          alert("Failed to delete some shifts.");
        }
      }
    });
  }
}
