(() => {
  'use strict';

  if (window.__rechunkCaptionsLoaded) return;
  window.__rechunkCaptionsLoaded = true;


  const CFG = {
    hardPauseMs:   5000,
    targetLines:      2,
    minPunctuationLastLineFill: 0.45,
    maxWords:        40,
    maxDurMs:      5200,
    minDurMs:      1800,
    longPauseThresholdMs: 6000,
    longPauseHoldMs: 5500,
    lookaheadMs:    300,
    pollMs:         100,
    navRetryMs:     250,
    navRetryForMs: 8000,
    triggerRetryMs: 900,
    maxTriggerAttempts: 8,
    // Caption sizing is a flat lookup: pick a player-width bucket, then read the font size for the chosen font. Box width is font x widthEm, capped to the player.
    widthBuckets: { medium: 700, large: 1250, xwide: 1800, ultra: 2600 },   // player-width thresholds (px)
    // Broadcast captions (CEA-708, BBC) are 1/15 of picture height. The two TV sizes aim at that on a fullscreen player, which is why they keep growing with the box.
    fontSizePx: {
      //          screen:  small  medium  large  xwide  ultra
      small:   { small: 16, medium: 18, large: 20, xwide: 22, ultra: 26 },
      medium:  { small: 20, medium: 24, large: 28, xwide: 32, ultra: 40 },
      large:   { small: 24, medium: 30, large: 34, xwide: 40, ultra: 50 },
      xlarge:  { small: 28, medium: 36, large: 44, xwide: 56, ultra: 76 },
      xxlarge: { small: 32, medium: 42, large: 56, xwide: 72, ultra: 120 },
    },
    wrapSafety: 0.985,
    textWidthEm:     24,
    // Shorts only: narrow the box so a line clears the right-side action buttons. The box is centered, so 3em trims about 3 characters off each side.
    shortsWidthReductionEm: 3,
    // Normal video, medium & large only: trim a few characters off the box.
    normalWideReductionEm: 5,
    // Shorts: lift the top 3 positions by this many lines of text height.
    shortsTopRaiseLines: 1.5,
    playerPaddingPx: 32,
    lineHeight:    1.4,
    rebuildYieldMs: 50,
    // Thresholds for deciding whether a creator's line breaks may be re-chunked.
    fittedLines: {
      minSpeechCharsPerSecond: 12,  // measured: song and verse 1.9 to 11.2, speech 14.1 to 16.9
      minCaptionsWithBreak:   0.2,  // some internal layout to judge at all
      minBreaks:               40,  // too few to judge, so assume the creator's
      minFittedScore:        0.15,  // measured: fitted 0.26+, lyrics 0.04 and under
    },
  };

  const SETTINGS_STORAGE_KEY  = 'ketuviaSettings';
  // The two TV sizes obey the same line length as the rest. Measuring the box in em keeps a line near 38 characters however large the screen gets, which is where broadcast subtitles sit.
  const BIG_SIZES = new Set(['xlarge', 'xxlarge']);
  // Matches the popup swatches so the preview shows what the captions will look like. White stays white; only the primaries are softened, since those were the tiring ones.
  const TEXT_COLORS = {
    white: '#ffffff',
    yellow: '#c9b64a',
    green: '#71a763',
    cyan: '#5da3a6',
  };
  const TEXT_OPACITIES = [100, 75, 50];
  const DEFAULT_SETTINGS = {
    targetLines: 2,
    textColor: 'white',
    textOpacity: 100,
    captionWidth: 'auto',
    textOutline: false,
    textBold: false,
    textSize: 'medium',
    background: 50,
    position: 'center-low',
    font: 'atkinson',
    allCaps: false,
  };
  // Background is a percentage now. 0 is no box at all, 100 is a solid block that hides subtitles burned into the picture. The old strings map onto the scale so nobody's stored choice reverts.
  const BACKGROUND_LEVELS = [0, 25, 50, 75, 100];
  const LEGACY_BACKGROUND = { light: 25, medium: 50, dark: 75 };
  // The user's choice of caption box width. auto keeps the width that follows the font size, which holds a line near 38 characters; the fractions trade rows for longer lines.
  const CAPTION_WIDTHS = { auto: 0, third: 1 / 3, half: 0.5, twothirds: 2 / 3, threequarters: 0.75 };
  const FONT_FAMILIES = {
    atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
    cascadia: '"Cascadia Code", ui-monospace, monospace',
    noto: '"Noto Sans", system-ui, sans-serif',
    average: '"Average Sans", system-ui, sans-serif',
    roboto: '"Roboto", system-ui, sans-serif',
    bona: '"Bona Nova", Georgia, serif',
  };
  const FONT_LOAD_FAMILIES = {
    atkinson: '"Atkinson Hyperlegible"',
    cascadia: '"Cascadia Code"',
    noto: '"Noto Sans"',
    average: '"Average Sans"',
    roboto: '"Roboto"',
    bona: '"Bona Nova"',
  };
  const OVERLAY_POSITIONS = {
    'left-top': { x: 'left', y: '8%' },
    'center-top': { x: 'center', y: '8%' },
    'right-top': { x: 'right', y: '8%' },
    'left-high': { x: 'left', y: '18%' },
    'center-high': { x: 'center', y: '18%' },
    'right-high': { x: 'right', y: '18%' },
    'left-highish': { x: 'left', y: '30%' },
    'center-highish': { x: 'center', y: '30%' },
    'right-highish': { x: 'right', y: '30%' },
    'left-middle': { x: 'left', y: '50%' },
    'center-middle': { x: 'center', y: '50%' },
    'right-middle': { x: 'right', y: '50%' },
    'left-lowish': { x: 'left', y: '70%' },
    'center-lowish': { x: 'center', y: '70%' },
    'right-lowish': { x: 'right', y: '70%' },
    'left-low': { x: 'left', y: '82%' },
    'center-low': { x: 'center', y: '82%' },
    'right-low': { x: 'right', y: '82%' },
    'left-bottom': { x: 'left', y: '92%' },
    'center-bottom': { x: 'center', y: '92%' },
    'right-bottom': { x: 'right', y: '92%' },
  };

  function readSettings() {
    // storage-bridge.js puts saved settings on the document and they are the authority. localStorage is only a same-page cache for before the bridge reports.
    const fromBridge = document.documentElement.dataset.ketuviaSettings;
    if (fromBridge) {
      try { return normalizeSettings(JSON.parse(fromBridge)); } catch {}
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      return normalizeSettings(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function normalizeSettings(settings) {
    const targetLines = Number(settings?.targetLines);
    const textSize = String(settings?.textSize || DEFAULT_SETTINGS.textSize);
    const rawBackground = settings?.background ?? DEFAULT_SETTINGS.background;
    const background = Object.hasOwn(LEGACY_BACKGROUND, String(rawBackground))
      ? LEGACY_BACKGROUND[String(rawBackground)]
      : Number(rawBackground);
    const captionWidth = String(settings?.captionWidth || DEFAULT_SETTINGS.captionWidth);
    const position = String(settings?.position || DEFAULT_SETTINGS.position);
    const font = String(settings?.font || DEFAULT_SETTINGS.font);
    const textColor = String(settings?.textColor || DEFAULT_SETTINGS.textColor);
    const textOpacity = Number(settings?.textOpacity);
    const allCaps = Boolean(settings?.allCaps);
    const textOutline = Boolean(settings?.textOutline);
    const textBold = Boolean(settings?.textBold);

    return {
      // Every subtitle guideline caps at three lines, so four and five are gone. Someone who stored them lands on three rather than snapping back to the default.
      targetLines: [1, 2, 3].includes(targetLines)
        ? targetLines
        : (targetLines >= 4 ? 3 : DEFAULT_SETTINGS.targetLines),
      textColor: Object.hasOwn(TEXT_COLORS, textColor)
        ? textColor
        : DEFAULT_SETTINGS.textColor,
      textOpacity: TEXT_OPACITIES.includes(textOpacity)
        ? textOpacity
        : DEFAULT_SETTINGS.textOpacity,
      textSize: Object.hasOwn(CFG.fontSizePx, textSize)
        ? textSize
        : DEFAULT_SETTINGS.textSize,
      background: BACKGROUND_LEVELS.includes(background)
        ? background
        : DEFAULT_SETTINGS.background,
      captionWidth: Object.hasOwn(CAPTION_WIDTHS, captionWidth)
        ? captionWidth
        : DEFAULT_SETTINGS.captionWidth,
      position: Object.hasOwn(OVERLAY_POSITIONS, position)
        ? position
        : DEFAULT_SETTINGS.position,
      font: Object.hasOwn(FONT_FAMILIES, font)
        ? font
        : DEFAULT_SETTINGS.font,
      allCaps,
      textOutline,
      textBold,
    };
  }

  const DEBUG = {
    enabled: false,
    maxChunkLogs: 80,
    maxRecords: 1500,
  };

  window.__ketuviaDebugEnabled = false;
  window.__ketuviaLastTimedtext = null;
  window.__ketuviaDebugLog = [];

  function safeFilenamePart(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function getDebugFileId() {
    const title = document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim();
    const titlePart = safeFilenamePart(title.split(/\s+/).slice(0, 3).join(' ')) || 'youtube-video';
    const videoId = safeFilenamePart(currentVideoId() || STATE.videoId || window.__ketuviaLastTimedtext?.videoId || 'unknown');
    const datePart = new Date().toISOString().slice(0, 10);
    return `${titlePart}-${videoId}-${datePart}`;
  }

  function downloadTextFile(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function pushTimingRecord(type, detail = {}) {
    if (!DEBUG.enabled) return;
    const records = window.__ketuviaDebugLog;
    records.push({
      at: new Date().toISOString(),
      tMs: Math.round(performance.now()),
      type,
      ...detail,
    });
    if (records.length > DEBUG.maxRecords) {
      records.splice(0, records.length - DEBUG.maxRecords);
    }
  }

  function pushDebugRecord(type, detail = {}) {
    if (!DEBUG.enabled) return;
    const records = window.__ketuviaDebugLog;
    records.push({
      at: new Date().toISOString(),
      tMs: Math.round(performance.now()),
      type,
      ...detail,
    });
    if (records.length > DEBUG.maxRecords) {
      records.splice(0, records.length - DEBUG.maxRecords);
    }
  }

  function buildKetuviaLogText(id) {
    const snapshot = {
      id,
      generatedAt: new Date().toISOString(),
      pageUrl: location.href,
      title: document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim(),
      videoId: currentVideoId() || STATE.videoId || null,
      enabled: STATE.enabled,
      debugEnabled: DEBUG.enabled,
      nativeCaptionsEnabled: areNativeCaptionsEnabled(),
      statusMode: STATE.statusMode,
      settings: STATE.settings,
      wordCount: STATE.words.length,
      chunkCount: STATE.chunks.length,
      asrLang: STATE.asrLang,
      timedtextRequestCount: STATE.timedtextRequestCount,
      timedtextResponseCount: STATE.timedtextResponseCount,
      lastTimedtextRequest: STATE.lastTimedtextRequest,
      lastTimedtextResponse: STATE.lastTimedtextResponse,
      lastCaptionTrigger: STATE.lastCaptionTrigger,
      lastCaptionTracks: STATE.lastCaptionTracks,
      layout: STATE.layout,
      chunks: STATE.chunks.slice(0, 120),
    };

    const lines = [
      `ID ${id}`,
      JSON.stringify({ snapshot }),
      'records',
      ...window.__ketuviaDebugLog.map(record => JSON.stringify(record)),
    ];
    return lines.join('\n') + '\n';
  }

  function downloadKetuviaDebugBundle() {
    const id = getDebugFileId();
    const raw = window.__ketuviaLastTimedtext?.text;
    if (raw) {
      downloadTextFile(`${id}-youtube-json.json`, raw, 'application/json');
    } else {
      console.warn('[Rechunk][Debug][RAW] no timedtext response captured yet');
    }

    downloadTextFile(`${id}-ketuvia-log.txt`, buildKetuviaLogText(id), 'text/plain');
  }
  window.__ketuviaDownloadTimedtext = downloadKetuviaDebugBundle;
  window.ketuviaDownload = downloadKetuviaDebugBundle;
  window.ketuvia = downloadKetuviaDebugBundle;

  // Firefox-only caption-loading diagnostic, active only while Debug mode is on. One timeline kept in sessionStorage so it survives refreshes, saved as JSON when Debug goes off.
  const FFDIAG = {
    isFirefox: /firefox/i.test(navigator.userAgent),
    logKey: 'ketuviaFFDiagLog',
    metaKey: 'ketuviaFFDiagMeta',
    limitMs: 60000,
    maxEntries: 3000,
    sampleMs: 1500,
    started: false,
    sampleId: null,
    pageT0: performance.now(),
  };

  function ffSafe(fn) { try { return fn(); } catch (e) { return 'ERR:' + e.message; } }
  function ffMeta() { try { return JSON.parse(sessionStorage.getItem(FFDIAG.metaKey) || 'null'); } catch { return null; } }
  function ffSetMeta(m) { try { sessionStorage.setItem(FFDIAG.metaKey, JSON.stringify(m)); } catch {} }
  function ffSessionActive() { const m = ffMeta(); return Boolean(m && m.active); }
  function ffElapsedMs() { const m = ffMeta(); return m && m.start ? Date.now() - m.start : 0; }

  function ffLog(type, data) {
    if (!FFDIAG.isFirefox || !ffSessionActive()) return;
    let arr;
    try { arr = JSON.parse(sessionStorage.getItem(FFDIAG.logKey) || '[]'); } catch { arr = []; }
    arr.push({
      ts: Date.now(),
      sessionMs: ffElapsedMs(),
      pageMs: Math.round(performance.now() - FFDIAG.pageT0),
      page: location.pathname,
      type,
      ...(data || {}),
    });
    if (arr.length > FFDIAG.maxEntries) arr.splice(0, arr.length - FFDIAG.maxEntries);
    try { sessionStorage.setItem(FFDIAG.logKey, JSON.stringify(arr)); } catch {}
  }

  function ffSnapshot() {
    const video = document.querySelector('video');
    const player = getPlayerElement();
    const presp = player && typeof player.getPlayerResponse === 'function'
      ? ffSafe(() => player.getPlayerResponse()) : null;
    const interceptorMs = typeof window.__ketuviaInterceptorMs === 'number' ? window.__ketuviaInterceptorMs : null;
    const overlay = document.getElementById('rechunk-overlay');
    const ttRes = ffSafe(() => performance.getEntriesByType('resource')
      .filter(e => /timedtext/.test(e.name))
      .map(e => ({
        startMs: Math.round(e.startTime),
        endMs: Math.round(e.responseEnd),
        // The decisive race signal: did YouTube's request fire BEFORE our
        // fetch/XHR interceptor was installed (so we could never catch it)?
        beforeInterceptor: interceptorMs != null ? e.startTime < interceptorMs : null,
      })));
    return {
      videoId: ffSafe(() => currentVideoId()),
      stateVideoId: STATE.videoId,
      asrLang: STATE.asrLang,
      enabled: STATE.enabled,
      triggered: STATE.triggered,
      triggerAttempts: STATE.triggerAttempts,
      statusMode: STATE.statusMode,
      words: STATE.words.length,
      chunks: STATE.chunks.length,
      nativeCaptionsEnabled: ffSafe(() => areNativeCaptionsEnabled()),
      interceptorInstalledMs: interceptorMs,
      fetchPatched: ffSafe(() => !/\[native code\]/.test(String(window.fetch))),
      timedtextRequestCount: STATE.timedtextRequestCount,
      timedtextResponseCount: STATE.timedtextResponseCount,
      lastTimedtextLen: window.__ketuviaLastTimedtext && window.__ketuviaLastTimedtext.text
        ? window.__ketuviaLastTimedtext.text.length
        : (window.__ketuviaLastTimedtext ? -1 : 0),
      perfTimedtextRequests: ttRes,
      player: player ? {
        id: player.id || null,
        rect: ffSafe(() => { const r = player.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }),
        captionsOptions: typeof player.getOptions === 'function' ? ffSafe(() => player.getOptions('captions')) : 'no-getOptions',
        currentTrack: typeof player.getOption === 'function' ? ffSafe(() => player.getOption('captions', 'track')) : 'no-getOption',
        playerResponseTracks: ffSafe(() => presp.captions.playerCaptionsTracklistRenderer.captionTracks
          .map(t => ({ lang: t.languageCode, kind: t.kind, hasUrl: Boolean(t.baseUrl) }))),
        playerResponseVideoId: presp ? ffSafe(() => presp.videoDetails.videoId) : null,
      } : null,
      ytInitialHasTracks: ffSafe(() => Boolean(window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks.length)),
      ytInitialVideoId: ffSafe(() => window.ytInitialPlayerResponse.videoDetails.videoId),
      video: video ? { paused: video.paused, currentTime: Math.round((video.currentTime || 0) * 10) / 10, readyState: video.readyState } : null,
      overlay: overlay ? { present: true, dataEmpty: overlay.dataset.empty, text: (overlay.textContent || '').slice(0, 60) } : { present: false },
      ccButtonAria: ffSafe(() => { const b = document.querySelector('.ytp-subtitles-button'); return b ? b.getAttribute('aria-pressed') : null; }),
    };
  }

  function ffFinalizeAndDownload(reason) {
    if (!FFDIAG.isFirefox) return;
    const m = ffMeta();
    if (!m || !m.active) return;
    ffSetMeta({ ...m, active: false }); // stop further logging across all pages
    if (FFDIAG.sampleId) { clearInterval(FFDIAG.sampleId); FFDIAG.sampleId = null; }
    ffLog('session_end', { reason, snapshot: ffSnapshot() });
    let arr = [];
    try { arr = JSON.parse(sessionStorage.getItem(FFDIAG.logKey) || '[]'); } catch {}
    const report = {
      kind: 'ketuvia-firefox-caption-diagnostic',
      reason,
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      sessionStart: m.start ? new Date(m.start).toISOString() : null,
      sessionDurationMs: m.start ? Date.now() - m.start : null,
      entryCount: arr.length,
      entries: arr,
    };
    downloadTextFile(`${getDebugFileId()}-firefox-caption-diagnostic.json`, JSON.stringify(report, null, 2), 'application/json');
    try { sessionStorage.removeItem(FFDIAG.logKey); } catch {}
  }

  function ffStart() {
    if (!FFDIAG.isFirefox || FFDIAG.started || !ffSessionActive()) return;
    FFDIAG.started = true;
    if (ffElapsedMs() >= FFDIAG.limitMs) { ffFinalizeAndDownload('time_limit'); return; }

    ffLog('page_load', { readyState: document.readyState, snapshot: ffSnapshot() });
    // Extra early snapshots to catch the initial-request race window.
    setTimeout(() => ffLog('early_500ms', { snapshot: ffSnapshot() }), 500);
    setTimeout(() => ffLog('early_2000ms', { snapshot: ffSnapshot() }), 2000);

    FFDIAG.sampleId = setInterval(() => {
      if (!ffSessionActive()) { clearInterval(FFDIAG.sampleId); FFDIAG.sampleId = null; return; }
      if (ffElapsedMs() >= FFDIAG.limitMs) { ffFinalizeAndDownload('time_limit'); return; }
      ffLog('sample', { snapshot: ffSnapshot() });
    }, FFDIAG.sampleMs);

    document.addEventListener('click', (e) => {
      const t = e.target;
      const btn = t && t.closest ? t.closest('button, .ytp-button, a, [role=button]') : null;
      ffLog('user_click', {
        target: t && t.tagName ? t.tagName.toLowerCase() : null,
        label: btn ? (btn.getAttribute('aria-label') || btn.getAttribute('title') || (btn.className || '').toString().slice(0, 60)) : null,
        isCC: Boolean(t && t.closest && t.closest('.ytp-subtitles-button')),
      });
    }, true);
    const video = document.querySelector('video');
    if (video) {
      video.addEventListener('play', () => ffLog('video_play', { currentTime: Math.round((video.currentTime || 0) * 10) / 10 }), true);
      video.addEventListener('pause', () => ffLog('video_pause', {}), true);
    }
    for (const ev of ['yt-navigate-start', 'yt-navigate-finish']) {
      document.addEventListener(ev, () => ffLog(ev, { path: location.pathname }), true);
    }
    document.addEventListener('visibilitychange', () => ffLog('visibilitychange', { hidden: document.hidden }), true);
    window.addEventListener('beforeunload', () => ffLog('page_unload', { snapshot: ffSnapshot() }), true);
  }

  document.documentElement.addEventListener('ketuvia-debug-change', () => {
    const wasEnabled = DEBUG.enabled;
    DEBUG.enabled = document.documentElement.dataset.ketuviaDebug === '1';
    window.__ketuviaDebugEnabled = DEBUG.enabled;
    if (DEBUG.enabled && !wasEnabled) {
      window.__ketuviaDebugLog = [];
      pushDebugRecord('debug_enabled', {
        videoId: currentVideoId() || STATE.videoId || null,
        pageUrl: location.href,
      });
      // Begin a fresh Firefox diagnostic session (survives refreshes).
      if (FFDIAG.isFirefox && !ffSessionActive()) {
        ffSetMeta({ active: true, start: Date.now() });
        ffLog('session_start', { pageUrl: location.href, snapshot: ffSnapshot() });
        ffStart();
      }
    }
    if (!DEBUG.enabled && wasEnabled) {
      ffFinalizeAndDownload('debug_off');
    }
    if (DEBUG.enabled && STATE.words.length) {
      rebuildChunksForLayout('debug_enabled');
    } else {
      STATE.debugChunks = [];
    }
  });

  const STATE = {
    enabled: true,
    videoId:    null,
    asrLang:    null,
    words:      [],
    chunks:     [],
    overlay:    null,
    overlayText: null,
    measurer:   null,
    measurerText: null,
    layout:     null,
    resizeObserver: null,
    resizeTimerId: null,
    resizeLayoutTimerId: null,
    lastResizeW: -1,
    lastResizeH: -1,
    measureRange: null,
    pollId:     null,
    lastText:   null,
    statusMode: 'idle',
    triggered:  false,
    navRetryId: null,
    navRetryUntil: 0,
    triggerRetryId: null,
    triggerAttempts: 0,
    timedtextRequestCount: 0,
    timedtextResponseCount: 0,
    lastTimedtextRequest: null,
    lastTimedtextResponse: null,
    lastCaptionTrigger: null,
    lastCaptionTracks: null,
    fontLoadRequestId: 0,
    chunkBuildRequestId: 0,
    chunkBuildSignature: null,
    chunkBuildInFlightSignature: null,
    debugChunks: [],
    settings: readSettings(),
  };

  window.__ketuviaEnabled = STATE.enabled;

  function areNativeCaptionsEnabled() {
    if (location.pathname.startsWith('/shorts/')) return true;

    const player = getPlayerElement();
    const button =
      player?.querySelector('.ytp-subtitles-button') ||
      document.querySelector('.ytp-subtitles-button');

    if (!button) return false;

    const ariaPressed = button.getAttribute('aria-pressed');
    if (ariaPressed === 'true') return true;
    if (ariaPressed === 'false') return false;

    return button.classList.contains('ytp-button-active');
  }

  function clearKetuviaOverlay() {
    if (STATE.overlayText) {
      STATE.overlayText.textContent = '';
    }
    if (STATE.overlay) {
      STATE.overlay.dataset.empty = '1';
    }
    STATE.lastText = null;
    if (document.head.contains(_captionHideStyle)) document.head.removeChild(_captionHideStyle);
  }

  function setEnabled(enabled) {
    STATE.enabled = Boolean(enabled);
    window.__ketuviaEnabled = STATE.enabled;
    captionLoadDebug('set_enabled', {
      requestedEnabled: Boolean(enabled),
      wordsLength: STATE.words.length,
      chunksLength: STATE.chunks.length,
      hasAsrLang: Boolean(STATE.asrLang),
      triggered: STATE.triggered,
    });

    if (STATE.enabled) {
      if (!areNativeCaptionsEnabled()) {
        captionLoadDebug('set_enabled_waiting_for_native_cc', {
          wordsLength: STATE.words.length,
          chunksLength: STATE.chunks.length,
        });
        clearKetuviaOverlay();
        return;
      }

      if (STATE.chunks.length) { mountOverlay(); startPolling(); renderCurrentCaption(true); }
      else if (STATE.words.length) { rebuildChunksForLayout('enabled_with_words'); startPolling(); }
      else if (STATE.asrLang && !STATE.triggered) waitForPlayerThenTrigger();
    } else {
      if (STATE.pollId) { clearInterval(STATE.pollId); STATE.pollId = null; }
      clearKetuviaOverlay();
    }
  }

  document.documentElement.addEventListener('ketuvia-enabled-sync', () => {
    setEnabled(document.documentElement.dataset.ketuviaEnabled !== '0');
  });

  document.documentElement.addEventListener('ketuvia-settings-sync', () => {
    const raw = document.documentElement.dataset.ketuviaSettings;
    if (!raw) return;
    try { applySettings(JSON.parse(raw)); } catch {}
  });

  function applySettings(nextSettings) {
    const previousSettings = STATE.settings;
    STATE.settings = normalizeSettings(nextSettings);
    window.__ketuviaSettings = { ...STATE.settings };

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(STATE.settings));
    } catch {}

    const needsRebuild =
      previousSettings.targetLines !== STATE.settings.targetLines ||
      previousSettings.textSize !== STATE.settings.textSize ||
      previousSettings.font !== STATE.settings.font ||
      previousSettings.allCaps !== STATE.settings.allCaps ||
      // Bold letters are wider, so captions must be re-measured and re-chunked for them.
      previousSettings.textBold !== STATE.settings.textBold ||
      // Width feeds the wrap simulation, so captions must be rebuilt for it or every measurement is for the old box.
      previousSettings.captionWidth !== STATE.settings.captionWidth;

    if (!STATE.enabled || !areNativeCaptionsEnabled()) {
      clearKetuviaOverlay();
      return { ...STATE.settings };
    }

    // A different family and a different weight are both a different font file, so both must wait for the load or the rebuild measures a font that is not on screen yet.
    if (needsRebuild && (previousSettings.font !== STATE.settings.font ||
                         previousSettings.textBold !== STATE.settings.textBold)) {
      rebuildChunksAfterFontReady();
    } else if (needsRebuild) {
      rebuildChunksForLayout('settings_changed', true);
    } else {
      mountOverlay();
      renderCurrentCaption(true);
    }

    return { ...STATE.settings };
  }

  window.__ketuviaSettings = { ...STATE.settings };
  window.__ketuviaApplySettings = applySettings;

  window.addEventListener('storage', event => {
    if (event.key !== SETTINGS_STORAGE_KEY || !event.newValue) return;
    try {
      const next = normalizeSettings(JSON.parse(event.newValue));
      // Compare the whole object. A hand-written field list silently drops any setting added later.
      if (JSON.stringify(next) === JSON.stringify(STATE.settings)) return;
      applySettings(next);
    } catch {}
  });

  window.addEventListener('ketuvia-settings-change', event => {
    applySettings(event.detail);
  });

  const log = (...a) => {
    if (!DEBUG.enabled) return;
    pushDebugRecord('log', { message: a.map(String).join(' ') });
  };

  const warn = (...a) => {
    if (!DEBUG.enabled) return;
    pushDebugRecord('warn', { message: a.map(String).join(' ') });
  };

  function captionLoadDebug(stage, detail = {}) {
    if (!DEBUG.enabled) return;
    const payload = {
      stage,
      videoId: STATE.videoId,
      enabled: STATE.enabled,
      nativeCaptionsEnabled: areNativeCaptionsEnabled(),
      statusMode: STATE.statusMode,
      triggerAttempts: STATE.triggerAttempts,
      chunks: STATE.chunks.length,
      words: STATE.words.length,
      ...detail,
    };
    pushDebugRecord('caption_load', payload);
    ffLog('caption_load', payload);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // YouTube leaves a hidden 0x0 Shorts player in the page after you visit Shorts, and it can sit ahead of the real one, so the first video element is not a safe way to find the player.
  function getPlayerElement() {
    const players = Array.from(document.querySelectorAll('.html5-video-player'));
    const area = el => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    const onScreen = players.filter(el => area(el) > 0);
    const pool = onScreen.length ? onScreen : players;
    const wanted = location.pathname.startsWith('/shorts/') ? 'shorts-player' : 'movie_player';
    return pool.find(el => el.id === wanted)
      || pool.sort((a, b) => area(b) - area(a))[0]
      || document.querySelector('#movie_player')
      || null;
  }

  function getRuntimeConfig() {
    return {
      ...CFG,
      targetLines: STATE.settings.targetLines,
    };
  }

  function normalizeCaptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function appendCaptionText(base, segment) {
    const text = normalizeCaptionText(segment);
    if (!text) return base;
    return base ? base + ' ' + text : text;
  }

  function joinWords(words) {
    let text = '';
    for (let i = 0; i < words.length; i++) {
      text = appendCaptionText(text, words[i].text);
    }
    return text;
  }

  function applyTextCase(text) {
    if (!STATE.settings.allCaps || !text) return text;
    return text.toLocaleUpperCase();
  }

  function widthBucket(playerWidth) {
    return playerWidth >= CFG.widthBuckets.ultra ? 'ultra'
      : playerWidth >= CFG.widthBuckets.xwide ? 'xwide'
      : playerWidth >= CFG.widthBuckets.large ? 'large'
      : playerWidth >= CFG.widthBuckets.medium ? 'medium'
      : 'small';
  }

  function getLayoutMetrics(player) {
    const playerWidth = Math.max(0, player?.clientWidth || 0);
    if (!playerWidth) return null;
    const settings = STATE.settings;
    const runtimeConfig = getRuntimeConfig();

    // Bucket the player width, then look up the font size for this setting.
    const bucket = widthBucket(playerWidth);
    const sizeRow = CFG.fontSizePx[settings.textSize] || CFG.fontSizePx.medium;
    // The chosen size is the chosen size. Keeping a tall caption on screen is the positioning code's job, not a reason to quietly hand back a smaller font than was asked for.
    const fontSizePx = sizeRow[bucket];

    // Box width follows the font size, capped to the player. Two width-basis overrides that do not change the displayed size: Shorts always uses the small font's width so the box clears the action buttons, and large on a normal video uses medium's width.
    const isShorts = location.pathname.startsWith('/shorts/');
    let widthEm = CFG.textWidthEm;
    if (isShorts) widthEm -= CFG.shortsWidthReductionEm;
    else if (settings.textSize === 'large') widthEm -= CFG.normalWideReductionEm - 1; // 1 char wider than medium
    else if (settings.textSize === 'medium') widthEm -= CFG.normalWideReductionEm;
    else if (BIG_SIZES.has(settings.textSize)) widthEm -= CFG.normalWideReductionEm;
    const widthFontPx = isShorts
      ? CFG.fontSizePx.small[bucket]
      : settings.textSize === 'large'
        ? CFG.fontSizePx.medium[bucket]
        : fontSizePx;
    const maxAvailableWidth = Math.max(0, playerWidth - CFG.playerPaddingPx);
    // The chosen fraction of the player wins over the em rule, except on Shorts, whose narrow box exists to clear the action buttons.
    const widthFraction = CAPTION_WIDTHS[settings.captionWidth] || 0;
    // Auto never exceeds the largest manual option, so picking 3/4 can never make the box narrower. The cap only touches xxlarge on small players, costing about one character per line there.
    const textWidthPx = !isShorts && widthFraction > 0
      ? Math.min(Math.round(playerWidth * widthFraction), maxAvailableWidth)
      : Math.min(Math.round(widthFontPx * widthEm), isShorts ? maxAvailableWidth : Math.round(playerWidth * 0.75), maxAvailableWidth);

    return {
      textWidthPx,
      fontSizePx,
      lineHeight: CFG.lineHeight,
      targetLines: runtimeConfig.targetLines,
    };
  }

  function ensureMeasureRange() {
    if (!STATE.measureRange) {
      STATE.measureRange = document.createRange();
    }
    return STATE.measureRange;
  }

  function measureNodeLayout(node, containerWidthPx, targetLines, includeDebugMetrics = false) {
    if (!node) {
      return {
        lineCount: 0,
        heightLineCount: 0,
        maxLineCount: 0,
        lastLineFill: 0,
        fillRatio: 0,
        rects: [],
        rawRectCount: 0,
        clientHeight: null,
        scrollHeight: null,
        offsetHeight: null,
        lineHeightPx: null,
      };
    }

    const range = ensureMeasureRange();
    range.selectNodeContents(node);
    const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
    const lines = [];

    for (const rect of rawRects) {
      let line = lines.find(existing => Math.abs(existing.top - rect.top) < 2);

      if (!line) {
        line = {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
        lines.push(line);
        continue;
      }

      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.width = line.right - line.left;
    }

    lines.sort((a, b) => a.top - b.top);

    const lineCount = lines.length || (node.textContent ? 1 : 0);
    const lastLine = lines[lines.length - 1];
    const lastLineFill =
      lastLine && containerWidthPx
        ? clamp(lastLine.width / containerWidthPx, 0, 1)
        : 0;
    const fillRatio =
      targetLines
        ? clamp(((Math.max(0, lineCount - 1)) + lastLineFill) / targetLines, 0, 1)
        : 0;

    let heightLineCount = lineCount;
    let maxLineCount = lineCount;
    let clientHeight = null;
    let scrollHeight = null;
    let offsetHeight = null;
    let lineHeightPx = null;

    if (includeDebugMetrics) {
      const style = window.getComputedStyle(node);
      const fontSizePx = Number.parseFloat(style.fontSize) || 0;
      lineHeightPx = Number.parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeightPx)) {
        const lineHeight = Number.parseFloat(style.lineHeight);
        lineHeightPx = Number.isFinite(lineHeight)
          ? lineHeight * fontSizePx
          : fontSizePx * CFG.lineHeight;
      }
      clientHeight = node.clientHeight || 0;
      scrollHeight = node.scrollHeight || 0;
      offsetHeight = node.offsetHeight || 0;
      const heightBasis = Math.max(scrollHeight, clientHeight, offsetHeight);
      heightLineCount =
        lineHeightPx > 0 && heightBasis > 0
          ? Math.max(1, Math.round(heightBasis / lineHeightPx))
          : lineCount;
      maxLineCount = Math.max(lineCount, heightLineCount);
    }

    return {
      lineCount,
      heightLineCount,
      maxLineCount,
      lastLineFill,
      fillRatio,
      rects: lines,
      rawRectCount: rawRects.length,
      clientHeight,
      scrollHeight,
      offsetHeight,
      lineHeightPx,
    };
  }

  function applyLayout(node, layout) {
    if (!node || !layout) return;
    const position = OVERLAY_POSITIONS[STATE.settings.position] || OVERLAY_POSITIONS[DEFAULT_SETTINGS.position];

    node.style.setProperty('--rechunk-text-width', layout.textWidthPx + 'px');
    node.style.setProperty('--rechunk-font-size', layout.fontSizePx + 'px');
    node.style.setProperty('--rechunk-line-height', String(layout.lineHeight));
    node.style.setProperty('--rechunk-target-lines', String(layout.targetLines));
    node.style.setProperty(
      '--rechunk-bg-opacity',
      String((Number(STATE.settings.background) || 0) / 100)
    );
    node.style.setProperty(
      '--rechunk-font-family',
      FONT_FAMILIES[STATE.settings.font] || FONT_FAMILIES.atkinson
    );
    node.style.setProperty(
      '--rechunk-color',
      TEXT_COLORS[STATE.settings.textColor] || TEXT_COLORS.white
    );
    node.style.setProperty(
      '--rechunk-text-opacity',
      String((Number(STATE.settings.textOpacity) || 100) / 100)
    );
    // A hard outline keeps text readable with the background off, the way burned-in broadcast subtitles stay legible. Pure style, so no rebuild is needed.
    node.style.setProperty('--rechunk-font-weight', STATE.settings.textBold ? '700' : '400');
    node.style.setProperty(
      '--rechunk-text-shadow',
      STATE.settings.textOutline
        ? '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, '
          + '0 -1.5px 0 #000, 0 1.5px 0 #000, -1.5px 0 0 #000, 1.5px 0 0 #000, 0 0 4px #000'
        : '0 1px 2px rgba(0, 0, 0, 0.9)'
    );
    node.style.setProperty(
      '--rechunk-font-feature-settings',
      STATE.settings.font === 'cascadia' ? '"liga" 0, "calt" 0' : 'normal'
    );
    // Shorts are tall, so the same percent is a larger pixel offset from centre. Compress y toward centre so each labelled position lands where it visually belongs.
    const SHORTS_Y_REMAP = { 8: 18, 18: 30, 30: 40, 50: 50, 70: 60, 82: 70, 92: 82 };
    const rawY = Number.parseFloat(position.y);
    const y = location.pathname.startsWith('/shorts/') && SHORTS_Y_REMAP[rawY] != null
      ? SHORTS_Y_REMAP[rawY]
      : rawY;
    const anchorTop = y <= 8;
    const anchorBottom = y >= 92;

    node.style.top = y + '%';
    node.style.bottom = 'auto';
    node.style.left = 'auto';
    node.style.right = 'auto';

    if (position.x === 'left') {
      node.style.left = '8px';
    } else if (position.x === 'right') {
      node.style.right = '8px';
    } else {
      node.style.left = '50%';
    }

    if (anchorTop) {
      node.style.top = '8px';
      node.style.transform = position.x === 'center' ? 'translateX(-50%)' : 'none';
      return;
    }

    if (anchorBottom) {
      node.style.top = 'auto';
      node.style.bottom = '8px';
      node.style.transform = position.x === 'center' ? 'translateX(-50%)' : 'none';
      return;
    }

    // Anchor to the video element's real rect, not the player's CSS height which lags during resize. Bottom-half positions anchor to the video bottom so the gap stays proportional.
    const video = document.querySelector('video');
    const playerEl = getPlayerElement();
    const vr = video?.getBoundingClientRect();
    const pr = playerEl?.getBoundingClientRect();
    if (vr && pr && vr.height > 0) {
      const videoOffsetInPlayer = vr.top - pr.top;
      const isShorts = location.pathname.startsWith('/shorts/');
      if (isShorts) {
        const fontLinePx = (layout.fontSizePx || 0) * (layout.lineHeight || 1.4);
        // Top and bottom edges are positioned from the small font as a fixed reference, so larger fonts grow toward the middle instead of past the edge.
        const refLinePx = CFG.fontSizePx.small[widthBucket(playerEl.clientWidth || pr.width)] * (layout.lineHeight || 1.4);
        const oneLineBoxPx = refLinePx + 4; // + 2px top/bottom padding
        if (rawY >= 92) {
          // Lowest position bottom-anchors like a normal video, so taller captions grow upward and never drop below where a one-line caption sits.
          const centerPx = videoOffsetInPlayer + (y / 100) * vr.height + 0.75 * refLinePx;
          node.style.top = 'auto';
          node.style.bottom = Math.round(pr.height - (centerPx + oneLineBoxPx / 2)) + 'px';
          node.style.transform = position.x === 'center' ? 'translateX(-50%)' : 'none';
        } else if (rawY <= 8) {
          // Topmost position top-anchors so taller captions grow downward and never rise above the video's top edge, lifted by the shared top-raise amount.
          const centerPx = videoOffsetInPlayer + (y / 100) * vr.height - 0.75 * refLinePx - CFG.shortsTopRaiseLines * refLinePx;
          node.style.bottom = 'auto';
          node.style.top = Math.round(centerPx - oneLineBoxPx / 2) + 'px';
          node.style.transform = position.x === 'center' ? 'translateX(-50%)' : 'none';
        } else {
          // Centre-anchored positions mirror about the video's middle, then the two upper ones are lifted by the shared top-raise amount in refLine units so all three move equally and keep their order.
          const shiftLines = rawY === 18 ? 0.25 : rawY === 82 ? -0.25 : 0;
          const raisePx = rawY <= 30 ? CFG.shortsTopRaiseLines * refLinePx : 0;
          const centerPx = Math.round(videoOffsetInPlayer + (y / 100) * vr.height + shiftLines * fontLinePx - raisePx);
          node.style.top = centerPx + 'px';
          node.style.transform = position.x === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)';
        }
      } else if (y > 50) {
        let bottomGapPx = Math.round(((100 - y) / 2 / 100) * vr.height);
        // Small clearance floor for the second-lowest position so the overlay
        // doesn't sit on YouTube's controls on medium-sized players.
        if (y === 82) bottomGapPx = Math.max(bottomGapPx, 50);
        node.style.top = 'auto';
        node.style.bottom = Math.round(pr.height - (videoOffsetInPlayer + vr.height) + bottomGapPx) + 'px';
        node.style.transform = position.x === 'center' ? 'translateX(-50%)' : 'none';
      } else {
        const topPx = Math.round(videoOffsetInPlayer + (y / 100) * vr.height);
        node.style.top = topPx + 'px';
        node.style.transform = position.x === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)';
      }
      return;
    }

    node.style.transform = position.x === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)';
  }

  function mountOverlay({ skipOverlayLayout = false } = {}) {
    // Only hide YouTube's captions while we are actually replacing them.
    if (STATE.enabled && !document.head.contains(_captionHideStyle)) {
      document.head.appendChild(_captionHideStyle);
    }

    const player = getPlayerElement();
    if (!player) {
      setTimeout(mountOverlay, 250);
      return null;
    }

    // Being somewhere in the document is not enough: an overlay left inside the hidden Shorts player renders at zero size.
    if (STATE.overlay && STATE.overlay.parentElement !== player) {
      player.appendChild(STATE.overlay);
    }
    if (STATE.measurer && STATE.measurer.parentElement !== player) {
      player.appendChild(STATE.measurer);
    }

    if (!STATE.overlay || !document.body.contains(STATE.overlay)) {
      const o = document.createElement('div');
      o.id = 'rechunk-overlay';
      o.setAttribute('role', 'status');
      o.setAttribute('aria-live', 'polite');
      o.setAttribute('aria-atomic', 'true');
      const text = document.createElement('div');
      text.className = 'rechunk-text';
      text.dir = 'auto';
      o.appendChild(text);
      player.appendChild(o);
      STATE.overlay = o;
      STATE.overlayText = text;
    }

    if (!STATE.measurer || !document.body.contains(STATE.measurer)) {
      const m = document.createElement('div');
      m.id = 'rechunk-measurer';
      const text = document.createElement('div');
      text.className = 'rechunk-text';
      text.dir = 'auto';
      m.appendChild(text);
      player.appendChild(m);
      STATE.measurer = m;
      STATE.measurerText = text;
    }

    const layout = getLayoutMetrics(player);
    if (layout) {
      STATE.layout = layout;
      if (!skipOverlayLayout) applyLayout(STATE.overlay, layout);
      applyLayout(STATE.measurer, layout);
    }

    if (!STATE.resizeObserver && typeof ResizeObserver === 'function') {
      STATE.resizeObserver = new ResizeObserver(entries => {
        // The player resizes continuously during a window drag and while a fresh video settles. Read the size from contentRect to drop no-op notifications, then debounce the reflow-heavy layout so it runs once after the size settles.
        const cr = entries[entries.length - 1]?.contentRect;
        const w = cr ? Math.round(cr.width) : 0;
        const h = cr ? Math.round(cr.height) : 0;
        if (w === STATE.lastResizeW && h === STATE.lastResizeH) return;
        STATE.lastResizeW = w;
        STATE.lastResizeH = h;
        if (STATE.resizeLayoutTimerId) clearTimeout(STATE.resizeLayoutTimerId);
        STATE.resizeLayoutTimerId = setTimeout(() => {
          STATE.resizeLayoutTimerId = null;
          mountOverlay();
          renderCurrentCaption(true);
          scheduleResizeRebuild();
        }, 120);
      });
      STATE.resizeObserver.observe(player);
    }

    return player;
  }

  function getDisplayText(text) {
    return applyTextCase(text);
  }

  function measureTextLayout(text) {
    if (!STATE.measurerText || !STATE.layout) {
      return { lineCount: 1, lastLineFill: 1, fillRatio: 1 };
    }

    const displayText = getDisplayText(text);
    STATE.measurerText.textContent = displayText;

    if (!displayText) {
      return { lineCount: 0, lastLineFill: 0, fillRatio: 0 };
    }
    return measureNodeLayout(
      STATE.measurerText,
      STATE.layout.textWidthPx,
      STATE.layout.targetLines,
      DEBUG.enabled
    );
  }

  function batchVerifyOverflows(pending) {
    if (!pending.length || !STATE.measurer?.parentElement || !STATE.layout) return [];

    const layout = STATE.layout;
    const ms = STATE.measurer;
    const container = document.createElement('div');

    container.style.position = 'absolute';
    container.style.top = ms.style.top || 'auto';
    container.style.bottom = ms.style.bottom || 'auto';
    container.style.left = ms.style.left || 'auto';
    container.style.right = ms.style.right || 'auto';
    container.style.transform = ms.style.transform || '';
    container.style.width = `min(${layout.textWidthPx}px, calc(100% - 32px))`;
    container.style.minWidth = '0';
    container.style.padding = '2px 8px';
    container.style.visibility = 'hidden';
    container.style.display = 'block';
    container.style.zIndex = '-1';
    container.style.pointerEvents = 'none';
    container.style.fontFamily = FONT_FAMILIES[STATE.settings.font] || FONT_FAMILIES.atkinson;
    container.style.fontSize = layout.fontSizePx + 'px';
    container.style.lineHeight = String(layout.lineHeight);
    container.style.fontWeight = STATE.settings.textBold ? '700' : '400';
    container.style.letterSpacing = '0.01em';
    container.style.fontFeatureSettings = STATE.settings.font === 'cascadia' ? '"liga" 0, "calt" 0' : 'normal';

    const children = pending.map(item => {
      const el = document.createElement('div');
      el.style.width = '100%';
      el.style.whiteSpace = 'pre-wrap';
      el.style.wordWrap = 'break-word';
      el.dir = 'auto';
      el.textContent = item.displayText;
      container.appendChild(el);
      return el;
    });

    ms.parentElement.appendChild(container);

    const results = children.map(el =>
      measureNodeLayout(el, layout.textWidthPx, layout.targetLines, false)
    );

    container.remove();
    return results;
  }

  async function waitForCurrentFont(layout) {
    if (!document.fonts?.load || !layout) return;

    const family = FONT_LOAD_FAMILIES[STATE.settings.font];
    if (!family) return;

    const size = Math.max(1, Math.round(layout.fontSizePx || 32));
    // Each weight is a separate @font-face, so it is a separate download. Waiting for 400 while rendering 700 measures against a font that is not on screen yet.
    const fontSpec = `${STATE.settings.textBold ? 700 : 400} ${size}px ${family}`;
    pushTimingRecord('font_load_start', { fontSpec });
    const t0 = performance.now();
    await document.fonts.load(fontSpec);
    pushTimingRecord('font_load_end', { fontSpec, durationMs: Math.round(performance.now() - t0) });
  }

  function rebuildChunksAfterFontReady() {
    const player = mountOverlay({ skipOverlayLayout: true });
    if (!player || !STATE.words.length) {
      // Layout is normally applied at the end of a rebuild to avoid a flash of the wrong line count. With no transcript there is no rebuild, so apply it now or the setting sits in STATE looking like it did nothing.
      applyOverlayLayoutNow();
      return;
    }

    const requestId = ++STATE.fontLoadRequestId;
    const layout = STATE.layout;

    waitForCurrentFont(layout).finally(() => {
      if (requestId !== STATE.fontLoadRequestId) return;
      rebuildChunksForLayout('font_ready', true);
    });
  }

  function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function getChunkBuildSignature() {
    const layout = STATE.layout || {};
    const firstWord = STATE.words[0];
    const lastWord = STATE.words[STATE.words.length - 1];
    return [
      STATE.videoId || currentVideoId() || '',
      STATE.words.length,
      firstWord?.startMs ?? '',
      lastWord?.startMs ?? '',
      lastWord?.text ?? '',
      layout.textWidthPx ?? '',
      layout.fontSizePx ?? '',
      layout.targetLines ?? '',
      STATE.settings.textSize,
      STATE.settings.font,
      STATE.settings.allCaps ? 'caps' : 'normal',
      // Bold glyphs are wider, so the same words wrap differently. Without this the rebuild is skipped as "unchanged" and captions keep the word grouping measured at regular weight.
      STATE.settings.textBold ? 'bold' : 'normal',
      DEBUG.enabled ? 'debug' : 'normal',
    ].join('|');
  }

  function scheduleResizeRebuild() {
    if (STATE.resizeTimerId) clearTimeout(STATE.resizeTimerId);
    STATE.resizeTimerId = setTimeout(() => {
      STATE.resizeTimerId = null;
      if (!STATE.words.length || !STATE.layout) return;
      if (STATE.chunks.length && getChunkBuildSignature() === STATE.chunkBuildSignature) {
        pushTimingRecord('chunk_build_skip', {
          reason: 'resize_settled',
          wordCount: STATE.words.length,
          cause: 'unchanged',
        });
        renderCurrentCaption(true);
        return;
      }
      rebuildChunksForLayout('resize_settled');
    }, 400);
  }

  // Push the current layout onto the overlay. Used when a rebuild cannot run, so
  // that an appearance change still reaches the screen.
  function applyOverlayLayoutNow() {
    if (STATE.overlay && STATE.layout) applyLayout(STATE.overlay, STATE.layout);
  }

  async function rebuildChunksForLayout(reason = 'unknown', deferOverlay = false) {
    const player = mountOverlay({ skipOverlayLayout: deferOverlay });
    if (!player || !STATE.words.length) {
      if (deferOverlay) applyOverlayLayoutNow();
      return;
    }

    const signature = getChunkBuildSignature();
    if (STATE.chunks.length && signature === STATE.chunkBuildSignature) {
      pushTimingRecord('chunk_build_skip', { reason, wordCount: STATE.words.length, cause: 'unchanged' });
      if (deferOverlay && STATE.overlay && STATE.layout) applyLayout(STATE.overlay, STATE.layout);
      renderCurrentCaption(true);
      return;
    }
    if (signature === STATE.chunkBuildInFlightSignature) {
      pushTimingRecord('chunk_build_skip', { reason, wordCount: STATE.words.length, cause: 'already_running' });
      return;
    }

    const requestId = ++STATE.chunkBuildRequestId;
    STATE.chunkBuildInFlightSignature = signature;
    pushTimingRecord('chunk_build_start', { reason, wordCount: STATE.words.length });
    const t0 = performance.now();
    const chunkResult = await chunkWords(STATE.words, getRuntimeConfig(), requestId);
    if (STATE.chunkBuildInFlightSignature === signature) {
      STATE.chunkBuildInFlightSignature = null;
    }
    if (chunkResult === null || requestId !== STATE.chunkBuildRequestId) return;

    pushTimingRecord('chunk_build_end', {
      reason,
      wordCount: STATE.words.length,
      chunkCount: chunkResult.chunks.length,
      durationMs: Math.round(performance.now() - t0),
    });

    STATE.chunks = chunkResult.chunks;
    STATE.debugChunks = chunkResult.debugChunks;
    STATE.chunkBuildSignature = signature;
    log('rebuilt ' + STATE.chunks.length + ' chunks for layout width=' + STATE.layout.textWidthPx);
    logChunkBuildSummary();

    if (deferOverlay && STATE.overlay && STATE.layout) applyLayout(STATE.overlay, STATE.layout);
    renderCurrentCaption(true);
  }

  function classifyBreakChar(text) {
    const lastChar = text.trimEnd().slice(-1);
    return {
      terminal: /[.!?]/.test(lastChar),
      clause: /[,;:]/.test(lastChar),
    };
  }

  function hasEnoughTextForPunctuation(layout, cfg) {
    if (!layout) return false;

    return layout.lineCount >= Math.max(1, cfg.targetLines) &&
      layout.lastLineFill >= cfg.minPunctuationLastLineFill;
  }

  function snapshotOverlayMetrics() {
    if (!STATE.overlay || !STATE.overlayText || !STATE.layout) return null;

    const overlayStyle = window.getComputedStyle(STATE.overlay);
    const textStyle = window.getComputedStyle(STATE.overlayText);
    const rendered = measureNodeLayout(
      STATE.overlayText,
      STATE.overlayText.clientWidth || STATE.layout.textWidthPx,
      STATE.layout.targetLines,
      true
    );

    return {
      cssWidth: overlayStyle.width,
      cssFontSize: textStyle.fontSize,
      cssLineHeight: textStyle.lineHeight,
      innerWidthPx: STATE.overlayText.clientWidth,
      renderedLineCount: rendered.lineCount,
      renderedHeightLineCount: rendered.heightLineCount,
      renderedMaxLineCount: rendered.maxLineCount,
      renderedRawRectCount: rendered.rawRectCount,
      renderedLastLineFill: Number(rendered.lastLineFill.toFixed(3)),
      renderedFillRatio: Number(rendered.fillRatio.toFixed(3)),
      renderedClientHeight: roundNumber(rendered.clientHeight),
      renderedScrollHeight: roundNumber(rendered.scrollHeight),
      renderedOffsetHeight: roundNumber(rendered.offsetHeight),
      renderedLineHeightPx: roundNumber(rendered.lineHeightPx, 2),
    };
  }

  function logChunkBuildSummary() {
    if (!DEBUG.enabled || !STATE.layout) return;

    const buildPayload = {
      playerWidthPx: getPlayerElement()?.clientWidth || 0,
      targetLines: STATE.layout.targetLines,
      targetTextWidthPx: STATE.layout.textWidthPx,
      targetFontSizePx: STATE.layout.fontSizePx,
      targetLineHeight: STATE.layout.lineHeight,
      chunkCount: STATE.chunks.length,
    };
    pushDebugRecord('build', buildPayload);
    STATE.debugChunks.slice(0, DEBUG.maxChunkLogs).forEach(chunk => {
      const chunkPayload = {
        idx: chunk.idx,
        words: `${chunk.startWord}-${chunk.endWord}`,
        measuredLines: chunk.measuredLineCount,
        measuredHeightLines: chunk.measuredHeightLineCount,
        measuredMaxLines: chunk.measuredMaxLineCount,
        measuredRawRects: chunk.measuredRawRectCount,
        measuredFill: chunk.measuredFillRatio,
        lastLineFill: chunk.measuredLastLineFill,
        measuredClientHeight: chunk.measuredClientHeight,
        measuredScrollHeight: chunk.measuredScrollHeight,
        measuredOffsetHeight: chunk.measuredOffsetHeight,
        measuredLineHeightPx: chunk.measuredLineHeightPx,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        lastWordStartMs: chunk.lastWordStartMs,
        nextStartMs: chunk.nextStartMs,
        pauseAfterMs: chunk.pauseAfterMs,
        longPauseHideAtMs: chunk.longPauseHideAtMs,
        longPauseGapMs: chunk.longPauseGapMs,
        lastWordEndMs: chunk.lastWordEndMs ?? null,
        reason: chunk.reason,
        text: chunk.text,
      };
      pushDebugRecord('chunk', chunkPayload);
    });
  }

  function logRenderedChunk(chunkIndex, chunk, renderWindow) {
    if (!DEBUG.enabled || !chunk) return;

    const meta = STATE.debugChunks[chunkIndex];
    const rendered = snapshotOverlayMetrics();

    const renderPayload = {
      chunkIndex,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      lastWordStartMs: chunk.lastWordStartMs,
      lastWordEndMs: chunk.lastWordEndMs ?? null,
      nextStartMs: chunk.nextStartMs,
      pauseAfterMs: chunk.pauseAfterMs,
      longPauseHideAtMs: chunk.longPauseHideAtMs ?? null,
      longPauseGapMs: chunk.longPauseGapMs ?? null,
      windowEndMs: renderWindow?.windowEndMs ?? null,
      windowEndReason: renderWindow?.windowEndReason ?? null,
      text: chunk.text,
      measuredLines: meta?.measuredLineCount ?? null,
      measuredHeightLines: meta?.measuredHeightLineCount ?? null,
      measuredMaxLines: meta?.measuredMaxLineCount ?? null,
      measuredRawRects: meta?.measuredRawRectCount ?? null,
      measuredFill: meta?.measuredFillRatio ?? null,
      measuredLastLineFill: meta?.measuredLastLineFill ?? null,
      measuredClientHeight: meta?.measuredClientHeight ?? null,
      measuredScrollHeight: meta?.measuredScrollHeight ?? null,
      measuredOffsetHeight: meta?.measuredOffsetHeight ?? null,
      measuredLineHeightPx: meta?.measuredLineHeightPx ?? null,
      reason: meta?.reason ?? null,
      renderedLines: rendered?.renderedLineCount ?? null,
      renderedHeightLines: rendered?.renderedHeightLineCount ?? null,
      renderedMaxLines: rendered?.renderedMaxLineCount ?? null,
      renderedRawRects: rendered?.renderedRawRectCount ?? null,
      renderedFill: rendered?.renderedFillRatio ?? null,
      renderedLastLineFill: rendered?.renderedLastLineFill ?? null,
      renderedClientHeight: rendered?.renderedClientHeight ?? null,
      renderedScrollHeight: rendered?.renderedScrollHeight ?? null,
      renderedOffsetHeight: rendered?.renderedOffsetHeight ?? null,
      renderedLineHeightPx: rendered?.renderedLineHeightPx ?? null,
      cssWidth: rendered?.cssWidth ?? null,
      cssFontSize: rendered?.cssFontSize ?? null,
      cssLineHeight: rendered?.cssLineHeight ?? null,
      innerWidthPx: rendered?.innerWidthPx ?? null,
    };
    pushDebugRecord('render', renderPayload);
    if (meta?.candidates?.length) {
      meta.candidates.forEach(candidate => {
        const candidatePayload = {
          chunkIndex,
          ...candidate,
        };
        pushDebugRecord('candidate', candidatePayload);
      });
    }
  }

  function roundNumber(value, digits = 0) {
    return Number.isFinite(value)
      ? Number(value.toFixed(digits))
      : null;
  }

  function onTimedtextBody(url, text) {
    if (!text || text.length === 0) return;
    let vid;
    try { vid = new URL(url).searchParams.get('v'); } catch { return; }
    if (!vid) return;
    STATE.timedtextResponseCount += 1;
    STATE.lastTimedtextResponse = {
      vid,
      length: text.length,
      atMs: Math.round(performance.now()),
    };
    ffLog('timedtext_intercepted', { vid, len: text.length, responseCount: STATE.timedtextResponseCount });
    window.__ketuviaLastTimedtext = {
      videoId: vid,
      url,
      receivedAt: new Date().toISOString(),
      text,
    };
    pushDebugRecord('raw_stored', {
      videoId: vid,
      url,
      length: text.length,
    });
    captionLoadDebug('timedtext_response', {
      vid,
      length: text.length,
      responseCount: STATE.timedtextResponseCount,
      preview: text.slice(0, 60),
    });
    log('intercepted timedtext vid=' + vid + ' len=' + text.length);
    if (STATE.videoId && vid !== STATE.videoId) {
      // Timedtext request is itself the authoritative signal that captions for a new video are loading — the URL update / navigate-finish often races behind it (especially on Shorts scroll). Reset and adopt.
      resetForNewVideo();
      STATE.videoId = vid;
    }
    if (!STATE.videoId) STATE.videoId = vid;
    processTimedtext(text);
  }

  function rewriteTimedtextUrl(url) {
    try {
      const u = new URL(url);
      u.searchParams.set('fmt', 'json3');
      return u.toString();
    } catch { return url; }
  }

  const _origFetch = window.fetch;

    window.fetch = function (input, init) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      const isTimedtext = url.includes('timedtext');

      if (isTimedtext) {
        const newUrl = rewriteTimedtextUrl(url);
        STATE.timedtextRequestCount += 1;
        STATE.lastTimedtextRequest = {
          transport: 'fetch',
          originalUrl: url,
          rewrittenUrl: newUrl,
          atMs: Math.round(performance.now()),
        };
        captionLoadDebug('timedtext_request', {
          transport: 'fetch',
          requestCount: STATE.timedtextRequestCount,
          originalFmt: (() => { try { return new URL(url).searchParams.get('fmt'); } catch { return null; } })(),
          rewrittenFmt: (() => { try { return new URL(newUrl).searchParams.get('fmt'); } catch { return null; } })(),
        });

        const req =
          typeof input === 'string'
            ? newUrl
            : new Request(newUrl, input);

        const p = _origFetch.call(this, req, init);
        p.then(resp => {
          resp.clone().text()
            .then(t => onTimedtextBody(newUrl, t))
            .catch(() => {});
        });
        return p;
      }

      return _origFetch.apply(this, arguments);
    };

  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      const isTimedtext =
        typeof url === 'string' &&
        url.includes('timedtext');

      if (isTimedtext) {
        const newUrl = rewriteTimedtextUrl(url);
        this._rechunkUrl = newUrl;
        STATE.timedtextRequestCount += 1;
        STATE.lastTimedtextRequest = {
          transport: 'xhr',
          originalUrl: url,
          rewrittenUrl: newUrl,
          atMs: Math.round(performance.now()),
        };
        captionLoadDebug('timedtext_request', {
          transport: 'xhr',
          requestCount: STATE.timedtextRequestCount,
          originalFmt: (() => { try { return new URL(url).searchParams.get('fmt'); } catch { return null; } })(),
          rewrittenFmt: (() => { try { return new URL(newUrl).searchParams.get('fmt'); } catch { return null; } })(),
        });

        return _XHROpen.call(
          this,
          method,
          newUrl,
          ...Array.prototype.slice.call(arguments, 2)
        );
      }

      return _XHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      const args = arguments;
      if (this._rechunkUrl) {
        this.addEventListener('load', () => {
          onTimedtextBody(this._rechunkUrl, this.responseText);
        });
      }

      return _XHRSend.apply(this, args);
    };

  // Mark when our fetch/XHR interceptor finished installing (only during a Firefox diagnostic session). Comparing this against the timedtext request's start time in performance entries reveals whether YouTube's request fired before we could patch — the core of the refresh race.
  try {
    if (FFDIAG.isFirefox && ffSessionActive()) {
      window.__ketuviaInterceptorMs = Math.round(performance.now());
      ffLog('interceptor_installed', { atMs: window.__ketuviaInterceptorMs });
    }
  } catch {}

  function processTimedtext(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      captionLoadDebug('timedtext_parse_failed', {
        error: e.message,
        length: text.length,
        preview: text.slice(0, 120),
      });
      warn('timedtext not JSON: ' + e.message + ' start=' + text.slice(0, 80));
      setStatus('error'); return;
    }
    const words = extractWords(data);
    if (!words.length) {
      STATE.lastTimedtextResponse = {
        ...(STATE.lastTimedtextResponse || {}),
        zeroWords: true,
        eventCount: (data.events || []).length,
      };
      warn('zero words extracted. events=' + (data.events || []).length);
      setStatus('error'); return;
    }
    STATE.words = words;
    STATE.chunkBuildSignature = null;
    STATE.chunkBuildInFlightSignature = null;
    clearTriggerRetry();
    captionLoadDebug('timedtext_parsed', {
      eventCount: (data.events || []).length,
      wordCount: words.length,
      storedWordsLength: STATE.words.length,
    });
    if (!STATE.enabled || !areNativeCaptionsEnabled()) {
      captionLoadDebug('timedtext_stored_not_rendered', {
        reason: !STATE.enabled ? 'ketuvia_disabled' : 'native_cc_off',
        storedWordsLength: STATE.words.length,
      });
      clearKetuviaOverlay();
      return;
    }
    mountOverlay();
    setStatus('active');
    startPolling();
    // The first build measures the caption font, so it has to wait for that font the same way a font change does.
    rebuildChunksAfterFontReady();
  }

  function currentVideoId() {
    if (location.pathname.startsWith('/shorts/')) {
      return location.pathname.split('/shorts/')[1]?.split('?')[0] || null;
    }
    if (location.pathname !== '/watch') return null;
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  }

  function readCaptionTracks() {
    const pr = window.ytInitialPlayerResponse;
    return pr && pr.captions
        && pr.captions.playerCaptionsTracklistRenderer
        && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
  }

  function clearNavRetry() {
    if (STATE.navRetryId) clearTimeout(STATE.navRetryId);
    STATE.navRetryId = null;
    STATE.navRetryUntil = 0;
  }

  function scheduleNavRetry() {
    if (!STATE.videoId || STATE.chunks.length) return;

    if (!STATE.navRetryUntil) {
      STATE.navRetryUntil = Date.now() + CFG.navRetryForMs;
    }

    if (STATE.navRetryId) return;

    const remaining = STATE.navRetryUntil - Date.now();
    if (remaining <= 0) {
      clearNavRetry();
      STATE.statusMode = 'unavailable';
      return;
    }

    STATE.navRetryId = setTimeout(() => {
      STATE.navRetryId = null;
      checkNavigation();
    }, Math.min(CFG.navRetryMs, remaining));
  }

  function clearTriggerRetry() {
    if (STATE.triggerRetryId) clearTimeout(STATE.triggerRetryId);
    STATE.triggerRetryId = null;
  }

  function isCaptionsApiReady(player) {
    if (!player || typeof player.getOptions !== 'function') return false;
    try {
      const options = player.getOptions('captions');
      return Array.isArray(options) && options.length > 0;
    } catch {
      return false;
    }
  }

  function triggerCaptionLoad() {
    if (
      !STATE.videoId ||
      !STATE.asrLang ||
      !STATE.enabled ||
      STATE.chunks.length ||
      !areNativeCaptionsEnabled()
    ) {
      captionLoadDebug('trigger_skipped', {
        hasVideoId: Boolean(STATE.videoId),
        asrLang: STATE.asrLang,
      });
      return;
    }

    const player = document.getElementById('movie_player');
    if (!player || typeof player.setOption !== 'function') {
      captionLoadDebug('trigger_waiting_for_player', {
        hasPlayer: Boolean(player),
        hasSetOption: Boolean(player && typeof player.setOption === 'function'),
      });
      clearTriggerRetry();
      STATE.triggerRetryId = setTimeout(() => {
        STATE.triggerRetryId = null;
        triggerCaptionLoad();
      }, 300);
      return;
    }

    if (typeof player.loadModule === 'function') {
      try { player.loadModule('captions'); } catch {}
    }

    if (!isCaptionsApiReady(player)) {
      captionLoadDebug('trigger_waiting_for_captions_api');
      clearTriggerRetry();
      STATE.triggerRetryId = setTimeout(() => {
        STATE.triggerRetryId = null;
        triggerCaptionLoad();
      }, 300);
      return;
    }

    STATE.triggerAttempts += 1;
    STATE.triggered = true;
    log(
      'triggering caption load attempt=' +
      STATE.triggerAttempts +
      ' lang=' +
      STATE.asrLang
    );
    STATE.lastCaptionTrigger = {
      attempt: STATE.triggerAttempts,
      lang: STATE.asrLang,
      atMs: Math.round(performance.now()),
    };
    captionLoadDebug('trigger_attempt', {
      lang: STATE.asrLang,
      captionsOptions: (() => {
        try { return player.getOptions('captions'); } catch { return null; }
      })(),
    });

    let requested = false;

    try {
      player.setOption('captions', 'reload', true);
      requested = true;
      captionLoadDebug('setOption_reload_ok');
    } catch (e) {
      captionLoadDebug('setOption_reload_failed', { error: e.message });
    }

    if (STATE.statusMode !== 'loading') {
      setStatus('loading');
    }

    clearTriggerRetry();
    STATE.triggerRetryId = setTimeout(() => {
      STATE.triggerRetryId = null;
      if (
        STATE.chunks.length ||
        !STATE.enabled ||
        !STATE.videoId ||
        !areNativeCaptionsEnabled()
      ) return;

      if (!requested || STATE.triggerAttempts < CFG.maxTriggerAttempts) {
        triggerCaptionLoad();
        return;
      }

      captionLoadDebug('trigger_failed_no_timedtext', {
        lastCaptionTrigger: STATE.lastCaptionTrigger,
        timedtextRequestCount: STATE.timedtextRequestCount,
        timedtextResponseCount: STATE.timedtextResponseCount,
        lastTimedtextRequest: STATE.lastTimedtextRequest,
        lastTimedtextResponse: STATE.lastTimedtextResponse,
        lastCaptionTracks: STATE.lastCaptionTracks,
      });
      warn('timedtext not intercepted after ' + STATE.triggerAttempts + ' attempts');
      setStatus('error');
    }, CFG.triggerRetryMs);
  }

  function checkNavigation() {
    const vid = currentVideoId();
    if (!vid) { if (STATE.videoId) resetForNewVideo(); return; }

    const isSameVideo = vid === STATE.videoId;
    if (!isSameVideo) {
      resetForNewVideo();
      STATE.videoId = vid;
      STATE.navRetryUntil = Date.now() + CFG.navRetryForMs;
    }

    const tracks = readCaptionTracks();
    if (!tracks || !tracks.length) {
      STATE.lastCaptionTracks = null;
      captionLoadDebug('tracks_missing');
      setStatus('loading');
      scheduleNavRetry();
      return;
    }

    clearNavRetry();

    const asr = tracks.find(t => t.kind === 'asr');
    STATE.lastCaptionTracks = tracks.map(track => ({
      kind: track.kind || null,
      languageCode: track.languageCode || null,
      name: track.name?.simpleText || track.name?.runs?.map(run => run.text).join('') || null,
      hasBaseUrl: Boolean(track.baseUrl),
    }));
    captionLoadDebug('tracks_found', {
      trackCount: tracks.length,
      tracks: STATE.lastCaptionTracks,
      selectedAsrLang: asr?.languageCode || null,
    });
    if (!asr) {
      STATE.statusMode = 'unavailable'; return;
    }

    STATE.asrLang = asr.languageCode || 'en';
    if (!isSameVideo || STATE.statusMode !== 'active') {
      log('asr track lang=' + STATE.asrLang + ' for ' + vid);
    }

    if (STATE.enabled && !STATE.chunks.length && areNativeCaptionsEnabled()) {
      setStatus('loading');
      waitForPlayerThenTrigger();
    }
  }

  function waitForPlayerThenTrigger() {
    if (
      STATE.statusMode === 'active' ||
      !STATE.enabled ||
      STATE.chunks.length ||
      !areNativeCaptionsEnabled()
    ) return;
    if (STATE.triggerRetryId) return;
    clearTriggerRetry();
    STATE.triggerRetryId = setTimeout(() => {
      STATE.triggerRetryId = null;
      triggerCaptionLoad();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkNavigation, { once: true });
  } else {
    checkNavigation();
  }

  // Resume the Firefox diagnostic on this fresh page load if a session is still active (it persists in sessionStorage across refreshes). Runs from the very start of the page so the initial-request race window is captured.
  ffStart();
  document.addEventListener('yt-navigate-start',  () => { if (STATE.videoId && currentVideoId() !== STATE.videoId) resetForNewVideo(); }, true);
  document.addEventListener('yt-navigate-finish', () => {
    pushTimingRecord('navigate_finish', { videoId: currentVideoId() || null });
    setTimeout(checkNavigation, 0);
  }, true);

  // Words that cannot end an English phrase. A line ending on one was broken by
  // something that could not read it.
  const PHRASE_GLUE = new Set((
    'a an the this that these those my your his her its our their ' +
    'of to in on at by for with from into onto upon over under about across through during ' +
    'and or but nor so yet as if than then because while when where whether which who whom whose ' +
    'is are was were am be been being do does did have has had ' +
    'will would shall should can could may might must ' +
    'no not any some each every either neither both all ' +
    'i you he she it we they there here what how why'
  ).split(' '));

  // Whether a manual track's line breaks came from a tool fitting text to a width rather than from the creator. Obeying a fitter's breaks lays captions out for someone else's box: each holds part of a wrapped block, so it cannot fill the chosen number of lines and strands a word or two on the last row. A fitter breaks wherever the width runs out, so it ends lines on "of" or "the" as readily as anywhere. A person ends a line at punctuation or a phrase boundary and never on a word that belongs to the next one. Scoring the breaks that way separates the two by a wide margin, where every measure of line length or timing overlapped: fitted tracks score 0.26 and above, lyrics and verse 0.04 and below. Only breaks INSIDE a caption count. Where each caption is one line, which is the usual shape for lyrics, there is no internal layout to attribute at all.
  // How fast the caption stream delivers text. Speech runs 14 to 17 characters a second; singing and recitation run 2 to 11, because the words are held to the music.
function deliveryCharsPerSecond(textEvents) {
  let chars = 0, ms = 0;
  for (const item of textEvents) {
    const dur = Number(item.ev.dDurationMs);
    if (!Number.isFinite(dur) || dur <= 0) continue;
    ms += dur;
    chars += item.text.trim().length;
  }
  return ms > 0 ? chars / (ms / 1000) : null;
}

// A creator's line break is worth keeping only when its timing carries meaning, which is what separates a lyric from a sentence a tool happened to cut in half.
function mayRechunkAcrossLines(textEvents, cfg) {
  if (!textEvents.length) return false;
  const rate = deliveryCharsPerSecond(textEvents);
  if (rate != null) return rate > cfg.minSpeechCharsPerSecond;
  return lineBreaksLookMechanical(textEvents, cfg);
}

// Fallback for files that carry no durations: judge the grammar of the breaks themselves.
function lineBreaksLookMechanical(textEvents, cfg) {
    if (!textEvents.length) return false;

    let withBreak = 0;
    let breaks = 0;
    let glueEndings = 0;
    let punctuationEndings = 0;

    for (const item of textEvents) {
      const lines = item.text.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length > 1) withBreak += 1;

      for (let i = 0; i < lines.length - 1; i++) {
        const words = lines[i].split(/\s+/);
        const last = words[words.length - 1] || '';
        breaks += 1;
        if (/[.,!?;:…]$/.test(last)) punctuationEndings += 1;
        else if (PHRASE_GLUE.has(last.toLowerCase().replace(/[^a-z']/g, ''))) glueEndings += 1;
      }
    }

    if (withBreak / textEvents.length <= cfg.minCaptionsWithBreak) return false;
    if (breaks < cfg.minBreaks) return false;
    return (glueEndings - punctuationEndings) / breaks > cfg.minFittedScore;
  }

  function getTextEventInfo(json3) {
    const events = json3.events || [];
    const textEvents = [];
    let newlineEventCount = 0;

    for (const [eventIndex, ev] of events.entries()) {
      const segs = ev.segs || [];
      if (!segs.length) continue;
      const text = segs.map(seg => seg.utf8 || '').join('');
      if (text === '\n') {
        newlineEventCount += 1;
        continue;
      }
      textEvents.push({ eventIndex, ev, text });
    }

    const singleSegmentEvents = textEvents.filter(item => (item.ev.segs || []).length === 1).length;
    const timedWindowEvents = textEvents.filter(item => Object.hasOwn(item.ev, 'wWinId')).length;
    const manualCaptionLike =
      textEvents.length > 0 &&
      newlineEventCount === 0 &&
      timedWindowEvents === 0 &&
      singleSegmentEvents / textEvents.length >= 0.9;

    // Word-timed tracks carry no creator line breaks, so there is nothing to keep.
    const linesAreAuthored =
      !manualCaptionLike || !mayRechunkAcrossLines(textEvents, CFG.fittedLines);

    return {
      events,
      textEvents,
      newlineEventCount,
      linesAreAuthored,
      sourceKind: manualCaptionLike ? 'manual_event_captions' : 'word_timed_captions',
    };
  }

  function extractWords(json3) {
    const out = [];
    const eventInfo = getTextEventInfo(json3);
    const debug = DEBUG.enabled
      ? {
          eventCount: eventInfo.events.length,
          textEventCount: eventInfo.textEvents.length,
          newlineEventCount: eventInfo.newlineEventCount,
          sourceKind: eventInfo.sourceKind,
          linesAreAuthored: eventInfo.linesAreAuthored,
          inputSegCount: 0,
          outputTokenCount: 0,
          multiWordSegCount: 0,
          skippedNonTextCount: 0,
          skippedNonIncreasingStartCount: 0,
          samples: [],
        }
      : null;
    let lastStart = -1;
    // Synthetic index incremented per sub-line for manual captions so that
    // the preserveEventBoundary check in chunkWords breaks at \n boundaries.
    let subLineCounter = 0;
    for (const [eventIndex, ev] of eventInfo.events.entries()) {
      if (!ev.segs) continue;
      const base = ev.tStartMs || 0;
      const eventDurationMs = ev.dDurationMs || 0;
      const eventEndMs = base + eventDurationMs;
      for (const [segIndex, s] of ev.segs.entries()) {
        if (debug) debug.inputSegCount += 1;
        const text = s.utf8;
        if (!text || text === '\n') {
          if (debug) debug.skippedNonTextCount += 1;
          continue;
        }
        const start = base + (s.tOffsetMs || 0);

        if (eventInfo.sourceKind === 'manual_event_captions') {
          // One event is one caption on YouTube, so the event boundary is the real one. A newline inside an event is the captioner fitting YouTube's width, not a lyric boundary, so those words keep the event's index and the box re-wraps them. Splitting there delays half the line past when YouTube shows it.
          const subLines = text.split('\n').map(l => l.trim()).filter(Boolean);
          if (!subLines.length) {
            if (debug) debug.skippedNonTextCount += 1;
            continue;
          }
          const totalChars = subLines.reduce((s, l) => s + l.length, 0) || 1;
          const eventDur = Math.max(0, eventEndMs - start);
          let subLineStart = start;
          for (let li = 0; li < subLines.length; li++) {
            const line = subLines[li];
            const subLineEnd = li === subLines.length - 1
              ? eventEndMs
              : subLineStart + Math.round((line.length / totalChars) * eventDur);
            const subLineDur = Math.max(0, subLineEnd - subLineStart);
            const lineWords = line.split(/\s+/).filter(Boolean);
            const syntheticEventIndex = subLineCounter;
            for (let wi = 0; wi < lineWords.length; wi++) {
              const wordStart = subLineStart + Math.round((wi / lineWords.length) * subLineDur);
              if (wordStart <= lastStart) {
                if (debug) debug.skippedNonIncreasingStartCount += 1;
                continue;
              }
              out.push({
                start: wordStart,
                end: subLineEnd,
                text: lineWords[wi],
                eventIndex: syntheticEventIndex,
                sourceKind: eventInfo.sourceKind,
                preserveEventBoundary: eventInfo.linesAreAuthored,
              });
              if (debug && debug.samples.length < 30) {
                debug.samples.push({
                  eventIndex: syntheticEventIndex,
                  segIndex,
                  eventStartMs: base,
                  eventDurationMs,
                  segOffsetMs: s.tOffsetMs || 0,
                  startMs: wordStart,
                  tokenCount: 1,
                  keptAs: 'manual-word',
                  text: lineWords[wi],
                  tokens: [lineWords[wi]],
                });
              }
              lastStart = wordStart;
            }
            subLineStart = subLineEnd;
          }
          subLineCounter++;
        } else {
          if (start <= lastStart) {
            if (debug) debug.skippedNonIncreasingStartCount += 1;
            continue;
          }
          // A segment holding a whole line cannot be wrapped, so a line too long for the box overflows it. Split it into words the chunker can re-wrap, and keep the segment boundary so captions still land on the segment's own timing.
          const segWords = text.trim().split(/\s+/).filter(Boolean);
          if (segWords.length > 1) {
            const nextSeg = ev.segs[segIndex + 1];
            const nextEvent = eventInfo.events[eventIndex + 1];
            // Rolling captions overlap, so a word spread past the next event's start would be dropped as out of order.
            const segEndMs = nextSeg
              ? base + (nextSeg.tOffsetMs || 0)
              : Math.min(eventEndMs || Infinity, nextEvent?.tStartMs ?? (eventEndMs || start));
            const segSpanMs = Math.max(0, segEndMs - start);
            for (let wi = 0; wi < segWords.length; wi++) {
              // Never skip a word for timing: nudging it a millisecond later keeps the order without losing text.
              const wordStart = Math.max(lastStart + 1,
                start + Math.round((wi / segWords.length) * segSpanMs));
              out.push({
                start: wordStart,
                end: null,
                text: segWords[wi],
                eventIndex,
                sourceKind: eventInfo.sourceKind,
                // Where YouTube ended a segment is not where the creator ended a line, so it is no reason to end a caption. Forcing a break here stops captions merging, which is the whole point of re-chunking.
                preserveEventBoundary: false,
              });
              lastStart = wordStart;
            }
            if (debug) debug.multiWordSegCount += 1;
            continue;
          }
          out.push({
            start,
            end: null,
            text,
            eventIndex,
            sourceKind: eventInfo.sourceKind,
            preserveEventBoundary: false,
          });
          if (debug) {
            const tokens = text.trim().split(/\s+/).filter(Boolean);
            if (tokens.length > 1) debug.multiWordSegCount += 1;
            if (debug.samples.length < 30 || tokens.length > 1) {
              debug.samples.push({
                eventIndex,
                segIndex,
                eventStartMs: base,
                eventDurationMs,
                segOffsetMs: s.tOffsetMs || 0,
                startMs: start,
                tokenCount: tokens.length,
                keptAs: 'segment',
                text,
                tokens,
              });
            }
          }
          lastStart = start;
        }
      }
    }
    if (debug) {
      debug.outputTokenCount = out.length;
      pushDebugRecord('extract', debug);
    }
    return out;
  }

async function chunkWords(words, cfg, requestId) {
  const chunks = [];
  const debugChunks = [];
  // Why each caption ended and how many lines it was predicted to need. Debug mode measures differently, so it cannot answer this for the fast path.
  const chunkTrace = [];
  const shouldDebug = DEBUG.enabled;
  const pendingVerification = [];
  if (!words.length) return { chunks, debugChunks };
  let nextYieldAt = performance.now() + cfg.rebuildYieldMs;

  // Precompute per-word canvas widths once so the hot loop never touches the DOM
  // for overflow detection. Falls back to DOM measurement if canvas is unavailable.
  const canvasW = STATE.layout?.textWidthPx ?? 0;
  let cwWidths = null; // Float32Array indexed by word index
  let cwSpaceW = 0;

  // The measurer must carry the weight the captions will render at BEFORE anything is measured. Overlay styling is deferred to the end of the rebuild to avoid flashes, but the measurer is invisible, so it gets the weight now.
  if (STATE.measurer) {
    STATE.measurer.style.setProperty('--rechunk-font-weight', STATE.settings.textBold ? '700' : '400');
  }
  pushTimingRecord('canvas_precompute_start', { wordCount: words.length });
  const preT0 = performance.now();
  if (canvasW > 0 && STATE.measurerText) {
    try {
      const style = window.getComputedStyle(STATE.measurerText);
      // Use a document-created canvas so it shares the document's font registry
      // and correctly loads custom @font-face fonts (OffscreenCanvas does not).
      const cvs = document.createElement('canvas');
      const ctx = cvs.getContext('2d');
      // Build the font string from individual properties instead of the `font` shorthand. The shorthand returns an empty string when any font-variant-* sub-property is non-default (e.g. font-variant-ligatures:none on Cascadia), which silently resets the canvas to its default 10px sans-serif font.
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // What the chunker actually measured with. Silent disagreement with the rendered font or box is what makes captions overflow.
      const primaryFamily = style.fontFamily.split(',')[0].trim();
      window.__ketuviaCanvas = {
        font: ctx.font,
        faceLoaded: document.fonts?.check?.(`${style.fontWeight} ${style.fontSize} ${primaryFamily}`) ?? null,
        boxPx: canvasW,
        renderedPx: Math.round(STATE.measurerText.getBoundingClientRect().width),
      };
      const lsPx = parseFloat(style.letterSpacing) || 0;
      cwSpaceW = ctx.measureText(' ').width + lsPx;
      // Store per-token widths per segment. Each segment may contain multiple space-separated tokens; we must wrap at each token boundary, not at segment boundaries, to match DOM word-wrap behaviour.
      cwWidths = new Array(words.length);
      for (let i = 0; i < words.length; i++) {
        const norm = normalizeCaptionText(words[i].text);
        const tokens = norm ? norm.split(' ').filter(Boolean) : [];
        cwWidths[i] = tokens.map(tk => {
          const t = getDisplayText(tk);
          return t ? ctx.measureText(t).width + lsPx * t.length : 0;
        });
      }
    } catch { cwWidths = null; }
  }
  const totalTokenCount = cwWidths ? cwWidths.reduce((s, arr) => s + arr.length, 0) : 0;
  pushTimingRecord('canvas_precompute_end', {
    wordCount: words.length,
    totalTokenCount,
    usedCanvas: Boolean(cwWidths),
    durationMs: Math.round(performance.now() - preT0),
  });

  // Simulate CSS word-wrapping using precomputed token widths. Returns null if canvas unavailable.
  // Canvas metrics and real layout differ by a fraction of a pixel per glyph, which decides the wrap when a line lands at 99% full, so pack to a slightly narrower box and the real layout always fits what was planned.
  const wrapW = canvasW * cfg.wrapSafety;
  function fastLineInfo(from, to) {
    if (!cwWidths) return null;
    let x = 0, lines = 1, any = false;
    for (let i = from; i < to; i++) {
      for (const w of cwWidths[i]) {
        if (!w) continue;
        if (any && x + cwSpaceW + w > wrapW) { lines++; x = w; }
        else { x += any ? cwSpaceW + w : w; any = true; }
      }
    }
    return { lineCount: lines, lastLineFill: any ? Math.min(1, x / wrapW) : 0 };
  }

  function fastHasMinFill(from, to) {
    const fi = fastLineInfo(from, to);
    if (!fi) return null; // null = unknown, caller must fall back to DOM
    return fi.lineCount >= Math.max(1, cfg.targetLines) && fi.lastLineFill >= cfg.minPunctuationLastLineFill;
  }

  const pushChunk = (startIndex, endIndexExclusive, meta) => {
    if (endIndexExclusive <= startIndex) return;

    const text = meta.text || joinWords(words.slice(startIndex, endIndexExclusive));
    if (!text) return;

    const startMs = words[startIndex].start;
    const lastWordStart = words[endIndexExclusive - 1].start;
    const lastWordEnd = words[endIndexExclusive - 1].end;
    const lastTimedPoint = lastWordEnd ?? lastWordStart;
    const nextStart = words[endIndexExclusive]?.start;
    const pauseAfterMs = nextStart != null ? nextStart - lastTimedPoint : null;
    const longPauseHideAtMs = pauseAfterMs != null && pauseAfterMs >= cfg.longPauseThresholdMs
      ? lastTimedPoint + cfg.longPauseHoldMs
      : null;
    const longPauseGapMs = longPauseHideAtMs != null && nextStart != null
      ? nextStart - longPauseHideAtMs
      : null;

    let endMs =
      nextStart != null
        ? nextStart
        : (lastWordStart + cfg.minDurMs);

    if (endMs - startMs < cfg.minDurMs) {
      endMs = startMs + cfg.minDurMs;
    }

    if (endMs - startMs > cfg.maxDurMs) {
      endMs = startMs + cfg.maxDurMs;
    }

    const displayText = getDisplayText(text);
    chunks.push({
      startMs,
      endMs,
      lastWordStartMs: lastWordStart,
      lastWordEndMs: lastWordEnd ?? null,
      nextStartMs: nextStart ?? null,
      pauseAfterMs,
      longPauseHideAtMs,
      longPauseGapMs,
      // One line the creator wrote. If it overflows the box it gets an even wrap.
      fromCreatorLine: meta.reason === 'manual_caption_event_boundary',
      text: displayText,
    });
    chunkTrace.push({ reason: meta.reason, lines: meta.layout?.lineCount ?? null,
                      startMs, text: displayText });
    if (shouldDebug) {
      debugChunks.push({
        idx: chunks.length - 1,
        startWord: startIndex,
        endWord: endIndexExclusive - 1,
        startMs,
        endMs,
        lastWordStartMs: lastWordStart,
        lastWordEndMs: lastWordEnd ?? null,
        nextStartMs: nextStart ?? null,
        pauseAfterMs,
        longPauseHideAtMs,
        longPauseGapMs,
        measuredLineCount: meta.layout.lineCount,
        measuredHeightLineCount: meta.layout.heightLineCount,
        measuredMaxLineCount: meta.layout.maxLineCount,
        measuredRawRectCount: meta.layout.rawRectCount,
        measuredFillRatio: Number(meta.layout.fillRatio.toFixed(3)),
        measuredLastLineFill: Number(meta.layout.lastLineFill.toFixed(3)),
        measuredClientHeight: roundNumber(meta.layout.clientHeight),
        measuredScrollHeight: roundNumber(meta.layout.scrollHeight),
        measuredOffsetHeight: roundNumber(meta.layout.offsetHeight),
        measuredLineHeightPx: roundNumber(meta.layout.lineHeightPx, 2),
        reason: meta.reason,
        candidates: meta.candidates,
        text: displayText,
      });
    }
  };

  let start = 0;

  while (start < words.length) {
    let chosenEnd = -1;
    let chosenLayout = null;
    let reason = 'unknown';
    let chosenText = '';
    const candidateDebug = shouldDebug ? [] : null;

    // Binary search using canvas widths — zero DOM reflows.
    // Falls back to DOM if canvas is unavailable.
    let overflowAt = words.length + 1;
    {
      let lo = start + 1, hi = Math.min(words.length, start + cfg.maxWords);
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const lc = fastLineInfo(start, mid)?.lineCount
          ?? measureTextLayout(joinWords(words.slice(start, mid))).lineCount;
        if (lc > cfg.targetLines) { overflowAt = mid; hi = mid - 1; }
        else lo = mid + 1;
      }
    }
    const maxFit = overflowAt - 1;

    // Linear scan for early breaks within the fit window.
    // hasMinFill checks use canvas; only fall back to DOM when canvas unavailable.
    let text = '';
    let lastFitEnd = start;
    let lastFitText = '';

    for (let end = start + 1; end <= Math.min(maxFit, words.length); end++) {
      text = appendCaptionText(text, words[end - 1].text);
      const currentWord = words[end - 1];
      const nextWord = words[end];
      const gapAfterMs = nextWord ? nextWord.start - currentWord.start : 0;
      const breaks = classifyBreakChar(currentWord.text);
      lastFitEnd = end;
      lastFitText = text;

      if (
        nextWord &&
        currentWord.preserveEventBoundary &&
        currentWord.eventIndex !== nextWord.eventIndex
      ) {
        reason = 'manual_caption_event_boundary';
        chosenEnd = end; chosenText = text;
        break;
      }

      if (nextWord && /^\s*(>>|<<)/.test(nextWord.text)) {
        reason = 'speaker_change';
        chosenEnd = end; chosenText = text;
        break;
      }

      if (gapAfterMs >= cfg.hardPauseMs) {
        const hasMinFill = fastHasMinFill(start, end) ?? hasEnoughTextForPunctuation(measureTextLayout(text), cfg);
        reason = hasMinFill ? 'hard_pause_after_min_fill' : 'hard_pause_before_min_fill';
        chosenEnd = end; chosenText = text;
        break;
      }

      if (breaks.terminal || breaks.clause) {
        const hasMinFill = fastHasMinFill(start, end) ?? hasEnoughTextForPunctuation(measureTextLayout(text), cfg);
        if (hasMinFill) {
          reason = 'punctuation_after_min_fill';
          chosenEnd = end; chosenText = text;
          break;
        }
      }

      if (end - start >= cfg.maxWords) {
        reason = 'max_words_last_fit';
        chosenEnd = end; chosenText = text;
        break;
      }
    }

    // No early break: use overflow boundary or end of captions.
    if (chosenEnd <= start) {
      if (overflowAt <= words.length && maxFit > start) {
        let end = maxFit;
        // A creator's line too long for the box has to span several captions.
        // Split it evenly, or the last one holds a word on its own.
        if (words[start].preserveEventBoundary) {
          let lineEnd = start;
          while (lineEnd < words.length && words[lineEnd].eventIndex === words[start].eventIndex) lineEnd++;
          const lineWords = lineEnd - start;
          const perCaption = maxFit - start;
          if (lineWords > perCaption) {
            const captions = Math.ceil(lineWords / perCaption);
            end = Math.min(start + Math.ceil(lineWords / captions), maxFit);
          }
        }
        reason = 'last_word_that_fits_before_overflow';
        chosenEnd = end;
        chosenText = (end === lastFitEnd && lastFitText) ? lastFitText : joinWords(words.slice(start, end));
      } else if (lastFitEnd > start) {
        const fi = fastLineInfo(start, lastFitEnd);
        const fakeLayout = fi ?? measureTextLayout(lastFitText);
        reason = !hasEnoughTextForPunctuation(fakeLayout, cfg)
          ? 'end_of_captions_before_min_fill'
          : 'end_of_captions_last_fit';
        chosenEnd = lastFitEnd; chosenText = lastFitText;
      }
    }

    if (chosenEnd <= start) {
      chosenEnd = Math.min(start + 1, words.length);
      chosenText = joinWords(words.slice(start, chosenEnd));
      reason = 'forced_single_word';
    }

    // Resolve final layout. Overflow captions: deferred to a single batch DOM pass after the loop (non-debug). Debug mode: DOM for accurate metrics on every caption. Otherwise: use canvas estimates (no DOM reflow needed).
    if (reason === 'last_word_that_fits_before_overflow') {
      if (shouldDebug) {
        let verify = measureTextLayout(chosenText);
        while (verify.lineCount > cfg.targetLines && chosenEnd > start + 1) {
          chosenEnd--;
          chosenText = joinWords(words.slice(start, chosenEnd));
          verify = measureTextLayout(chosenText);
        }
        chosenLayout = verify;
      } else {
        const fi = fastLineInfo(start, chosenEnd);
        chosenLayout = fi
          ? { lineCount: fi.lineCount, lastLineFill: fi.lastLineFill, fillRatio: 0, heightLineCount: fi.lineCount, maxLineCount: fi.lineCount, rawRectCount: fi.lineCount, clientHeight: 0, scrollHeight: 0, offsetHeight: 0, lineHeightPx: 0 }
          : { lineCount: cfg.targetLines, lastLineFill: 1, fillRatio: 1, heightLineCount: cfg.targetLines, maxLineCount: cfg.targetLines, rawRectCount: cfg.targetLines, clientHeight: 0, scrollHeight: 0, offsetHeight: 0, lineHeightPx: 0 };
        pendingVerification.push({
          chunkIdx: chunks.length,
          displayText: getDisplayText(chosenText),
          startWord: start,
          endWord: chosenEnd,
        });
      }
    } else if (shouldDebug) {
      chosenLayout = measureTextLayout(chosenText);
    } else {
      const fi = fastLineInfo(start, chosenEnd);
      chosenLayout = fi
        ? { lineCount: fi.lineCount, lastLineFill: fi.lastLineFill, fillRatio: 0, heightLineCount: fi.lineCount, maxLineCount: fi.lineCount, rawRectCount: fi.lineCount, clientHeight: 0, scrollHeight: 0, offsetHeight: 0, lineHeightPx: 0 }
        : measureTextLayout(chosenText);
    }

    pushChunk(start, chosenEnd, {
      layout: chosenLayout || { lineCount: 0, fillRatio: 0, lastLineFill: 0 },
      reason,
      candidates: shouldDebug ? candidateDebug : null,
      text: chosenText,
    });
    start = chosenEnd;

    if (performance.now() >= nextYieldAt) {
      await yieldToBrowser();
      nextYieldAt = performance.now() + cfg.rebuildYieldMs;
      if (STATE.chunkBuildRequestId !== requestId) return null;
    }
  }

  if (!shouldDebug && pendingVerification.length > 0) {
    const batchResults = batchVerifyOverflows(pendingVerification);
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const item = pendingVerification[i];
      if (!result || result.lineCount <= cfg.targetLines) continue;
      // Canvas underestimated — trim sequentially (rare path, accepted cascade trade-off)
      let newEnd = item.endWord - 1;
      if (newEnd <= item.startWord) continue; // single-word caption overflows — can't trim further, leave as-is
      let trimText = joinWords(words.slice(item.startWord, newEnd));
      let trimLayout = measureTextLayout(trimText);
      while (trimLayout.lineCount > cfg.targetLines && newEnd > item.startWord + 1) {
        newEnd--;
        trimText = joinWords(words.slice(item.startWord, newEnd));
        trimLayout = measureTextLayout(trimText);
      }
      chunks[item.chunkIdx].text = getDisplayText(trimText);
      chunks[item.chunkIdx].lastWordStartMs = words[newEnd - 1].start;
      chunks[item.chunkIdx].lastWordEndMs = words[newEnd - 1].end ?? null;
    }
  }

  window.__ketuviaChunkTrace = chunkTrace;
  return { chunks, debugChunks };
}

  const _captionHideStyle = document.createElement('style');
  _captionHideStyle.textContent = '.ytp-caption-window-container{visibility:hidden!important}';

  function renderCurrentCaption(force = false) {
    if (!STATE.overlay || !STATE.enabled) return;
    if (!areNativeCaptionsEnabled()) {
      clearKetuviaOverlay();
      return;
    }
    if (!document.head.contains(_captionHideStyle)) {
      document.head.appendChild(_captionHideStyle);
    }

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video) return;

    const ms = (video.currentTime || 0) * 1000 + CFG.lookaheadMs;
    let active = '';
    let activeIndex = -1;
    let activeWindow = null;
    const N = STATE.chunks.length;

    for (let i = 0; i < N; i++) {
      const c = STATE.chunks[i];
      const next = STATE.chunks[i + 1];
      const shouldHideBeforeNext =
        c.longPauseHideAtMs != null &&
        next &&
        next.startMs > c.longPauseHideAtMs;
      const winEnd = shouldHideBeforeNext
        ? c.longPauseHideAtMs
        : next
          ? next.startMs
          : c.endMs;
      if (ms >= c.startMs && ms < winEnd) {
        active = c.text;
        activeIndex = i;
        activeWindow = {
          windowEndMs: winEnd,
          windowEndReason: shouldHideBeforeNext
            ? 'long_pause_hold_elapsed'
            : next
              ? 'next_chunk'
              : 'chunk_end',
        };
        break;
      }
      if (ms < c.startMs) break;
    }

    if (!force && active === STATE.lastText) return;

    if (STATE.overlayText) {
      STATE.overlayText.textContent = active;
    }
    STATE.overlay.dataset.empty = active ? '0' : '1';
    STATE.overlay.dataset.creatorLine =
      activeIndex >= 0 && STATE.chunks[activeIndex]?.fromCreatorLine ? '1' : '0';
    if (active && activeIndex >= 0) {
      logRenderedChunk(activeIndex, STATE.chunks[activeIndex], activeWindow);
    }
    STATE.lastText = active;
  }

  function startPolling() {
    if (STATE.pollId) return;
    const tick = () => {
      renderCurrentCaption();
    };
    STATE.pollId = setInterval(tick, CFG.pollMs);
  }

  function flashOverlay(msg) {
    if (!STATE.overlay || !STATE.overlayText) return;
    STATE.overlayText.textContent = msg;
    STATE.overlay.dataset.empty = '0';
    setTimeout(() => {
      if (STATE.overlay && STATE.overlayText && STATE.overlayText.textContent === msg) {
        STATE.overlayText.textContent = '';
        STATE.overlay.dataset.empty = '1';
      }
    }, 4000);
  }

  function resetForNewVideo() {
    if (STATE.pollId) clearInterval(STATE.pollId);
    clearNavRetry();
    clearTriggerRetry();
    if (STATE.resizeTimerId) clearTimeout(STATE.resizeTimerId);
    if (STATE.resizeLayoutTimerId) clearTimeout(STATE.resizeLayoutTimerId);
    if (STATE.resizeObserver) STATE.resizeObserver.disconnect();
    if (STATE.overlay && STATE.overlay.parentNode) STATE.overlay.parentNode.removeChild(STATE.overlay);
    if (STATE.measurer && STATE.measurer.parentNode) STATE.measurer.parentNode.removeChild(STATE.measurer);
    if (document.head.contains(_captionHideStyle)) document.head.removeChild(_captionHideStyle);
    STATE.pollId     = null;
    STATE.overlay    = null;
    STATE.overlayText = null;
    STATE.measurer   = null;
    STATE.measurerText = null;
    STATE.layout     = null;
    STATE.resizeObserver = null;
    STATE.resizeTimerId = null;
    STATE.resizeLayoutTimerId = null;
    STATE.lastResizeW = -1;
    STATE.lastResizeH = -1;
    STATE.measureRange = null;
    STATE.words      = [];
    STATE.chunks     = [];
    STATE.asrLang    = null;
    STATE.videoId    = null;
    STATE.lastText   = null;
    STATE.triggered  = false;
    STATE.triggerAttempts = 0;
    STATE.statusMode = 'idle';
    STATE.timedtextRequestCount = 0;
    STATE.timedtextResponseCount = 0;
    STATE.lastTimedtextRequest = null;
    STATE.lastTimedtextResponse = null;
    STATE.lastCaptionTrigger = null;
    STATE.lastCaptionTracks = null;
    STATE.chunkBuildSignature = null;
    STATE.chunkBuildInFlightSignature = null;
  }

  function setStatus(mode) {
    STATE.statusMode = mode;
    if (mode === 'error' && STATE.enabled) {
      mountOverlay();
      flashOverlay('Ketuvia: failed to load captions');
    }
  }
})();
