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
    lookaheadMs:   1000,
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
  };

  const SETTINGS_STORAGE_KEY = 'ketuviaSettings';
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
    medium: 1.3,
    large: 1.7,
  };
  const BACKGROUND_OPACITY = {
    light: 0.3,
    medium: 0.5,
    dark: 0.8,
  };
  const FONT_FAMILIES = {
    atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
    opensans: '"Open Sans", system-ui, sans-serif',
    noto: '"Noto Sans", system-ui, sans-serif',
    average: '"Average Sans", system-ui, sans-serif',
    roboto: '"Roboto", system-ui, sans-serif',
    rubik: '"Rubik", system-ui, sans-serif',
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
  };

  window.__ketuviaDebugEnabled = false;

  window.addEventListener('ketuvia-debug-change', event => {
    DEBUG.enabled = Boolean(event.detail?.enabled);
    window.__ketuviaDebugEnabled = DEBUG.enabled;
    if (DEBUG.enabled && STATE.words.length) {
      rebuildChunksForLayout();
    } else {
      STATE.debugChunks = [];
    }
  });

  const STATE = {
    enabled:    true,
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
    button:     null,
    lastText:   null,
    statusMode: 'idle',
    triggered:  false,
    navRetryId: null,
    navRetryUntil: 0,
    triggerRetryId: null,
    triggerAttempts: 0,
    debugChunks: [],
    settings: readSettings(),
  };

  function applySettings(nextSettings) {
    STATE.settings = normalizeSettings(nextSettings);
    window.__ketuviaSettings = { ...STATE.settings };

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(STATE.settings));
    } catch {}

    rebuildChunksForLayout();
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
    console.log(
      '[Rechunk]',
      new Date().toISOString(),
      ...a
    );
  };

  const warn = (...a) => {
    if (!DEBUG.enabled) return;
    console.warn(
      '[Rechunk]',
      new Date().toISOString(),
      ...a
    );
  };

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

  function joinWords(words) {
    let text = '';

    for (let i = 0; i < words.length; i++) {
      const seg = words[i].text;

      if (i === 0) {
        text = seg;
        continue;
      }

      if (!text.endsWith(' ') && !seg.startsWith(' ')) {
        text += ' ';
      }

      text += seg;
    }

    return text.replace(/\s+/g, ' ').trim();
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

  function measureNodeLayout(node, containerWidthPx, targetLines) {
    if (!node) {
      return { lineCount: 0, lastLineFill: 0, fillRatio: 0, rects: [], rawRectCount: 0 };
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

    return { lineCount, lastLineFill, fillRatio, rects: lines, rawRectCount: rawRects.length };
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
    node.style.top = position.y;
    node.style.bottom = 'auto';
    node.style.left = '';
    node.style.right = '';

    if (position.x === 'left') {
      node.style.left = '8px';
      node.style.transform = 'translateY(-50%)';
      node.style.textAlign = 'left';
    } else if (position.x === 'right') {
      node.style.right = '8px';
      node.style.transform = 'translateY(-50%)';
      node.style.textAlign = 'right';
    } else {
      node.style.left = '50%';
      node.style.transform = 'translate(-50%, -50%)';
      node.style.textAlign = 'center';
    }
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

  function measureTextLayout(text) {
    if (!STATE.measurerText || !STATE.layout) {
      return { lineCount: 1, lastLineFill: 1, fillRatio: 1 };
    }

    STATE.measurerText.textContent = text;

    if (!text) {
      return { lineCount: 0, lastLineFill: 0, fillRatio: 0 };
    }
    return measureNodeLayout(
      STATE.measurerText,
      STATE.layout.textWidthPx,
      STATE.layout.targetLines
    );
  }

  function rebuildChunksForLayout() {
    const player = mountOverlay();
    if (!player || !STATE.words.length) return;

    const chunkResult = chunkWords(STATE.words, getRuntimeConfig());
    STATE.chunks = chunkResult.chunks;
    STATE.debugChunks = chunkResult.debugChunks;
    log('rebuilt ' + STATE.chunks.length + ' chunks for layout width=' + STATE.layout.textWidthPx);
    logChunkBuildSummary();

    if (STATE.lastText && STATE.overlay) {
      if (STATE.overlayText) {
        STATE.overlayText.textContent = '';
      }
      STATE.overlay.dataset.empty = '1';
      STATE.lastText = null;
    }
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
      STATE.layout.targetLines
    );

    return {
      cssWidth: overlayStyle.width,
      cssFontSize: textStyle.fontSize,
      cssLineHeight: textStyle.lineHeight,
      innerWidthPx: STATE.overlayText.clientWidth,
      renderedLineCount: rendered.lineCount,
      renderedRawRectCount: rendered.rawRectCount,
      renderedLastLineFill: Number(rendered.lastLineFill.toFixed(3)),
      renderedFillRatio: Number(rendered.fillRatio.toFixed(3)),
    };
  }

  function logChunkBuildSummary() {
    if (!DEBUG.enabled || !STATE.layout) return;

    console.log('[Rechunk][Debug][BUILD]', JSON.stringify({
      playerWidthPx: getPlayerElement()?.clientWidth || 0,
      targetLines: STATE.layout.targetLines,
      targetTextWidthPx: STATE.layout.textWidthPx,
      targetFontSizePx: STATE.layout.fontSizePx,
      targetLineHeight: STATE.layout.lineHeight,
      chunkCount: STATE.chunks.length,
    }));
    STATE.debugChunks.slice(0, DEBUG.maxChunkLogs).forEach(chunk => {
      console.log('[Rechunk][Debug][CHUNK]', JSON.stringify({
        idx: chunk.idx,
        words: `${chunk.startWord}-${chunk.endWord}`,
        measuredLines: chunk.measuredLineCount,
        measuredRawRects: chunk.measuredRawRectCount,
        measuredFill: chunk.measuredFillRatio,
        lastLineFill: chunk.measuredLastLineFill,
        reason: chunk.reason,
        text: chunk.text,
      }));
    });
  }

  function logRenderedChunk(chunkIndex, chunk) {
    if (!DEBUG.enabled || !chunk) return;

    const meta = STATE.debugChunks[chunkIndex];
    const rendered = snapshotOverlayMetrics();

    console.log('[Rechunk][Debug][RENDER]', JSON.stringify({
      chunkIndex,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      text: chunk.text,
      measuredLines: meta?.measuredLineCount ?? null,
      measuredRawRects: meta?.measuredRawRectCount ?? null,
      measuredFill: meta?.measuredFillRatio ?? null,
      measuredLastLineFill: meta?.measuredLastLineFill ?? null,
      reason: meta?.reason ?? null,
      renderedLines: rendered?.renderedLineCount ?? null,
      renderedRawRects: rendered?.renderedRawRectCount ?? null,
      renderedFill: rendered?.renderedFillRatio ?? null,
      renderedLastLineFill: rendered?.renderedLastLineFill ?? null,
      cssWidth: rendered?.cssWidth ?? null,
      cssFontSize: rendered?.cssFontSize ?? null,
      cssLineHeight: rendered?.cssLineHeight ?? null,
      innerWidthPx: rendered?.innerWidthPx ?? null,
    }));
    if (meta?.candidates?.length) {
      meta.candidates.forEach(candidate => {
        console.log('[Rechunk][Debug][CANDIDATE]', JSON.stringify({
          chunkIndex,
          ...candidate,
        }));
      });
    }
  }

  function onTimedtextBody(url, text) {
    if (!text || text.length === 0) return;
    let vid;
    try { vid = new URL(url).searchParams.get('v'); } catch { return; }
    if (!vid) return;
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

    window.fetch = async function (input, init) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      const isTimedtext = url.includes('timedtext');

      if (isTimedtext) {
        const newUrl = rewriteTimedtextUrl(url);

        const req =
          typeof input === 'string'
            ? newUrl
            : new Request(newUrl, input);

        const resp = await _origFetch.call(this, req, init);

        resp.clone().text()
          .then(t => onTimedtextBody(newUrl, t))
          .catch(() => {});

        return resp;
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
      warn('timedtext not JSON: ' + e.message + ' start=' + text.slice(0, 80));
      setStatus('error'); return;
    }
    const words = extractWords(data);
    if (!words.length) {
      warn('zero words extracted. events=' + (data.events || []).length);
      setStatus('error'); return;
    }
    STATE.words = words;
    mountOverlay();
    const chunkResult = chunkWords(words, getRuntimeConfig());
    STATE.chunks = chunkResult.chunks;
    STATE.debugChunks = chunkResult.debugChunks;
    log('built ' + STATE.chunks.length + ' chunks from ' + words.length + ' words');
    logChunkBuildSummary();
    setStatus('active');
    startPolling();
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
      ensureButton();
      updateButton();
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
    if (!STATE.videoId || !STATE.asrLang || !STATE.enabled || STATE.chunks.length) return;

    const player = document.getElementById('movie_player');
    if (!player || typeof player.setOption !== 'function') {
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

    let requested = false;

    try {
      player.setOption('captions', 'track', { languageCode: STATE.asrLang });
      requested = true;
    } catch (e) {
      warn('setOption(track) failed: ' + e.message);
    }

    try {
      player.setOption('captions', 'reload', true);
      requested = true;
    } catch {}

    if (STATE.statusMode !== 'loading') {
      setStatus('loading');
    }

    clearTriggerRetry();
    STATE.triggerRetryId = setTimeout(() => {
      STATE.triggerRetryId = null;
      if (STATE.chunks.length || !STATE.enabled || !STATE.videoId) return;

      if (!requested || STATE.triggerAttempts < CFG.maxTriggerAttempts) {
        triggerCaptionLoad();
        return;
      }

      warn('timedtext not intercepted after ' + STATE.triggerAttempts + ' attempts');
      setStatus('error');
      mountOverlay();
      flashOverlay('Ketuvia: click the CC button twice to activate');
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
      ensureButton();
      setStatus('loading');
      scheduleNavRetry();
      return;
    }

    clearNavRetry();

    const asr = tracks.find(t => t.kind === 'asr');
    if (!asr) {
      STATE.statusMode = 'unavailable'; ensureButton(); updateButton(); return;
    }

    STATE.asrLang = asr.languageCode || 'en';
    if (!isSameVideo || STATE.statusMode !== 'active') {
      log('asr track lang=' + STATE.asrLang + ' for ' + vid);
    }

    ensureButton();
    if (STATE.enabled && !STATE.chunks.length) {
      setStatus('loading');
      waitForPlayerThenTrigger();
    }
  }

  function waitForPlayerThenTrigger() {
    if (STATE.statusMode === 'active' || !STATE.enabled || STATE.chunks.length) return;
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
  document.addEventListener('yt-navigate-finish', () => setTimeout(checkNavigation, 0), true);

  function extractWords(json3) {
    const out = [];
    let lastStart = -1;
    for (const ev of (json3.events || [])) {
      if (!ev.segs) continue;
      const base = ev.tStartMs || 0;
      for (const s of ev.segs) {
        const text = s.utf8;
        if (!text || text === '\n') continue;
        const start = base + (s.tOffsetMs || 0);
        if (start <= lastStart) continue;
        out.push({ start, text });
        lastStart = start;
      }
    }
    return out;
  }

function chunkWords(words, cfg) {
  const chunks = [];
    const debugChunks = [];
    const shouldDebug = DEBUG.enabled;
  if (!words.length) return { chunks, debugChunks };

  const pushChunk = (startIndex, endIndexExclusive, meta) => {
    if (endIndexExclusive <= startIndex) return;

    const slice = words.slice(startIndex, endIndexExclusive);
    const text = joinWords(slice);
    if (!text) return;

    const startMs = slice[0].start;
    const lastWordStart = slice[slice.length - 1].start;
    const nextStart = words[endIndexExclusive]?.start;

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

    chunks.push({ startMs, endMs, text });
    if (shouldDebug) {
      debugChunks.push({
        idx: chunks.length - 1,
        startWord: startIndex,
        endWord: endIndexExclusive - 1,
        measuredLineCount: meta.layout.lineCount,
        measuredRawRectCount: meta.layout.rawRectCount,
        measuredFillRatio: Number(meta.layout.fillRatio.toFixed(3)),
        measuredLastLineFill: Number(meta.layout.lastLineFill.toFixed(3)),
        reason: meta.reason,
        candidates: meta.candidates,
        text,
      });
    }
  };

  let start = 0;

  while (start < words.length) {
    let chosenEnd = -1;
    let chosenLayout = null;
    let reason = 'unknown';
    let firstGoodPunctuationEnd = -1;
    let firstGoodPunctuationLayout = null;
    let lastFitEnd = start + 1;
    let lastFitLayout = null;
    const candidateDebug = [];

    for (let end = start + 1; end <= words.length; end++) {
      const slice = words.slice(start, end);
      const text = joinWords(slice);
      const layout = measureTextLayout(text);
      const currentWord = slice[slice.length - 1];
      const nextWord = words[end];
      const gapAfterMs = nextWord ? nextWord.start - currentWord.start : 0;
      const durationMs = currentWord.start - slice[0].start;
      const breaks = classifyBreakChar(currentWord.text);

      if (layout.lineCount > cfg.targetLines) {
        reason =
          firstGoodPunctuationEnd > start
            ? 'punctuation_after_min_fill_before_overflow'
            : 'last_word_that_fits_before_overflow';
        chosenEnd =
          firstGoodPunctuationEnd > start
            ? firstGoodPunctuationEnd
            : lastFitEnd;
        chosenLayout =
          firstGoodPunctuationLayout || lastFitLayout;
        if (shouldDebug) {
          candidateDebug.push({
            endWord: end - 1,
            lines: layout.lineCount,
            rawRects: layout.rawRectCount,
            fill: Number(layout.fillRatio.toFixed(3)),
            lastLineFill: Number(layout.lastLineFill.toFixed(3)),
            overflow: true,
            pauseAfter: gapAfterMs >= cfg.hardPauseMs,
            durationMs,
            terminal: breaks.terminal,
            clause: breaks.clause,
            text,
          });
        }
        break;
      }

      lastFitEnd = end;
      lastFitLayout = layout;

      if (shouldDebug) {
        candidateDebug.push({
          endWord: end - 1,
          lines: layout.lineCount,
          rawRects: layout.rawRectCount,
          fill: Number(layout.fillRatio.toFixed(3)),
          lastLineFill: Number(layout.lastLineFill.toFixed(3)),
          overflow: false,
          pauseAfter: gapAfterMs >= cfg.hardPauseMs,
          durationMs,
          terminal: breaks.terminal,
          clause: breaks.clause,
          text,
        });
      }

      const hasPunctuation = breaks.terminal || breaks.clause;
      const hasMinimumFill = hasEnoughTextForPunctuation(layout, cfg);

      if (hasPunctuation && hasMinimumFill) {
        firstGoodPunctuationEnd = end;
        firstGoodPunctuationLayout = layout;
        reason = 'punctuation_after_min_fill';
        chosenEnd = end;
        chosenLayout = layout;
        break;
      }

      if (gapAfterMs >= cfg.hardPauseMs) {
        reason =
          hasMinimumFill
            ? 'hard_pause_after_min_fill'
            : 'hard_pause_before_min_fill';
        chosenEnd = end;
        chosenLayout = layout;
        break;
      }

      if (end - start >= cfg.maxWords) {
        reason =
          firstGoodPunctuationEnd > start
            ? 'punctuation_after_min_fill_before_max_words'
            : 'max_words_last_fit';
        chosenEnd =
          firstGoodPunctuationEnd > start
            ? firstGoodPunctuationEnd
            : end;
        chosenLayout =
          firstGoodPunctuationLayout || layout;
        break;
      }
    }

    if (chosenEnd <= start) {
      chosenEnd = lastFitEnd;
      chosenLayout = lastFitLayout;
      reason =
        lastFitLayout && !hasEnoughTextForPunctuation(lastFitLayout, cfg)
          ? 'end_of_captions_before_min_fill'
          : 'end_of_captions_last_fit';
    }

    if (chosenEnd <= start) {
      chosenEnd = Math.min(start + 1, words.length);
      chosenLayout = measureTextLayout(joinWords(words.slice(start, chosenEnd)));
      reason = 'forced_single_word';
    }

    pushChunk(start, chosenEnd, {
      layout: chosenLayout || { lineCount: 0, fillRatio: 0, lastLineFill: 0 },
      reason,
      candidates: candidateDebug,
    });
    start = chosenEnd;
  }

  return { chunks, debugChunks };
}

  const _captionHideStyle = document.createElement('style');
  _captionHideStyle.textContent = '.ytp-caption-window-container{visibility:hidden!important}';

  function renderCurrentCaption(force = false) {
    if (!STATE.overlay || !STATE.enabled) return;
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video) return;

    const ms = (video.currentTime || 0) * 1000 + CFG.lookaheadMs;
    let active = '';
    let activeIndex = -1;
    const N = STATE.chunks.length;

    for (let i = 0; i < N; i++) {
      const c = STATE.chunks[i];
      const next = STATE.chunks[i + 1];
      const winEnd = next ? next.startMs : c.endMs;
      if (ms >= c.startMs && ms < winEnd) {
        active = c.text;
        activeIndex = i;
        break;
      }
      if (ms < c.startMs) break;
    }

    if (!force && active === STATE.lastText) return;

    if (STATE.overlayText) {
      STATE.overlayText.textContent = applyTextCase(active);
    }
    STATE.overlay.dataset.empty = active ? '0' : '1';
    if (active && activeIndex >= 0) {
      logRenderedChunk(activeIndex, STATE.chunks[activeIndex]);
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
    updateButton();
  }

  function setStatus(mode) {
    STATE.statusMode = mode;
    updateButton();
    if (mode === 'error') { mountOverlay(); flashOverlay('Ketuvia: failed to load captions'); }
  }

  function ensureButton() {
    if (STATE.button && document.body.contains(STATE.button)) { updateButton(); return; }
    const right = document.querySelector('.ytp-right-controls');
    if (!right) { setTimeout(ensureButton, 300); return; }
    const btn = document.createElement('button');
    btn.id = 'rechunk-toggle';
    btn.className = 'ytp-button';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Turn Ketuvia captions on or off');
    btn.title = 'Turn Ketuvia captions on or off';
    btn.textContent = 'CC+';
    btn.addEventListener('click', () => {
      STATE.enabled = !STATE.enabled;
      if (STATE.enabled) {
        if (STATE.chunks.length) { mountOverlay(); startPolling(); }
        else if (STATE.asrLang && !STATE.triggered) waitForPlayerThenTrigger();
      } else {
        if (STATE.pollId) { clearInterval(STATE.pollId); STATE.pollId = null; }
        if (STATE.overlay) {
          if (STATE.overlayText) {
            STATE.overlayText.textContent = '';
          }
          STATE.overlay.dataset.empty = '1';
        }
        if (document.head.contains(_captionHideStyle)) document.head.removeChild(_captionHideStyle);
      }
      updateButton();
    });
    const settings = right.querySelector('.ytp-settings-button');
    if (settings && settings.parentNode) settings.parentNode.insertBefore(btn, settings);
    else right.prepend(btn);
    STATE.button = btn;
    updateButton();
  }

  function updateButton() {
    if (!STATE.button) return;
    const b = STATE.button;
    b.dataset.status  = STATE.statusMode;
    b.dataset.enabled = STATE.enabled ? '1' : '0';
    const labels = {
      idle:        'Ketuvia: waiting for video',
      loading:     'Ketuvia: loading captions',
      active:      'Ketuvia is on (click to turn off)',
      unavailable: 'Ketuvia: no auto-captions on this video',
      error:       'Ketuvia: failed to load captions',
    };
    b.title = (STATE.enabled ? '' : '(disabled) ') + (labels[STATE.statusMode] || '');
  }
})();
