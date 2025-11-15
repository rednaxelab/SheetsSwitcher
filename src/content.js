// --- PART 1: RUNS IN ALL FRAMES (at document_start) ---
const frameId = (window.self === window.top) ? "TOP" : "CHILD";

function keydownHandler(event) {
  // --- CHANGE ---
  // We now capture the 'Alt' key press itself, in addition to Alt+Arrows.
  if (event.key === 'Alt' || (event.altKey && (
    event.code === 'ArrowDown' || 
    event.code === 'ArrowRight' || 
    event.code === 'ArrowUp' || 
    event.code === 'ArrowLeft'
  ))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    
    window.top.postMessage({
      type: 'SS_KEY_DOWN',
      key: event.key,
      code: event.code
    }, 'https://docs.google.com');
  }
}

function keyupHandler(event) {
  // This remains the same.
  if (event.key === 'Alt') {
    event.preventDefault(); 
    event.stopImmediatePropagation();
    
    window.top.postMessage({
      type: 'SS_KEY_UP',
      key: event.key
    }, 'https://docs.google.com');
  }
}

window.addEventListener('keydown', keydownHandler, true);
window.addEventListener('keyup', keyupHandler, true);

// --- PART 2: RUNS IN TOP FRAME ONLY ---
if (window.self === window.top) {

  // --- 1. GLOBAL STATE & INITIALIZATION ---
  const tracker = new SheetTracker(15);
  let uiFrame = null;
  let modifierKeyPressed = false; // Tracks if Alt is *currently* held down
  let currentActiveSheet = null;
  let isUILoaded = false;
  let isUIVisible = false;
  let pendingShowMessage = null; 
  let lastAltDownTime = 0; // --- CHANGED: Now tracks DOWN time ---

  // --- 2. UI IFRAME MANAGEMENT ---
  // (This section is unchanged)
  function createUIFrame() {
    if (uiFrame) return uiFrame;
    const frame = document.createElement('iframe');
    frame.id = 'sheet-switcher-ui-frame';
    frame.src = chrome.runtime.getURL('src/ui/ui.html');
    frame.onload = () => {
      isUILoaded = true;
      if (pendingShowMessage) {
          frame.contentWindow.postMessage(pendingShowMessage, '*');
          pendingShowMessage = null;
      }
    };
    frame.style.position = 'fixed';
    frame.style.top = '0';
    frame.style.left = '0';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = 'none';
    frame.style.zIndex = '999999';
    frame.style.display = 'none';
    frame.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    document.body.appendChild(frame);
    return frame;
  }
  function getUIFrame() {
    if (!uiFrame) { uiFrame = createUIFrame(); }
    return uiFrame;
  }
  function hideUIFrame() {
    if (uiFrame) { uiFrame.style.display = 'none'; }
    isUIVisible = false;
  }
  function showUIFrame() {
    const frame = getUIFrame();
    frame.style.display = 'block';
    isUIVisible = true;
  }

  // --- 3. GOOGLE SHEETS DOM INTERACTION ---
  // (This section is unchanged, includes your focus fix)
  function getActiveSheetName() {
    const activeTab = document.querySelector('.docs-sheet-tab.docs-sheet-active-tab');
    if (activeTab) {
      const nameEl = activeTab.querySelector('.docs-sheet-tab-name');
      if (nameEl) { return nameEl.textContent; }
    }
    return null;
  }
  function switchSheet(sheetName) {
    const tabs = document.querySelectorAll('.docs-sheet-tab');
    for (const tab of tabs) {
      const nameEl = tab.querySelector('.docs-sheet-tab-name');
      if (nameEl && nameEl.textContent === sheetName) {
        const event = new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, view: window
        });
        tab.dispatchEvent(event);
        setTimeout(() => {
          const grid = document.querySelector('.waffle-grid-container, .grid-container');
          if (grid) { grid.focus({ preventScroll: true }); }
        }, 0); 
        return;
      }
    }
  }

  // --- 4. SHEET CHANGE DETECTION ---
  // (This section is unchanged)
  function handleSheetChange() {
    const newSheetName = getActiveSheetName();
    if (newSheetName && newSheetName !== currentActiveSheet) {
      currentActiveSheet = newSheetName;
      tracker.push(currentActiveSheet);
    }
  }
  function observeSheetChanges(tabListEl) {
    currentActiveSheet = getActiveSheetName();
    if (currentActiveSheet) {
      tracker.push(currentActiveSheet);
    }
    const observer = new MutationObserver(handleSheetChange);
    const config = {
      attributes: true, subtree: true, attributeFilter: ['class', 'aria-selected']
    };
    observer.observe(tabListEl, config);
    getUIFrame(); // Proactively create the UI frame
  }

  // --- 5. STARTUP: WAIT FOR TAB BAR TO EXIST ---
  // (This section is unchanged)
  const firstTabSelector = '.docs-sheet-tab';
  document.addEventListener('DOMContentLoaded', () => {
    const startupObserver = new MutationObserver((mutations, obs) => {
      const firstTab = document.querySelector(firstTabSelector);
      if (firstTab) {
        const tabList = firstTab.parentElement;
        if (tabList) {
          observeSheetChanges(tabList);
          obs.disconnect();
        }
      }
    });
    startupObserver.observe(document.documentElement, {
      childList: true, subtree: true
    });
  });

  // --- 6. TOP-FRAME KEY HANDLERS (REVISED LOGIC) ---
  
  function showSwitcherUI() {
    if (isUIVisible) return; 
    showUIFrame();
    const frame = getUIFrame();
    const uiWindow = frame.contentWindow;
    if (tracker.getRecents().length === 0) {
        currentActiveSheet = getActiveSheetName();
        if (currentActiveSheet) { tracker.push(currentActiveSheet); }
    }
    const sheets = tracker.getRecents(); 
    const uiData = sheets.map(sheetName => ({
      id: sheetName, sheet: sheetName
    }));
    if (uiData.length > 0) {
      const initialIndex = 0; 
      const showMessage = { type: 'SHOW', payload: uiData, initialIndex: initialIndex };
      if (isUILoaded) {
        uiWindow.postMessage(showMessage, '*');
      } else {
        pendingShowMessage = showMessage; 
      }
    }
  }
  
  // --- REVISED handleTopFrameKeydown ---
  function handleTopFrameKeydown(eventData) {
    if (eventData.key === 'Alt') {
      // Check if Alt is already held (to prevent key-repeat)
      if (modifierKeyPressed) return; 
      
      modifierKeyPressed = true;
      const now = new Date().getTime();
      
      // Check if this press is within 300ms of the last press
      if (now - lastAltDownTime < 300) {
        if (!isUIVisible) {
          showSwitcherUI();
        }
      }
      lastAltDownTime = now;
    }

    // Handle arrows (this part is unchanged)
    if (isUIVisible && uiFrame && isUILoaded) {
      switch (eventData.code) {
        case 'ArrowDown':
        case 'ArrowRight':
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_NEXT' }, '*');
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_PREV' }, '*');
          break;
      }
    }
  }

  // --- REVISED handleTopFrameKeyup ---
  function handleTopFrameKeyup(eventData) {
    if (eventData.key === 'Alt') {
      modifierKeyPressed = false;
      
      if (isUIVisible) {
        // Alt was released, so hide and select.
        if (isUILoaded && uiFrame) {
          uiFrame.contentWindow.postMessage({ type: 'GET_SELECTION_AND_HIDE' }, '*');
        }
      }
      // If UI is not visible, do nothing on keyup.
    }
  }

  // --- 7. MESSAGE LISTENER ---
  // (This section is unchanged)
  window.addEventListener('message', (event) => {
    if (event.origin !== "https://docs.google.com" && event.origin !== "chrome-extension://" + chrome.runtime.id) {
        if (uiFrame && event.source === uiFrame.contentWindow) {
             // This is a message from our UI iframe
        } else {
            return; // Ignore messages from other sources
        }
    }
    const { type, payload } = event.data;
    switch(type) {
        case 'SS_KEY_DOWN':
            handleTopFrameKeydown(event.data);
            break;
        case 'SS_KEY_UP':
            handleTopFrameKeyup(event.data);
            break;
        case 'UI_SELECTION':
            if (payload && payload.sheet && payload.sheet !== currentActiveSheet) {
                switchSheet(payload.sheet);
            }
            break;
        case 'UI_HIDDEN':
            hideUIFrame();
            break;
    }
  });

} // --- END if (window.self === window.top) ---
