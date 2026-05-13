# Ketuvia: bug and change log

Ketuvia is a Chrome/Firefox extension that replaces YouTube's default word-by-word auto-captions with phrase-based captions. YouTube's captions reveal one word at a time as the speaker speaks, which is hard to read and cognitively taxing. Ketuvia intercepts the caption stream, groups words into natural phrases, and displays them in a clean overlay with customizable font, size, position, and background. The goal is to make captions genuinely readable and accessible.

---

## To Fix / Implement
- Change: use original YouTube caption boundaries more intelligently for auto captions when they indicate speaker or utterance changes without explicit `>>` markers

## Shipped Changes

### Version 3.1.0
- Performance: avoid duplicate chunk rebuilds when the transcript, layout, font, size, line count, caps setting, and debug mode have not changed
- Performance: skip starting a second identical chunk rebuild while the first one is still running, reducing repeated work on long videos
- Release: Chrome-only submission while the Firefox version remains in AMO review

### Version 3 (3.0.0 - 3.0.2)
- Fix: captions no longer stay visible through very long silent gaps; long-pause hiding uses the last timed caption point plus a hold window instead of waiting until the next caption starts
- Fix: creator/manual caption lines are no longer merged across original YouTube caption events, preserving intentional lyric/stanza splits
- Debug: `ketuvia()` in the console downloads the latest captured YouTube timedtext JSON plus a compact Ketuvia debug log
- Fix: Cascadia Code was producing too many lines. font-variant-ligatures was breaking canvas font measurement; fixed by building the font string from individual style properties instead
- Removed font-variant-ligatures override (was unnecessary)
- Popup: reordered controls to Lines, All Caps, then Shade
- Performance: binary search and precalculations to speed up line rendering
- Fix: storage-bridge.js was missing from packaged extension (broke Chrome and Firefox builds from 2.1.4 onward); added to build script
- Subtitle text always centered regardless of caption block position
- Right-edge caption position now flush with player edge, matching left-side behavior
- Font-size selector circles in popup now vertically aligned
- Arabic/Hebrew RTL rendering improvements
- Fix: storage-bridge.js crashed with `TypeError` when YouTube blocked extension storage access (`chrome.runtime.lastError` was not checked before reading `items`), causing debug-mode persistence to silently fail; added lastError guards to both storage callbacks
- Debug: timing records (`pushTimingRecord`) added for font load, canvas precomputation, and chunk build — always-on, not gated by debug mode — to diagnose video load delays
- Debug: `window.__ketuviaLastTimedtext` now always captured (was previously debug-mode-only)
- Debug: log filenames use date-only ISO format and support Unicode (Hebrew/Arabic) video titles

### Version 2 (2.0.0 - 2.1.4)
- Added full caption customization: font choice, size, position, background shade, all caps toggle
- Fixed caption positioning and all caps layout
- Auto re-request autocaptions on initial load failure
- Changed default font to Atkinson Hyperlegible
- Improved sentence chunking: punctuation vs length prioritization
- Improved subtitle splitting (fully dependent on rendered line count, fill percentage, and punctuation)
- Fixed sentence chunking timing (transcript timestamps falsely breaking sentences)
- Fixed missing spaces at sentence boundaries
- UI and text size updates
- Added GitHub Actions workflow: automated publish to Chrome Web Store and Firefox AMO on version bump
- Added Firefox/AMO publishing support: build.py produces Chrome zip and patched Firefox build (moz-extension:// URLs, gecko manifest fields); CI split into independent Chrome and Firefox jobs so a Chrome review hold does not block Firefox
- Firefox: iterated on data_collection_permissions and minimum version requirements to satisfy AMO schema
- Performance: reduced processing requirements, improved stability
- Popup: reorganized layout, improved style, medium font size reduced
- Fix: persistence issues between Ketuvia settings and YouTube CC settings; separated their storage logic
- RTL: Arabic/Hebrew support, podcast new speaker formatting

### Version 1 (1.0.0 - 1.8.5)
Core extension built from scratch. Key things figured out and implemented:
- **Caption interception**: YouTube generates a short-lived Proof-of-Origin Token (pot) for timedtext requests that cannot be replicated externally. Solution: patch `window.fetch` and `XMLHttpRequest` to intercept YouTube's own requests, rewrite them to `fmt=json3` (which is not in the signed params so the HMAC stays valid), and capture the response body. No separate network requests made by the extension
- **Word extraction and chunker**: parses the json3 transcript, groups words into phrase-length chunks based on pause gaps, character count, word count, and duration constraints
- **Overlay**: custom div injected into the YouTube player; YouTube's native word-by-word captions hidden via injected style
- **100ms polling loop**: syncs displayed chunk to `video.currentTime` with a small lookahead offset
- **YouTube SPA navigation**: handles `yt-navigate-finish` events so the extension resets correctly when navigating between videos
- **Player trigger**: calls `player.setOption('captions','track',...)` to trigger YouTube's caption fetch without a popup or user interaction
- **CC+ toggle button**: injected into YouTube's player controls bar
