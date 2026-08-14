// Opens the welcome page once, and only once.
//
// On a fresh install that is obvious. It also opens for people who already had
// Ketuvia before the welcome page existed, because until now nothing ever told
// them the settings existed at all: a user reported hunting through the add-ons
// manager, finding no options, and concluding there were none. The stored flag
// means nobody sees it twice, however many times they update afterwards.
const SEEN_KEY = 'ketuviaWelcomeSeen';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;

  try {
    const stored = await chrome.storage.local.get({ [SEEN_KEY]: false });
    if (stored[SEEN_KEY]) return;
    // Open first, then record it. If the tab cannot be opened, the flag stays
    // unset and they get another chance on the next update. Seeing this twice is
    // a much better failure than never seeing it.
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    await chrome.storage.local.set({ [SEEN_KEY]: true });
  } catch {
    // A failed welcome is never worth breaking the extension over.
  }
});
