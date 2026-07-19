'use strict';

let _cooldown     = false;
let _scanning     = true;
let _activeEngine = null;
let _scanner      = null;   // QrScanner instance
let _rafId        = null;
let _canvas       = null;
let _ctx          = null;
let _frameCount   = 0;
let _lastTick     = 0;

// ── Entry point ───────────────────────────────────────────────────────────────
async function initDecoder(video) {
  _canvas = document.getElementById('overlay');
  _ctx    = _canvas.getContext('2d', { willReadFrequently: true });

  // Tier 1: BarcodeDetector native (Chrome Android / Safari 17+)
  if (await tryBarcodeDetector(video)) return;

  // Tier 2: nimiq/qr-scanner — tự crop + scale vùng QR, dùng web worker
  if (await tryQrScanner(video)) return;

  // Tier 3: ZXing low-level với multi-scale scan
  if (window.ZXing && tryZXing(video)) return;

  // Tier 4: jsQR fallback cuối cùng
  startJSQR(video);
}

// ── Tier 1: BarcodeDetector ───────────────────────────────────────────────────
async function tryBarcodeDetector(video) {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const fmts = await BarcodeDetector.getSupportedFormats();
    if (!fmts.includes('qr_code')) return false;
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    _activeEngine = 'native';
    console.log('[QR] Engine: BarcodeDetector ✓');
    setStatus('Đang quét... Đưa CCCD vào khung hình', 'active');
    const tick = async () => {
      if (_activeEngine !== 'native') return;
      _rafId = requestAnimationFrame(tick);
      if (!_scanning || _cooldown) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA) return;
      try {
        const results = await det.detect(video);
        if (results.length && results[0].rawValue) {
          onDetected(results[0].rawValue);
        }
      } catch (_) {}
    };
    requestAnimationFrame(tick);
    return true;
  } catch (_) { return false; }
}

// ── Tier 2: nimiq/qr-scanner ─────────────────────────────────────────────────
// Ưu điểm: tự crop + scale vùng QR (giải quyết vấn đề resolution CCCD),
// dùng web worker (không block UI), hỗ trợ iPhony/iPad qua Safari.
async function tryQrScanner(video) {
  if (typeof QrScanner === 'undefined') return false;
  try {
    _scanner = new QrScanner(
      video,
      result => {
        if (!_scanning || _cooldown) return;
        const text = (result && result.data) ? result.data : String(result);
        if (!text) return;
        console.log('[CCCD Raw QR]', JSON.stringify(text));
        onDetected(text);
      },
      {
        returnDetailedScanResult: true,
        maxScansPerSecond:        15,
        preferredCamera:          'environment',
        // Tắt overlay riêng của qr-scanner — app đã có flash/beep/toast
        highlightScanRegion:      false,
        highlightCodeOutline:     false,
      }
    );

    // video.srcObject đã được set bởi camera.js → qr-scanner skip getUserMedia
    await _scanner.start();

    _activeEngine = 'qrscanner';
    console.log('[QR] Engine: nimiq/qr-scanner ✓ (auto crop+scale)');
    setStatus('Đang quét... Đưa CCCD vào khung hình', 'active');

    // Bump frame counter để user biết scan loop đang chạy
    setInterval(() => {
      if (_activeEngine === 'qrscanner') {
        _frameCount += 15;
        if (_frameCount % 60 === 0) {
          setStatus(`Đang quét... Đưa CCCD vào khung hình (${_frameCount})`, 'active');
        }
      }
    }, 1000);

    return true;
  } catch (e) {
    console.warn('[QR] qr-scanner lỗi:', e.message || e);
    if (_scanner) { try { _scanner.destroy(); } catch (_) {} _scanner = null; }
    return false;
  }
}

// ── Tier 3: ZXing MultiFormatReader + multi-scale ────────────────────────────
function tryZXing(video) {
  if (!window.ZXing) return false;
  try {
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);

    _activeEngine = 'zxing';
    console.log('[QR] Engine: ZXing HybridBinarizer ✓');
    setStatus('Đang quét... Đưa CCCD vào khung hình', 'active');

    // Offscreen canvas dùng để crop + scale vùng trung tâm
    const cropCanvas = document.createElement('canvas');
    const cropCtx    = cropCanvas.getContext('2d');

    const tick = () => {
      if (_activeEngine !== 'zxing') return;
      _rafId = requestAnimationFrame(tick);
      if (!_scanning || _cooldown) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA) return;

      const now = performance.now();
      if (now - _lastTick < 80) return;  // 12fps
      _lastTick = now;

      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      _canvas.width = vw; _canvas.height = vh;
      _ctx.drawImage(video, 0, 0, vw, vh);

      // Pass 1: full frame
      let decoded = zxingDecode(reader, _canvas);

      // Pass 2: crop trung tâm 50% và scale lên 2x — giải quyết QR nhỏ
      if (!decoded) {
        const cx = Math.floor(vw * 0.25), cy = Math.floor(vh * 0.25);
        const cw = Math.floor(vw * 0.50), ch = Math.floor(vh * 0.50);
        cropCanvas.width  = cw * 2;
        cropCanvas.height = ch * 2;
        cropCtx.drawImage(_canvas, cx, cy, cw, ch, 0, 0, cw * 2, ch * 2);
        decoded = zxingDecode(reader, cropCanvas);
      }

      if (decoded) {
        console.log('[CCCD Raw QR]', JSON.stringify(decoded));
        onDetected(decoded);
      } else {
        _ctx.clearRect(0, 0, vw, vh);
        _frameCount++;
        if (_frameCount % 30 === 0) setStatus(`Đang quét... [zxing] (${_frameCount})`, 'active');
      }
    };
    requestAnimationFrame(tick);
    return true;
  } catch (e) {
    console.warn('[QR] ZXing lỗi:', e.message);
    return false;
  }
}

function zxingDecode(reader, canvas) {
  try {
    const lum    = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
    const bmp    = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
    const result = reader.decode(bmp);
    return (result && result.getText()) ? result.getText() : null;
  } catch (_) { return null; }
}

// ── Tier 4: jsQR fallback ─────────────────────────────────────────────────────
function startJSQR(video) {
  _activeEngine = 'jsqr';
  console.log('[QR] Engine: jsQR fallback');
  setStatus('Đang quét... Đưa CCCD vào khung hình', 'active');

  const cropCanvas = document.createElement('canvas');
  const cropCtx    = cropCanvas.getContext('2d');

  const tick = () => {
    if (_activeEngine !== 'jsqr') return;
    _rafId = requestAnimationFrame(tick);
    if (!_scanning || _cooldown) return;
    if (video.readyState < video.HAVE_ENOUGH_DATA) return;

    const now = performance.now();
    if (now - _lastTick < 80) return;
    _lastTick = now;

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    _canvas.width = vw; _canvas.height = vh;
    _ctx.drawImage(video, 0, 0, vw, vh);
    if (!window.jsQR) return;

    // Pass 1: full frame
    let px = _ctx.getImageData(0, 0, vw, vh);
    let r  = jsQR(px.data, vw, vh, { inversionAttempts: 'attemptBoth' });

    // Pass 2: crop trung tâm 50%, scale 2x
    if (!r || !r.data) {
      const cx = Math.floor(vw * 0.25), cy = Math.floor(vh * 0.25);
      const cw = Math.floor(vw * 0.50), ch = Math.floor(vh * 0.50);
      cropCanvas.width  = cw * 2; cropCanvas.height = ch * 2;
      cropCtx.drawImage(_canvas, cx, cy, cw, ch, 0, 0, cw * 2, ch * 2);
      px = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
      r  = jsQR(px.data, cropCanvas.width, cropCanvas.height, { inversionAttempts: 'attemptBoth' });
    }

    if (r && r.data) {
      console.log('[CCCD Raw QR]', JSON.stringify(r.data));
      onDetected(r.data);
    } else {
      _ctx.clearRect(0, 0, vw, vh);
      _frameCount++;
      if (_frameCount % 30 === 0) setStatus(`Đang quét... [jsqr] (${_frameCount})`, 'active');
    }
  };
  requestAnimationFrame(tick);
}

// ── Shared ────────────────────────────────────────────────────────────────────
function onDetected(data) {
  _cooldown = true;
  window.onQRDetected && window.onQRDetected(data);
  setTimeout(() => { _cooldown = false; }, 2000);
}

function resumeScan() {
  _cooldown = false;
  if (_activeEngine === 'qrscanner' && _scanner && !_scanner._active) {
    _scanner.start().catch(() => {});
  }
}
function pauseScan() { _scanning = false; }
function startScan() { _scanning = true;  }

window.resumeScan = resumeScan;
window.pauseScan  = pauseScan;
window.startScan  = startScan;

// ── Image upload scanning ─────────────────────────────────────────────────────
function initImageUpload() {
  const input = document.getElementById('inputUploadQR');
  if (!input) return;

  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    input.value = ''; // reset cho lần chọn sau

    try {
      // Load ảnh vào Image element
      const img = await loadImage(file);

      // Thử decode bằng nhiều engine
      let decoded = null;

      // Try 1: QrScanner.scanImage (nếu có)
      if (!decoded && typeof QrScanner !== 'undefined' && QrScanner.scanImage) {
        try {
          const result = await QrScanner.scanImage(img, { returnDetailedScanResult: true });
          decoded = result && result.data ? result.data : null;
        } catch (_) {}
      }

      // Try 2: BarcodeDetector
      if (!decoded && 'BarcodeDetector' in window) {
        try {
          const det = new BarcodeDetector({ formats: ['qr_code'] });
          const results = await det.detect(img);
          if (results.length) decoded = results[0].rawValue;
        } catch (_) {}
      }

      // Try 3: jsQR multi-scale
      if (!decoded && window.jsQR) {
        decoded = decodeImageWithJsQR(img);
      }

      if (decoded) {
        console.log('[Upload QR]', JSON.stringify(decoded));
        onDetected(decoded);
      } else {
        showToast('Không tìm thấy mã QR trong ảnh', 'error', 3000);
        beepError();
      }
    } catch (err) {
      console.warn('[Upload Error]', err);
      showToast('Lỗi đọc ảnh: ' + err.message, 'error', 3000);
    }
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được file ảnh'));
    img.src = URL.createObjectURL(file);
  });
}

function decodeImageWithJsQR(img) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');

  // Try full resolution
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);
  let px = ctx.getImageData(0, 0, c.width, c.height);
  let r = jsQR(px.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
  if (r && r.data) return r.data;

  // Try scaled down 50% (sometimes helps with very large images)
  const sw = Math.floor(c.width / 2), sh = Math.floor(c.height / 2);
  c.width = sw; c.height = sh;
  ctx.drawImage(img, 0, 0, sw, sh);
  px = ctx.getImageData(0, 0, sw, sh);
  r = jsQR(px.data, sw, sh, { inversionAttempts: 'attemptBoth' });
  if (r && r.data) return r.data;

  // Try center crop 60%
  const ow = img.naturalWidth, oh = img.naturalHeight;
  const cx = Math.floor(ow * 0.2), cy = Math.floor(oh * 0.2);
  const cw = Math.floor(ow * 0.6), ch = Math.floor(oh * 0.6);
  c.width = cw; c.height = ch;
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
  px = ctx.getImageData(0, 0, cw, ch);
  r = jsQR(px.data, cw, ch, { inversionAttempts: 'attemptBoth' });
  return (r && r.data) ? r.data : null;
}

// ── App entry point ───────────────────────────────────────────────────────────
window.initApp = function() {
  if (window._appInited) return;
  window._appInited = true;
  renderTable();
  initImageUpload();
  const video = document.getElementById('video');
  initCamera().then(stream => {
    if (stream) initDecoder(video);
  });
};
