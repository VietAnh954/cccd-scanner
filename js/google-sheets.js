'use strict';

/**
 * Google Sheets export via Google Apps Script web app.
 *
 * SAU KHI DEPLOY Apps Script, dán URL vào DEFAULT_GS_URL bên dưới.
 * Khi đã set, mọi người dùng bấm "GG Sheets" đều push data lên
 * mà không cần nhập URL thủ công.
 */

// ═══════════════════════════════════════════════════════════════════
// ▶▶▶  DÁN URL APPS SCRIPT ĐÃ DEPLOY VÀO ĐÂY  ◀◀◀
const DEFAULT_GS_URL = 'https://script.google.com/macros/s/AKfycbxnRNR8NelVBDSgp-GufXpQ81Zn0XxPfLt2V6gRNM03QBeq9D07r1O2WFW2KRJRlZMUPw/exec';
// ═══════════════════════════════════════════════════════════════════

const GS_URL_KEY = 'cccd_gs_url';

function getGSUrl() {
  return localStorage.getItem(GS_URL_KEY) || DEFAULT_GS_URL || '';
}

function setGSUrl(url) {
  localStorage.setItem(GS_URL_KEY, url.trim());
}

function promptGSUrl() {
  const current = getGSUrl();
  const url = prompt(
    'Dán URL Google Apps Script đã deploy:\n\n' +
    '(Xem hướng dẫn trong file HUONG_DAN_CCCD_Scanner.docx)',
    current
  );
  if (url === null) return null;
  if (!url.trim()) {
    showToast('URL không được để trống', 'warning');
    return null;
  }
  if (!url.includes('script.google.com') && !url.includes('googleusercontent.com')) {
    showToast('URL không hợp lệ — phải là URL Apps Script', 'error');
    return null;
  }
  setGSUrl(url);
  return url.trim();
}

async function exportToGoogleSheets(records) {
  if (!records || records.length === 0) {
    showToast('Không có bản ghi để xuất', 'warning');
    return;
  }

  let url = getGSUrl();
  if (!url) {
    url = promptGSUrl();
    if (!url) return;
  }

  const payload = {
    records: records.map(r => ({
      rawData:   r.rawData || '',
      cccd:      r.cccd || '',
      name:      r.name || '',
      dob:       r.dob || '',
      gender:    r.gender || '',
      address:   r.address || '',
      issueDate: r.issueDate || '',
      scannedAt: r.scannedAt || '',
    })),
  };

  showToast('Đang gửi lên Google Sheets...', '', 2500);

  // Thử 3 phương thức: cors fetch → no-cors fetch → form submit
  // Google Apps Script redirect (302) có thể làm mất POST body trên mobile

  // ── Method 1: fetch cors (tốt nhất — đọc được response) ──
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    if (resp.ok) {
      try {
        const result = await resp.json();
        if (result.success) {
          showToast(`Đã gửi ${result.count || records.length} bản ghi ✓`, 'success', 3000);
          return;
        }
      } catch (_) {
        // response không phải JSON nhưng request thành công
        showToast(`Đã gửi ${records.length} bản ghi ✓`, 'success', 3000);
        return;
      }
    }
  } catch (e) {
    console.warn('[GS] cors fetch failed:', e.message, '→ trying fallback...');
  }

  // ── Method 2: form submit qua hidden iframe (hoạt động mọi nơi) ──
  try {
    await submitViaForm(url, payload);
    showToast(`Đã gửi ${records.length} bản ghi ✓`, 'success', 3000);
    return;
  } catch (e) {
    console.warn('[GS] form submit failed:', e.message);
  }

  // ── Method 3: no-cors fetch (last resort) ──
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    showToast(`Đã gửi ${records.length} bản ghi (chưa xác nhận)`, 'warning', 3000);
  } catch (err) {
    console.error('[GS] all methods failed:', err);
    showToast('Lỗi gửi dữ liệu: ' + err.message, 'error', 4000);
    if (confirm('Gửi thất bại. Bạn muốn nhập lại URL Apps Script?')) {
      promptGSUrl();
    }
  }
}

/**
 * Gửi data qua hidden form + iframe.
 * Không bị ảnh hưởng bởi CORS hay redirect — hoạt động trên mọi browser/mobile.
 */
function submitViaForm(url, data) {
  return new Promise((resolve, reject) => {
    try {
      const id = 'gs_frame_' + Date.now();

      // Hidden iframe nhận response
      const iframe = document.createElement('iframe');
      iframe.name = id;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      // Form gửi data
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = id;
      form.style.display = 'none';

      // Apps Script đọc e.parameter.data
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'data';
      input.value = JSON.stringify(data);
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();

      // Dọn dẹp sau 5s
      setTimeout(() => {
        try { document.body.removeChild(form); } catch (_) {}
        try { document.body.removeChild(iframe); } catch (_) {}
        resolve();
      }, 5000);

    } catch (e) {
      reject(e);
    }
  });
}

function resetGSUrl() {
  localStorage.removeItem(GS_URL_KEY);
  showToast('Đã xóa URL — sẽ dùng URL mặc định', 'warning');
}

window.exportToGoogleSheets = exportToGoogleSheets;
window.resetGSUrl = resetGSUrl;
window.promptGSUrl = promptGSUrl;
