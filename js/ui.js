'use strict';

// ── Audio feedback ────────────────────────────────────────────────────────────
function beep(freq = 800, duration = 100, type = 'sine', delay = 0) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration / 1000);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration / 1000 + 0.05);
  } catch (e) { /* audio not available */ }
}

function beepSuccess() { beep(880, 120, 'sine'); }
function beepError()   { beep(320, 80, 'square'); beep(260, 80, 'square', 0.12); }

// ── Flash ─────────────────────────────────────────────────────────────────────
function flashViewfinder(type = 'success') {
  const el = document.getElementById('flashOverlay');
  if (!el) return;
  el.className = 'flash-overlay flash-' + type;
  setTimeout(() => {
    el.className = 'flash-overlay fade-out';
    setTimeout(() => { el.className = 'flash-overlay'; }, 400);
  }, 200);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = '', duration = 1800) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 100);
}

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(text, state = '') {
  const dot  = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  if (span) span.textContent = text;
  if (dot) {
    dot.className = 'status-dot' + (state ? ' ' + state : '');
  }
}

function updateBadge() {
  const badge = document.getElementById('recordBadge');
  const count = store.count();
  if (badge) {
    badge.textContent = count;
    badge.className = 'record-badge' + (count === 0 ? ' zero' : '');
  }
}

// ── Table render ──────────────────────────────────────────────────────────────
function renderTable() {
  const records  = store.getAll();
  const emptyEl  = document.getElementById('emptyState');
  const tableEl  = document.getElementById('recordsTable');
  const tbodyEl  = document.getElementById('tableBody');
  const titleEl  = document.getElementById('recordsTitle');
  const clearBtn  = document.getElementById('btnClearAll');
  const exportBtn = document.getElementById('btnExport');
  const gsBtn     = document.getElementById('btnExportGS');

  const n = records.length;
  if (titleEl) titleEl.textContent = `Danh sách (${n} bản ghi)`;

  if (clearBtn)  clearBtn.disabled  = n === 0;
  if (exportBtn) exportBtn.disabled = n === 0;
  if (gsBtn)     gsBtn.disabled     = n === 0;

  updateBadge();

  if (n === 0) {
    if (emptyEl) emptyEl.style.display = '';
    if (tableEl) tableEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableEl) tableEl.style.display = '';

  if (!tbodyEl) return;
  tbodyEl.innerHTML = records.map(r => `
    <tr>
      <td style="text-align:center;color:var(--text-muted);font-size:12px">${r.stt}</td>
      <td><span class="cccd-num">${r.cccd}</span></td>
      <td><span class="name-cell" title="${r.name}">${r.name}</span></td>
      <td><span class="date-cell">${r.dob}</span></td>
      <td>
        <button class="btn-delete-row" data-cccd="${r.cccd}" title="Xóa bản ghi này">✕</button>
      </td>
    </tr>
  `).join('');

  tbodyEl.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const cccd = btn.dataset.cccd;
      store.remove(cccd);
      renderTable();
      showToast('Đã xóa bản ghi', 'warning');
    });
  });
}

// ── Preview modal ─────────────────────────────────────────────────────────────
let _pendingRecord = null;
let _isOverwrite   = false;

function showPreviewModal(record, isOverwrite = false) {
  _pendingRecord = record;
  _isOverwrite   = isOverwrite;

  const body = document.getElementById('modalBody');
  if (body) {
    const rows = [
      ['Số CCCD',  `<span class="modal-value cccd-val">${record.cccd}</span>`],
      ['Họ tên',   record.name],
      ['Ngày sinh', record.dob],
      ['Giới tính', record.gender],
      ['Địa chỉ',  record.address || '—'],
      ['Ngày cấp', record.issueDate || '—'],
    ];
    body.innerHTML = rows.map(([label, val]) => `
      <div class="modal-row">
        <span class="modal-label">${label}:</span>
        ${typeof val === 'string' && !val.startsWith('<')
          ? `<span class="modal-value">${val || '—'}</span>`
          : val}
      </div>
    `).join('');
  }

  if (isOverwrite) {
    const btn = document.getElementById('btnSave');
    if (btn) btn.textContent = '⚠ Ghi đè';
  } else {
    const btn = document.getElementById('btnSave');
    if (btn) btn.textContent = '✓ Lưu';
  }

  openOverlay('modalOverlay');
}

function closePreviewModal() {
  closeOverlay('modalOverlay');
  _pendingRecord = null;
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;
  openOverlay('confirmOverlay');
  const ok = document.getElementById('confirmOk');
  const cancel = document.getElementById('confirmCancel');
  const cleanup = () => { closeOverlay('confirmOverlay'); };
  const newOk = ok.cloneNode(true);
  const newCancel = cancel.cloneNode(true);
  ok.parentNode.replaceChild(newOk, ok);
  cancel.parentNode.replaceChild(newCancel, cancel);
  newOk.addEventListener('click', () => { cleanup(); onConfirm(); });
  newCancel.addEventListener('click', cleanup);
}

// ── Overlay helpers ───────────────────────────────────────────────────────────
function openOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ── Wire up modal buttons ─────────────────────────────────────────────────────
document.getElementById('btnSave').addEventListener('click', () => {
  if (!_pendingRecord) return;
  if (_isOverwrite) store.remove(_pendingRecord.cccd);
  store.add(_pendingRecord);
  renderTable();
  closePreviewModal();
  showToast('Đã lưu', 'success');
  beepSuccess();
  window.resumeScan && window.resumeScan();
});

document.getElementById('btnDiscard').addEventListener('click', () => {
  closePreviewModal();
  window.resumeScan && window.resumeScan();
});

document.getElementById('btnClearAll').addEventListener('click', () => {
  showConfirm(
    'Xóa tất cả',
    `Xóa toàn bộ ${store.count()} bản ghi? Hành động này không thể hoàn tác.`,
    () => {
      store.clear();
      renderTable();
      showToast('Đã xóa tất cả', 'warning');
    }
  );
});

document.getElementById('btnExport').addEventListener('click', () => {
  if (store.count() === 0) return;
  exportToExcel(store.getAll());
});

document.getElementById('btnExportGS').addEventListener('click', () => {
  if (store.count() === 0) return;
  exportToGoogleSheets(store.getAll());
});

// ── QR detection handler ──────────────────────────────────────────────────────
window.onQRDetected = function(rawData) {
  try {
    const record = parseQR(rawData);

    if (store.has(record.cccd)) {
      flashViewfinder('success');
      showToast('⚠ CCCD này đã tồn tại trong danh sách', 'warning', 2500);
      showPreviewModal(record, true);
    } else {
      flashViewfinder('success');
      beepSuccess();
      showPreviewModal(record, false);
    }
  } catch (e) {
    flashViewfinder('error');
    beepError();
    console.warn('[Parse Error]', e.message, '| Raw:', rawData);
    if (e instanceof CCCDParseError) {
      showToast('QR không phải CCCD: ' + e.message, 'error', 5000);
    }
  }
};

// Export helpers to window
window.showToast      = showToast;
window.setStatus      = setStatus;
window.renderTable    = renderTable;
window.flashViewfinder = flashViewfinder;
window.beepSuccess    = beepSuccess;
window.beepError      = beepError;
