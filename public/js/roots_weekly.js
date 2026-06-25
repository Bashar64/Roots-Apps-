import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const dashboardRef = ref(db, "dashboard/root-weekly-v3");

const PEOPLE = {
  Hashim: { initial: "HA", class: "av-hashim" },
  Omar: { initial: "OM", class: "av-omar" },
  Bashar: { initial: "BA", class: "av-bashar" },
  Khaldoun: { initial: "KH", class: "av-khaldoun" },
  Team: { initial: "TM", class: "av-team" }
};

const CATS = { ops: "Operations", fin: "Finance", adm: "Admin", col: "Collaboration", sal: "Sales" };
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function parseTime(t) {
  if (!t) return 0;
  const match = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  let [_, h, m] = match;
  return parseInt(h) * 60 + parseInt(m);
}

const OOC_AM = (t) => ({ time: t || "09:30", name: "Outstanding order check (AM)", desc: "Manual order status check", cat: "ops", key: false, fixed: true });
const OOC_PM = () => ({ time: "17:00", name: "Outstanding order check (PM)", desc: "Manual order status check", cat: "ops", key: false, fixed: true });
const COD_K = () => ({ time: "11:00", name: "COD reconciliation with Khaldoun", desc: "COD reconciliation session", cat: "fin", key: true, defaultAssign: "Khaldoun", fixed: true });

const DAYS_CONFIG = [
  { id: "sat", name: "Saturday", badge: "d-sat", meta: "Warehouse day", tasks: [OOC_AM("9:30\u20139:45"), { time: "9:45\u201310:00", name: "Courier handover \u2014 Skynet", desc: "Hand over Thursday orders", cat: "ops", key: false, fixed: true }, { time: "10:00\u201311:00", name: "Admin \u2014 WMS prep", desc: "Prepare sheets, print AWBs", cat: "adm", key: false, fixed: true }, { time: "11:00\u201312:00", name: "Sales", desc: "Sales work", cat: "sal", key: true, fixed: true }, { time: "12:00\u201314:00", name: "Pending tasks", desc: "Backlog", cat: "adm", key: true, fixed: true }, { time: "14:00\u201316:00", name: "Items arrival + packaging", desc: "Receive orders", cat: "ops", key: false, fixed: true }, { time: "16:00\u201317:00", name: "Admin close", desc: "Close system", cat: "adm", key: false, fixed: true }, OOC_PM(), { time: "17:30\u201318:00", name: "Courier handover", desc: "End handover", cat: "ops", key: false, fixed: true }] },
  { id: "sun", name: "Sunday", badge: "d-sun", meta: "Start of week", tasks: [{ time: "9:30\u201310:00", name: "Team catch-up", desc: "Review Sat", cat: "col", key: false, fixed: true }, { time: "10:00\u201311:30", name: "Founders call", desc: "Weekly sync", cat: "col", key: true, fixed: true }, OOC_AM("11:30\u201311:45"), { time: "11:45\u201312:15", name: "Upload sheets", desc: "Print AWBs", cat: "ops", key: false, fixed: true }, COD_K(), { time: "12:30\u201313:30", name: "COD reconciliation", desc: "Payouts", cat: "fin", key: true, fixed: true }, { time: "13:30\u201315:00", name: "Pending tasks", desc: "Backlog", cat: "adm", key: true, fixed: true }, { time: "15:00\u201317:00", name: "Order prep", desc: "Process orders", cat: "ops", key: false, fixed: true }, { time: "17:00\u201317:30", name: "Admin close", desc: "Wrap up", cat: "adm", key: false, fixed: true }, OOC_PM(), { time: "17:30\u201318:00", name: "Courier handover", desc: "End handover", cat: "ops", key: false, fixed: true }] },
  { id: "mon", name: "Monday", badge: "d-mon", meta: "Warehouse day", tasks: [OOC_AM("9:30\u20139:45"), { time: "9:45\u201310:30", name: "Admin \u2014 WMS prep", desc: "Sheets & AWBs", cat: "adm", key: false, fixed: true }, { time: "10:30\u201311:30", name: "Sales", desc: "Sales work", cat: "sal", key: true, fixed: true }, { time: "11:30\u201314:00", name: "Pending tasks", desc: "Backlog", cat: "adm", key: true, fixed: true }, { time: "14:00\u201316:00", name: "Items arrival + packaging", desc: "Receive orders", cat: "ops", key: false, fixed: true }, { time: "16:00\u201317:00", name: "Admin close", desc: "Close system", cat: "adm", key: false, fixed: true }, OOC_PM(), { time: "17:30\u201318:00", name: "Courier handover", desc: "End handover", cat: "ops", key: false, fixed: true }] },
  { id: "tue", name: "Tuesday", badge: "d-tue", meta: "Mid-week", tasks: [{ time: "9:30\u201310:00", name: "Team catch-up", desc: "Review Mon", cat: "col", key: false, fixed: true }, OOC_AM("10:00\u201310:15"), { time: "10:15\u201310:45", name: "Upload sheets", desc: "Print AWBs", cat: "ops", key: false, fixed: true }, COD_K(), { time: "11:00\u201315:00", name: "Pending tasks", desc: "Backlog", cat: "adm", key: true, fixed: true }, { time: "15:00\u201316:00", name: "Founders call", desc: "Mid-week sync", cat: "col", key: true, fixed: true }, { time: "16:00\u201317:00", name: "Close orders", desc: "Finalize", cat: "ops", key: false, fixed: true }, OOC_PM(), { time: "17:30\u201318:00", name: "Courier handover", desc: "End handover", cat: "ops", key: false, fixed: true }] },
  { id: "wed", name: "Wednesday", badge: "d-wed", meta: "Warehouse day", tasks: [OOC_AM("9:30\u20139:45"), { time: "9:45\u201310:30", name: "Admin \u2014 WMS prep", desc: "Sheets & AWBs", cat: "adm", key: false, fixed: true }, { time: "10:30\u201311:30", name: "Sales", desc: "Sales work", cat: "sal", key: true, fixed: true }, { time: "11:30\u201314:00", name: "Pending tasks", desc: "Backlog", cat: "adm", key: true, fixed: true }, { time: "14:00\u201316:00", name: "Items arrival + packaging", desc: "Receive orders", cat: "ops", key: false, fixed: true }, { time: "16:00\u201317:00", name: "Admin close", desc: "Close system", cat: "adm", key: false, fixed: true }, OOC_PM(), { time: "17:30\u201318:00", name: "Courier handover", desc: "End handover", cat: "ops", key: false, fixed: true }] },
  { id: "thu", name: "Thursday", badge: "d-thu", meta: "End of week", tasks: [{ time: "9:30\u201310:00", name: "Team catch-up", desc: "Review Wed", cat: "col", key: false, fixed: true }, OOC_AM("10:00\u201310:15"), { time: "10:15\u201310:45", name: "Upload sheets", desc: "Print AWBs", cat: "ops", key: false, fixed: true }, COD_K(), { time: "11:00\u201313:00", name: "Weekly COD reconciliation", desc: "Full week", cat: "fin", key: true, fixed: true }, { time: "13:00\u201315:00", name: "Pending tasks", desc: "Backlog", cat: "adm", key: true, fixed: true }, { time: "15:00\u201316:00", name: "Founders call", desc: "Sync", cat: "col", key: true, fixed: true }, { time: "16:00\u201317:00", name: "Close orders", desc: "Finalize", cat: "ops", key: false, fixed: true }, OOC_PM(), { time: "17:30\u201318:00", name: "Courier handover", desc: "End handover", cat: "ops", key: false, fixed: true }] }
];

let state = {}, customTasks = [], reportHistory = [], currentFilter = "all", isInitialLoad = true, lastLocalUpdate = 0;

function getKey(dayId, task) { return task.fixed ? `${dayId}_fixed_${task.name}` : `custom_${task.customId}`; }
function getTaskState(key, t) {
  if (!state[key]) state[key] = { assigned: (t && t.defaultAssign) || "Hashim", status: "Not done", reason: "" };
  return state[key];
}

function showToast(msg) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

onValue(dashboardRef, (snapshot) => {
  if (snapshot.exists()) {
    const data = snapshot.val();
    // Crucial: Only sync if we haven't updated locally in the last 5 seconds
    if (isInitialLoad || (Date.now() - lastLocalUpdate > 5000)) {
      state = data.taskState || {};
      customTasks = data.customTasks || [];
      reportHistory = data.reportHistory || [];
      renderAll(); renderHistory();
      if (isInitialLoad) {
        document.getElementById("report-status").textContent = "Cloud Sync Active (RTDB)";
        isInitialLoad = false;
      }
    }
  }
});

async function cloudUpdate(path, value) {
  const statusEl = document.getElementById("report-status");
  statusEl.innerHTML = '<span style="color:#60a5fa">\u25cf Syncing...</span>';
  lastLocalUpdate = Date.now();
  try {
    const rtdbPath = path.replace(/\./g, "/");
    await update(dashboardRef, { [rtdbPath]: value, updatedAt: new Date().toISOString() });
    statusEl.innerHTML = '<span style="color:#4ade80">\u2713 Saved</span>';
    setTimeout(() => { if(statusEl.textContent.includes("Saved")) statusEl.textContent = "Cloud Sync Active (RTDB)"; }, 2000);
  } catch (e) {
    statusEl.innerHTML = '<span style="color:#f87171">\u26a0 Sync Failed</span>';
  }
}

window.updateTaskField = (key, field, val) => {
  if (!state[key]) state[key] = { status: "Not done", reason: "", assigned: "Hashim" };
  state[key][field] = val;
  renderAll();
  cloudUpdate(`taskState/${key}/${field}`, val);
};

window.updateTaskStatus = (key, val) => {
  if (!state[key]) state[key] = { status: "Not done", reason: "", assigned: "Hashim" };
  state[key].status = val;
  renderAll();
  if (val === "Done") showToast("Task Completed");
  cloudUpdate(`taskState/${key}/status`, val);
};

window.toggleAddForm = (dayId) => {
  const el = document.getElementById("add-form-" + dayId);
  const isOpen = el.classList.contains("open");
  document.querySelectorAll(".add-form").forEach(f => f.classList.remove("open"));
  if (!isOpen) el.classList.add("open");
};

window.saveCustomTask = async (dayId) => {
  const name = document.getElementById("new-name-" + dayId).value.trim();
  const hh = document.getElementById("new-hh-" + dayId).value;
  const mm = document.getElementById("new-mm-" + dayId).value;
  const assigned = document.getElementById("new-assign-" + dayId).value;
  const cat = document.getElementById("new-cat-" + dayId).value;
  const keyType = document.getElementById("new-key-" + dayId).value === "key";
  if (!name) return;

  const customId = Date.now();
  const newTask = { dayId, customId, name, time: `${hh}:${mm}`, desc: "", cat, key: keyType, fixed: false };
  const newTaskState = { assigned, status: "Not done", reason: "" };
  
  state[`custom_${customId}`] = newTaskState;
  customTasks.push(newTask);
  renderAll();
  showToast("Task Added successfully");
  
  lastLocalUpdate = Date.now();
  await update(dashboardRef, { "customTasks": customTasks, [`taskState/custom_${customId}`]: newTaskState, "updatedAt": new Date().toISOString() });
};

window.removeTask = async (key, isFixed) => {
  if (!confirm("Are you sure you want to remove this task?")) return;
  
  if (isFixed) {
    if (!state[key]) state[key] = { status: "Not done", reason: "", assigned: "Hashim" };
    state[key].removed = true;
    renderAll();
    cloudUpdate(`taskState/${key}/removed`, true);
  } else {
    const customId = key.replace("custom_", "");
    customTasks = customTasks.filter(ct => String(ct.customId) !== String(customId));
    // Clean up state for custom task
    delete state[key];
    renderAll();
    // We update the whole customTasks array and also delete the state entry in cloud
    lastLocalUpdate = Date.now();
    await update(dashboardRef, { 
      "customTasks": customTasks, 
      [`taskState/${key}`]: null, 
      "updatedAt": new Date().toISOString() 
    });
  }
  showToast("Task removed");
};

window.deleteCustomTask = (dayId, customId) => window.removeTask(`custom_${customId}`, false);

window.setFilter = (f) => {
  currentFilter = f;
  ["all", "key", "routine", "notdone"].forEach(b => {
    const btn = document.getElementById("f-" + b);
    if (btn) btn.className = "filter-btn" + (b === f ? " active" + (f !== "all" ? "-" + f : "") : "");
  });
  renderAll();
};

function updateMetrics() {
  let total = 0, done = 0;
  DAYS_CONFIG.forEach(d => {
    const tasks = [...customTasks.filter(ct => ct.dayId === d.id), ...d.tasks.filter(t => t.fixed)];
    tasks.forEach(t => { 
      const k = getKey(d.id, t);
      if (state[k] && state[k].removed) return;
      total++; 
      if (getTaskState(k, t).status === "Done") done++; 
    });
  });
  document.getElementById("m-total").textContent = total;
  document.getElementById("m-progress").textContent = (total > 0 ? Math.round(done/total*100) : 0) + "%";
  document.getElementById("m-done-count").textContent = done + " completed";
}

function renderAll() {
  const container = document.getElementById("schedule");
  if (!container) return;
  container.innerHTML = "";
  let visibleCount = 0;
  DAYS_CONFIG.forEach(day => {
    const tasks = [...customTasks.filter(ct => ct.dayId === day.id), ...day.tasks.filter(t => t.fixed)].sort((a, b) => parseTime(a.time) - parseTime(b.time));
    const section = document.createElement("div");
    section.className = "day-section";
    section.innerHTML = `<div class="day-header"><span class="day-badge ${day.badge}">${day.name}</span><span class="day-name">${day.meta}</span><button class="add-task-btn" onclick="window.toggleAddForm('${day.id}')">+ Custom task</button></div>`;
    const wrap = document.createElement("div");
    wrap.className = "tbl-wrap";
    wrap.innerHTML = `<div class="tbl-head"><div class="th"></div><div class="th">Time</div><div class="th">Task</div><div class="th">Cat</div><div class="th">Assignee</div><div class="th">Status</div><div class="th">Notes</div><div class="th"></div></div>`;
    const addForm = document.createElement("div");
    addForm.className = "add-form";
    addForm.id = "add-form-" + day.id;
    addForm.innerHTML = `<div class="form-group" style="flex:2"><label class="form-label">Task</label><input class="form-input" id="new-name-${day.id}" placeholder="Task name..."></div><div class="form-group" style="flex:1"><label class="form-label">Time</label><div class="time-selector-box"><select id="new-hh-${day.id}">${HOURS.map(h=>`<option value="${h}">${h}</option>`).join("")}</select><span>:</span><select id="new-mm-${day.id}">${MINUTES.map(m=>`<option value="${m}">${m}</option>`).join("")}</select></div></div><div class="form-group" style="flex:1"><label class="form-label">Assign</label><select class="form-select" id="new-assign-${day.id}">${Object.keys(PEOPLE).map(p=>`<option value="${p}">${p}</option>`).join("")}</select></div><div class="form-group" style="flex:1"><label class="form-label">Priority</label><select class="form-select" id="new-key-${day.id}"><option value="routine">Routine</option><option value="key">Key</option></select></div><div class="form-group" style="flex:1"><label class="form-label">Cat</label><select class="form-select" id="new-cat-${day.id}">${Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div><div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:5px"><button class="report-btn primary" style="padding:10px 20px" onclick="window.saveCustomTask('${day.id}')">Add</button></div>`;
    wrap.appendChild(addForm);
    tasks.forEach(t => {
      const k = getKey(day.id, t);
      const s = getTaskState(k, t);
      if (s.removed) return;
      if (currentFilter === "key" && !t.key) return;
      if (currentFilter === "routine" && t.key) return;
      if (currentFilter === "notdone" && s.status === "Done") return;
      visibleCount++; const isDone = s.status === "Done";
      const p = PEOPLE[s.assigned] || PEOPLE.Hashim;
      const row = document.createElement("div");
      row.className = `task-row ${t.key ? "key-task" : ""} ${isDone ? "done-row" : ""}`;
      row.innerHTML = `<div><div class="key-dot ${t.key ? "key" : "routine"}"></div></div><div class="time-str">${t.time}</div><div><div class="task-name">${t.name}</div><div class="task-desc">${t.desc||""}</div></div><div><span class="cat-pill cp-${t.cat}">${CATS[t.cat]||t.cat}</span></div><div style="display:flex;align-items:center;gap:8px"><select class="form-select" style="padding:2px;font-size:11px" onchange="window.updateTaskField('${k}', 'assigned', this.value)">${Object.keys(PEOPLE).map(u=>`<option value="${u}" ${s.assigned===u?"selected":""}>${u}</option>`).join("")}</select><div class="avatar ${p.class}">${p.initial}</div></div><div><select class="form-select" onchange="window.updateTaskStatus('${k}', this.value)"><option value="Not done" ${!isDone?"selected":""}>Pending</option><option value="Done" ${isDone?"selected":""}>Complete</option></select></div><div><input type="text" class="form-input" value="${s.reason||""}" placeholder="Notes..." onchange="window.updateTaskField('${k}', 'reason', this.value)"></div><div><button class="del-btn" title="Remove Task" onclick="window.removeTask('${k}', ${t.fixed})">\u00d7</button></div>`;
      wrap.appendChild(row);
    });
    section.appendChild(wrap); container.appendChild(section);
  });
  document.getElementById("filter-count").textContent = currentFilter !== "all" ? `${visibleCount} results` : "";
  updateMetrics();
}

window.sendNow = () => {
  let text = `OPS AUDIT - ${new Date().toLocaleDateString()}\n\n`;
  DAYS_CONFIG.forEach(d => {
    text += d.name.toUpperCase() + "\n";
    [...customTasks.filter(ct => ct.dayId === d.id), ...d.tasks.filter(t => t.fixed)].forEach(t => {
      const s = getTaskState(getKey(d.id, t), t);
      text += ` [${s.status==="Done"?"\u2713":"\u2717"}] ${t.time.padEnd(8)} | ${t.name}\n`;
    });
    text += "\n";
  });
  window.open(`mailto:ops@roots-jo.co?subject=Roots Audit&body=${encodeURIComponent(text)}`);
};

function renderHistory() {
  const container = document.getElementById("history-list");
  if (!container) return;
  container.innerHTML = reportHistory.map(r => `<div class="history-item"><div class="history-item-header"><div>Audit ${new Date(r.timestamp).toLocaleDateString()}</div><div class="hstat hstat-done">${Math.round(r.done/r.total*100)}%</div></div></div>`).join("");
}

renderAll(); renderHistory();
setInterval(() => {
  const next = new Date(); next.setHours(20, 0, 0, 0); if(new Date() > next) next.setDate(next.getDate()+1);
  const el = document.getElementById("next-send");
  if (el) el.textContent = "Next check: " + next.toLocaleString();
}, 60000);
