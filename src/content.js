// --- PART 1: RUNS IN ALL FRAMES (at document_start) ---
const frameId = (window.self === window.top) ? "TOP" : "CHILD";

function keydownHandler(event) {
  const modifierKey = event.metaKey || event.altKey;
  if (modifierKey && (
    event.code === 'Backquote' || 
    event.code === 'ArrowDown' || 
    event.code === 'ArrowRight' || 
    event.code === 'ArrowUp' || 
    event.code === 'ArrowLeft'
  )) {
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
  if (event.key === 'Meta' || event.key === 'Alt') {
    event.preventDefault(); 
    event.stopImmediatePropagation();
    
    window.top.postMessage({
      type: 'SS_KEY_UP',
      key: event.key
    }, 'https://docs.google.com');
  }
}

// Final defense against the backtick bleed-through
// function beforeInputHandler(event) {
//     const modifierKey = event.metaKey || event.altKey;
//     if (modifierKey && event.data === '`') {
//         event.preventDefault();
//         event.stopImmediatePropagation();
//     }
// }

window.addEventListener('keydown', keydownHandler, true);
window.addEventListener('keyup', keyupHandler, true);
// window.addEventListener('beforeinput', beforeInputHandler, true);


// --- PART 2: RUNS IN TOP FRAME ONLY ---
if (window.self === window.top) {

  // --- 1. GLOBAL STATE & INITIALIZATION ---
  const tracker = new SheetTracker(15);
  let uiFrame = null;
  let modifierKeyPressed = false; // Tracks Alt OR Cmd
  let currentActiveSheet = null;
  let isUILoaded = false;
  let isUIVisible = false;
  let pendingShowMessage = null; 

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
    if (!uiFrame) {
      uiFrame = createUIFrame();
    }
    return uiFrame;
  }

  function hideUIFrame() {
    if (uiFrame) {
      uiFrame.style.display = 'none';
    }
    isUIVisible = false;
  }

  function showUIFrame() {
    const frame = getUIFrame();
    frame.style.display = 'block';
    isUIVisible = true;
  }

  // --- 3. GOOGLE SHEETS DOM INTERACTION ---
  function getActiveSheetName() {
    const activeTab = document.querySelector('.docs-sheet-tab.docs-sheet-active-tab');
    if (activeTab) {
      const nameEl = activeTab.querySelector('.docs-sheet-tab-name');
      if (nameEl) {
        return nameEl.textContent;
      }
    }
    return null;
  }

  function switchSheet(sheetName) {
    const tabs = document.querySelectorAll('.docs-sheet-tab');
    for (const tab of tabs) {
      const nameEl = tab.querySelector('.docs-sheet-tab-name');
      if (nameEl && nameEl.textContent === sheetName) {
        const event = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        tab.dispatchEvent(event);
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
      attributes: true, 
      subtree: true,
      attributeFilter: ['class', 'aria-selected']
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
          observeSheetChanges(tabList); // Attach our real observer
          obs.disconnect(); // Stop this startup observer
        }
      }
    });

    startupObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });


  // --- 6. TOP-FRAME KEY HANDLERS ---
  
  function handleTopFrameKeydown(eventData) {
    if (!modifierKeyPressed) {
      modifierKeyPressed = true;
    }
    
    if (eventData.code === 'Backquote') {
      if (!isUIVisible) {
        showUIFrame();
        const frame = getUIFrame();
        const uiWindow = frame.contentWindow;

        // Manually populate tracker if it's empty
        if (tracker.getRecents().length === 0) {
            currentActiveSheet = getActiveSheetName();
            if (currentActiveSheet) {
                tracker.push(currentActiveSheet);
            }
        }
        
        const sheets = tracker.getRecents(); 
        const spreadsheetTitle = document.title.replace(' - Google Sheets', '');
        const uiData = sheets.map(sheetName => ({
          id: sheetName,
          title: spreadsheetTitle,
          sheet: sheetName
        }));
        
        if (uiData.length > 0) {
          const initialIndex = uiData.length > 1 ? 1 : 0;
          const showMessage = { type: 'SHOW', payload: uiData, initialIndex: initialIndex };

          if (isUILoaded) {
            uiWindow.postMessage(showMessage, '*');
          } else {
            pendingShowMessage = showMessage; 
          }
        }
      } else {
        // UI is already visible, just cycle
        if (uiFrame && isUILoaded) {
          uiFrame.contentWindow.postMessage({ type: 'CYCLE_NEXT' }, '*');
        }
      }
    }

    // Handle arrows only if UI is visible
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

  function handleTopFrameKeyup(eventData) {
    if (eventData.key === 'Meta' || eventData.key === 'Alt') {
      modifierKeyPressed = false;
      
      if (!isUIVisible) {
        hideUIFrame(); 
        return;
      }

      if (isUILoaded && uiFrame) {
        uiFrame.contentWindow.postMessage({ type: 'GET_SELECTION_AND_HIDE' }, '*');
      }
    }
  }

  // --- 7. MESSAGE LISTENER ---
  window.addEventListener('message', (event) => {
    
    // Security: Only accept messages from our extension or the page itself
    if (event.origin !== "https://docs.google.com" && event.origin !== "chrome-extension://" + chrome.runtime.id) {
        // Check for iframe message
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
