/**
 * Factory for simple localStorage-backed services (getAll / save).
 * @param {string} key - The localStorage key to read/write.
 */
export function createLocalStorageService(key) {
  return {
    getAll: () => JSON.parse(localStorage.getItem(key) || '[]'),
    save: (data) => { localStorage.setItem(key, JSON.stringify(data)); },
  };
}
