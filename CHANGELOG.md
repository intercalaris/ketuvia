# Ketuvia: bug and change log

Ketuvia is a Chrome/Firefox extension that replaces YouTube's default word-by-word auto-captions with phrase-based captions. YouTube's captions reveal one word at a time as the speaker speaks, which is hard to read and cognitively taxing. Ketuvia intercepts the caption stream, groups words into natural phrases, and displays them in a clean overlay with customizable font, size, position, and background. The goal is to make captions genuinely readable and accessible.

---

## To Fix / Implement
- Change: use original YouTube caption boundaries more intelligently for auto captions when they indicate speaker or utterance changes without explicit `>>` markers

## Tooling / Release Process
- Fixed: removed version check from CI detect step. Previously CI compared the manifest version against the previous commit and failed if unchanged, forcing arbitrary bumps when a publish attempt failed. Now the stores themselves reject duplicate versions with a clear error, which is sufficient.
- Release publishing is now controlled by commit-message keywords: `[chrome]`, `[firefox]`, `[chrome+firefox]`, or `[replace-chrome]`
- Store publishing requires a manifest version bump; commits without release keywords do not publish to any store
- `[replace-chrome]` cancels a pending Chrome Web Store review before uploading the new Chrome version

### Tooling Bugs
- **Chrome Web Store OAuth refresh token expires every 7 days** because the Google Cloud OAuth consent screen is in Testing mode. Fix: go to the OAuth consent screen in Google Cloud Console and publish the app (switch from Testing to Production). Until then, the `CWS_REFRESH_TOKEN` GitHub secret needs to be manually rotated every week.
  - Fixed 2026-05-16: switched OAuth consent screen to Production mode. Token no longer expires.

## Shipped Changes

### Version 3.2.7
- Fix: manually written captions now respect user line count, font, and all-caps settings.

  **Background:** YouTube delivers two distinct caption formats. Auto-generated captions give each word its own event with a precise timestamp (`tOffsetMs`), and insert `\n`-only events as separators between word groups. Manually written captions give each full sentence as a single segment with one start/end time, no per-word offsets, no `\n`-only separator events, and no `wWinId` property on events. The extension detects which format is in use by checking for those three signals.

  **The bug:** Because manually written captions stored the entire sentence as one indivisible entry, the chunk builder could never split it. Every caption fell back to `forced_single_word` mode and ignored `targetLines` entirely. Switching fonts or enabling all-caps would change how many screen lines the sentence occupied, but the setting had no effect.

  **The fix:** In `extractWords`, manually written caption segments are now split at `\n` characters (which the creator placed as intentional line breaks), then each resulting sub-line is split into individual words with timing distributed proportionally across the sub-line's share of the event duration. Each word becomes its own entry. Sub-line boundaries are enforced as hard chunk breaks via a synthetic per-sub-line event index, so the creator's `\n` splits are always respected. Within a sub-line, the chunk builder can reflow freely - if the user's chosen font or all-caps setting makes a sub-line too wide for `targetLines`, it splits at word boundaries rather than overflowing.

### Version 3.2.2
- Firefox: lowered minimum required version from 142 to 109 (the first Firefox with MV3 support), allowing installation on Firefox ESR 128 and other older stable releases

### Version 3.2.1
- Release: re-submit Chrome version to replace pending store review
- Note: Average Sans has no bold variant; regular only.

### Version 3.2.0
- Performance: changing font, size, or line count triggers a full caption rebuild. To verify each caption fits within the line limit, its text is written to a hidden DOM element and the browser measures it, which forces a full page layout recalculation. Previously this was done per-caption sequentially, meaning hundreds of recalculations. Now all captions are written to the DOM first, then all are measured in one pass, one recalculation total, roughly 10x faster on long videos.
- Fix: changing font no longer causes a brief flash of an extra caption line before the layout recalculates
- Fix: caption trimming after a line overflow now handles being off by more than one word, and no longer crashes on single-word captions

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
- Debug: timing records (`pushTimingRecord`) added for font load, canvas precomputation, and chunk build, gated by debug mode, to diagnose video load delays
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
