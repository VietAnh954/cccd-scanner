/**
 * ═══════════════════════════════════════════════════════════════
 * GOOGLE APPS SCRIPT — CCCD Scanner
 * ═══════════════════════════════════════════════════════════════
 *
 * HƯỚNG DẪN:
 * 1. Mở https://script.google.com → mở project cũ (hoặc tạo mới)
 * 2. XÓA TOÀN BỘ code cũ trong Code.gs
 * 3. DÁN TOÀN BỘ code bên dưới vào
 * 4. Bấm 💾 Lưu
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me (Tôi)
 *    - Who has access: Anyone (Bất kỳ ai)
 * 6. Copy URL deployment → dán vào DEFAULT_GS_URL trong google-sheets.js
 *
 * LƯU Ý QUAN TRỌNG:
 * - Phải tạo NEW DEPLOYMENT mỗi khi thay đổi code
 * - "Manage deployments" → edit KHÔNG cập nhật code!
 * - Execute as: phải chọn "Me" (Tôi), KHÔNG phải "User accessing"
 * - Who has access: phải chọn "Anyone" (Bất kỳ ai), KHÔNG phải "Anyone with Google account"
 */

var SHEET_ID = '19XlSwLO3B6TPbjxsquh2Z7cUZow4c3hBOXYfGplGYX0';
var SHEET_NAME = 'Sheet1';

// ── Xử lý GET request (từ script tag — hoạt động trên mọi thiết bị) ──
function doGet(e) {
  return handleRequest(e);
}

// ── Xử lý POST request (backup — hoạt động trên desktop) ──
function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error('Không tìm thấy sheet "' + SHEET_NAME + '"');
    }

    var records = [];

    // Đọc data từ nhiều nguồn
    if (e.parameter && e.parameter.data) {
      // GET query param hoặc form POST
      var parsed = JSON.parse(e.parameter.data);
      records = parsed.records ? parsed.records : [parsed];

    } else if (e.postData && e.postData.contents) {
      // POST JSON body
      var payload = JSON.parse(e.postData.contents);
      records = payload.records ? payload.records : [payload];
    }

    if (records.length === 0) {
      return jsonResponse({ success: false, error: 'Không có dữ liệu' });
    }

    // Ghi từng bản ghi vào sheet
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var lastRow = sheet.getLastRow();
      var stt = lastRow; // Row 1 = header → STT bắt đầu từ 1

      sheet.appendRow([
        stt,
        r.rawData || '',
        r.cccd || '',
        r.name || '',
        r.dob || '',
        r.gender || '',
        r.address || '',
        r.issueDate || '',
        r.scannedAt || ''
      ]);

      // Format cột CCCD (cột C) là text → tránh Excel hiểu nhầm thành số
      var newRow = sheet.getLastRow();
      sheet.getRange(newRow, 3).setNumberFormat('@');
    }

    return jsonResponse({ success: true, count: records.length });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
