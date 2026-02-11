(() => {
  let selectionOverlay = null;
  let selectionRect = null;
  let isSelecting = false;
  let startX, startY;

  async function captureScreenshot(options = {}) {
    try {
      // Use html-to-image if available
      if (typeof htmlToImage !== "undefined") {
        const { left, top, width, height } = options;

        // If specific area is requested
        if (width && height) {
          const fullCanvas = await htmlToImage.toCanvas(document.body, {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          });

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = width;
          cropCanvas.height = height;
          const ctx = cropCanvas.getContext('2d');

          // Draw the selected part of the full canvas onto the crop canvas
          // Note: coordinates from selection are relative to viewport, 
          // we need to add scroll offsets if we captured the full body
          const scrollX = window.scrollX;
          const scrollY = window.scrollY;

          ctx.drawImage(
            fullCanvas,
            left + scrollX, top + scrollY, width, height, // source
            0, 0, width, height                           // destination
          );

          return cropCanvas.toDataURL('image/png');
        }

        // Default: Full page
        return await htmlToImage.toPng(document.body, {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        });
      }
      throw new Error("html-to-image library not found");
    } catch (error) {
      console.error("[dyad-screenshot] Failed to capture screenshot:", error);
      throw error;
    }
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
        try {
          const dataUrl = await captureScreenshot({ left, top, width, height });
          sendResponse(true, dataUrl);
        } catch (error) {
          sendResponse(false, null, error.message);
        }
      }, 50);
    };

    window.addEventListener('keydown', handleEsc);
    document.body.appendChild(selectionOverlay);
  }

  function sendResponse(success, dataUrl, error = null) {
    window.parent.postMessage({
      type: "dyad-screenshot-response",
      success,
      dataUrl,
      error
    }, "*");
  }

  async function handleScreenshotRequest(options = {}) {
    try {
      console.debug("[dyad-screenshot] Capturing screenshot...");
      const dataUrl = await captureScreenshot(options);
      console.debug("[dyad-screenshot] Screenshot captured successfully");
      sendResponse(true, dataUrl);
    } catch (error) {
      console.error("[dyad-screenshot] Screenshot capture failed:", error);
      sendResponse(false, null, error.message);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;

    if (event.data.type === "dyad-take-screenshot") {
      handleScreenshotRequest();
    } else if (event.data.type === "dyad-start-selection") {
      startSelection();
    }
  });
})();

