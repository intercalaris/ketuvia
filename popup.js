const DEFAULT_SETTINGS = {
  textSize: 'medium',
  targetLines: 2,
  background: 'medium',
  position: 'center-low',
  font: 'atkinson',
  allCaps: false,
};

const toggle = document.getElementById('debug-toggle');
const ketuviaOn = document.getElementById('ketuvia-on');
const ketuviaOff = document.getElementById('ketuvia-off');
const capsToggle = document.getElementById('caps-toggle');
const reset = document.getElementById('reset');
const ENABLED_STORAGE_KEY = 'ketuviaEnabled';
const DEBUG_STORAGE_KEY = 'ketuviaDebug';
const debugStorage = chrome.storage.session ?? chrome.storage.local;

function normalizeSettings(settings) {
  const textSize = ['small', 'medium', 'large'].includes(settings?.textSize)
    ? settings.textSize
    : DEFAULT_SETTINGS.textSize;
  const targetLines = [1, 2, 3].includes(Number(settings?.targetLines))
    ? Number(settings.targetLines)
    : DEFAULT_SETTINGS.targetLines;
  const background = ['light', 'medium', 'dark'].includes(settings?.background)
    ? settings.background
    : DEFAULT_SETTINGS.background;
  const font = ['atkinson', 'cascadia', 'noto', 'average', 'roboto', 'bona'].includes(settings?.font)
    ? settings.font
    : DEFAULT_SETTINGS.font;
  const allCaps = Boolean(settings?.allCaps);
  const position = [
    'left-top', 'center-top', 'right-top',
    'left-high', 'center-high', 'right-high',
    'left-highish', 'center-highish', 'right-highish',
    'left-middle', 'center-middle', 'right-middle',
    'left-lowish', 'center-lowish', 'right-lowish',
    'left-low', 'center-low', 'right-low',
    'left-bottom', 'center-bottom', 'right-bottom',
  ].includes(settings?.position)
    ? settings.position
    : DEFAULT_SETTINGS.position;

  return { textSize, targetLines, background, position, font, allCaps };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getGlobalEnabled() {
  const items = await chrome.storage.local.get({ [ENABLED_STORAGE_KEY]: true });
  return items[ENABLED_STORAGE_KEY] !== false;
}

async function setGlobalEnabled(enabled) {
  await chrome.storage.local.set({ [ENABLED_STORAGE_KEY]: Boolean(enabled) });
}

async function runInTab(payload = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;

  let result = null;
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: nextPayload => {
        const host = window.location.hostname;
        const isYouTube = host === 'youtube.com' ||
          host === 'www.youtube.com' ||
          host === 'm.youtube.com';

        if (!isYouTube) return null;

        if (nextPayload.settings) {
          if (typeof window.__ketuviaApplySettings === 'function') {
            window.__ketuviaApplySettings(nextPayload.settings);
          } else {
            window.dispatchEvent(new CustomEvent('ketuvia-settings-change', {
              detail: nextPayload.settings,
            }));
          }
        }

        if (typeof nextPayload.debug === 'boolean') {
          window.__ketuviaDebugEnabled = nextPayload.debug;
          window.dispatchEvent(new CustomEvent('ketuvia-debug-change', {
            detail: { enabled: nextPayload.debug },
          }));
        }

        return {
          debug: Boolean(window.__ketuviaDebugEnabled),
          settings: window.__ketuviaSettings || null,
        };
      },
      args: [payload],
    });
  } catch {
    return null;
  }

  return result;
}

function renderSettings(settings) {
  const normalized = normalizeSettings(settings);

  document.querySelectorAll('.segments:not(.ketuvia-segments)').forEach(group => {
    const setting = group.dataset.setting;
    group.querySelectorAll('button').forEach(button => {
      button.dataset.active =
        String(normalized[setting]) === button.dataset.value ? '1' : '0';
    });
  });

  document.querySelectorAll('.position-grid button').forEach(button => {
    button.dataset.active =
      normalized.position === button.dataset.value ? '1' : '0';
  });

  document.querySelectorAll('.font-list button').forEach(button => {
    button.dataset.active =
      normalized.font === button.dataset.value ? '1' : '0';
  });

  capsToggle.checked = normalized.allCaps;
}

function renderEnabled(enabled) {
  ketuviaOn.dataset.active = enabled ? '1' : '0';
  ketuviaOff.dataset.active = enabled ? '0' : '1';
}

async function syncFromTab() {
  renderEnabled(await getGlobalEnabled());

  const items = await debugStorage.get({ [DEBUG_STORAGE_KEY]: false });
  toggle.checked = items[DEBUG_STORAGE_KEY] === true;

  const result = await runInTab();
  if (!result) return;
  renderSettings(result.settings);
}

document.querySelectorAll('.segments:not(.ketuvia-segments) button').forEach(button => {
  button.addEventListener('click', async () => {
    const group = button.closest('.segments');
    const next = normalizeSettings({
      textSize: document.querySelector('[data-setting="textSize"] button[data-active="1"]')?.dataset.value,
      targetLines: document.querySelector('[data-setting="targetLines"] button[data-active="1"]')?.dataset.value,
      background: document.querySelector('[data-setting="background"] button[data-active="1"]')?.dataset.value,
      position: document.querySelector('[data-setting="position"] button[data-active="1"]')?.dataset.value,
      font: document.querySelector('[data-setting="font"] button[data-active="1"]')?.dataset.value,
      allCaps: document.getElementById('caps-toggle')?.checked,
      [group.dataset.setting]: button.dataset.value,
    });

    renderSettings(next);
    const result = await runInTab({ settings: next });
    if (result?.settings) {
      renderSettings(result.settings);
    }
  });
});

document.querySelectorAll('.position-grid button').forEach(button => {
  button.addEventListener('click', async () => {
    const next = normalizeSettings({
      textSize: document.querySelector('[data-setting="textSize"] button[data-active="1"]')?.dataset.value,
      targetLines: document.querySelector('[data-setting="targetLines"] button[data-active="1"]')?.dataset.value,
      background: document.querySelector('[data-setting="background"] button[data-active="1"]')?.dataset.value,
      font: document.querySelector('[data-setting="font"] button[data-active="1"]')?.dataset.value,
      allCaps: document.getElementById('caps-toggle')?.checked,
      position: button.dataset.value,
    });

    renderSettings(next);
    const result = await runInTab({ settings: next });
    if (result?.settings) {
      renderSettings(result.settings);
    }
  });
});

document.querySelectorAll('.font-list button').forEach(button => {
  button.addEventListener('click', async () => {
    const next = normalizeSettings({
      textSize: document.querySelector('[data-setting="textSize"] button[data-active="1"]')?.dataset.value,
      targetLines: document.querySelector('[data-setting="targetLines"] button[data-active="1"]')?.dataset.value,
      background: document.querySelector('[data-setting="background"] button[data-active="1"]')?.dataset.value,
      position: document.querySelector('[data-setting="position"] button[data-active="1"]')?.dataset.value,
      font: button.dataset.value,
      allCaps: document.getElementById('caps-toggle')?.checked,
    });

    renderSettings(next);
    const result = await runInTab({ settings: next });
    if (result?.settings) {
      renderSettings(result.settings);
    }
  });
});

reset.addEventListener('click', async () => {
  renderSettings(DEFAULT_SETTINGS);
  toggle.checked = false;
  renderEnabled(true);
  await setGlobalEnabled(true);
  await debugStorage.set({ [DEBUG_STORAGE_KEY]: false });
  const result = await runInTab({ settings: DEFAULT_SETTINGS });
  if (result?.settings) {
    renderSettings(result.settings);
  }
});

capsToggle.addEventListener('change', async () => {
  const next = normalizeSettings({
    textSize: document.querySelector('[data-setting="textSize"] button[data-active="1"]')?.dataset.value,
    targetLines: document.querySelector('[data-setting="targetLines"] button[data-active="1"]')?.dataset.value,
    background: document.querySelector('[data-setting="background"] button[data-active="1"]')?.dataset.value,
    position: document.querySelector('[data-setting="position"] button[data-active="1"]')?.dataset.value,
    font: document.querySelector('[data-setting="font"] button[data-active="1"]')?.dataset.value,
    allCaps: capsToggle.checked,
  });

  renderSettings(next);
  const result = await runInTab({ settings: next });
  if (result?.settings) {
    renderSettings(result.settings);
  }
});

toggle.addEventListener('change', async () => {
  try {
    await debugStorage.set({ [DEBUG_STORAGE_KEY]: toggle.checked });
  } catch {
    toggle.checked = !toggle.checked;
  }
});

async function updateEnabled(enabled) {
  renderEnabled(enabled);
  try {
    await setGlobalEnabled(enabled);
  } catch {
    renderEnabled(!enabled);
  }
}

ketuviaOn.addEventListener('click', () => updateEnabled(true));
ketuviaOff.addEventListener('click', () => updateEnabled(false));

renderSettings(DEFAULT_SETTINGS);
syncFromTab().catch(() => {});
