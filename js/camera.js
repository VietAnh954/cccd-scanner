'use strict';

async function initCamera() {
  const video     = document.getElementById('video');
  const loading   = document.getElementById('loadingOverlay');
  const camSection = document.getElementById('cameraSection');
  const permDenied = document.getElementById('permissionDenied');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showPermissionDenied();
    setStatus('Camera không được hỗ trợ trên trình duyệt này', 'error');
    return null;
  }

  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width:      { ideal: 1920 },
      height:     { ideal: 1080 },
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      setTimeout(reject, 10000);   // 10s timeout
    });

    await video.play();

    if (loading) loading.classList.add('hidden');
    setStatus('Đang quét... Đưa CCCD vào khung hình', 'active');

    return stream;
  } catch (err) {
    if (loading) loading.classList.add('hidden');

    const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
    if (isDenied) {
      showPermissionDenied();
      setStatus('Camera bị từ chối — kiểm tra quyền truy cập', 'error');
    } else {
      setStatus('Không thể bật camera: ' + err.message, 'error');
      showToast('Không thể bật camera: ' + err.message, 'error', 4000);
    }
    return null;
  }
}

function showPermissionDenied() {
  const cs = document.getElementById('cameraSection');
  const pd = document.getElementById('permissionDenied');
  if (cs) cs.style.display = 'none';
  if (pd) pd.style.display = '';
}

window.initCamera = initCamera;
