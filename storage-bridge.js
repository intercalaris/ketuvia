(() => {
  'use strict';

  const ENABLED_STORAGE_KEY = 'ketuviaEnabled';

  function syncEnabled(enabled) {
    document.documentElement.dataset.ketuviaEnabled = enabled ? '1' : '0';
    document.documentElement.dispatchEvent(new Event('ketuvia-enabled-sync'));
  }

  chrome.storage.local.get({ [ENABLED_STORAGE_KEY]: true }, items => {
    syncEnabled(items[ENABLED_STORAGE_KEY] !== false);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[ENABLED_STORAGE_KEY]) return;
    syncEnabled(changes[ENABLED_STORAGE_KEY].newValue !== false);
  });
})();
