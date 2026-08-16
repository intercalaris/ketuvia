# Ketuvia: bug and change log

Ketuvia is a Chrome/Firefox extension that replaces YouTube's default word-by-word auto-captions with phrase-based captions. YouTube's captions reveal one word at a time as the speaker speaks, which is hard to read and cognitively taxing. Ketuvia intercepts the caption stream, groups words into natural phrases, and displays them in a clean overlay with customizable font, size, position, and background. The goal is to make captions genuinely readable and accessible.

---

## To Fix / Implement
- Change: use original YouTube caption boundaries more intelligently for auto captions when they indicate speaker or utterance changes without explicit `>>` markers

## Tooling / Release Process
- Proposed: drop the CI version check. It fails a build when the manifest version is unchanged, which forces an arbitrary bump after a failed publish, and the stores reject duplicate versions anyway.
- Release publishing is now controlled by commit-message keywords: `[chrome]`, `[firefox]`, `[chrome+firefox]`, or `[replace-chrome]`
- Store publishing requires a manifest version bump; commits without release keywords do not publish to any store
- `[replace-chrome]` cancels a pending Chrome Web Store review before uploading the new Chrome version

### Tooling Bugs
- **Chrome Web Store OAuth refresh token expires every 7 days** because the Google Cloud OAuth consent screen is in Testing mode. Fix: go to the OAuth consent screen in Google Cloud Console and publish the app (switch from Testing to Production). Until then, the `CWS_REFRESH_TOKEN` GitHub secret needs to be manually rotated every week.
  - Fixed 2026-05-16: switched OAuth consent screen to Production mode. Token no longer expires.

## Keeping Past Faults Out

Each of these ran green while the fault was live, which is why the fault shipped. Every one now has a
check that fails on the broken version and passes on the fixed one.

| Fault | What caused it | What catches it now |
| --- | --- | --- |
| Settings needed repeated clicking, then flicked back | The panel built each save from whichever buttons looked active, so a click before storage loaded saved the defaults | `tools/popupsim.mjs`, click before the load resolves |
| The same flicking, returning in 4.3.2 | A second copy of `syncFromStorage` replaced the fixed one and repainted the panel from a read issued before the click | `tools/popupsim.mjs`, click while a later read is in flight; plus a duplicate-function check in `configaudit.mjs` |
| Captions used more lines than chosen | A whole transcript line arrived as one unit the chunker could not wrap | `ketcheck fit`, judged over every caption built, not the few that happen to play |
| Captions stopped merging across segments | A forced break at every segment boundary | `ketcheck lines`, which reports what ends each caption |
| Caption text went missing | Interpolated word times collided and were dropped as out of order | `ketcheck text`, transcript word count against caption word count |
| Captions blinked out and settings changes vanished | A missing subtitles button was read as "captions are off" | `ketcheck ccbutton`, which removes the button, then checks both that captions survive and that a real off still hides them |
| An open tab ignored the panel after an update | The settings messenger dies with the old extension and is not replaced | `ketcheck afterupdate`, which restarts the extension and checks a never-reloaded tab still obeys |
| A leftover page copy overwrote a fresh choice | The copy was written back without re-checking | `ketcheck staleprefs`, which arms the old copy and then chooses something new |
| Bold reused captions measured at the regular weight | Weight was missing from the rebuild check and from the font wait | `ketcheck flows`, which runs bold as one of its configurations |

Two testing lessons are baked in as well. The storage stub reads its value when the read is serviced
rather than when it resolves, because reading at resolve time hid the stale-read race entirely. And
the panel stub is built from `popup.html`, because a hand-written stub silently lost 19 of the 21
position buttons and reported success anyway.

## Shipped Changes

### Version 4.3.5
- **Fix: after installing or updating, an already-open YouTube tab stopped obeying the settings panel.** The part of the extension that carries settings into the page dies when the extension is replaced, so the panel kept saving while nothing in that tab was listening, and only reloading the page revived it. It is now put back into open tabs on install and update. The part that draws the captions runs in the page itself and survives, so only the messenger is replaced and nothing is doubled.
- **Fix: settings left behind in the page could overwrite a fresh choice.** Removing the extension clears its storage but not the copy kept in the page, which exists so an upgrade does not reset anyone's preferences. That copy was written back without looking again, so a choice made in the same moment could be overwritten by the old one. It now re-checks first and never writes over anything that has appeared since.

### Version 4.3.4
- **Fix: captions blinked out and settings changes were thrown away.** Both showing a caption and applying a settings change were gated on finding YouTube's subtitles button in the page, and a missing button counted as "captions are off". YouTube removes its controls for a moment whenever it re-renders them, so during that moment every poll wiped the caption and any setting chosen at that instant was discarded without ever rebuilding. That reads as the captions flashing, the chosen option not taking, and a page refresh fixing it. Not being able to tell is now treated as unknown rather than off: only a definite off hides anything. Turning captions off still hides them, and turning them back on still restores them.

### Version 4.3.3
- **Fix: the settings panel could undo a click you had just made.** The panel reads storage several times as it opens, and an old copy of that routine was still in the file. Because a later function declaration replaces an earlier one, that old copy was the one running, and when its read finished it repainted the panel with the values from before your click. Clicking during those first moments therefore looked like the setting flicking back on its own. The stale copy is gone, and the panel now only ever paints from the settings it holds in memory.
- **Caption colours are back to full strength.** The softened yellow, green and cyan read as washed out on video; text opacity is the control for toning them down.

### Version 4.3.2
- **Fix: captions were breaking at YouTube's own segment boundaries**, so words that belonged in one caption were shown as two and the chosen line count often went unused. Long segments are still split so captions fit the box; line breaks the creator authored, such as song lyrics, are still kept.
- **Lines are now 1 to 3.** Subtitle guidelines cap a caption at two lines, three by exception, so 4 and 5 have been removed. A stored 4 or 5 becomes 3.
- **Caption width is now Auto, 1/3, 1/2 and 2/3.** 1/3 is narrower than Auto reaches in a windowed player or at the two TV sizes. 3/4 has been removed: at normal text sizes it ran far past the line length subtitles are meant to hold. A stored 3/4 becomes 2/3.
- **Yellow, green and cyan are softer shades**, easier to read for long stretches than the pure primaries, and the settings panel now previews the colour that appears on screen. White is unchanged.
- **The outline is slightly heavier** and draws in eight directions, so the corners of letters no longer thin out.

### Version 4.3.0
- **Fix: settings sometimes needed repeated clicking and flashed back to the previous look.** The popup built each save from whichever buttons looked active at that moment, so a click landing before storage loaded wrote the defaults over stored choices. It now holds its settings in memory, and an early click waits for the load.
- **Background is a 0 to 100 scale: 0, 25, 50, 75, 100.** 100 is a solid block for pictures with subtitles burned in; 0 removes the box. Stored light, medium and dark map to 25, 50 and 75.
- **Outline toggle.** A dark outline around the letters, for reading with no background box.
- **Bold toggle.**
- **Fix: captions could use more lines than the number chosen.** On videos whose transcript arrives as whole lines rather than word by word, a line too wide for the box was shown whole and spilled onto an extra row. Those lines are now split into words the chunker can re-wrap.
- **Caption width: Auto, 1/2, 2/3 or 3/4 of the player.** Auto follows the font size and holds a line near 38 characters. Shorts ignore the setting, since their narrow box exists to clear the action buttons.

### Version 4.2.1
- **Fix: captions invisible after moving between a Short and a normal video.** YouTube leaves a hidden 0x0 player in the page, and the overlay could mount inside it. The player is now chosen from the visible ones, preferring the one that belongs to the current page.
- The welcome page appears on install and on major version changes only.

### Version 4.2.0
- **Text colour:** white, yellow, green and cyan.
- **Text opacity:** 100%, 75% or 50%, separate from the background.
- **Four and five line captions.**
- **Two larger text sizes for TVs and large monitors.** Broadcast standards put a caption line at 1/15 of picture height, so a flat 52px maximum fell further behind as screens grew. The largest size now reaches 72px at 1080 and 120px at 2160.
- Line length is unchanged by size. The box is measured in em, so a line stays near 38 characters, where broadcast subtitles sit (BBC 37, Netflix 42).
- A caption never takes more than 42% of the player height.
- Popup: five sizes and line counts fit without the tallest A clipping, and the size letters share one baseline.

### Version 4.1.2
- Fix: a creator's line wider than the caption box no longer strands one or two words on the last row; it wraps evenly.
- Fix: a creator's line too long for a single caption is split into equal parts.
- Neither fix merges text across a creator's line break, so lyrics and verse keep their lines.

### Version 4.1.1
- Settings open from the browser's add-ons manager as well as the toolbar icon; `options_ui` points at the same panel.

### Version 4.1.0
- **Fix: popup settings did nothing for some users.** Everything except On/Off and Debug was applied by injecting into the active tab, which returned null on a healthy install for three separate reasons, all swallowed silently. Settings now travel through `chrome.storage` like the On/Off state, so a change reaches every open YouTube tab.
- **Fix: an appearance change could be dropped until an unrelated event.** A rebuild that could not run left the new look in memory. Both rebuild paths now apply the layout when they cannot rebuild.
- **Fix: creator captions wrapped by a tool now reflow to fill the chosen number of lines.** Many professionally captioned videos are machine-fitted to a fixed line width, and those breaks carry no meaning, but the extension treated them as intent. A track's breaks are discarded only when most captions contain one, the line lengths are uniform, and the text does not repeat, which leaves lyrics and verse untouched.
- Firefox: minimum version raised from 109 to 128, which is where `"world": "MAIN"` is supported. Earlier versions installed and did nothing.
- Debug: a Firefox caption-loading diagnostic, inert unless Debug mode is on.

### Version 4.0.0
- **YouTube Shorts support**, including scrolling from one Short to the next. The timedtext response is treated as the signal that a new video is loading, since it arrives before the URL updates, and the overlay mounts on the visible `#shorts-player`.
- **Caption sizing rebuilt as a lookup**: three player-width buckets by three font settings, with the box width a fixed em count of the font size.
- Shorts positioning: top and bottom are edge-anchored so multi-line captions grow inward, and upper and lower are mirror-symmetric about the centre.
- Shorts width narrowed so a full line clears the action buttons.
- Normal video: large font keeps its size but uses the medium box width.
- Performance: fast window resizing no longer thrashes the main thread; the layout work runs once after the size settles.
- Settings stay in sync across open tabs.
- Popup: tighter spacing around the donate row.

### Version 3.2.7
- **Fix: manually written captions now respect the line count, font and all-caps settings.** A manual caption stored a whole sentence as one indivisible entry, so it could never be split and every caption fell back to single-word mode. Segments are now split at the creator's `
`, then into words with the timing shared across the sub-line. Sub-line boundaries stay hard breaks; within one, captions reflow freely.

### Version 3.2.2
- Firefox: lowered minimum required version from 142 to 109 (the first Firefox with MV3 support), allowing installation on Firefox ESR 128 and other older stable releases

### Version 3.2.1
- Release: re-submit Chrome version to replace pending store review
- Note: Average Sans has no bold variant; regular only.

### Version 3.2.0
- Performance: a font, size or line count change rebuilds every caption, and each is measured in the DOM. All captions are now written first and measured in one pass, one layout recalculation instead of hundreds, roughly 10x faster on long videos.
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
