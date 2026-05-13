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
    textWidthEm:     24,
    minTextWidthPx: 360,
    maxTextWidthPx: 720,
    playerPaddingPx: 32,
    fontSizeRatio: 0.0155,
    minFontPx:      16,
    maxFontPx:      32,
    lineHeight:    1.4,
    rebuildYieldMs: 50,
  };

  const SETTINGS_STORAGE_KEY  = 'ketuviaSettings';
  const DEFAULT_SETTINGS = {
    targetLines: 2,
    textSize: 'medium',
    background: 'medium',
    position: 'center-low',
    font: 'atkinson',
    allCaps: false,
  };
  const TEXT_SIZE_SCALE = {
    small: 0.9,
    medium: 1.2,
    large: 1.7,
  };
  const BACKGROUND_OPACITY = {
    light: 0.3,
    medium: 0.5,
    dark: 0.8,
  };
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
    'left-high': { x: 'left', y: '20%' },
    'center-high': { x: 'center', y: '20%' },
    'right-high': { x: 'right', y: '20%' },
    'left-highish': { x: 'left', y: '35%' },
    'center-highish': { x: 'center', y: '35%' },
    'right-highish': { x: 'right', y: '35%' },
    'left-middle': { x: 'left', y: '50%' },
    'center-middle': { x: 'center', y: '50%' },
    'right-middle': { x: 'right', y: '50%' },
    'left-lowish': { x: 'left', y: '68%' },
    'center-lowish': { x: 'center', y: '68%' },
    'right-lowish': { x: 'right', y: '68%' },
    'left-low': { x: 'left', y: '84%' },
    'center-low': { x: 'center', y: '84%' },
    'right-low': { x: 'right', y: '84%' },
    'left-bottom': { x: 'left', y: '94%' },
    'center-bottom': { x: 'center', y: '94%' },
    'right-bottom': { x: 'right', y: '94%' },
  };

  function readSettings() {
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
    const background = String(settings?.background || DEFAULT_SETTINGS.background);
    const position = String(settings?.position || DEFAULT_SETTINGS.position);
    const font = String(settings?.font || DEFAULT_SETTINGS.font);
    const allCaps = Boolean(settings?.allCaps);

    return {
      targetLines: [1, 2, 3].includes(targetLines)
        ? targetLines
        : DEFAULT_SETTINGS.targetLines,
      textSize: Object.hasOwn(TEXT_SIZE_SCALE, textSize)
        ? textSize
        : DEFAULT_SETTINGS.textSize,
      background: Object.hasOwn(BACKGROUND_OPACITY, background)
        ? background
        : DEFAULT_SETTINGS.background,
      position: Object.hasOwn(OVERLAY_POSITIONS, position)
        ? position
        : DEFAULT_SETTINGS.position,
      font: Object.hasOwn(FONT_FAMILIES, font)
        ? font
        : DEFAULT_SETTINGS.font,
      allCaps,
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

  window.addEventListener('ketuvia-debug-change', event => {
    const wasEnabled = DEBUG.enabled;
    DEBUG.enabled = Boolean(event.detail?.enabled);
    window.__ketuviaDebugEnabled = DEBUG.enabled;
    if (DEBUG.enabled && !wasEnabled) {
      window.__ketuviaDebugLog = [];
      pushDebugRecord('debug_enabled', {
        videoId: currentVideoId() || STATE.videoId || null,
        pageUrl: location.href,
      });
    }
    if (DEBUG.enabled && STATE.words.length) {
      rebuildChunksForLayout();
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
    debugChunks: [],
    settings: readSettings(),
  };

  window.__ketuviaEnabled = STATE.enabled;

  function areNativeCaptionsEnabled() {
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
      else if (STATE.words.length) { rebuildChunksForLayout(); startPolling(); }
      else if (STATE.asrLang && !STATE.triggered) waitForPlayerThenTrigger();
    } else {
      if (STATE.pollId) { clearInterval(STATE.pollId); STATE.pollId = null; }
      clearKetuviaOverlay();
    }
  }

  document.documentElement.addEventListener('ketuvia-enabled-sync', () => {
    setEnabled(document.documentElement.dataset.ketuviaEnabled !== '0');
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
      previousSettings.allCaps !== STATE.settings.allCaps;

    if (!STATE.enabled || !areNativeCaptionsEnabled()) {
      clearKetuviaOverlay();
      return { ...STATE.settings };
    }

    if (needsRebuild && previousSettings.font !== STATE.settings.font) {
      rebuildChunksAfterFontReady();
    } else if (needsRebuild) {
      rebuildChunksForLayout();
    } else {
      mountOverlay();
    }

    renderCurrentCaption(true);

    return { ...STATE.settings };
  }

  window.__ketuviaSettings = { ...STATE.settings };
  window.__ketuviaApplySettings = applySettings;

  window.addEventListener('ketuvia-settings-change', event => {
    applySettings(event.detail);
  });

  const log = (...a) => {
    if (!DEBUG.enabled) return;
    pushDebugRecord('log', { message: a.map(String).join(' ') });
    console.log(
      '[Rechunk]',
      new Date().toISOString(),
      ...a
    );
  };

  const warn = (...a) => {
    if (!DEBUG.enabled) return;
    pushDebugRecord('warn', { message: a.map(String).join(' ') });
    console.warn(
      '[Rechunk]',
      new Date().toISOString(),
      ...a
    );
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
    console.log('[Rechunk][Debug][CAPTION_LOAD]', JSON.stringify(payload));
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function getPlayerElement() {
    return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
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

  function getLayoutMetrics(player) {
    const playerWidth = Math.max(0, player?.clientWidth || 0);
    if (!playerWidth) return null;
    const settings = STATE.settings;
    const runtimeConfig = getRuntimeConfig();
    const textSizeScale = TEXT_SIZE_SCALE[settings.textSize] || TEXT_SIZE_SCALE.medium;

    const fontSizePx = clamp(
      Math.round(playerWidth * CFG.fontSizeRatio * textSizeScale * 10) / 10,
      CFG.minFontPx,
      CFG.maxFontPx
    );

    const maxAvailableWidth = Math.max(0, playerWidth - CFG.playerPaddingPx);
    const targetTextWidth = Math.round(fontSizePx * CFG.textWidthEm);
    const textWidthPx = clamp(
      targetTextWidth,
      Math.min(CFG.minTextWidthPx, maxAvailableWidth),
      Math.min(CFG.maxTextWidthPx, maxAvailableWidth)
    );

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
      String(BACKGROUND_OPACITY[STATE.settings.background] || BACKGROUND_OPACITY.medium)
    );
    node.style.setProperty(
      '--rechunk-font-family',
      FONT_FAMILIES[STATE.settings.font] || FONT_FAMILIES.atkinson
    );
    node.style.setProperty(
      '--rechunk-font-feature-settings',
      STATE.settings.font === 'cascadia' ? '"liga" 0, "calt" 0' : 'normal'
    );
    const y = Number.parseFloat(position.y);
    const anchorTop = y <= 8;
    const anchorBottom = y >= 94;

    node.style.top = position.y;
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

    node.style.transform = position.x === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)';
  }

  function mountOverlay() {
    if (!document.head.contains(_captionHideStyle)) document.head.appendChild(_captionHideStyle);

    const player = getPlayerElement();
    if (!player) {
      setTimeout(mountOverlay, 250);
      return null;
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
      applyLayout(STATE.overlay, layout);
      applyLayout(STATE.measurer, layout);
    }

    if (!STATE.resizeObserver && typeof ResizeObserver === 'function') {
      STATE.resizeObserver = new ResizeObserver(() => {
        if (STATE.resizeTimerId) clearTimeout(STATE.resizeTimerId);
        STATE.resizeTimerId = setTimeout(() => {
          STATE.resizeTimerId = null;
          rebuildChunksForLayout();
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

  async function waitForCurrentFont(layout) {
    if (!document.fonts?.load || !layout) return;

    const family = FONT_LOAD_FAMILIES[STATE.settings.font];
    if (!family) return;

    const size = Math.max(1, Math.round(layout.fontSizePx || CFG.maxFontPx));
    const fontSpec = `400 ${size}px ${family}`;
    pushTimingRecord('font_load_start', { fontSpec });
    const t0 = performance.now();
    await document.fonts.load(fontSpec);
    pushTimingRecord('font_load_end', { fontSpec, durationMs: Math.round(performance.now() - t0) });
  }

  function rebuildChunksAfterFontReady() {
    const player = mountOverlay();
    if (!player || !STATE.words.length) return;

    const requestId = ++STATE.fontLoadRequestId;
    const layout = STATE.layout;

    waitForCurrentFont(layout).finally(() => {
      if (requestId !== STATE.fontLoadRequestId) return;
      rebuildChunksForLayout();
    });
  }

  function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function rebuildChunksForLayout() {
    const player = mountOverlay();
    if (!player || !STATE.words.length) return;

    const requestId = ++STATE.chunkBuildRequestId;
    pushTimingRecord('chunk_build_start', { wordCount: STATE.words.length });
    const t0 = performance.now();
    const chunkResult = await chunkWords(STATE.words, getRuntimeConfig(), requestId);
    if (chunkResult === null || requestId !== STATE.chunkBuildRequestId) return;

    pushTimingRecord('chunk_build_end', {
      wordCount: STATE.words.length,
      chunkCount: chunkResult.chunks.length,
      durationMs: Math.round(performance.now() - t0),
    });

    STATE.chunks = chunkResult.chunks;
    STATE.debugChunks = chunkResult.debugChunks;
    log('rebuilt ' + STATE.chunks.length + ' chunks for layout width=' + STATE.layout.textWidthPx);
    logChunkBuildSummary();

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
    console.log('[Rechunk][Debug][BUILD]', JSON.stringify(buildPayload));
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
      console.log('[Rechunk][Debug][CHUNK]', JSON.stringify(chunkPayload));
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
    console.log('[Rechunk][Debug][RENDER]', JSON.stringify(renderPayload));
    if (meta?.candidates?.length) {
      meta.candidates.forEach(candidate => {
        const candidatePayload = {
          chunkIndex,
          ...candidate,
        };
        pushDebugRecord('candidate', candidatePayload);
        console.log('[Rechunk][Debug][CANDIDATE]', JSON.stringify(candidatePayload));
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
    if (STATE.videoId && vid !== STATE.videoId) return;
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
    rebuildChunksForLayout();
  }

  function currentVideoId() {
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
  document.addEventListener('yt-navigate-start',  () => { if (STATE.videoId && currentVideoId() !== STATE.videoId) resetForNewVideo(); }, true);
  document.addEventListener('yt-navigate-finish', () => {
    pushTimingRecord('navigate_finish', { videoId: currentVideoId() || null });
    setTimeout(checkNavigation, 0);
  }, true);

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

    return {
      events,
      textEvents,
      newlineEventCount,
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
          inputSegCount: 0,
          outputTokenCount: 0,
          multiWordSegCount: 0,
          skippedNonTextCount: 0,
          skippedNonIncreasingStartCount: 0,
          samples: [],
        }
      : null;
    let lastStart = -1;
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
        if (start <= lastStart) {
          if (debug) debug.skippedNonIncreasingStartCount += 1;
          continue;
        }
        out.push({
          start,
          end: eventInfo.sourceKind === 'manual_event_captions' ? eventEndMs : null,
          text,
          eventIndex,
          sourceKind: eventInfo.sourceKind,
          preserveEventBoundary: eventInfo.sourceKind === 'manual_event_captions',
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
    if (debug) {
      debug.outputTokenCount = out.length;
      pushDebugRecord('extract', debug);
      console.log('[Rechunk][Debug][EXTRACT]', JSON.stringify(debug));
    }
    return out;
  }

async function chunkWords(words, cfg, requestId) {
  const chunks = [];
  const debugChunks = [];
  const shouldDebug = DEBUG.enabled;
  if (!words.length) return { chunks, debugChunks };
  let nextYieldAt = performance.now() + cfg.rebuildYieldMs;

  // Precompute per-word canvas widths once so the hot loop never touches the DOM
  // for overflow detection. Falls back to DOM measurement if canvas is unavailable.
  const canvasW = STATE.layout?.textWidthPx ?? 0;
  let cwWidths = null; // Float32Array indexed by word index
  let cwSpaceW = 0;

  pushTimingRecord('canvas_precompute_start', { wordCount: words.length });
  const preT0 = performance.now();
  if (canvasW > 0 && STATE.measurerText) {
    try {
      const style = window.getComputedStyle(STATE.measurerText);
      // Use a document-created canvas so it shares the document's font registry
      // and correctly loads custom @font-face fonts (OffscreenCanvas does not).
      const cvs = document.createElement('canvas');
      const ctx = cvs.getContext('2d');
      // Build the font string from individual properties instead of the `font`
      // shorthand. The shorthand returns an empty string when any font-variant-*
      // sub-property is non-default (e.g. font-variant-ligatures:none on Cascadia),
      // which silently resets the canvas to its default 10px sans-serif font.
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const lsPx = parseFloat(style.letterSpacing) || 0;
      cwSpaceW = ctx.measureText(' ').width + lsPx;
      // Store per-token widths per segment. Each segment may contain multiple
      // space-separated tokens; we must wrap at each token boundary, not at
      // segment boundaries, to match DOM word-wrap behaviour.
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
  function fastLineInfo(from, to) {
    if (!cwWidths) return null;
    let x = 0, lines = 1, any = false;
    for (let i = from; i < to; i++) {
      for (const w of cwWidths[i]) {
        if (!w) continue;
        if (any && x + cwSpaceW + w > canvasW) { lines++; x = w; }
        else { x += any ? cwSpaceW + w : w; any = true; }
      }
    }
    return { lineCount: lines, lastLineFill: any ? Math.min(1, x / canvasW) : 0 };
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
      text: displayText,
    });
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
        const t = lastFitEnd === maxFit ? lastFitText : joinWords(words.slice(start, maxFit));
        reason = 'last_word_that_fits_before_overflow';
        chosenEnd = maxFit; chosenText = t;
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

    // Resolve final layout.
    // Overflow chunks: one DOM measurement to verify canvas wasn't optimistic.
    // Debug mode: DOM for accurate metrics.
    // Otherwise: use canvas estimates (no DOM reflow needed).
    if (reason === 'last_word_that_fits_before_overflow') {
      const verify = measureTextLayout(chosenText);
      if (verify.lineCount > cfg.targetLines && chosenEnd > start + 1) {
        chosenEnd--;
        chosenText = joinWords(words.slice(start, chosenEnd));
        chosenLayout = measureTextLayout(chosenText);
      } else {
        chosenLayout = verify;
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
  }

  function setStatus(mode) {
    STATE.statusMode = mode;
    if (mode === 'error' && STATE.enabled) {
      mountOverlay();
      flashOverlay('Ketuvia: failed to load captions');
    }
  }
})();
