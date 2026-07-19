'use strict';

/**
 * Google Sheets export via Google Apps Script web app.
 *
 * Flow:
 * 1. User deploys Apps Script (code provided in guide)
 * 2. Paste deployment URL vào app
 * 3. Bấm "Xuất GG Sheets" → data pushed lên sheet "VA"
 */

const GS_URL_KEY = 'cccd_gs_url';

function getGSUrl() {
  return localStorage.getItem(GS_URL_KEY) || '';
}

function setGSUrl(url) {
  localStorage.setItem(GS_URL_KEY, url.trim());
}

function promptGSUrl() {
  const current = getGSUrl();
  const url = prompt(
    'Dán URL Google Apps Script đã deploy:\n\n' +
    '(Xem hướng dẫn cài đặt trong file HUONG_DAN.md)',
    current
  );
  if (url === null) return null; // cancelled
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

  // Prepare payload
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

  try {
    showToast('Đang gửi lên Google Sheets...', '', 2000);

    const resp = await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // no-cors → opaque response, không đọc được kết quả
    // nhưng nếu không throw error thì request đã gửi thành công
    showToast(`Đã gửi ${records.length} bản ghi lên Google Sheets ✓`, 'success', 3000);

  } catch (err) {
    console.error('[GS Export Error]', err);
    showToast('Lỗi gửi dữ liệu: ' + err.message, 'error', 4000);

    // Nếu lỗi, cho user nhập lại URL
    if (confirm('Gửi thất bại. Bạn muốn nhập lại URL Apps Script?')) {
      promptGSUrl();
    }
  }
}

// Cho phép reset URL từ console hoặc settings
function resetGSUrl() {
  localStorage.removeItem(GS_URL_KEY);
  showToast('Đã xóa URL Google Sheets', 'warning');
}

window.exportToGoogleSheets = exportToGoogleSheets;
window.resetGSUrl = resetGSUrl;
window.promptGSUrl = promptGSUrl;
