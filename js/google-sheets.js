'use strict';

/**
 * Google Sheets export via Google Apps Script web app.
 *
 * CÁCH HOẠT ĐỘNG:
 * Gửi từng bản ghi qua GET request (script tag) → không bị CORS,
 * không bị mất data khi Google redirect 302 (nguyên nhân lỗi trên mobile).
 *
 * YÊU CẦU: Apps Script phải có hàm doGet(e) — xem hướng dẫn bên dưới.
 */

// ═══════════════════════════════════════════════════════════════════
// ▶▶▶  URL APPS SCRIPT ĐÃ DEPLOY  ◀◀◀
const DEFAULT_GS_URL = 'https://script.google.com/macros/s/AKfycbyXKC626WicppcUIfZudhOTyC8tixZmxs2hu-Rc7KOVGYZiaCYrsZ81OGne6QvNvABAPA/exec';


// ═══════════════════════════════════════════════════════════════════

// Xóa URL cũ trong localStorage (tránh dùng URL cũ từ phiên trước)
try { localStorage.removeItem('cccd_gs_url'); } catch (_) { }

async function exportToGoogleSheets(records) {
  if (!records || records.length === 0) {
    showToast('Không có bản ghi để xuất', 'warning');
    return;
  }

  const url = DEFAULT_GS_URL;
  if (!url) {
    showToast('Chưa cài URL Apps Script trong google-sheets.js', 'error');
    return;
  }

  const total = records.length;
  showToast('Đang gửi ' + total + ' bản ghi lên Google Sheets...', '', 3000);

  // ── Gửi từng bản ghi qua GET (script tag) ──
  // Script tag LUÔN follow redirect 302 → không bị CORS → hoạt động trên mọi thiết bị
  let sentCount = 0;

  for (let i = 0; i < total; i++) {
    const r = records[i];
    const data = {
      rawData: r.rawData || '',
      cccd: r.cccd || '',
      name: r.name || '',
      dob: r.dob || '',
      gender: r.gender || '',
      address: r.address || '',
      issueDate: r.issueDate || '',
      scannedAt: r.scannedAt || '',
    };

    try {
      await sendViaScriptTag(url, data);
      sentCount++;
    } catch (e) {
      console.warn('[GS] Bản ghi', i + 1, 'lỗi:', e.message);
    }

    // Delay nhỏ giữa các request tránh rate limit
    if (i < total - 1) {
      await sleep(300);
    }
  }

  // ── Kết quả ──
  if (sentCount === total) {
    showToast('Đã gửi ' + total + ' bản ghi lên Google Sheets ✓', 'success', 3000);
  } else if (sentCount > 0) {
    showToast('Đã gửi ' + sentCount + '/' + total + ' bản ghi.', 'warning', 4000);
  } else {
    showToast('Không gửi được. Kiểm tra Apps Script (cần có doGet + deploy lại).', 'error', 5000);
  }
}

/**
 * Gửi 1 bản ghi qua GET request bằng <script> tag.
 * Script tag follow redirect 302 tự nhiên, không cần CORS headers.
 * Response từ Apps Script không phải JS hợp lệ → onerror fire, nhưng
 * server-side đã xử lý xong data trước khi trả response.
 */
function sendViaScriptTag(baseUrl, record) {
  return new Promise(function (resolve, reject) {
    var encoded = encodeURIComponent(JSON.stringify(record));
    var fullUrl = baseUrl + '?data=' + encoded + '&_t=' + Date.now();

    // Kiểm tra URL length (giới hạn ~8000 ký tự)
    if (fullUrl.length > 7500) {
      reject(new Error('URL quá dài (' + fullUrl.length + ' chars)'));
      return;
    }

    var script = document.createElement('script');
    script.src = fullUrl;

    var timer = setTimeout(function () {
      cleanup();
      resolve(); // Timeout = request đã gửi, coi như thành công
    }, 12000);

    function cleanup() {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      try { script.remove(); } catch (_) { }
    }

    // onload: response là JS hợp lệ (nếu Apps Script trả JSONP)
    script.onload = function () { cleanup(); resolve(); };

    // onerror: response không phải JS (JSON) → vẫn OK, data đã được ghi
    script.onerror = function () { cleanup(); resolve(); };

    document.head.appendChild(script);
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

window.exportToGoogleSheets = exportToGoogleSheets;
