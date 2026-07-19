'use strict';

function exportToExcel(records) {
  if (!window.XLSX) {
    showToast('Thư viện Excel chưa sẵn sàng, thử lại sau', 'error');
    return;
  }

  // Template theo yêu cầu:
  // STT | Dữ liệu gốc | Số CCCD | Họ và tên | Năm sinh | Giới tính | Địa chỉ | Ngày cấp | Ngày quét
  const headers = [
    'STT',
    'Dữ liệu gốc',
    'Số CCCD',
    'Họ và tên',
    'Năm sinh',
    'Giới tính',
    'Địa chỉ',
    'Ngày cấp',
    'Ngày quét',
  ];

  const rows = records.map(r => [
    r.stt,
    r.rawData || '',
    { t: 's', v: String(r.cccd) },   // force text — tránh scientific notation
    r.name,
    r.dob,
    r.gender,
    r.address,
    r.issueDate,
    r.scannedAt,
  ]);

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 5 },   // STT
    { wch: 55 },  // Dữ liệu gốc
    { wch: 16 },  // Số CCCD
    { wch: 25 },  // Họ và tên
    { wch: 12 },  // Năm sinh
    { wch: 10 },  // Giới tính
    { wch: 45 },  // Địa chỉ
    { wch: 12 },  // Ngày cấp
    { wch: 22 },  // Ngày quét
  ];

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Styles
  const headerStyle = {
    font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill:      { fgColor: { rgb: '1E3A5F' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border:    { bottom: { style: 'medium', color: { rgb: '2E86DE' } } },
  };

  const zebraStyle = { fill: { fgColor: { rgb: 'EBF3FB' } }, font: { sz: 11 } };
  const normalStyle = { font: { sz: 11 } };
  const sttStyle = { alignment: { horizontal: 'center' }, font: { sz: 11 } };
  const cccdStyle = {
    font:      { name: 'Courier New', sz: 11, bold: true, color: { rgb: '1E3A5F' } },
    alignment: { horizontal: 'left' },
  };
  const rawStyle = {
    font:      { sz: 10, color: { rgb: '7F8C8D' } },
    alignment: { wrapText: true },
  };

  // Apply header styles
  headers.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[ref]) ws[ref].s = headerStyle;
  });

  // Apply data row styles
  records.forEach((_, ri) => {
    const rowIdx = ri + 1;
    const isZebra = ri % 2 === 1;
    const zFill = isZebra ? zebraStyle.fill : undefined;
    headers.forEach((_, ci) => {
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: ci });
      if (!ws[ref]) return;
      if (ci === 0)      ws[ref].s = { ...sttStyle, fill: zFill };
      else if (ci === 1) ws[ref].s = { ...rawStyle, fill: zFill };
      else if (ci === 2) ws[ref].s = { ...cccdStyle, fill: zFill };
      else               ws[ref].s = isZebra ? zebraStyle : normalStyle;
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CCCD');

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const filename = `CCCD_scan_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;

  XLSX.writeFile(wb, filename);
  showToast(`Đã xuất ${records.length} bản ghi`, 'success', 2500);
}

window.exportToExcel = exportToExcel;
