// Shows only the instructions that match the browser you are reading this in,
// since Firefox and Chrome name the pinning controls differently.
const isFirefox = navigator.userAgent.includes('Firefox');
document.body.dataset.browser = isFirefox ? 'firefox' : 'chrome';

document.getElementById('close').addEventListener('click', async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {}
  window.close();
});
