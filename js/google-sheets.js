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
// Ví dụ: 'https://script.google.com/macros/s/AKfyc.../exec'
const DEFAULT_GS_URL = 'https://script.google.com/macros/s/AKfycbxnRNR8NelVBDSgp-GufXpQ81Zn0XxPfLt2V6gRNM03QBeq9D07r1O2WFW2KRJRlZMUPw/exec';
// ═══════════════════════════════════════════════════════════════════

const GS_URL_KEY = 'cccd_gs_url';

function getGSUrl() {
  // Ưu tiên: localStorage (user override) → hardcoded default
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
      rawData: r.rawData || '',
      cccd: r.cccd || '',
      name: r.name || '',
      dob: r.dob || '',
      gender: r.gender || '',
      address: r.address || '',
      issueDate: r.issueDate || '',
      scannedAt: r.scannedAt || '',
    })),
  };

  try {
    showToast('Đang gửi lên Google Sheets...', '', 2000);

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    showToast(`Đã gửi ${records.length} bản ghi lên Google Sheets ✓`, 'success', 3000);

  } catch (err) {
    console.error('[GS Export Error]', err);
    showToast('Lỗi gửi dữ liệu: ' + err.message, 'error', 4000);

    if (confirm('Gửi thất bại. Bạn muốn nhập lại URL Apps Script?')) {
      promptGSUrl();
    }
  }
}

function resetGSUrl() {
  localStorage.removeItem(GS_URL_KEY);
  showToast('Đã xóa URL Google Sheets — sẽ dùng URL mặc định', 'warning');
}

window.exportToGoogleSheets = exportToGoogleSheets;
window.resetGSUrl = resetGSUrl;
window.promptGSUrl = promptGSUrl;
