import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const QrScanner = ({ onScanSuccess, onScanFailure, containerId = 'qr-reader' }) => {
  useEffect(() => {
    // Ensure the container is in the DOM
    if (!document.getElementById(containerId)) {
        return;
    }

    const html5QrcodeScanner = new Html5QrcodeScanner(
      containerId,
      { 
        fps: 10, // Optional, frame per second for scanning
        qrbox: { width: 250, height: 250 }, // Optional, bounding box for scanner
        rememberLastUsedCamera: true,
        supportedScanTypes: [/* HTML5_QR_CODE_SCAN_TYPE_CAMERA */ 0]
      },
      /* verbose= */ false
    );

    const didRender = new Set();
    const renderScanner = () => {
        if (!didRender.has(containerId)) {
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            didRender.add(containerId);
        }
    }

    // Delay rendering to ensure DOM is ready
    const timeoutId = setTimeout(renderScanner, 100);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(error => {
          console.error("Failed to clear html5QrcodeScanner.", error);
        });
      }
    };
  }, [onScanSuccess, onScanFailure, containerId]);

  return <div id={containerId} className="w-full"></div>;
};

export default QrScanner;
