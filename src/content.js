// --- PART 1: RUNS IN ALL FRAMES (at document_start) ---
const frameId = (window.self === window.top) ? "TOP" : "CHILD";
let isSheetSwitcherUIVisible = false;

function keydownHandler(event) {
  if (event.altKey && (
    event.code === 'ArrowDown' ||
    event.code === 'ArrowRight' ||
    event.code === 'ArrowUp' ||
    event.code === 'ArrowLeft'
  )) {
    
    if (isSheetSwitcherUIVisible) {
      event.preventDefault();
    }
    
    event.stopImmediatePropagation();
    window.top.postMessage({
      type: 'SS_KEY_DOWN',
      key: event.key,
      code: event.code
    }, 'https://docs.google.com');

  } else if (event.key === 'Alt') {
    event.stopImmediatePropagation();
    window.top.postMessage({
      type: 'SS_KEY_DOWN',
      key: event.key,
      code: event.code
    }, 'https://docs.google.com');
  }
}

function keyupHandler(event) {
  if (event.key === 'Alt') {
    event.stopImmediatePropagation();
    window.top.postMessage({
      type: 'SS_KEY_UP',
      key: event.key
    }, 'https://docs.google.com');
  }
}

window.addEventListener('keydown', keydownHandler, true);
window.addEventListener('keyup', keyupHandler, true);

// --- NEW --- Message listener in ALL frames to sync UI state
window.addEventListener('message', (event) => {
  if (event.source !== window.top || event.origin !== 'https://docs.google.com') {
    return;
  }
  
  if (event.data.type === 'SS_UI_VISIBLE') {
    isSheetSwitcherUIVisible = true;
  } else if (event.data.type === 'SS_UI_HIDDEN') {
    isSheetSwitcherUIVisible = false;
  }
}, false);


// --- PART 2: RUNS IN TOP FRAME ONLY ---
if (window.self === window.top) {

  // --- 1. GLOBAL STATE & INITIALIZATION ---
  const tracker = new SheetTracker(15);
  let uiFrame = null;
  let modifierKeyPressed = false; 
  let currentActiveSheet = null;
  let isUILoaded = false;
  let isUIVisible = false; // This remains the top frame's source of truth
  let pendingShowMessage = null;
  let lastAltDownTime = 0; 

  // --- 2. UI IFRAME MANAGEMENT ---
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
    window.postMessage({ type: 'SS_UI_HIDDEN' }, 'https://docs.google.com');
  }

  function showUIFrame() {
    const frame = getUIFrame();
    frame.style.display = 'block';
    isUIVisible = true;
    window.postMessage({ type: 'SS_UI_VISIBLE' }, 'https://docs.google.com');
  }

  // --- 3. GOOGLE SHEETS DOM INTERACTION ---
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
        const downEvent = new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, view: window
        });
        const upEvent = new MouseEvent('mouseup', {
          bubbles: true, cancelable: true, view: window
        });
        tab.dispatchEvent(downEvent);
        tab.dispatchEvent(upEvent);
        setTimeout(() => {
          const grid = document.querySelector('.waffle-grid-container, .grid-container');
          if (grid) { grid.focus({ preventScroll: true }); }
        }, 0);
        return;
      }
    }
  }

  // --- 4. SHEET CHANGE DETECTION ---
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
    showUIFrame(); // This will now broadcast the 'visible' state
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
      const initialIndex = (uiData.length > 1) ? 1 : 0;
      const showMessage = { type: 'SHOW', payload: uiData, initialIndex: initialIndex };
      if (isUILoaded) {
        uiWindow.postMessage(showMessage, '*');
      } else {
        pendingShowMessage = showMessage;
      }
    }
  }

  function handleTopFrameKeydown(eventData) {
    if (eventData.key === 'Alt') {
      if (modifierKeyPressed) return;
      modifierKeyPressed = true;
      const now = new Date().getTime();
      if (now - lastAltDownTime < 300) {
        if (!isUIVisible) {
          showSwitcherUI();
        }
      }
      lastAltDownTime = now;
    }
    if (isUIVisible && uiFrame && isUILoaded) {
      switch (eventData.code) {
        case 'ArrowDown':
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_DOWN' }, '*');
          break;
        case 'ArrowRight':
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_NEXT' }, '*');
          break;
        case 'ArrowUp':
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_UP' }, '*');
          break;
        case 'ArrowLeft':
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_PREV' }, '*');
          break;
      }
    }
  }
  function handleTopFrameKeyup(eventData) {
    if (eventData.key === 'Alt') {
      modifierKeyPressed = false;
      if (isUIVisible) {
        if (isUILoaded && uiFrame) {
          uiFrame.contentWindow.postMessage({ type: 'GET_SELECTION_AND_HIDE' }, '*');
        }
      }
    }
  }

  // --- 7. MESSAGE LISTENER ---
  window.addEventListener('message', (event) => {
    if (event.origin !== "https://docs.google.com" && event.origin !== "chrome-extension://" + chrome.runtime.id) {
      if (uiFrame && event.source === uiFrame.contentWindow) {
      } else {
        return;
      }
    }

    const { type, payload } = event.data;
    switch (type) {
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

}
