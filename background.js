chrome.runtime.onInstalled.addListener(async details => {
  const { version } = chrome.runtime.getManifest();

  const shouldShow =
    details.reason === 'install' ||
    (details.reason === 'update' &&
      version === '3.0.0' &&
      details.previousVersion?.split('.')[0] === '2');

  if (!shouldShow) return;

  await chrome.storage.local.set({ ketuviaShowOnboarding: true });
  try {
    await chrome.action.openPopup();
  } catch {}
});
