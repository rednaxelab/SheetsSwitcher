class SheetTracker {
  queue = new Array();
  maxSize = 4;
  constructor(maxSize = 10) { // Increased default max size
    this.maxSize = maxSize;
  }
  
  /**
   * Adds a value to the recent-items queue.
   * If the value already exists, it's moved to the end (most recent).
   * @param {string} value - The sheet name to track.
   */
  push(value) {
    // Filter out any existing instance of the value
    let a = this.queue.filter(v => v !== value);
    
    // Add the new value to the end (most recent)
    a.push(value);
    
    // Trim the array from the front (oldest) if it's too large
    while (a.length > this.maxSize) {
      a.shift();
    }
    this.queue = a;
  }
  
  /**
   * Returns the queue, ordered from most recent to least recent.
   * @returns {Array<string>}
   */
  getRecents() {
    // The queue is already [oldest, ..., newest]
    // We reverse it for the UI, which wants [newest, ..., oldest]
    return [...this.queue].reverse();
  }
}
