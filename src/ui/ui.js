// --- UI LOGIC ---
document.addEventListener('DOMContentLoaded', () => {

  const container = document.getElementById('worksheet-cycler-container');
  const listElement = document.getElementById('cycler-list');

  const sheetsIconSvg = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z" fill="white"/>
            <path d="M10 19H12V17H14V15H12V13H10V15H8V17H10V19ZM12 10H8V12H12V10Z" fill="white"/>
        </svg>
    `;

  let currentItems = [];
  let activeIndex = 0;
  let isVisible = false;

  // --- Internal Functions ---

  function createItemElement(item, index) {
    const li = document.createElement('li');
    li.className = 'cycler-item';
    li.dataset.index = index;
    li.dataset.id = item.id || `item-${index}`;
    li.innerHTML = `
            <div class="cycler-item-icon">
                ${sheetsIconSvg}
            </div>
            <div class="cycler-item-text">
                <p class="cycler-item-title">${item.sheet || 'Sheet1'}</p>
            </div>
        `;
    return li;
  }

  function renderItems(items) {
    if (!listElement) return;
    currentItems = items;
    listElement.innerHTML = '';
    items.forEach((item, index) => {
      const itemEl = createItemElement(item, index);
      listElement.appendChild(itemEl);
    });
  }

  function setActiveItem(index) {
    if (!listElement || index < 0 || index >= currentItems.length) return;

    activeIndex = index;

    listElement.querySelectorAll('.cycler-item').forEach(item => {
      item.classList.remove('active');
    });

    const activeEl = listElement.querySelector(`.cycler-item[data-index="${index}"]`);
    if (activeEl) {
      activeEl.classList.add('active');
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function showWorksheetCycler(items, initialIndex = 0) {
    if (!container) return;
    renderItems(items);
    setActiveItem(initialIndex);
    container.classList.add('visible');
    isVisible = true;
  };

  function hideWorksheetCycler() {
    if (!container) return;
    container.classList.remove('visible');
    isVisible = false;
    // Notify parent that UI is hidden
    window.parent.postMessage({ type: 'UI_HIDDEN' }, '*');
  };

  function cycleNextWorksheet() {
    if (!isVisible || currentItems.length === 0) return;
    let nextIndex = (activeIndex + 1) % currentItems.length;
    setActiveItem(nextIndex);
  };

  function cyclePreviousWorksheet() {
    if (!isVisible || currentItems.length === 0) return;
    let prevIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
    setActiveItem(prevIndex);
  };

  function getNumberOfColumns() {
    if (!listElement || listElement.children.length <= 1) {
      return 1;
    }
    const items = listElement.children;
    const firstItemTop = items[0].offsetTop;
    let cols = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].offsetTop === firstItemTop) {
        cols++;
      } else {
        // Found first item on the next row, so return count
        return cols > 0 ? cols : 1;
      }
    }
    // All items are on one row
    return cols > 0 ? cols : 1;
  }

  function cycleUpWorksheet() {
    if (!isVisible || currentItems.length === 0) return;
    const cols = getNumberOfColumns();
    if (cols <= 0) { cyclePreviousWorksheet(); return; } // Fallback

    let prevIndex = activeIndex - cols;
    if (prevIndex < 0) {
      // Wrapped. Go to the last row, in the same column if possible.
      const colIndex = activeIndex % cols;
      prevIndex = (Math.floor((currentItems.length - 1) / cols) * cols) + colIndex;
      // If that column doesn't exist in the last row, go to the last item
      if (prevIndex >= currentItems.length) {
        prevIndex = currentItems.length - 1;
      }
    }
    setActiveItem(prevIndex);
  };

  function cycleDownWorksheet() {
    if (!isVisible || currentItems.length === 0) return;
    const cols = getNumberOfColumns();
    if (cols <= 0) { cycleNextWorksheet(); return; } // Fallback

    let nextIndex = activeIndex + cols;
    if (nextIndex >= currentItems.length) {
      // Wrapped. Go to the first row, in the same column.
      nextIndex = activeIndex % cols;
    }
    setActiveItem(nextIndex);
  };

  function getSelectedWorksheet() {
    if (!isVisible || !listElement) return null;
    const activeEl = listElement.querySelector('.cycler-item.active');
    return activeEl ? currentItems[parseInt(activeEl.dataset.index)] : null;
  };

  // --- Message Listener ---
  window.addEventListener('message', (event) => {
    // --- CHANGE ---
    // Security check. Must match the origin of content.js, which is https://docs.google.com
    if (event.origin !== 'https://docs.google.com') {
      return;
    }

    const { type, payload, initialIndex } = event.data;

    switch (type) {
      case 'SHOW':
        showWorksheetCycler(payload, initialIndex);
        break;
      case 'CYCLE_NEXT':
        cycleNextWorksheet();
        break;
      case 'CYCLE_PREV':
        cyclePreviousWorksheet();
        break;
      case 'CYCLE_UP':
        cycleUpWorksheet();
        break;
      case 'CYCLE_DOWN':
        cycleDownWorksheet();
        break;
      case 'GET_SELECTION_AND_HIDE':
        const selected = getSelectedWorksheet();
        window.parent.postMessage({ type: 'UI_SELECTION', payload: selected }, '*');
        hideWorksheetCycler();
        break;
    }
  });

});
