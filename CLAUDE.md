# CLAUDE.md — CCCD QR Scanner
> Đọc file này trước khi làm bất cứ thứ gì. Đây là nguồn sự thật duy nhất cho project.

---

## 1. BỐI CẢNH & MỤC TIÊU

**Người dùng:** Nhân viên nghiệp vụ tại công ty bảo hiểm Việt Nam, cần thu thập thông tin CCCD của khách hàng số lượng lớn.

**Vấn đề:** iOS App Store không có app nào vừa quét QR CCCD vừa xuất thẳng ra Excel đủ tin cậy.

**Giải pháp:** Build một **Progressive Web App (PWA)** chạy trên trình duyệt Safari iOS — không cần cài app, không cần backend, không cần tài khoản. Người dùng mở link → quét → xuất Excel.

**Luồng chính:**
```
Mở app trên iPhone → Camera sau bật → Đưa CCCD vào → QR detected (beep + flash)
→ Preview thông tin → Bấm Lưu → Lặp lại → Bấm Xuất Excel → Tải file .xlsx
```

---

## 2. STACK & RÀNG BUỘC KỸ THUẬT

### Bắt buộc tuân thủ
| Ràng buộc | Lý do |
|---|---|
| **Không backend** | Đơn giản hoá deploy, dữ liệu không rời thiết bị |
| **Không framework** (no React/Vue) | Không cần build step, dễ audit |
| **Không npm** | Dùng CDN hoặc local lib copy |
| **Single HTML entry point** | Deploy chỉ cần drag-drop hoặc GitHub Pages |
| **HTTPS hoặc localhost** | Bắt buộc để `getUserMedia` camera hoạt động |

### Thư viện dùng (load từ CDN, có fallback local)
```html
<!-- QR decode -->
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>

<!-- Excel export -->
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

### File structure
```
cccd-scanner/
├── CLAUDE.md               ← file này
├── index.html              ← entry point duy nhất
├── css/
│   └── style.css
├── js/
│   ├── camera.js           ← getUserMedia, video stream
│   ├── qr-decoder.js       ← jsQR scan loop
│   ├── cccd-parser.js      ← parse QR string → object
│   ├── data-store.js       ← in-memory array (session only)
│   ├── ui.js               ← DOM, table, toast, modal
│   └── excel-export.js     ← SheetJS export
├── libs/
│   ├── jsqr.min.js         ← local fallback
│   └── xlsx.min.js         ← local fallback
└── manifest.json           ← PWA manifest
```

---

## 3. KIẾN TRÚC CHI TIẾT

### 3.1 Sơ đồ module
```
Camera (getUserMedia)
    │
    ▼
QR Decoder (jsQR, requestAnimationFrame loop)
    │  decode raw string
    ▼
CCCD Parser (regex / split)
    │  { cccd, name, dob, gender, address, issueDate }
    ▼
Data Store (JS Array in memory)
    │
    ├──▶ UI (table render, badge count, toast)
    │
    └──▶ Excel Export (SheetJS → .xlsx download)
```

### 3.2 CCCD QR Format
Mã QR trên CCCD Việt Nam encode chuỗi phân tách bởi `|`:

```
079XXXXXXXXX|HỌ TÊN VIẾT HOA|DDMMYYYY|Nam/Nữ|Địa chỉ thường trú|DDMMYYYY
```

**Ví dụ thực tế:**
```
079203012345|NGUYEN VAN AN|01011990|Nam|123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh|15092022
```

**Field mapping:**
| Index | Field | Tên cột Excel |
|---|---|---|
| 0 | Số CCCD (12 số) | `Số CCCD` |
| 1 | Họ tên | `Họ tên` |
| 2 | Ngày sinh (DDMMYYYY) | `Ngày sinh` |
| 3 | Giới tính | `Giới tính` |
| 4 | Địa chỉ thường trú | `Địa chỉ thường trú` |
| 5 | Ngày cấp (DDMMYYYY) | `Ngày cấp` |
| auto | Thời gian quét | `Thời gian quét` |

**Parser phải:**
- Split theo `|`, trim whitespace từng field
- Validate: field[0] phải match `/^\d{12}$/`
- Format ngày: `01011990` → `01/01/1990`
- Handle: chuỗi QR không phải CCCD → throw error có message rõ ràng
- Handle: thiếu field (một số thẻ cũ có ít trường hơn) → điền `""` thay vì crash

### 3.3 Camera Module
```javascript
// Ưu tiên camera sau (iPhone production)
const constraints = {
  video: {
    facingMode: { ideal: "environment" }, // không dùng exact → fallback được
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
};

// Video element cần có attributes:
// autoplay playsinline muted
// (playsinline bắt buộc trên iOS Safari, không có sẽ fullscreen)
```

### 3.4 Scan Loop
```javascript
function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    // draw video frame to canvas
    // get imageData
    // jsQR(imageData.data, width, height)
    // if result → onQRDetected(result.data)
  }
  requestAnimationFrame(tick);
}
```

**Debounce:** Sau khi detect 1 QR thành công, dừng scan 2000ms tránh lưu duplicate liên tiếp.

### 3.5 Data Store
```javascript
// Structure
const store = {
  records: [],        // array of parsed CCCD objects
  add(record) {},     // push, tăng STT
  remove(cccd) {},    // xóa theo số CCCD
  clear() {},         // xóa tất cả
  has(cccd) {},       // kiểm tra duplicate
  count() {}          // trả về số bản ghi
};
```

### 3.6 Excel Export — Cột output
```
| STT | Số CCCD | Họ tên | Ngày sinh | Giới tính | Địa chỉ thường trú | Ngày cấp | Thời gian quét |
```

- Tên file: `CCCD_scan_YYYYMMDD_HHmm.xlsx` (timestamp lúc xuất)
- Row 1: Header, **bold**, background `#1E3A5F`, chữ trắng
- Row 2+: dữ liệu, zebra striping (xen kẽ trắng / xanh nhạt `#EBF3FB`)
- Cột STT: width 5, căn giữa
- Cột Số CCCD: width 15, format text (không bị scientific notation)
- Cột Họ tên: width 25
- Cột Địa chỉ: width 45
- Auto freeze row 1 (header)

---

## 4. UI/UX SPECIFICATION

### 4.1 Layout (mobile-first)
```
┌─────────────────────────┐
│  [≡]  CCCD Scanner  [?] │  ← Header (sticky)
├─────────────────────────┤
│                         │
│   ┌─────────────────┐   │
│   │                 │   │
│   │   VIDEO FEED    │   │  ← Viewfinder (16:9)
│   │                 │   │
│   │  [ scanner box ]│   │  ← Canvas overlay, targeting box
│   └─────────────────┘   │
│                         │
│  ● Đang quét... (3)     │  ← Status + badge count
│                         │
├─────────────────────────┤
│  Danh sách (3 bản ghi)  │
│  ┌───┬──────────┬─────┐ │
│  │ # │ CCCD     │ Tên │ │
│  ├───┼──────────┼─────┤ │
│  │ 1 │ 079...45 │ ... │ │
│  └───┴──────────┴─────┘ │
├─────────────────────────┤
│  [🗑 Xóa tất cả] [📥 Xuất Excel] │  ← Footer actions
└─────────────────────────┘
```

### 4.2 Preview Modal (sau khi quét)
Hiện bottom sheet với thông tin đã parse:
```
┌─────────────────────────┐
│ ✅ Quét thành công      │
│─────────────────────────│
│ Số CCCD:  079203012345  │
│ Họ tên:   NGUYEN VAN AN │
│ Ngày sinh: 01/01/1990   │
│ Giới tính: Nam          │
│ Ngày cấp:  15/09/2022   │
│─────────────────────────│
│  [✗ Bỏ qua]  [✓ Lưu]   │
└─────────────────────────┘
```

### 4.3 Feedback states
| Event | Visual | Audio |
|---|---|---|
| QR detected (valid CCCD) | Flash xanh lá lên viewfinder | Beep 1 tiếng (800Hz, 100ms) |
| QR không phải CCCD | Flash đỏ | Beep 2 tiếng ngắn |
| Lưu thành công | Toast "Đã lưu" (1.5s) | Không |
| Duplicate CCCD | Toast cảnh báo vàng | Không |
| Camera bị từ chối | Error screen hướng dẫn bật quyền | Không |

### 4.4 iOS Simulator (chỉ hiện trên desktop)
```css
/* Detect desktop: màn hình rộng > 768px → show simulator frame */
@media (min-width: 768px) {
  .simulator-frame {
    width: 393px;
    height: 852px;
    border-radius: 55px;
    border: 12px solid #1a1a1a;
    box-shadow: 0 0 0 2px #333, 0 30px 80px rgba(0,0,0,0.5);
    overflow: hidden;
    position: relative;
    margin: 40px auto;
  }
  /* Dynamic Island giả */
  .simulator-frame::before {
    content: '';
    position: absolute;
    top: 12px; left: 50%;
    transform: translateX(-50%);
    width: 120px; height: 35px;
    background: #000;
    border-radius: 20px;
    z-index: 100;
  }
}

/* Trên mobile thật: ẩn frame, app chiếm toàn màn hình */
@media (max-width: 767px) {
  .simulator-frame { all: unset; display: block; }
}
```

Toggle button `[📱 Xem như iPhone]` / `[🖥 Toàn màn hình]` ở góc phải header.

### 4.5 Color palette
```
Primary:    #1E3A5F  (navy — header, button primary)
Accent:     #2E86DE  (blue — highlight, scan box)
Success:    #27AE60  (green — flash, toast lưu)
Warning:    #F39C12  (amber — duplicate warning)
Danger:     #E74C3C  (red — error, invalid QR)
Background: #F5F7FA  (light grey)
Surface:    #FFFFFF  (card, modal)
Text:       #2C3E50  (dark)
Text muted: #7F8C8D  (label, placeholder)
```

---

## 5. TASK LIST — THỨ TỰ BUILD

### ✅ PHASE 1 — Skeleton (làm trước tiên)
- [ ] **T1.1** Tạo `index.html` — boilerplate, meta tags iOS, load libs
- [ ] **T1.2** Tạo `style.css` — layout, color palette, mobile-first
- [ ] **T1.3** Build iOS simulator CSS frame (hiện trên desktop, ẩn trên mobile)
- [ ] **T1.4** Tạo `manifest.json` — PWA, icon, theme color
- [ ] **T1.5** Verify: mở `index.html` trên Chrome → thấy simulator frame với placeholder viewfinder

### ✅ PHASE 2 — Camera
- [ ] **T2.1** Tạo `camera.js` — `initCamera()`, handle permission denied
- [ ] **T2.2** Render video stream vào `<video playsinline autoplay muted>`
- [ ] **T2.3** Canvas overlay lên video (để draw targeting box + QR highlight)
- [ ] **T2.4** Verify: webcam bật, hiện trong simulator frame

### ✅ PHASE 3 — QR Decode
- [ ] **T3.1** Tạo `qr-decoder.js` — scan loop với `requestAnimationFrame`
- [ ] **T3.2** Tích hợp jsQR, decode từng frame
- [ ] **T3.3** Khi detect QR: vẽ border xanh quanh QR box trên canvas
- [ ] **T3.4** Debounce 2000ms sau mỗi lần detect thành công
- [ ] **T3.5** Verify: đưa QR bất kỳ vào webcam → console.log ra raw string

### ✅ PHASE 4 — CCCD Parser
- [ ] **T4.1** Tạo `cccd-parser.js` — hàm `parseQR(rawString)`
- [ ] **T4.2** Validate số CCCD 12 chữ số
- [ ] **T4.3** Format ngày `DDMMYYYY` → `DD/MM/YYYY`
- [ ] **T4.4** Return object `{ cccd, name, dob, gender, address, issueDate, scannedAt }`
- [ ] **T4.5** Throw `CCCDParseError` với message tiếng Việt nếu không parse được
- [ ] **T4.6** Verify: unit test với chuỗi mẫu trong `console` — pass hết

### ✅ PHASE 5 — Data Store & UI
- [ ] **T5.1** Tạo `data-store.js` — store object với `add/remove/clear/has/count`
- [ ] **T5.2** Tạo `ui.js` — `renderTable()`, `showModal()`, `showToast()`, `updateBadge()`
- [ ] **T5.3** Sau khi parse thành công → mở preview modal
- [ ] **T5.4** Bấm [Lưu] → `store.add()` → `renderTable()` → đóng modal → resume scan
- [ ] **T5.5** Bấm [Bỏ qua] → đóng modal → resume scan
- [ ] **T5.6** Duplicate check: nếu `store.has(cccd)` → toast cảnh báo, hỏi có ghi đè không
- [ ] **T5.7** Nút [Xóa tất cả] → confirm dialog → `store.clear()` → `renderTable()`
- [ ] **T5.8** Verify: quét QR mẫu → lưu → thấy trong bảng

### ✅ PHASE 6 — Audio Feedback
- [ ] **T6.1** Tạo beep sound bằng Web Audio API (không cần file .mp3)
  ```javascript
  function beep(freq = 800, duration = 100, type = 'sine') {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  }
  ```
- [ ] **T6.2** Beep thành công khi lưu CCCD hợp lệ
- [ ] **T6.3** Double beep ngắn khi QR không hợp lệ

### ✅ PHASE 7 — Excel Export
- [ ] **T7.1** Tạo `excel-export.js` — hàm `exportToExcel(records)`
- [ ] **T7.2** Build worksheet: header row styled + data rows zebra
- [ ] **T7.3** Format cột số CCCD là text (tránh scientific notation trong Excel)
- [ ] **T7.4** Set column widths, freeze top row
- [ ] **T7.5** Filename: `CCCD_scan_YYYYMMDD_HHmm.xlsx`
- [ ] **T7.6** Nút [Xuất Excel] disabled khi `store.count() === 0`
- [ ] **T7.7** Verify: xuất file → mở bằng Excel/Google Sheets → đúng format

### ✅ PHASE 8 — Polish & Edge Cases
- [ ] **T8.1** Empty state: khi bảng trống hiện icon + "Chưa có bản ghi nào"
- [ ] **T8.2** Camera permission denied: hiện màn hình hướng dẫn bật quyền (có ảnh minh hoạ text)
- [ ] **T8.3** Xử lý khi jsQR chưa load xong (loading state)
- [ ] **T8.4** Toggle simulator: nút góc phải header, lưu state vào localStorage
- [ ] **T8.5** Test Safari iOS: `playsinline`, camera permission flow
- [ ] **T8.6** Kiểm tra không có `console.error` nào trong happy path

---

## 6. ACCEPTANCE CRITERIA — PASS/FAIL

| ID | Test | Pass khi |
|---|---|---|
| AC1 | Mở `index.html` trên Chrome desktop | Thấy iOS simulator frame, camera bật sau 1-2s |
| AC2 | Đưa QR bất kỳ vào webcam | Thấy border xanh bao quanh QR |
| AC3 | Đưa CCCD thật vào webcam | Flash xanh, beep, modal hiện đúng thông tin |
| AC4 | Bấm Lưu | Dòng mới trong bảng, badge +1 |
| AC5 | Quét cùng CCCD lần 2 | Toast cảnh báo "Đã tồn tại" |
| AC6 | QR không phải CCCD | Flash đỏ, double beep, không mở modal |
| AC7 | Bấm Xuất Excel với 3 bản ghi | Tải file .xlsx, mở ra đúng 3 dòng + header |
| AC8 | Bấm Xóa tất cả | Confirm dialog → xóa → empty state |
| AC9 | Mở trên Safari iOS (HTTPS) | Camera sau bật, toàn bộ flow hoạt động như desktop |
| AC10 | Bấm toggle simulator | Frame ẩn/hiện, app vẫn hoạt động |

---

## 7. TEST DATA — CCCD MẪU (dùng để test parser)

```javascript
// Dùng các chuỗi này để test cccd-parser.js mà không cần CCCD thật
const TEST_CASES = [
  // Happy path
  "079203012345|NGUYEN VAN AN|01011990|Nam|123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh|15092022",
  "001304567890|TRAN THI BICH|25121985|Nữ|45 Nguyễn Huệ, Hoàn Kiếm, Hà Nội|20032019",

  // Edge cases
  "079203012345|NGUYEN VAN AN|01011990|Nam|Địa chỉ|",     // thiếu ngày cấp
  "079203012345|NGUYEN VAN AN|01011990|Nam||15092022",     // thiếu địa chỉ

  // Invalid (phải throw error)
  "ABCD|NGUYEN VAN AN|01011990|Nam|Địa chỉ|15092022",     // CCCD không phải số
  "12345|NGUYEN VAN AN",                                    // quá ít field
  "https://example.com",                                    // QR web thông thường
  "",                                                       // empty string
];
```

Để test không cần webcam: thêm nút ẩn `[Dev: Inject QR]` chỉ hiện khi `localhost`, click sẽ inject chuỗi test vào parser như thể vừa quét được.

---

## 8. DEPLOY CHECKLIST (sau khi build xong)

### Test local
```bash
# Python (nếu cần HTTPS giả lập cho camera)
python3 -m http.server 8080
# Mở: http://localhost:8080

# Hoặc dùng ngrok để test trên iPhone thật qua mạng LAN
npx ngrok http 8080
# Lấy HTTPS URL → mở trên Safari iPhone
```

### Deploy production (để dùng trên iPhone)
1. Push toàn bộ folder lên GitHub repo
2. Vào Settings → Pages → Source: main branch / root
3. URL dạng: `https://username.github.io/cccd-scanner/`
4. Mở URL trên Safari iPhone → Add to Home Screen → dùng như app

---

## 9. NHỮNG GÌ KHÔNG LÀM TRONG V1

- ❌ Không quét NFC chip (iOS Safari không hỗ trợ Web NFC)
- ❌ Không lưu cloud / Supabase (scope v2)
- ❌ Không đăng nhập / tài khoản
- ❌ Không sync đa thiết bị
- ❌ Không print / chia sẻ trực tiếp
- ❌ Không OCR (chỉ quét QR, không đọc chữ trên thẻ)

---

## 10. SẴN SÀNG BUILD

Đọc xong file này là đủ context. Bắt đầu từ **PHASE 1** và build tuần tự.  
Verify mỗi phase trước khi sang phase tiếp theo.  
Mọi quyết định kỹ thuật nằm ở Section 3. Mọi quyết định UI nằm ở Section 4.

**Bắt đầu với:** `index.html` → `style.css` → `manifest.json`
