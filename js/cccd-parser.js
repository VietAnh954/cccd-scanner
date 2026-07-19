'use strict';

class CCCDParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CCCDParseError';
  }
}

/**
 * Parse raw QR string from Vietnamese CCCD into a structured object.
 *
 * Format 7 fields (CCCD mới, phổ biến):
 *   CCCD | old_id | Họ tên | DDMMYYYY | Giới tính | Địa chỉ | DDMMYYYY
 *   (old_id có thể rỗng → chuỗi có "||")
 *
 * Format 6 fields (CCCD cũ):
 *   CCCD | Họ tên | DDMMYYYY | Giới tính | Địa chỉ | DDMMYYYY
 */
function parseQR(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new CCCDParseError('Dữ liệu QR rỗng hoặc không hợp lệ');
  }

  const trimmed = raw.trim();
  if (!trimmed.includes('|')) {
    throw new CCCDParseError('QR này không phải mã CCCD (không có dấu phân cách |)');
  }

  const fields = trimmed.split('|').map(f => f.trim());

  if (fields.length < 3) {
    throw new CCCDParseError('Dữ liệu QR thiếu trường thông tin (cần ít nhất 3 trường)');
  }

  const cccd = fields[0];
  if (!/^\d{9}$|^\d{12}$/.test(cccd)) {
    throw new CCCDParseError(`Số CCCD/CMND không hợp lệ: "${cccd}" (phải là 9 hoặc 12 chữ số)`);
  }

  // Detect format: 7+ fields = new format with old_id at index 1
  // Kiểm tra: nếu >= 7 fields VÀ field[1] rỗng hoặc là số (CMND cũ) → 7-field format
  const is7Field = fields.length >= 7 &&
    (fields[1] === '' || /^\d{9,12}$/.test(fields[1]));

  const offset = is7Field ? 1 : 0;  // skip old_id field

  const name      = fields[1 + offset] || '';
  const dobRaw    = fields[2 + offset] || '';
  const gender    = fields[3 + offset] || '';
  const address   = fields[4 + offset] || '';
  const issueDateRaw = fields[5 + offset] || '';

  function formatDate(s) {
    if (!s) return '';
    const d = s.trim();
    if (d.length === 8 && /^\d{8}$/.test(d)) {
      return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4,8)}`;
    }
    return d;
  }

  return {
    cccd,
    name,
    dob:       formatDate(dobRaw),
    gender,
    address,
    issueDate: formatDate(issueDateRaw),
    rawData:   trimmed,
    scannedAt: new Date().toLocaleString('vi-VN'),
  };
}

window.CCCDParseError = CCCDParseError;
window.parseQR = parseQR;
