(() => {
  'use strict';

  const ENABLED_STORAGE_KEY = 'ketuviaEnabled';
  const DEBUG_STORAGE_KEY   = 'ketuviaDebug';
  const debugStorage = chrome.storage.session ?? chrome.storage.local;

  function syncEnabled(enabled) {
    document.documentElement.dataset.ketuviaEnabled = enabled ? '1' : '0';
    document.documentElement.dispatchEvent(new Event('ketuvia-enabled-sync'));
  }

  function syncDebug(enabled) {
    document.documentElement.dispatchEvent(new CustomEvent('ketuvia-debug-change', {
      bubbles: true,
      detail: { enabled: Boolean(enabled) },
    }));
  }

  chrome.storage.local.get({ [ENABLED_STORAGE_KEY]: true }, items => {
    if (chrome.runtime.lastError) return;
    syncEnabled(items[ENABLED_STORAGE_KEY] !== false);
  });

  debugStorage.get({ [DEBUG_STORAGE_KEY]: false }, items => {
    if (chrome.runtime.lastError) return;
    syncDebug(items[DEBUG_STORAGE_KEY] === true);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[ENABLED_STORAGE_KEY]) {
      syncEnabled(changes[ENABLED_STORAGE_KEY].newValue !== false);
    }
    const debugArea = chrome.storage.session ? 'session' : 'local';
    if (areaName === debugArea && changes[DEBUG_STORAGE_KEY]) {
      syncDebug(changes[DEBUG_STORAGE_KEY].newValue === true);
    }
  });
})();
