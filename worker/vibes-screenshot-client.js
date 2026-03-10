(() => {
  let selectionOverlay = null;
  let selectionRect = null;
  let isSelecting = false;
  let startX, startY;

  async function captureScreenshot(options = {}) {
    // We now prefer native screenshot via parent Electron process
    // This is much more reliable than html-to-image
    window.parent.postMessage({
      type: "vibes-request-native-screenshot",
      rect: options
    }, "*");
    return null; // Response will come asynchronously via parent
  }

  function cleanupSelection() {
    if (selectionOverlay) {
      document.body.removeChild(selectionOverlay);
      selectionOverlay = null;
      selectionRect = null;
    }
    window.removeEventListener('keydown', handleEsc);
  }

  function handleEsc(e) {
    if (e.key === 'Escape') {
      cleanupSelection();
    }
  }

  function startSelection() {
    if (selectionOverlay) return;

    selectionOverlay = document.createElement('div');
    Object.assign(selectionOverlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.4)',
      zIndex: '1000000',
      cursor: 'crosshair',
      userSelect: 'none'
    });

    selectionRect = document.createElement('div');
    Object.assign(selectionRect.style, {
      position: 'absolute',
      border: '2px solid #7f22fe',
      backgroundColor: 'rgba(127, 34, 254, 0.1)',
      display: 'none',
      pointerEvents: 'none'
    });

    selectionOverlay.appendChild(selectionRect);

    selectionOverlay.onmousedown = (e) => {
      if (e.button !== 0) return; // Only left click
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      selectionRect.style.display = 'block';
      selectionRect.style.left = startX + 'px';
      selectionRect.style.top = startY + 'px';
      selectionRect.style.width = '0px';
      selectionRect.style.height = '0px';
    };

    selectionOverlay.onmousemove = (e) => {
      if (!isSelecting) return;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(startX - currentX);
      const height = Math.abs(startY - currentY);

      selectionRect.style.left = left + 'px';
      selectionRect.style.top = top + 'px';
      selectionRect.style.width = width + 'px';
      selectionRect.style.height = height + 'px';
    };

    selectionOverlay.onmouseup = async (e) => {
      if (!isSelecting) return;
      isSelecting = false;

      const currentX = e.clientX;
      const currentY = e.clientY;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(startX - currentX);
      const height = Math.abs(startY - currentY);

      if (width < 5 || height < 5) {
        // Just clicked or selection too small, ignore
        return;
      }

      cleanupSelection();

      // Give time for overlay to disappear
      setTimeout(async () => {
        captureScreenshot({ left, top, width, height });
      }, 50);
    };

    window.addEventListener('keydown', handleEsc);
    document.body.appendChild(selectionOverlay);
  }

  function sendResponse(success, dataUrl, error = null) {
    window.parent.postMessage({
      type: "vibes-screenshot-response",
      success,
      dataUrl,
      error
    }, "*");
  }

  async function handleScreenshotRequest(options = {}) {
    console.debug("[vibes-screenshot] Requesting native screenshot from parent...");
    captureScreenshot(options);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;

    if (event.data.type === "vibes-take-screenshot") {
      handleScreenshotRequest();
    } else if (event.data.type === "vibes-start-selection") {
      startSelection();
    }
  });
})();

