(() => {
  'use strict';

  const ENABLED_STORAGE_KEY = 'ketuviaEnabled';
  const DEBUG_STORAGE_KEY   = 'ketuviaDebug';

  function syncEnabled(enabled) {
    document.documentElement.dataset.ketuviaEnabled = enabled ? '1' : '0';
    document.documentElement.dispatchEvent(new Event('ketuvia-enabled-sync'));
  }

  function syncDebug(enabled) {
    document.documentElement.dataset.ketuviaDebug = enabled ? '1' : '0';
    document.documentElement.dispatchEvent(new Event('ketuvia-debug-change'));
  }

  chrome.storage.local.get({ [ENABLED_STORAGE_KEY]: true }, items => {
    if (chrome.runtime.lastError) return;
    syncEnabled(items[ENABLED_STORAGE_KEY] !== false);
  });

  chrome.storage.local.get({ [DEBUG_STORAGE_KEY]: false }, items => {
    if (chrome.runtime.lastError) return;
    syncDebug(items[DEBUG_STORAGE_KEY] === true);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[ENABLED_STORAGE_KEY]) {
      syncEnabled(changes[ENABLED_STORAGE_KEY].newValue !== false);
    }
    if (areaName === 'local' && changes[DEBUG_STORAGE_KEY]) {
      syncDebug(changes[DEBUG_STORAGE_KEY].newValue === true);
    }
  });
})();
