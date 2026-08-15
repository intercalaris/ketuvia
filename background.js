// Opens the welcome page on install, and again only when the major version changes, so 4.2 to 4.3 is silent but 4.x to 5.0 says hello again.
const SEEN_KEY = 'ketuviaWelcomeSeen';
const SEEN_MAJOR_KEY = 'ketuviaWelcomeMajor';
const LEGACY_FLAG_MAJOR = 4;

function majorOf(version) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  return Number.isFinite(major) ? major : 0;
}

// Returns the major version to record, or null to stay quiet. Kept separate so it can be tested without a browser.
function welcomeDecision(currentMajor, storedMajor, legacySeen) {
  // The plain flag was only ever written by version 4, so that is the major it stands for, even if the next update jumps to 5.
  const seen = Number.isFinite(storedMajor) ? storedMajor : (legacySeen ? LEGACY_FLAG_MAJOR : null);
  if (seen === null) return { show: true, record: currentMajor };
  if (currentMajor > seen) return { show: true, record: currentMajor };
  return { show: false, record: seen };
}

if (typeof module !== 'undefined') module.exports = { majorOf, welcomeDecision };

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== 'install' && reason !== 'update') return;

    const currentMajor = majorOf(chrome.runtime.getManifest().version);
    try {
      const stored = await chrome.storage.local.get({ [SEEN_KEY]: false, [SEEN_MAJOR_KEY]: null });
      const decision = welcomeDecision(currentMajor, stored[SEEN_MAJOR_KEY], stored[SEEN_KEY] === true);

      if (!decision.show) {
        // Carry an older install's plain flag onto the major it was seen for, so this stays a one-per-major decision.
        if (!Number.isFinite(stored[SEEN_MAJOR_KEY])) {
          await chrome.storage.local.set({ [SEEN_MAJOR_KEY]: decision.record });
        }
        return;
      }

      // Open first, then record it, so a failed tab leaves the flag unset and they get another chance. Seeing it twice beats never seeing it.
      await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
      await chrome.storage.local.set({ [SEEN_MAJOR_KEY]: decision.record, [SEEN_KEY]: true });
    } catch {
      // A failed welcome is never worth breaking the extension over.
    }
  });
}
