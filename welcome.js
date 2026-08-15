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

// The panel is the real settings popup in an iframe. Measure it rather than hard-coding a size that goes stale whenever the popup gains a row.
const panel = document.querySelector('.panel iframe');

function fitPanel() {
  const doc = panel && panel.contentDocument;
  if (!doc || !doc.body) return;
  const box = doc.body.getBoundingClientRect();
  if (!box.width || !box.height) return;
  panel.style.width = Math.ceil(box.width) + 'px';
  panel.style.height = Math.ceil(box.height) + 'px';
}

if (panel) {
  panel.addEventListener('load', () => {
    fitPanel();
    setTimeout(fitPanel, 150);
    setTimeout(fitPanel, 600);
  });
  fitPanel();
}
