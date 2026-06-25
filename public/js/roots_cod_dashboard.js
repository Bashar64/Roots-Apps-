import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const codRef = ref(db, "dashboard/cod-dashboard-v1");

/* --- State Management --- */
const S = {
  omnifulFile: null,
  skynetFiles: [],
  result: null,
  tab: 'all',
  expanded: new Set(),
  payment: {},
  delivery: {},
  notes: {},
  approved: {},
  merchantPaid: {},
  rootsCharge: {},
  history: [],
  sort: {
    all: { col: null, dir: 'asc' },
    matched: { col: null, dir: 'asc' },
    skynetOnly: { col: null, dir: 'asc' },
    omnifulOnly: { col: null, dir: 'asc' }
  },
  colFilter: {
    all: {},
    matched: {},
    skynetOnly: {},
    omnifulOnly: {}
  },
  view: 'upload'
};

/* --- Cloud Synchronization --- */
onValue(codRef, (snapshot) => {
  if (snapshot.exists()) {
    const data = snapshot.val();
    const state = data.state || {};
    S.payment = state.payment || {};
    S.delivery = state.delivery || {};
    S.notes = state.notes || {};
    S.approved = state.approved || {};
    S.merchantPaid = state.merchantPaid || {};
    S.rootsCharge = state.rootsCharge || {};
    S.history = data.history || [];
    
    // Refresh UI if we are in dashboard or history view
    if (S.view === 'dashboard' && S.result) {
      renderDashboard();
    } else if (S.view === 'history') {
      renderHistoryList();
    }
  }
});

async function cloudUpdate(path, value) {
  try {
    await update(codRef, { [path]: value, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Sync failed", e);
  }
}

/* --- Persistence --- */
function persist() {
  // We keep local storage as a cache, but primary is cloud
  const stateData = {
    payment: S.payment,
    delivery: S.delivery,
    notes: S.notes,
    approved: S.approved,
    merchantPaid: S.merchantPaid,
    rootsCharge: S.rootsCharge
  };
  try {
    localStorage.setItem('roots_cod', JSON.stringify(stateData));
  } catch (e) {}
  cloudUpdate("state", stateData);
}

function getHistory() {
  return S.history || [];
}

function saveHistory(r) {
  S.history = r;
  try {
    localStorage.setItem('roots_cod_history', JSON.stringify(r));
  } catch (e) {}
  cloudUpdate("history", r);
}

function addHistoryEntry(result, label) {
  const runs = [...getHistory()];
  runs.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    label,
    stats: {
      totalCOD: Object.values(result.summary).reduce((a, b) => a + b.cod, 0),
      totalNet: Object.values(result.summary).reduce((a, b) => a + b.net, 0),
      matched: result.matched.length,
      skynetOnly: result.skynetOnly.length,
      omnifulOnly: result.omnifulOnly.length
    },
    summary: JSON.parse(JSON.stringify(result.summary)),
    orders: result.all.map(o => ({
      orderRef: o.orderRef || o.ref || '',
      seller: o.seller || o.store || '',
      customer: o.customer || o.recipient || '',
      expected: o.expected || 0,
      cod: o.skynet ? o.skynet.cod : (o.cod || 0),
      net: o.skynet ? o.skynet.net : 0,
      type: o._type,
      returnStatus: o.returnStatus || '',
      cancelled: o.cancelled || false,
      orderDate: o.orderDate || '',
      deliveryDate: o.skynet ? o.skynet.deliveryDate : '',
      city: o.city || (o.skynet ? o.skynet.city : '') || ''
    }))
  });
  if (runs.length > 52) runs.pop();
  saveHistory(runs);
}

/* --- File Handlers --- */
function handleOmniful(e) {
  const f = e.target.files[0];
  if (!f) return;
  S.omnifulFile = f;
  document.getElementById('omnifulFiles').innerHTML = `<div class="dfn">✓ ${f.name}</div>`;
  document.getElementById('omnifulDrop').classList.add('loaded');
  updateBtn();
}

function handleSkynet(e) {
  const fs = Array.from(e.target.files);
  if (!fs.length) return;
  S.skynetFiles = fs;
  document.getElementById('skynetFiles').innerHTML = fs.map(f => `<div class="dfn">✓ ${f.name}</div>`).join('');
  document.getElementById('skynetDrop').classList.add('loaded');
  updateBtn();
}

function updateBtn() {
  document.getElementById('runBtn').disabled = !(S.omnifulFile && S.skynetFiles.length);
}

function readWb(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(XLSX.read(e.target.result, { type: 'array' }));
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

/* --- Parsing Logic --- */
function parseOmniful(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', cellDates: true });
  return rows.map(r => {
    const status = st(r['ORDER STATUS']);
    return {
      orderId: nRef(r['ORDER ID']),
      orderRef: st(r['ORDER REFERENCE']),
      seller: st(r['SELLER NAME']),
      customer: st(r['CUSTOMER NAME']),
      phone: st(r['CUSTOMER PHONE']),
      expected: pAmt(r['COLLECTION AMOUNT']),
      status,
      cancelled: status.toUpperCase() === 'CANCELLED',
      orderDate: st(r['ORDER CREATED AT']),
      city: st(r['DESTINATION CITY']),
      country: st(r['DESTINATION COUNTRY']),
      paymentMode: st(r['PAYMENT MODE']),
      deliveryType: st(r['DELIVERY TYPE']),
      shippingMethod: st(r['SHIPPING METHOD']),
      orderType: st(r['ORDER TYPE']),
      totalQty: st(r['TOTAL ORDERED QUANTITY']),
      returnStatus: st(r['RETURN STATUS']),
      _type: 'omniful_only'
    };
  });
}

function parseSkynetWbs(wbs) {
  const all = [];
  wbs.forEach(wb => {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const his = data.reduce((a, row, i) => { if (row.some(c => st(c) === 'Ref #')) a.push(i); return a; }, []);
    his.forEach((hi, bi) => {
      const hdrs = data[hi].map(h => st(h));
      const c = n => hdrs.indexOf(n);
      const iRef = c('Ref #'), iSt = c('Company Store'), iRec = c('Recipient Name'), iDt = c('Delivery Date'), iCod = c('Cod'), iFee = c('Delivery fees'), iNet = c('Net'), iTyp = c('Type'), iCty = c('City'), iArea = c('Area'), iRmk = c('Remark'), iPcs = c('Pieces'), iNum = c('Recipient Number');
      const nxt = his[bi + 1] || data.length;
      for (let i = hi + 1; i < nxt; i++) {
        const r = data[i];
        if (!r[iRef] || st(r[iRef]) === 'Ref #') continue;
        all.push({
          ref: st(r[iRef]).replace(/\D/g, ''),
          store: st(r[iSt]),
          recipient: st(r[iRec]),
          recipientNum: st(r[iNum]),
          deliveryDate: st(r[iDt]),
          cod: pAmt(r[iCod]),
          deliveryFee: pAmt(r[iFee]),
          net: pAmt(r[iNet]),
          type: st(r[iTyp]),
          city: st(r[iCty]),
          area: st(r[iArea]),
          remark: st(r[iRmk]),
          pieces: st(r[iPcs]),
          _type: 'skynet_only'
        });
      }
    });
  });
  return all;
}

/* --- Reconciliation Core --- */
function reconcile(omniful, skynet) {
  const sMap = {};
  skynet.forEach(x => { sMap[x.ref] = x; });
  const matched = [], omnifulOnly = [];
  omniful.forEach(o => {
    if (!o.orderId) { omnifulOnly.push(o); return; }
    const x = sMap[o.orderId];
    if (x) {
      matched.push({ ...o, skynet: x, diff: x.cod - o.expected, _type: 'matched' });
      delete sMap[o.orderId];
    }
    else omnifulOnly.push(o);
  });
  const skynetOnly = Object.values(sMap);
  const summary = {};
  const add = (m, x) => {
    const raw = m || x.store || 'Unknown';
    const k = raw.toLowerCase().trim();
    if (!summary[k]) summary[k] = { cod: 0, fees: 0, net: 0, count: 0, displayName: raw };
    summary[k].cod += x.cod;
    summary[k].fees += x.deliveryFee;
    summary[k].net += x.net;
    summary[k].count++;
  };
  matched.forEach(m => add(m.seller, m.skynet));
  skynetOnly.forEach(x => add(x.store, x));
  return { matched, skynetOnly, omnifulOnly, summary, all: [...matched, ...skynetOnly, ...omnifulOnly] };
}

async function runReconciliation() {
  const btn = document.getElementById('runBtn');
  btn.textContent = 'Processing…';
  btn.disabled = true;
  document.getElementById('runError').textContent = '';
  try {
    const omniWb = await readWb(S.omnifulFile);
    const skyWbs = await Promise.all(S.skynetFiles.map(readWb));
    S.result = reconcile(parseOmniful(omniWb), parseSkynetWbs(skyWbs));
    S.tab = 'all';
    S.expanded = new Set();
    S.sort = { all: { col: null, dir: 'asc' }, matched: { col: null, dir: 'asc' }, skynetOnly: { col: null, dir: 'asc' }, omnifulOnly: { col: null, dir: 'asc' } };
    S.colFilter = { all: {}, matched: {}, skynetOnly: {}, omnifulOnly: {} };
    addHistoryEntry(S.result, S.omnifulFile.name.replace(/\.[^.]+$/, ''));
    renderDashboard();
    showView('dashboard');
  } catch (e) {
    document.getElementById('runError').textContent = 'Error: ' + e.message;
    btn.disabled = false;
  }
  btn.textContent = 'Run Reconciliation';
}

/* --- Navigation & Views --- */
function showView(v) {
  ['uploadView', 'dashboardView', 'historyView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const liveBadge = document.getElementById('liveBadge');
  if (liveBadge) liveBadge.style.display = 'none';
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.style.display = 'none';
  const paidBtn = document.getElementById('paidBtn');
  if (paidBtn) paidBtn.style.display = 'none';
  const histBtn = document.getElementById('histBtn');
  if (histBtn) histBtn.classList.remove('active');
  
  S.view = v;
  if (v === 'upload') {
    document.getElementById('uploadView').style.display = '';
  } else if (v === 'dashboard') {
    document.getElementById('dashboardView').style.display = 'block';
    if (liveBadge) liveBadge.style.display = '';
    if (resetBtn) resetBtn.style.display = '';
    if (paidBtn) paidBtn.style.display = '';
  } else if (v === 'history') {
    document.getElementById('historyView').style.display = 'block';
    if (histBtn) histBtn.classList.add('active');
    if (S.result) {
      if (resetBtn) resetBtn.style.display = '';
      if (paidBtn) paidBtn.style.display = '';
    }
    renderHistoryList();
  }
}

function resetDashboard() {
  S.omnifulFile = null;
  S.skynetFiles = [];
  document.getElementById('omnifulFiles').innerHTML = '';
  document.getElementById('skynetFiles').innerHTML = '';
  document.getElementById('omnifulDrop').classList.remove('loaded');
  document.getElementById('skynetDrop').classList.remove('loaded');
  const runBtn = document.getElementById('runBtn');
  runBtn.disabled = true;
  runBtn.textContent = 'Run Reconciliation';
  document.getElementById('runError').textContent = '';
  showView('upload');
}

function showHistory() {
  if (S.view === 'history') {
    showView(S.result ? 'dashboard' : 'upload');
  } else {
    showView('history');
  }
}

window.showHistory = showHistory;
window.resetDashboard = resetDashboard;
window.showPaidSummary = showPaidSummary;
window.handleOmniful = handleOmniful;
window.handleSkynet = handleSkynet;
window.switchTab = switchTab;
window.runReconciliation = runReconciliation;
window.approveOrder = approveOrder;
window.setDelivery = setDelivery;
window.setRootsCharge = setRootsCharge;
window.downloadPaidSummary = downloadPaidSummary;
window.deleteHistoryItem = deleteHistoryItem;
window.loadHistoryRun = loadHistoryRun;


/* --- Logic: Approved Orders --- */
function getApprovedAsMatched() {
  if (!S.result) return [];
  return S.result.omnifulOnly.filter(o => S.approved[oKey(o)]).map(o => ({ ...o, _type: 'validated', skynet: null, diff: 0 }));
}

function getEffectiveSummary() {
  const summary = JSON.parse(JSON.stringify(S.result.summary));
  getApprovedAsMatched().forEach(o => {
    const raw = o.seller || 'Unknown';
    const k = raw.toLowerCase().trim();
    if (!summary[k]) summary[k] = { cod: 0, fees: 0, net: 0, count: 0, displayName: raw, approved: 0, approvedAmt: 0, rootsDeliveryCharges: 0, rootsDeliveryCount: 0 };
    if (!summary[k].approved) {
      summary[k].approved = 0;
      summary[k].approvedAmt = 0;
      summary[k].rootsDeliveryCharges = 0;
      summary[k].rootsDeliveryCount = 0;
    }
    summary[k].approved++;
    summary[k].approvedAmt += o.expected;
    const key = o.orderId || o.ref || o.orderRef || JSON.stringify(o).slice(0, 40);
    const del = S.delivery[key] || { value: 'Skynet' };
    const rc = parseFloat(S.rootsCharge[key] || 0);
    if (del.value === 'Roots' && rc > 0) {
      summary[k].rootsDeliveryCharges = (summary[k].rootsDeliveryCharges || 0) + rc;
      summary[k].rootsDeliveryCount = (summary[k].rootsDeliveryCount || 0) + 1;
    }
  });
  return summary;
}

/* --- Rendering: Dashboard --- */
function renderDashboard() {
  const r = S.result;
  const now = new Date();
  document.getElementById('runMeta').textContent = 'Generated ' + now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tCOD = Object.values(r.summary).reduce((a, b) => a + b.cod, 0);
  const tNet = Object.values(r.summary).reduce((a, b) => a + b.net, 0);
  const approvedCount = r.omnifulOnly.filter(o => S.approved[oKey(o)]).length;
  const pendingCount = r.omnifulOnly.filter(o => !S.approved[oKey(o)]).length;
  
  document.getElementById('summaryCards').innerHTML = [
    { l: 'Total COD Collected', v: fmt(tCOD) + ' JOD', s: 'From all SkyNet settlements', c: 'dark' },
    { l: 'Net to Remit', v: fmt(tNet) + ' JOD', s: 'SkyNet settled orders', c: 'gc' },
    { l: 'Matched Orders', v: r.matched.length, s: 'Successfully reconciled', c: 'oc' },
    { l: 'Pending Validation', v: pendingCount, s: approvedCount + ' approved · ' + r.skynetOnly.length + ' SkyNet only', c: pendingCount > 0 ? 'rc' : '' },
  ].map(x => `<div class="sc ${x.c}"><div class="sc-l">${x.l}</div><div class="sc-v">${x.v}</div><div class="sc-s">${x.s}</div></div>`).join('');
  
  renderTransferBox();
  document.getElementById('merchantGrid').innerHTML = Object.values(r.summary).map(x => `
    <div class="mc">
      <div class="mc-name">${x.displayName}</div>
      <div class="mc-row"><span class="mc-rl">COD Collected</span><span class="mc-rv">${fmt(x.cod)} JOD</span></div>
      <div class="mc-row"><span class="mc-rl">Delivery Fees</span><span class="mc-rv neg">− ${fmt(x.fees)} JOD</span></div>
      <div class="mc-row"><span class="mc-rl">Orders</span><span class="mc-rv">${x.count}</span></div>
      <hr class="mcd">
      <div class="mc-net"><span class="mc-nl">Net to Remit</span><span class="mc-nv">${fmt(x.net)} JOD</span></div>
    </div>`).join('');
  renderTable();
}

function renderTransferBox() {
  const r = S.result;
  const pending = r.omnifulOnly.filter(o => !S.approved[oKey(o)]).length;
  const effSum = getEffectiveSummary();
  const allReviewed = pending === 0;
  const box = document.getElementById('transferBox');
  if (Object.keys(effSum).length === 0) { box.innerHTML = ''; return; }
  
  const cards = Object.entries(effSum).map(([k, x]) => {
    const mk = k;
    const isPaid = S.merchantPaid[mk];
    const rdc = x.rootsDeliveryCharges || 0;
    const rdcCount = x.rootsDeliveryCount || 0;
    const approvedAmt = x.approvedAmt || 0;
    const total = x.net + approvedAmt - rdc;
    return `
      <div class="tmc">
        <div class="tmc-name">${x.displayName}</div>
        <div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px">Breakdown</div>
          <div class="tmc-row"><span class="tmc-rl">SkyNet settled (net)</span><span class="tmc-rv">+ ${fmt(x.net)} JOD</span></div>
          ${approvedAmt > 0 ? `<div class="tmc-row"><span class="tmc-rl">Validated orders COD (${x.approved})</span><span class="tmc-rv">+ ${fmt(approvedAmt)} JOD</span></div>` : ''}
          ${rdc > 0 ? `<div class="tmc-row"><span class="tmc-rl" style="color:var(--red)">Roots delivery charges (${rdcCount})</span><span class="tmc-rv" style="color:var(--red)">− ${fmt(rdc)} JOD</span></div>` : ''}
          <div style="border-top:1px dashed var(--bdr);margin:8px 0"></div>
          <div class="tmc-row" style="font-size:11px">
            <span style="font-weight:700">Total</span>
            <span style="font-weight:800;color:var(--green)">${fmt(total)} JOD</span>
          </div>
        </div>
        <div class="tmc-total"><span class="tmc-tl">Amount to Transfer</span><span class="tmc-tv">${fmt(total)} JOD</span></div>
        <button class="mark-paid-btn ${isPaid ? 'is-paid' : ''}" onclick="toggleMerchantPaid('${mk}','${x.displayName}',${total})" ${isPaid ? 'disabled' : ''}>
          ${isPaid ? '✓ Marked as Paid' : 'Mark as Paid'}
        </button>
      </div>`;
  }).join('');
  
  box.innerHTML = `
    <div class="transfer-box ${allReviewed ? '' : 'warn'}" style="margin-bottom:1.5rem">
      <div class="transfer-title">${allReviewed ? '✅ Transfer Summary — All Orders Reviewed' : '⏳ Transfer Summary — ' + pending + ' orders still pending review'}
      </div>
      <div class="tmerch-grid">${cards}</div>
    </div>`;
}

function toggleMerchantPaid(mk, name, amount) {
  S.merchantPaid[mk] = { paid: true, timestamp: new Date().toISOString(), amount, name };
  persist();
  renderDashboard();
  renderPaidSummary();
}

function unmarkMerchantPaid(mk) {
  delete S.merchantPaid[mk];
  persist();
  renderDashboard();
  renderPaidSummary();
}

function renderPaidSummary() {
  const entries = Object.entries(S.merchantPaid).filter(([, v]) => v.paid);
  const box = document.getElementById('paidSummaryBox');
  if (!entries.length) { box.innerHTML = '<div class="empty-state">No merchants marked as paid yet.</div>'; return; }
  
  box.innerHTML = entries.map(([k, v]) => `
    <div class="paid-entry">
      <div>
        <div class="paid-merch">${v.name || k}</div>
        <div class="paid-meta">Marked paid on ${new Date(v.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date(v.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <div style="text-align:right">
        <div class="paid-amt">${fmt(v.amount)} JOD</div>
        <button class="unpaid-btn" onclick="unmarkMerchantPaid('${k}')">Undo</button>
      </div>
    </div>`).join('');
}

/* --- Rendering: Table --- */
function switchTab(tab, btn) {
  S.tab = tab;
  S.expanded = new Set();
  document.querySelectorAll('.otab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderTable();
}

function oKey(o) { return o.orderId || o.ref || o.orderRef || JSON.stringify(o).slice(0, 40); }

function getCols(tab) {
  const base = [
    { id: 'num', label: '#', sort: false },
    { id: 'ref', label: 'Order Ref' },
    { id: 'merchant', label: 'Merchant' },
    { id: 'customer', label: 'Customer' },
    { id: 'cod', label: 'COD (JOD)' },
    { id: 'status', label: 'Status' },
  ];
  if (tab === 'omnifulOnly' || tab === 'all') base.push({ id: 'returnStatus', label: 'Return' });
  base.push({ id: 'payment', label: 'Payment', sort: false });
  base.push({ id: 'deliveredBy', label: 'Delivered By', sort: false });
  if (tab === 'matched' || tab === 'all') base.push({ id: 'rootsCharge', label: 'Roots Charge', sort: false });
  if (tab !== 'matched') base.push({ id: 'note', label: 'Note', sort: false });
  if (tab === 'omnifulOnly' || tab === 'all') base.push({ id: 'approve', label: 'Approve', sort: false });
  base.push({ id: 'details', label: '', sort: false });
  return base;
}

function sortOrders(orders, tab) {
  const { col, dir } = S.sort[tab] || { col: null, dir: 'asc' };
  if (!col) return orders;
  return [...orders].sort((a, b) => {
    let va = getSortVal(a, col), vb = getSortVal(b, col);
    if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
    return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
}

function getSortVal(o, col) {
  switch (col) {
    case 'ref': return o.orderRef || o.ref || '';
    case 'merchant': return o.seller || o.store || '';
    case 'customer': return o.customer || o.recipient || '';
    case 'cod': return o.skynet ? o.skynet.cod : (o.cod || o.expected || 0);
    case 'status': return o._type;
    case 'returnStatus': return o.returnStatus || '';
    default: return '';
  }
}

function filterByCol(orders, tab) {
  const filters = S.colFilter[tab] || {};
  return orders.filter(o => Object.entries(filters).every(([col, val]) => {
    if (!val) return true;
    return String(getSortVal(o, col)) === val;
  }));
}

function renderTable() {
  const r = S.result;
  if (!r) return;
  const qEl = document.getElementById('searchInput');
  const q = qEl ? qEl.value.toLowerCase() : '';
  const approved = getApprovedAsMatched();
  let baseOrders;
  if (S.tab === 'all') baseOrders = [...r.matched, ...approved, ...r.skynetOnly, ...r.omnifulOnly.filter(o => !S.approved[oKey(o)])];
  else if (S.tab === 'matched') baseOrders = [...r.matched, ...approved];
  else if (S.tab === 'skynetOnly') baseOrders = r.skynetOnly;
  else baseOrders = r.omnifulOnly.filter(o => !S.approved[oKey(o)]);

  if (q) baseOrders = baseOrders.filter(o => (o.orderRef || o.ref || '').toLowerCase().includes(q) || (o.customer || o.recipient || '').toLowerCase().includes(q) || (o.seller || o.store || '').toLowerCase().includes(q));
  const allForDropdown = baseOrders;
  baseOrders = filterByCol(baseOrders, S.tab);
  const orders = sortOrders(baseOrders, S.tab);

  const container = document.getElementById('tableContainer');
  if (!orders.length) { if (container) container.innerHTML = '<div class="empty-state">No orders found</div>'; return; }

  const cols = getCols(S.tab);
  const { col: sortCol, dir: sortDir } = S.sort[S.tab] || {};

  let html = `<table><thead><tr class="hrow">`;
  cols.forEach(c => {
    if (c.sort === false) { html += `<th>${c.label}</th>`; return; }
    const isSorted = sortCol === c.id;
    const icon = isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    html += `<th class="${isSorted ? 'sorted' : ''}" onclick="doSort('${c.id}')">${c.label} <span class="sort-icon">${icon}</span></th>`;
  });
  html += '</tr><tr class="frow">';
  cols.forEach(c => {
    if (c.sort === false || c.id === 'num') { html += `<th></th>`; return; }
    const fv = S.colFilter[S.tab][c.id] || '';
    const allVals = [...new Set(allForDropdown.map(o => String(getSortVal(o, c.id))).filter(v => v && v !== 'undefined' && v !== 'null'))].sort();
    const opts = allVals.map(v => `<option value="${esc(v)}" ${fv === v ? 'selected' : ''}>${v}</option>`).join('');
    html += `<th><select class="fcol" onchange="setColFilter('${c.id}', this.value)"><option value="">All</option>${opts}</select></th>`;
  });
  html += '</tr></thead><tbody>';

  orders.forEach((o, i) => {
    const key = oKey(o);
    const pay = S.payment[key] || 'not_paid';
    const del = S.delivery[key] || { value: 'Skynet', text: '' };
    const note = S.notes[key] || '';
    const exp = S.expanded.has(key);
    const ref = o.orderRef || o.ref || '—';
    const merchant = o.seller || o.store || '—';
    const customer = o.customer || o.recipient || '—';
    const cod = o.skynet ? o.skynet.cod : (o.cod || o.expected || 0);
    const isCancelled = o.cancelled;

    let statusBadge;
    if (o._type === 'matched') statusBadge = '<span class="badge bm">✓ Matched</span>';
    else if (o._type === 'validated') statusBadge = '<span class="badge bv">✓ Validated</span>';
    else if (o._type === 'skynet_only') statusBadge = '<span class="badge bs">SkyNet Only</span>';
    else if (isCancelled) statusBadge = '<span class="badge bc">✗ Cancelled</span>';
    else statusBadge = '<span class="badge bo">Omniful Only</span>';

    const showReturn = S.tab === 'omnifulOnly' || S.tab === 'all';
    let retCell = '';
    if (showReturn) { const rs = (o.returnStatus || '').trim(); retCell = `<td>${rs ? `<span class="badge br">↩ ${rs}</span>` : '<span class="badge bn">—</span>'}</td>`; }

    const payBtn = `<button class="pay-btn ${pay}" onclick="togglePay('${key}')">${pay === 'paid' ? '✓ Paid' : 'Not Paid'}</button>`;
    const delHtml = `<div class="del-wrap"><select class="del-sel" onchange="setDel('${key}',this.value)"><option value="Skynet" ${del.value === 'Skynet' ? 'selected' : ''}>SkyNet</option><option value="Roots" ${del.value === 'Roots' ? 'selected' : ''}>Roots</option><option value="Others" ${del.value === 'Others' ? 'selected' : ''}>Others</option></select>${del.value === 'Others' ? `<input class="del-oth" placeholder="Specify…" value="${esc(del.text || '')}" oninput="setDelText('${key}',this.value)">` : ''}  </div>`;
    const noteCell = S.tab !== 'matched' ? `<td><input class="note-inp" placeholder="Add note…" value="${esc(note)}" oninput="setNote('${key}',this.value)"></td>` : '';
    const showApprove = S.tab === 'omnifulOnly' || S.tab === 'all';
    const approveCell = showApprove ? (o._type === 'omniful_only' ? `<td><button class="approve-btn" onclick="approveOrder('${key}')" ${!note ? 'disabled title="Add a note before approving"' : ''}>✓ Approve</button></td>` : '<td style="color:var(--muted);font-size:11px">—</td>') : '';

    let rootsChargeCell = '';
    if (S.tab === 'matched' || S.tab === 'all') {
      if (o._type === 'validated' && del.value === 'Roots') {
        const rc = S.rootsCharge[key] || '';
        rootsChargeCell = `<td><select class="del-sel" onchange="setRootsCharge('${key}',this.value)"><option value="" ${!rc ? 'selected' : ''}>Select…</option><option value="2" ${rc === '2' ? 'selected' : ''}>2 JOD</option><option value="3" ${rc === '3' ? 'selected' : ''}>3 JOD</option></select></td>`;
      } else {
        rootsChargeCell = '<td style="color:var(--muted);font-size:11px">—</td>';
      }
    }
    
    html += `<tr style="${isCancelled ? 'opacity:.65' : ''}">`
      + `<td style="color:var(--muted);font-weight:600">${i + 1}</td>`
      + `<td style="font-weight:700">${ref}</td>`
      + `<td style="text-transform:capitalize;font-weight:600">${merchant}</td>`
      + `<td>${customer}</td>`
      + `<td style="font-weight:700">${fmt(cod)}</td>`
      + `<td>${statusBadge}</td>`
      + retCell
      + `<td>${payBtn}</td>`
      + `<td>${delHtml}</td>`
      + rootsChargeCell
      + noteCell
      + approveCell
      + `<td><button class="det-btn" onclick="toggleExp('${key}')">${exp ? '▲ Close' : '▼ Details'}</button></td>`
      + `</tr>`;
    if (exp) { html += `<tr class="det-row"><td colspan="${cols.length}"><div class="det-panel">${buildDet(o)}</div></td></tr>`; }
  });
  html += '</tbody></table>';
  if (container) container.innerHTML = html;
}

/* --- Details Builder --- */
function buildDet(o) {
  const key = oKey(o);
  let html = '<div class="det-grid">';
  if (o.orderRef || o.orderId) {
    html += `<div><div class="det-bt">📋 Omniful Details</div><div class="det-fields">`
      + df('Order Ref', o.orderRef) + df('Order ID', o.orderId)
      + df('Seller', o.seller) + df('Customer', o.customer)
      + df('Phone', o.phone)
      + df('City', o.city) + df('Expected COD', o.expected ? fmt(o.expected) + ' JOD' : null)
      + df('Payment Mode', o.paymentMode) + df('Order Status', o.status)
      + df('Return Status', o.returnStatus || 'None') + df('Delivery Type', o.deliveryType)
      + df('Order Type', o.orderType) + df('Total Qty', o.totalQty)
      + '</div></div>';
  }
  const x = o.skynet || (o._type === 'skynet_only' ? o : null);
  if (x) {
    const ddt = parseDateTime(x.deliveryDate);
    html += `<div><div class="det-bt">🚚 SkyNet Details</div><div class="det-fields">`
      + df('Ref #', x.ref) + df('Store', x.store)
      + df('Recipient', x.recipient) + df('Phone', x.recipientNum)
      + df('Delivery Date', ddt.date) + df('Delivery Time', ddt.time)
      + df('City', x.city) + df('Area', x.area)
      + df('COD Collected', fmt(x.cod) + ' JOD') + df('Delivery Fee', fmt(x.deliveryFee) + ' JOD')
      + df('Net', fmt(x.net) + ' JOD') + df('Status', x.type)
      + df('Pieces', x.pieces) + df('Remark', x.remark)
      + '</div></div>';
  }
  html += '</div>';
  if (o._type === 'validated') {
    const rc = S.rootsCharge[key];
    html += `<div style="margin-top:12px;padding:10px 14px;background:var(--pbg);border-radius:8px;border-left:3px solid var(--purple);font-size:12px;font-weight:600;color:var(--purple)">✓ Validated order — Delivered by Roots${rc ? ' · Delivery charge: ' + rc + ' JOD' : ' · No delivery charge set yet'}</div>`;
  }
  if (o._type === 'matched' && Math.abs(o.diff) > 0.01) {
    html += `<div class="diff-alert">⚠ COD difference of ${o.diff > 0 ? '+' : ''}${fmt(o.diff)} JOD — Expected ${fmt(o.expected)} JOD, SkyNet collected ${fmt(o.skynet.cod)} JOD</div>`;
  }
  return html;
}

/* --- Helpers: Date/Time --- */
function parseDateTime(raw) {
  if (!raw || raw === '' || raw === '—') return { date: '—', time: '—' };
  let dt = null;
  if (raw instanceof Date) { dt = raw; }
  else if (typeof raw === 'number' && raw > 1000) {
    dt = new Date((raw - 25569) * 86400 * 1000);
  }
  if (dt && !isNaN(dt)) {
    const pad = n => String(n).padStart(2, '0');
    return { date: `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
  }
  const s = String(raw).trim();
  const dotMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}:\d{2})/);
  if (dotMatch) {
    const [, d, m, y, t] = dotMatch;
    return { date: `${y.length === 2 ? '20' + y : y}/${m}/${d}`, time: t };
  }
  const isoMatch = s.match(/^(\d{4})[\-\/](\d{2})[\-\/](\d{2})\s+(\d{2}:\d{2})/);
  if (isoMatch) {
    return { date: `${isoMatch[1]}/${isoMatch[2]}/${isoMatch[3]}`, time: isoMatch[4] };
  }
  const sp = s.split(/\s+/);
  return { date: sp[0] || s, time: sp[1] || '—' };
}

/* --- Interactions --- */
function doSort(col) {
  const cur = S.sort[S.tab];
  if (cur.col === col) { S.sort[S.tab].dir = cur.dir === 'asc' ? 'desc' : 'asc'; }
  else { S.sort[S.tab] = { col, dir: 'asc' }; }
  renderTable();
}

function setColFilter(col, val) {
  S.colFilter[S.tab][col] = val;
  renderTable();
}

window.setColFilter = setColFilter;
window.doSort = doSort;
window.togglePay = togglePay;
window.setDel = setDel;
window.setDelText = setDelText;
window.setNote = setNote;
window.toggleExp = toggleExp;

function approveOrder(key) {
  S.approved[key] = true;
  persist();
  renderDashboard();
}

function setRootsCharge(k, v) { S.rootsCharge[k] = v; persist(); renderTable(); }
function togglePay(k) { S.payment[k] = S.payment[k] === 'paid' ? 'not_paid' : 'paid'; persist(); renderTable(); }
function setDel(k, v) { S.delivery[k] = { value: v, text: S.delivery[k]?.text || '' }; persist(); renderTable(); }
function setDelText(k, t) { if (!S.delivery[k]) S.delivery[k] = { value: 'Others', text: '' }; S.delivery[k].text = t; persist(); }
function setNote(k, t) {
  S.notes[k] = t;
  persist();
  const btn = document.querySelector(`button[onclick="approveOrder('${k}')"]`);
  if (btn) {
    btn.disabled = !t.trim();
    btn.title = t.trim() ? "" : "Add a note before approving";
  }
}
function toggleExp(k) { S.expanded.has(k) ? S.expanded.delete(k) : S.expanded.add(k); renderTable(); }

/* --- History --- */
function renderHistoryList() {
  const runs = getHistory();
  const detailEl = document.getElementById('historyDetail');
  if (detailEl) detailEl.innerHTML = '';
  const listEl = document.getElementById('historyList');
  if (!runs.length) { if (listEl) listEl.innerHTML = '<div class="hist-empty"><span>📂</span>No reconciliation runs yet.</div>'; return; }
  if (listEl) listEl.innerHTML = `<div class="hlist">${runs.map((run, i) => {
    const d = new Date(run.date);
    const ds = d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const merch = Object.values(run.summary).map(x => `<span class="hpill">${x.displayName}</span>`).join('');
    return `
      <div class="hcard" onclick="viewHistory(${i})">
        <div class="hcard-top">
          <div><div class="hcard-date">${ds}</div><div class="hcard-id">${run.label}</div></div>
          <button class="hdel-btn" onclick="delHistory(event,${i})">Delete</button>
        </div>
        <div class="hstats">
          <div><div class="hstat-l">COD Collected</div><div class="hstat-v oc">${fmt(run.stats.totalCOD)} JOD</div></div>
          <div><div class="hstat-l">Net to Remit</div><div class="hstat-v gc">${fmt(run.stats.totalNet)} JOD</div></div>
          <div><div class="hstat-l">Matched</div><div class="hstat-v">${run.stats.matched}</div></div>
          <div><div class="hstat-l">Unmatched</div><div class="hstat-v">${run.stats.skynetOnly + run.stats.omnifulOnly}</div></div>
        </div>
        <div class="hmerch">${merch}</div>
      </div>`;
  }).join('')}</div>`;
}

function viewHistory(idx) {
  const run = getHistory()[idx];
  const d = new Date(run.date);
  const ds = d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const merch = Object.values(run.summary).map(x => `
    <div class="mc">
      <div class="mc-name">${x.displayName}</div>
      <div class="mc-row"><span class="mc-rl">COD Collected</span><span class="mc-rv">${fmt(x.cod)} JOD</span></div>
      <div class="mc-row"><span class="mc-rl">Delivery Fees</span><span class="mc-rv neg">− ${fmt(x.fees)} JOD</span></div>
      <div class="mc-row"><span class="mc-rl">Orders</span><span class="mc-rv">${x.count}</span></div>
      <hr class="mcd">
      <div class="mc-net"><span class="mc-nl">Net to Remit</span><span class="mc-nv">${fmt(x.net)} JOD</span></div>
    </div>`).join('');
  
  let tbl = `<table style="min-width:800px"><thead><tr class="hrow"><th>#</th><th>Order Ref</th><th>Merchant</th><th>Customer</th><th>Order Date</th><th>COD (JOD)</th><th>Net (JOD)</th><th>Status</th><th>Return Status</th><th>Cancelled</th><th></th></tr></thead><tbody>`;
  run.orders.forEach((o, i) => {
    const badge = o.type === 'matched' ? '<span class="badge bm">✓ Matched</span>' : o.type === 'skynet_only' ? '<span class="badge bs">SkyNet Only</span>' : '<span class="badge bo">Omniful Only</span>';
    tbl += `<tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td style="font-weight:700">${o.orderRef || '—'}</td>
      <td style="text-transform:capitalize">${o.seller || '—'}</td>
      <td>${o.customer || '—'}</td>
      <td>${o.orderDate ? o.orderDate.toString().split(' ')[0] : '—'}</td>
      <td>${fmt(o.cod)}</td>
      <td>${fmt(o.net)}</td>
      <td>${badge}</td>
      <td>${o.returnStatus ? `<span class="badge br">↩ ${o.returnStatus}</span>` : '—'}</td>
      <td>${o.cancelled ? '<span class="badge bc">✗ Cancelled</span>' : '—'}</td>
      <td style="text-align:right">
        <button class="hdel-btn" onclick="deleteOrderFromHistory(${idx}, ${i})" title="Delete order from this run">✕</button>
      </td>
    </tr>`;
  });
  tbl += '</tbody></table>';

  const detailEl = document.getElementById('historyDetail');
  if (detailEl) {
    detailEl.innerHTML = `
      <div class="hdet">
        <div class="hdet-hdr">
          <div><div class="hdet-title">Run Details — ${ds}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${run.label}</div></div>
          <div style="display:flex;gap:10px">
            <button class="hdel-btn" onclick="delHistory(event, ${idx}); document.getElementById('historyDetail').innerHTML=''" style="border-color:var(--red); color:var(--red)">Delete Entire Run</button>
            <button class="hclose-btn" onclick="document.getElementById('historyDetail').innerHTML=''">✕ Close</button>
          </div>
        </div>
        <div class="hdet-cards">
          <div class="hdc"><div class="hdc-l">COD Collected</div><div class="hdc-v" style="color:var(--orange)">${fmt(run.stats.totalCOD)} JOD</div></div>
          <div class="hdc"><div class="hdc-l">Net to Remit</div><div class="hdc-v" style="color:var(--green)">${fmt(run.stats.totalNet)} JOD</div></div>
          <div class="hdc"><div class="hdc-l">Matched</div><div class="hdc-v">${run.stats.matched}</div></div>
          <div class="hdc"><div class="hdc-l">Unmatched</div><div class="hdc-v">${run.stats.skynetOnly + run.stats.omnifulOnly}</div></div>
        </div>
        <div class="sec-lbl" style="margin-bottom:.75rem">Merchant Breakdown</div>
        <div class="mgrid" style="margin-bottom:1.25rem">${merch}</div>
        <div class="sec-lbl" style="margin-bottom:.75rem">All Orders (${run.orders.length})</div>
        <div class="twrap">${tbl}</div>
      </div>`;
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function deleteOrderFromHistory(runIdx, orderIdx) {
  if (!confirm("Remove this order from this history run?")) return;
  const runs = [...getHistory()];
  const run = runs[runIdx];
  const o = run.orders[orderIdx];
  
  // Update summary
  const k = (o.seller || 'Unknown').toLowerCase().trim();
  if (run.summary[k]) {
    run.summary[k].cod -= (o.cod || 0);
    run.summary[k].net -= (o.net || 0);
    run.summary[k].count--;
    if (run.summary[k].count <= 0) delete run.summary[k];
  }
  
  // Remove order
  run.orders.splice(orderIdx, 1);
  
  // Update stats
  run.stats.totalCOD = Object.values(run.summary).reduce((a, b) => a + b.cod, 0);
  run.stats.totalNet = Object.values(run.summary).reduce((a, b) => a + b.net, 0);
  run.stats.matched = run.orders.filter(x => x.type === 'matched').length;
  run.stats.skynetOnly = run.orders.filter(x => x.type === 'skynet_only').length;
  run.stats.omnifulOnly = run.orders.filter(x => x.type === 'omniful_only').length;
  
  saveHistory(runs);
  viewHistory(runIdx);
}

window.viewHistory = viewHistory;
function delHistory(e, idx) { e.stopPropagation(); if (!confirm('Delete this reconciliation run?')) return; const runs = getHistory(); runs.splice(idx, 1); saveHistory(runs); renderHistoryList(); }
window.delHistory = delHistory;
window.toggleMerchantPaid = toggleMerchantPaid;
window.unmarkMerchantPaid = unmarkMerchantPaid;
window.approveOrder = approveOrder;
window.deleteOrderFromHistory = deleteOrderFromHistory;

/* --- Utils --- */
function nRef(v) { if (v == null || v === '') return ''; const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(n) ? String(v).trim() : String(n); }
function pAmt(v) { if (v == null || v === '') return 0; if (typeof v === 'number') return v; return parseFloat(String(v).replace(/[^\d.]/g, '')) || 0; }
function st(v) { return String(v || '').trim(); }
function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }
function df(l, v) { if (!v) return ''; return `<div><div class="dfl">${l}</div><div class="dfv">${v}</div></div>`; }
function esc(x) { return String(x || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function showPaidSummary() {} 
function setDelivery() {} 
function downloadPaidSummary() {} 
function deleteHistoryItem(runIdx, orderIdx) { deleteOrderFromHistory(runIdx, orderIdx); }
window.deleteHistoryItem = deleteHistoryItem;
function loadHistoryRun() {} 
