const toggle = document.getElementById('debug-toggle');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runInTab(tabId, enabled) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: nextEnabled => {
      const host = window.location.hostname;
      const isYouTube = host === 'youtube.com' ||
        host === 'www.youtube.com' ||
        host === 'm.youtube.com';

      if (!isYouTube) return null;

      if (typeof nextEnabled === 'boolean') {
        window.__ketuviaDebugEnabled = nextEnabled;
        window.dispatchEvent(new CustomEvent('ketuvia-debug-change', {
          detail: { enabled: nextEnabled },
        }));
      }

      return Boolean(window.__ketuviaDebugEnabled);
    },
    args: [enabled],
  });

  return result;
}

async function syncFromTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const enabled = await runInTab(tab.id);
  if (enabled !== null) {
    toggle.checked = enabled;
  }
}

toggle.addEventListener('change', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const enabled = await runInTab(tab.id, toggle.checked);
    if (enabled !== null) {
      toggle.checked = enabled;
    }
  } catch {
    toggle.checked = !toggle.checked;
  }
});

syncFromTab().catch(() => {});
