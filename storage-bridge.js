(() => {
  'use strict';

  const ENABLED_STORAGE_KEY  = 'ketuviaEnabled';
  const DEBUG_STORAGE_KEY    = 'ketuviaDebug';
  const SETTINGS_STORAGE_KEY = 'ketuviaSettings';

  function syncEnabled(enabled) {
    document.documentElement.dataset.ketuviaEnabled = enabled ? '1' : '0';
    document.documentElement.dispatchEvent(new Event('ketuvia-enabled-sync'));
  }

  // Appearance settings reach the page the same way the on/off state does. The
  // popup writes them to storage and this hands them to inject.js through the
  // document, which works in every tab and needs no scripting injection.
  function syncSettings(settings) {
    if (!settings) return;
    document.documentElement.dataset.ketuviaSettings = JSON.stringify(settings);
    document.documentElement.dispatchEvent(new Event('ketuvia-settings-sync'));
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

  chrome.storage.local.get({ [SETTINGS_STORAGE_KEY]: null }, items => {
    if (chrome.runtime.lastError) return;
    if (items[SETTINGS_STORAGE_KEY]) {
      syncSettings(items[SETTINGS_STORAGE_KEY]);
      return;
    }
    // Settings used to be kept in the page's own localStorage. Carry them across
    // once so an existing user's choices survive the move to extension storage
    // instead of silently reverting to the defaults.
    let previous = null;
    try { previous = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null'); }
    catch {}
    if (previous) chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: previous });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[ENABLED_STORAGE_KEY]) {
      syncEnabled(changes[ENABLED_STORAGE_KEY].newValue !== false);
    }
    if (changes[DEBUG_STORAGE_KEY]) {
      syncDebug(changes[DEBUG_STORAGE_KEY].newValue === true);
    }
    if (changes[SETTINGS_STORAGE_KEY]) {
      syncSettings(changes[SETTINGS_STORAGE_KEY].newValue);
    }
  });
})();
