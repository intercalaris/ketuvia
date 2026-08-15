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

### Version 4.2.1
- **Fix: captions invisible after moving between a Short and a normal video.** YouTube leaves a hidden 0x0 player in the page when you navigate between Shorts and watch pages, and it can sit ahead of the real one. The extension found the player through the first `video` element in the document, so it mounted the caption overlay inside the hidden one and everything rendered at zero size. Reported with two diagnostics: a watch page whose player was `shorts-player` at 0x0, and a Short whose player was `movie_player` at 0x0. The player is now chosen by taking the visible players and preferring the one that belongs to the current page, and the overlay moves if it ever finds itself in the wrong player.
- The welcome page now appears on install and again only when the major version changes, so 4.2 to 4.3 is silent but 4.x to 5.0 says hello again. An older install carrying the plain seen flag is treated as having seen it for version 4.

### Version 4.2.0
- **Text colour.** White, yellow, green and cyan, the four broadcast caption colours. Requested by a Firefox user who found white text hard to read against bright video.
- **Text opacity.** 100%, 75% or 50%, separate from the background Shade, matching how YouTube's own caption settings treat font opacity and background opacity as different controls.
- **Four and five line captions**, on top of the existing one to three.
- **Two larger text sizes for TVs and large monitors.** Broadcast captions (CEA-708, BBC) put a caption line at 1/15 of picture height, which is about 70 arcminutes at a normal couch distance and is independent of TV size, since viewing distance scales with the screen. The old flat maximum of 52px was 1/21 of a 1080-tall player and 1/42 of a 4K one, so it fell further behind the standard as the screen grew. The size table now has buckets for fullscreen (>=1800px) and 4K (>=2600px) players, and the largest size reaches 72px at 1080 and 120px at 2160.
- Line length is unchanged by the new sizes. The caption box is measured in em, so a line stays near 38 characters at any size or screen, which is where broadcast subtitles sit (BBC 37, Netflix 42). Without this the two new sizes would have run to 48 characters and forced eye travel across a large screen.
- A caption can never take more than 42% of the player height. Five lines at the largest size shrink to fit a short player instead of burying it.
- Popup: five sizes and five line counts fit without the tallest A clipping, and the size letters share one baseline and grow upward. Colour sits above its opacity, lines above background.

### Version 4.1.2
- Fix: a creator's caption line that is wider than the caption box no longer strands one or two words on the last row. Those captions now wrap evenly instead of filling the first row and spilling the remainder. Only captions that are a single creator-written line are affected, so captions the extension groups itself are untouched.
- Fix: when a creator's line is too long to fit even one caption, it is split into equal parts rather than filling the first and leaving a word alone in the next.
- Neither fix merges text across a creator's line break, so lyrics and verse keep their lines and nothing moves into an earlier caption.

### Version 4.1.1
- Settings are now reachable from the browser's own add-ons manager, not only from the toolbar icon. `options_ui` points at the same panel, so Firefox shows it under the three dots in about:addons and Chrome shows it under Details. A user reported hunting there first, finding no Options entry, and concluding the extension had no settings at all. This only became possible in 4.1.0: before then the panel needed a YouTube tab in focus to do anything, so opening it from the add-ons page would have done nothing.

### Version 4.1.0
- **Fix: popup settings did nothing for some users.** Reported by a Firefox user whose captions worked and whose popup looked normal, but where only On/Off and Reset had any effect.

  **The bug:** On/Off and Debug were written to `chrome.storage`, picked up by `storage-bridge.js`, and applied in every tab. Everything else went through `runInTab()`, which called `chrome.scripting.executeScript` into the MAIN world of *the active tab of the current window*, and ended in `catch { return null; }`. Three things made that return null on a perfectly healthy install: no tab id, the injected function's own `isYouTube` guard, and destructuring an empty result array. All were swallowed silently. It failed in both directions, so the popup could not read the current settings either, which is why it always displayed the defaults.

  **The fix:** settings now travel exactly like the On/Off state. The popup writes them to `chrome.storage.local`, `storage-bridge.js` hands them to the page on the document, and `inject.js` applies them. No injection, no MAIN world, no active-tab targeting, and a change now applies to every open YouTube tab instead of one. `runInTab` and the `getActiveTab` helper are gone, and the four duplicated settings handlers collapse into one `changeSettings` call.

- **Fix: an appearance change could be dropped until something else happened.** `applySettings` hands off to a rebuild that starts with `if (!player || !STATE.words.length) return;`, and on a font change the overlay restyle is deliberately deferred until after the rebuild to avoid a flash of the wrong line count. When no transcript had been captured yet there was no rebuild, so the new appearance stayed in `STATE` and only reached the screen when an unrelated event, a window resize or the next video, applied the layout. Both rebuild paths now apply the overlay layout when they cannot run, which keeps the anti-flash behaviour for the case it was written for.

- Debug: a Firefox caption-loading diagnostic ships with this version. It is inert unless the user is on Firefox and turns Debug mode on, in which case it records a timeline that survives page refreshes and saves a JSON report when Debug mode is turned off again. Written to chase the refresh race where YouTube's `timedtext` request can fire before the fetch interceptor is installed.

- Firefox: minimum version raised from 109 to 128. `inject.js` is declared `"world": "MAIN"`, which Firefox only supports from 128 (bug 1736575). Between 109 and 127 the add-on installed and did nothing at all, since it could not patch the page's `fetch`, read `ytInitialPlayerResponse`, or reach `player.setOption`.

- Fix: creator-written captions that were wrapped by a tool now reflow to fill the chosen number of lines.

  **Background:** 3.2.7 made the extension respect a creator's line breaks in manually written captions and never merge across them, so a music video's lyrics stay one line per caption. That relies on the line breaks being the creator's choice.

  **The bug:** Many professionally captioned videos are not written line by line. The transcript is run through a tool that fits it to a fixed line width, typically 50 characters, and hands YouTube two-line blocks. Those breaks carry no meaning, but the extension treated them as intent, so a caption could never be more than half of one wrapped block. At medium and large text the block is wider than the caption box, so it spilled one or two words onto a second line and stopped there, and a three-line setting produced the same two lines as a two-line setting. Small text hid the problem because its box is wider than the source lines, and Cascadia hid it because a monospaced font overflows far enough that the split looks deliberate.

  **The fix:** `linesWereFittedToAWidth` in `getTextEventInfo` asks three questions of a manual track, each ruling out a kind of writing whose line breaks are real. Do most captions contain a line break, which excludes the one-line-per-caption shape nearly every lyric track uses. Are the line lengths uniform, which excludes verse, whose lines are as long as the phrase. Does the text repeat itself, which excludes sung verse with short even lines, such as a chorus. Only when all three point the same way are the breaks discarded and the words handed to the normal chunk builder. Word timing is untouched either way.

### Version 4.0.0
- **YouTube Shorts support.** Captions now work on Shorts, including scrolling from one Short to the next. Shorts deliver caption data only through the intercepted `timedtext` request (there is no `ytInitialPlayerResponse`), and the timedtext for the next Short arrives before the URL updates, so the interceptor now treats the timedtext response itself as the authoritative signal that a new video is loading and adopts it. The visible Shorts player is `#shorts-player` (the `#movie_player` element is 0x0), so the overlay now mounts on the `.html5-video-player` ancestor of the `<video>` element.
- **Caption sizing rebuilt as a simple lookup.** The old stack of ratios, per-size scales, floors, and a separate width calculation is gone. Font size is now a flat lookup of 3 player-width buckets (small <700px, medium 700-1250px, large >=1250px) by 3 font settings, and the caption box width is just the font size times a fixed em count, capped to fit the player. Each of the nine cells is independently tunable with no cross-coupling.
- **Shorts positioning.** Top and bottom positions are now edge-anchored: a 1-, 2-, or 3-line caption shares the same outer edge and grows inward, so multi-line captions never extend past the video edge, under the subscribe/action buttons, or above the top. Upper and lower positions are mirror-symmetric about the video's center, the middle is true center, and the top three positions are lifted by a configurable amount. Edge positions use the small font as a fixed width/height reference so they sit in the same place regardless of the selected font size.
- **Shorts width.** The caption box is narrowed and uses the small font as a fixed width basis for every size, so a full line always clears the fixed right-side action buttons (larger fonts wrap to more lines rather than widening the box).
- **Normal-video width.** Large font keeps its size but uses the medium font's box width (one character wider than medium), and medium/large boxes are trimmed a few characters.
- Performance: fast window resizing no longer thrashes the main thread. The `ResizeObserver` now reads the new size from `contentRect` (no forced reflow), drops no-op notifications, and trailing-debounces the reflow-heavy layout work so it runs once after the size settles instead of on every notification. This also makes it loop-safe.
- Settings stay in sync across open tabs and between Shorts and normal videos via a `storage` event listener.
- Popup: tighter spacing around the donate / debug-mode row.

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
