// Opens the welcome page once and only once, on install and on the update that introduces it, since existing users were never told the settings exist at all.
const SEEN_KEY = 'ketuviaWelcomeSeen';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;

  try {
    const stored = await chrome.storage.local.get({ [SEEN_KEY]: false });
    if (stored[SEEN_KEY]) return;
    // Open first, then record it, so a failed tab leaves the flag unset and they get another chance. Seeing it twice beats never seeing it.
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    await chrome.storage.local.set({ [SEEN_KEY]: true });
  } catch {
    // A failed welcome is never worth breaking the extension over.
  }
});
