async function syncFromStorage() {
  renderEnabled(await getGlobalEnabled());
  const items = await debugStorage.get({ [DEBUG_STORAGE_KEY]: false });
  toggle.checked = items[DEBUG_STORAGE_KEY] === true;
  await ready;
}

const DEFAULT_SETTINGS = {
  textSize: 'medium',
  targetLines: 2,
  textColor: 'white',
  textOpacity: 100,
  captionWidth: 'auto',
  background: 50,
  textOutline: false,
  textBold: false,
  position: 'center-low',
  font: 'atkinson',
  allCaps: false,
};

const toggle = document.getElementById('debug-toggle');
const ketuviaOn = document.getElementById('ketuvia-on');
const ketuviaOff = document.getElementById('ketuvia-off');
const capsToggle = document.getElementById('caps-toggle');
const outlineToggle = document.getElementById('outline-toggle');
const boldToggle = document.getElementById('bold-toggle');
const reset = document.getElementById('reset');
const version = document.getElementById('version');
if (version) version.textContent = 'v' + chrome.runtime.getManifest().version;
const ENABLED_STORAGE_KEY  = 'ketuviaEnabled';
const SETTINGS_STORAGE_KEY = 'ketuviaSettings';
const DEBUG_STORAGE_KEY = 'ketuviaDebug';
const debugStorage = chrome.storage.local;

function normalizeSettings(settings) {
  const textSize = ['small', 'medium', 'large', 'xlarge', 'xxlarge'].includes(settings?.textSize)
    ? settings.textSize
    : DEFAULT_SETTINGS.textSize;
  // Four and five lines are gone, so a stored 4 or 5 lands on three rather than snapping back to the default.
  const targetLines = [1, 2, 3].includes(Number(settings?.targetLines))
    ? Number(settings.targetLines)
    : (Number(settings?.targetLines) >= 4 ? 3 : DEFAULT_SETTINGS.targetLines);
  const textColor = ['white', 'yellow', 'green', 'cyan'].includes(settings?.textColor)
    ? settings.textColor
    : DEFAULT_SETTINGS.textColor;
  const textOpacity = [100, 75, 50].includes(Number(settings?.textOpacity))
    ? Number(settings.textOpacity)
    : DEFAULT_SETTINGS.textOpacity;
  const legacy = { light: 25, medium: 50, dark: 75 };
  const rawBg = settings?.background ?? DEFAULT_SETTINGS.background;
  const rawBackground = Object.hasOwn(legacy, String(rawBg))
    ? legacy[String(rawBg)]
    : Number(rawBg);
  const background = [0, 25, 50, 75, 100].includes(rawBackground)
    ? rawBackground
    : DEFAULT_SETTINGS.background;
  // 3/4 is gone; a stored 3/4 lands on the next widest rather than snapping back to Auto.
  const storedWidth = settings?.captionWidth === 'threequarters' ? 'twothirds' : settings?.captionWidth;
  const captionWidth = ['auto', 'third', 'half', 'twothirds'].includes(storedWidth)
    ? storedWidth
    : DEFAULT_SETTINGS.captionWidth;
  const font = ['atkinson', 'cascadia', 'noto', 'average', 'roboto', 'bona'].includes(settings?.font)
    ? settings.font
    : DEFAULT_SETTINGS.font;
  const allCaps = Boolean(settings?.allCaps);
  const textOutline = Boolean(settings?.textOutline);
  const textBold = Boolean(settings?.textBold);
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

  return { textSize, targetLines, background, position, font, allCaps, textColor, textOpacity, captionWidth, textOutline, textBold };
}

async function getGlobalEnabled() {
  const items = await chrome.storage.local.get({ [ENABLED_STORAGE_KEY]: true });
  return items[ENABLED_STORAGE_KEY] !== false;
}

async function setGlobalEnabled(enabled) {
  await chrome.storage.local.set({ [ENABLED_STORAGE_KEY]: Boolean(enabled) });
}

// Settings travel like the on/off state: written to storage here, handed to the page by storage-bridge.js. That reaches every YouTube tab, not just the active one.
async function loadSettings() {
  const items = await chrome.storage.local.get({ [SETTINGS_STORAGE_KEY]: null });
  return normalizeSettings(items[SETTINGS_STORAGE_KEY]);
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

// The settings themselves, not whatever the buttons happen to show. Reading state back out of the DOM meant a click
// landing before the stored values arrived saved the defaults over them, which looked like colours and sizes reverting.
let settings = null;
const ready = loadSettings().then(loaded => {
  settings = loaded;
  renderSettings(loaded);
  return loaded;
}).catch(() => DEFAULT_SETTINGS);

async function changeSettings(overrides) {
  const base = settings || await ready || DEFAULT_SETTINGS;
  const next = normalizeSettings({ ...base, ...overrides });
  settings = next;
  renderSettings(next);
  try {
    await saveSettings(next);
  } catch {
    settings = await loadSettings();
    renderSettings(settings);
  }
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
  if (outlineToggle) outlineToggle.checked = normalized.textOutline;
  if (boldToggle) boldToggle.checked = normalized.textBold;
}

function renderEnabled(enabled) {
  ketuviaOn.dataset.active = enabled ? '1' : '0';
  ketuviaOff.dataset.active = enabled ? '0' : '1';
}

async function syncFromStorage() {
  renderEnabled(await getGlobalEnabled());

  const items = await debugStorage.get({ [DEBUG_STORAGE_KEY]: false });
  toggle.checked = items[DEBUG_STORAGE_KEY] === true;

  renderSettings(await loadSettings());
}

document.querySelectorAll('.segments:not(.ketuvia-segments) button').forEach(button => {
  button.addEventListener('click', () => changeSettings({
    [button.closest('.segments').dataset.setting]: button.dataset.value,
  }));
});

document.querySelectorAll('.position-grid button').forEach(button => {
  button.addEventListener('click', () => changeSettings({ position: button.dataset.value }));
});

document.querySelectorAll('.font-list button').forEach(button => {
  button.addEventListener('click', () => changeSettings({ font: button.dataset.value }));
});

capsToggle.addEventListener('change', () => changeSettings({ allCaps: capsToggle.checked }));
if (outlineToggle) outlineToggle.addEventListener('change', () => changeSettings({ textOutline: outlineToggle.checked }));
if (boldToggle) boldToggle.addEventListener('change', () => changeSettings({ textBold: boldToggle.checked }));

reset.addEventListener('click', async () => {
  settings = { ...DEFAULT_SETTINGS };
  renderSettings(DEFAULT_SETTINGS);
  toggle.checked = false;
  renderEnabled(true);
  await setGlobalEnabled(true);
  await debugStorage.set({ [DEBUG_STORAGE_KEY]: false });
  await saveSettings(DEFAULT_SETTINGS);
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
syncFromStorage().catch(() => {});
