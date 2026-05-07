/* Rechunk Captions for YouTube
 *
 * Single path of operation:
 *   1. At document_start (MAIN world), patch window.fetch and XMLHttpRequest
 *      to intercept YouTube's OWN timedtext requests. The player generates
 *      a short-lived Proof-of-Origin Token (pot) for these requests — we
 *      cannot replicate it, so we intercept the player's request instead of
 *      making our own. We modify the intercepted URL to use fmt=json3 (fmt
 *      is not in sparams so the signature stays valid) and capture the body.
 *   2. At DOMContentLoaded / yt-navigate-finish, read ytInitialPlayerResponse
 *      to detect which video is playing and whether it has an ASR track.
 *   3. Once the player is ready, call player.setOption('captions','track',…)
 *      to trigger caption loading if YouTube hasn't already done so.
 *   4. The interceptor receives the json3 response, runs the chunker, mounts
 *      the overlay, and starts the 100ms sync loop.
 *
 * No timedtext requests are made by this extension. No backup paths.
 */
(() => {
  'use strict';

  if (window.__rechunkCaptionsLoaded) return;
  window.__rechunkCaptionsLoaded = true;

  // ── Settings ──────────────────────────────────────────────────────────────
  const CFG = {
    // Only split early on genuine silence
    hardPauseMs: 2200,
    // Preferred subtitle fullness
    targetChars: 180,
    // Absolute limits
    maxChars: 260,
    maxWords: 40,
    // Timing limits
    maxDurMs: 5200,
    minDurMs: 1800,
    // Slight anticipation improves readability
    lookaheadMs: 1000,
    pollMs: 100,
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const STATE = {
    enabled:    true,
    videoId:    null,
    asrLang:    null,   // language code of detected ASR track
    chunks:     [],
    overlay:    null,
    pollId:     null,
    button:     null,
    lastText:   null,
    statusMode: 'idle',
    triggered:  false,  // did we already call setOption for this video?
  };

  const log  = (...a) => console.log('%c[Rechunk]', 'color:#7cf', ...a);
  const warn = (...a) => console.warn('[Rechunk]', ...a);

  // ── 1. Intercept YouTube's timedtext requests ─────────────────────────────
  // We rewrite the URL to use fmt=json3 and capture the body.
  // fmt is NOT in sparams, so the HMAC signature stays valid.

  function onTimedtextBody(url, text) {
    if (!text || text.length === 0) return;
    let vid;
    try { vid = new URL(url).searchParams.get('v'); } catch { return; }
    if (!vid) return;
    log('intercepted timedtext vid=' + vid + ' len=' + text.length);
    // Accept even if we haven't matched the video yet (initial load race)
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

  // Patch XHR (YouTube player may use XHR instead of fetch)
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

  // ── 2. Process intercepted json3 data ─────────────────────────────────────
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
    STATE.chunks = chunkWords(words, CFG);
    log('built ' + STATE.chunks.length + ' chunks from ' + words.length + ' words');
    setStatus('active');
    mountOverlay();
    startPolling();
  }

  // ── 3. Navigation / player setup ──────────────────────────────────────────
  function currentVideoId() {
    if (location.pathname !== '/watch') return null;
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  }

  function checkNavigation() {
    const vid = currentVideoId();
    if (!vid) { if (STATE.videoId) resetForNewVideo(); return; }
    if (vid === STATE.videoId) return;
    resetForNewVideo();
    STATE.videoId = vid;

    // Read ASR track from ytInitialPlayerResponse (no network needed)
    const pr = window.ytInitialPlayerResponse;
    const tracks = pr && pr.captions
                && pr.captions.playerCaptionsTracklistRenderer
                && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
    if (!tracks || !tracks.length) {
      STATE.statusMode = 'unavailable'; ensureButton(); updateButton(); return;
    }
    const asr = tracks.find(t => t.kind === 'asr');
    if (!asr) {
      STATE.statusMode = 'unavailable'; ensureButton(); updateButton(); return;
    }
    STATE.asrLang = asr.languageCode || 'en';
    log('asr track lang=' + STATE.asrLang + ' for ' + vid);
    ensureButton();
    setStatus('loading');
    // Trigger caption loading once the player is ready
    waitForPlayerThenTrigger();
  }

  // Poll until the player element exposes setOption, then trigger caption load.
  // YouTube's player will fetch timedtext; our interceptor captures the response.
  function waitForPlayerThenTrigger() {
    if (STATE.triggered) return;
    const attempt = () => {
      if (!STATE.videoId) return; // navigated away
      if (STATE.statusMode === 'active') return; // already captured
      const player = document.getElementById('movie_player');
      if (player && typeof player.setOption === 'function') {
        if (STATE.triggered) return;
        STATE.triggered = true;
        log('triggering caption load lang=' + STATE.asrLang);
        try {
          player.setOption('captions', 'track', { languageCode: STATE.asrLang });
        } catch (e) {
          warn('setOption failed: ' + e.message);
          setStatus('error');
        }
        // If the timedtext intercept doesn't fire within 6 s, the initial fetch
        // probably went through a service worker cache our patch can't see.
        // Surface a helpful message so the user knows to click the CC button once.
        setTimeout(() => {
          if (STATE.statusMode === 'loading') {
            warn('timedtext not intercepted after 6s — prompting user');
            STATE.statusMode = 'error';
            updateButton();
            mountOverlay();
            flashOverlay('Rechunk: click the CC button twice to activate');
          }
        }, 6000);
      } else {
        setTimeout(attempt, 300);
      }
    };
    setTimeout(attempt, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkNavigation, { once: true });
  } else {
    checkNavigation();
  }
  document.addEventListener('yt-navigate-start',  () => { if (STATE.videoId && currentVideoId() !== STATE.videoId) resetForNewVideo(); }, true);
  document.addEventListener('yt-navigate-finish', checkNavigation, true);

  // ── 4. JSON3 word extraction + chunker ────────────────────────────────────
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
  let cur = null;

  const flush = (nextStart) => {
    if (!cur) return;

    let text = '';

    for (let i = 0; i < cur.words.length; i++) {
      const seg = cur.words[i].text;

      if (i === 0) {
        text = seg;
        continue;
      }

      if (!text.endsWith(' ') && !seg.startsWith(' ')) {
        text += ' ';
      }

      text += seg;
    }

    text = text.replace(/\s+/g, ' ').trim();

    if (text) {
      const lastWordStart =
        cur.words[cur.words.length - 1].start;

      let end =
        nextStart != null
          ? nextStart
          : (lastWordStart + cfg.minDurMs);

      if (end - cur.start < cfg.minDurMs) {
        end = cur.start + cfg.minDurMs;
      }

      if (end - cur.start > cfg.maxDurMs) {
        end = cur.start + cfg.maxDurMs;
      }

      chunks.push({
        startMs: cur.start,
        endMs: end,
        text,
      });
    }

    cur = null;
  };

  for (const w of words) {
    if (!cur) {
      cur = {
        words: [w],
        start: w.start,
      };
      continue;
    }

    const prev =
      cur.words[cur.words.length - 1];

    const gap =
      w.start - prev.start;

    const buildText = arr =>
      arr
        .map(x => x.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();

    const curText =
      buildText(cur.words);

    const curLen =
      curText.length;

    const nextText =
      buildText([
        ...cur.words,
        w
      ]);

    const nextLen =
      nextText.length;
      
      

    const nextWords =
      (
        curText + ' ' + w.text
      )
      .trim()
      .split(/\s+/)
      .length;

    const dur =
      w.start - cur.start;

    // Real silence in speech
    const hardPause =
      gap >= cfg.hardPauseMs;

    // Preferred readable size reached
    const reachedTarget =
      curLen >= cfg.targetChars;

    // Absolute safety limits
    const tooLong =
      nextLen > cfg.maxChars ||

      (
        dur > cfg.maxDurMs &&
        (
          curLen >= 120 ||
          nextWords >= 20
        )
      );
    
    const splitReasons = [];

      if (hardPause) {
        splitReasons.push(
          `hardPause gap=${gap}`
        );
      }

      if (nextLen > cfg.maxChars) {
        splitReasons.push(
          `maxChars nextLen=${nextLen}`
        );
      }

      if (
        dur > cfg.maxDurMs &&
        (
          curLen >= 120 ||
          nextWords >= 20
        )
      ) {
        splitReasons.push(
          `maxDur dur=${dur}`
        );
      }

      if (splitReasons.length) {
        console.group(
          '%c[Rechunk Split]',
          'color:#f66;font-weight:bold'
        );

        console.log(
          'REASONS:',
          splitReasons
        );

        console.log(
          'CURRENT TEXT:',
          curText
        );

        console.log(
          'CURRENT LEN:',
          curLen
        );

        console.log(
          'NEXT WORD:',
          JSON.stringify(w.text)
        );

        console.log(
          'NEXT START:',
          w.start
        );

        console.log(
          'NEXT TEXT:',
          nextText
        );

        console.log(
          'NEXT LEN:',
          nextLen
        );

        console.log(
          'DURATION:',
          dur
        );

        console.log(
          'GAP:',
          gap
        );

        console.log(
          'WORDS ARRAY:',
          cur.words.map(x => ({
            start: x.start,
            text: x.text
          }))
        );

        console.groupEnd();
      }
    // Split only if:
    // 1. real silence
    // 2. hard limits exceeded
    // 3. already at preferred size and adding more would overshoot
    if (
      hardPause ||
      tooLong
    ){
      flush(w.start);

      cur = {
        words: [w],
        start: w.start,
      };
    } else {
      cur.words.push(w);
    }
  }

  flush();

  return chunks;
}

  // ── 5. Overlay + polling ──────────────────────────────────────────────────
  // Hide YouTube's native captions while our overlay is active.
  const _captionHideStyle = document.createElement('style');
  _captionHideStyle.textContent = '.ytp-caption-window-container{visibility:hidden!important}';

  function mountOverlay() {
    // Hide YouTube's word-by-word captions
    if (!document.head.contains(_captionHideStyle)) document.head.appendChild(_captionHideStyle);

    if (STATE.overlay && document.body.contains(STATE.overlay)) return;
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (!player) { setTimeout(mountOverlay, 250); return; }
    const o = document.createElement('div');
    o.id = 'rechunk-overlay';
    o.setAttribute('role', 'status');
    o.setAttribute('aria-live', 'polite');
    o.setAttribute('aria-atomic', 'true');
    player.appendChild(o);
    STATE.overlay = o;
  }

  function startPolling() {
    if (STATE.pollId) return;
    const tick = () => {
      if (!STATE.overlay || !STATE.enabled) return;
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (!video) return;
      const ms = (video.currentTime || 0) * 1000 + CFG.lookaheadMs;
      let active = '';
      const N = STATE.chunks.length;
      for (let i = 0; i < N; i++) {
        const c = STATE.chunks[i];
        const next = STATE.chunks[i + 1];
        const winEnd = next ? next.startMs : c.endMs;
        if (ms >= c.startMs && ms < winEnd) { active = c.text; break; }
        if (ms < c.startMs) break;
      }
      if (active !== STATE.lastText) {
        STATE.overlay.textContent = active;
        STATE.overlay.dataset.empty = active ? '0' : '1';
        STATE.lastText = active;
      }
    };
    STATE.pollId = setInterval(tick, CFG.pollMs);
  }

  function flashOverlay(msg) {
    if (!STATE.overlay) return;
    STATE.overlay.textContent = msg;
    STATE.overlay.dataset.empty = '0';
    setTimeout(() => {
      if (STATE.overlay && STATE.overlay.textContent === msg) {
        STATE.overlay.textContent = '';
        STATE.overlay.dataset.empty = '1';
      }
    }, 4000);
  }

  function resetForNewVideo() {
    if (STATE.pollId) clearInterval(STATE.pollId);
    if (STATE.overlay && STATE.overlay.parentNode) STATE.overlay.parentNode.removeChild(STATE.overlay);
    if (document.head.contains(_captionHideStyle)) document.head.removeChild(_captionHideStyle);
    STATE.pollId     = null;
    STATE.overlay    = null;
    STATE.chunks     = [];
    STATE.asrLang    = null;
    STATE.videoId    = null;
    STATE.lastText   = null;
    STATE.triggered  = false;
    STATE.statusMode = 'idle';
    updateButton();
  }

  // ── 6. Button ─────────────────────────────────────────────────────────────
  function setStatus(mode) {
    STATE.statusMode = mode;
    updateButton();
    if (mode === 'error') { mountOverlay(); flashOverlay('Rechunk Captions: failed to load'); }
  }

  function ensureButton() {
    if (STATE.button && document.body.contains(STATE.button)) { updateButton(); return; }
    const right = document.querySelector('.ytp-right-controls');
    if (!right) { setTimeout(ensureButton, 300); return; }
    const btn = document.createElement('button');
    btn.id = 'rechunk-toggle';
    btn.className = 'ytp-button';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle Rechunk Captions');
    btn.title = 'Rechunk Captions';
    btn.textContent = 'CC+';
    btn.addEventListener('click', () => {
      STATE.enabled = !STATE.enabled;
      if (STATE.enabled) {
        if (STATE.chunks.length) { mountOverlay(); startPolling(); }
        else if (STATE.asrLang && !STATE.triggered) waitForPlayerThenTrigger();
      } else {
        if (STATE.pollId) { clearInterval(STATE.pollId); STATE.pollId = null; }
        if (STATE.overlay) { STATE.overlay.textContent = ''; STATE.overlay.dataset.empty = '1'; }
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
      idle:        'Rechunk Captions: waiting for video',
      loading:     'Rechunk Captions: loading',
      active:      'Rechunk Captions: ON (click to disable)',
      unavailable: 'Rechunk Captions: no auto-captions on this video',
      error:       'Rechunk Captions: failed to load',
    };
    b.title = (STATE.enabled ? '' : '(disabled) ') + (labels[STATE.statusMode] || '');
  }
})();