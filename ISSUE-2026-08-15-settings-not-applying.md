# Settings not applying, and what else Johan asked for

Raised by Johan De Wet (dewetjh@gmail.com), Firefox on Windows 11, over 15 August 2026. He is one of about six daily Firefox users and has been the source of most of the recent feature work.

**Status.** All three items are built, tested and staged as 4.3.0, unreleased at the time of this update. The bug fix is proven by simulation against the released code; the background scale, the legacy migration and the width control are verified rendering on a live video, including a re-chunk after a width change.

---

## 1. What Johan reported

**10:36Z, after reinstalling to pick up 4.2.1**

> Lines 4 and 5 as well as the colours only activate sometimes after repeatedly clicking on it till it actually takes and the font size 4 and 5 also stay the same size as font 2 and only after repeated clicking does it sometimes change and then with it sometimes activates the colour changes and line changes as well. There must be a timing issue with it registering the commands.

Same message, two feature requests:

> For background a Black option that does 100% black might be a good option to block out unwanted white text that is embedded in the video.

> Not sure if you can maybe add an option for how wide the text box can be. I'd say the current setting can be a 1 and then maybe add a 2 and 3 for extra width.

**10:54Z, with a screenshot**

> You can see here what I mean with the Dark text background that the embedded white text still interferes even worse when you have the text set to white. Also that the text box is short with it taking up 1/3 of the screen width. Adding length options of say 1/2 and 2/3 and even 3/4 could help people who prefer to read longer lines rather than more lines that cover the video.

**11:14Z, with a 7 second screen recording**

> Here I was just clicking between the text sizes from 3 to 5 and back to 3 and you can see that it doesn't always take the right size or colour. It sometimes double flashes and reverts back.

**12:52Z, two more screenshots**

> No background for the subs can also work and here the text box length is closer to 2/3 the width of the video.

> Here you can see what it looks like with 3/4 the width of the video.

He watches Chinese donghua with subtitles burned into the picture, which is why an opaque background matters to him: a semi-transparent box leaves the embedded text legible underneath, and white-on-white is the worst case.

## 2. What his recording actually shows

Measured frame by frame with `utilities/captiontimeline.py`, which counts yellow, white and dark pixels in the caption band:

| | |
|---|---|
| Clip length | 6.9 seconds, 1920x1080, 29.7 fps |
| Appearance changes | 16 |
| Shape of each change | yellow present for one or two frames, roughly 33 to 66 ms, then white again |
| Pattern | changes arrive in pairs about 0.1 s apart, pairs separated by 1 to 3 s |

His still photographs show the same thing at two moments: identical video frame, identical caption text, once large and yellow with a dark box covering the burned-in Chinese line, once small and white with the Chinese line clearly visible above it. Nothing but Ketuvia's own appearance differs between them.

His caption box measures about 43% of the video width in those photographs, which is the basis of his "1/3 of the screen" complaint.

## 3. Root cause, proven

`popup.js` kept no state of its own. It painted the defaults synchronously on open, loaded the stored settings asynchronously, and every click built the object to save by reading whichever buttons happened to look active at that instant:

```js
renderSettings(DEFAULT_SETTINGS);   // immediate: buttons show defaults
syncFromStorage().catch(() => {});  // async: real values arrive later
```

A click landing inside that window saves **the defaults plus the one button pressed**, silently replacing everything else the user had set.

`utilities/popupsim.mjs` runs the real `popup.js` against a stubbed DOM and a deliberately slow `chrome.storage`, then clicks "3 lines" 5 ms after open. Against the released code:

```
BAD  saved textSize:"medium"  textColor:"white"  font:"atkinson"  targetLines:3
```

Against the fixed code, same timing:

```
ok   saved textSize:"xxlarge" textColor:"yellow" font:"noto"      targetLines:3
```

This accounts for every symptom he described. Repeated clicking eventually works because by then the load has finished. Colour reverts when he clicks a size and vice versa, because each click writes a fresh object built from stale buttons. Sizes 4 and 5 look like size 2 because the size he clicked is saved while the rest snaps back, and a later click resets the size too. The one-frame yellow flash is the extension applying his value and then receiving the next write built from stale buttons.

The extension side is not at fault. Driving settings straight into `chrome.storage` and recording every styling change inside the page with `style.start`/`style.get` gives six clean transitions for six changes, no flashes, no reverts, the overlay staying in `movie_player` throughout.

## 4. The fix

`popup.js` now holds the settings in memory, seeded once from storage, and every change merges onto that rather than onto the DOM:

```js
let settings = null;
const ready = loadSettings().then(loaded => { settings = loaded; renderSettings(loaded); return loaded; });

async function changeSettings(overrides) {
  const base = settings || await ready || DEFAULT_SETTINGS;
  const next = normalizeSettings({ ...base, ...overrides });
  ...
}
```

A click arriving before the load simply waits for it. `currentSettings()` and its DOM reads are gone. `syncFromStorage` awaits the same promise instead of racing it.

Staged as 4.3.0 with the two features below.

## 5. What shipped earlier the same day, for context

| Version | Contents |
|---|---|
| 4.2.0 | Text colour, text opacity, four and five line captions, two TV sizes, the delivery-pace rule for which creator line breaks are real, balanced rows, and the popup rebuilt on one two-column grid |
| 4.2.1 | Captions rendering invisibly after moving between a Short and a normal video, because YouTube leaves a hidden zero-size player in the page and the extension mounted the overlay inside it. Welcome page now shows on install and on a major version change only |

Both are live on Firefox and Chrome.

## 6. Built from the same thread, shipped in 4.3.0

**Opaque background.** Background is currently three opacity steps (light 0.3, medium 0.45, dark 0.7 over black). Proposal: make it a five step scale expressed as percentages, 0, 25, 50, 75, 100, matching how Text opacity already reads. 0 gives him the no-background look he likes on some shows, 100 gives the solid block that hides burned-in subtitles. Five buttons fit the 135px cell at about 27px each.

**Caption width.** Today the box width is derived from the font size, `min(fontSize * 19em, playerWidth - 32)`, which holds a line near 38 characters at any size. That is deliberate and matches broadcast practice, but it means a user cannot choose long lines over more rows, which is exactly what he is asking for. Proposal: a `captionWidth` setting of Auto, 1/2, 2/3, 3/4, where Auto keeps today's em rule so nobody's existing look changes, and the fractions are taken of the player width. Four buttons fit one cell.

Both additions want a third row in the control grid. Lines and Text colour occupy row one, Background and Text opacity row two, so Width pairs naturally with something in row three.

## 7. Will the new changes break existing behaviour?

Checked against the code before building, since two of the three changes touch machinery that exists for speed or fidelity.

**The popup fix.** No interaction with the extension at all: it changes only what object gets written to storage. The extension's own rebuild sequencing, chunkBuildRequestId invalidating stale async rebuilds, is untouched and is what already made direct storage writes land cleanly in one step. One behavioural change worth knowing: a click in the first ~50 ms after opening the popup now waits for the stored settings instead of acting on defaults, which is the point.

**Width control, the risky one.** Box width today is an input to the chunker, not just a style. The canvas wrap simulation packs words against canvasW = layout.textWidthPx, and rebuilds are gated on needsRebuild, which fires only for targetLines, textSize, font and allCaps. Two traps follow. First, a width change must trigger a full re-chunk, or captions built for the old width render in the new box and every measurement the chunker made, including the wrapSafety margin protecting against one-frame overflow rows, is wrong. So captionWidth must join the needsRebuild list. Second, the em-derived width is also what keeps lines near 38 characters on any screen; the fractional widths deliberately override that, so a 3/4-width box on a large font can exceed the readable-line guideline. That is the user's explicit choice, but Auto must remain the default so nobody's layout changes on update. The Shorts width overrides, which always use the small font width so captions clear the action buttons, must ignore the fractional setting entirely, or wide captions will sit under the like/subscribe buttons again.

**Opaque background.** Pure style, no chunking input. Two details: the overlay's text-shadow exists to keep white text legible on light video and is pointless but harmless on a solid block, and at opacity 0 the box still occupies its padding, which is fine since the box is what balances rows. The migration must map the stored strings light/medium/dark onto the new scale, light to 25, medium to 50, dark to 75, so nobody's existing setting reverts to a default. normalizeSettings already treats unknown values as the default, which is the silent-revert trap the migration avoids.

**Storage shape.** Both features add keys. Old inject.js versions ignore unknown keys and normalizeSettings fills missing ones, so mixed old-popup/new-extension states degrade to defaults for the new keys only. The legacy cross-tab listener was already fixed on 4.2.0 to compare whole objects, so new keys propagate there without edits.

## 8. Suspicions not yet ruled out

The fix explains everything he reported, but these are worth watching because they were considered and not fully eliminated:

- **His player width bucket.** He watches on a TV. If the player reports a size that lands in a different width bucket than expected, font sizes come from a different column of the table. Nothing in his report requires this explanation, and no bucket makes xlarge equal to medium, so it is unlikely, but it has not been measured on his setup.
- **Two copies installed.** He removed and reinstalled the add-on to force the update. If a temporary and a store copy were ever active together, both would inject and the `window.__rechunkCaptionsLoaded` guard would let only the first run, so this should be harmless, but it was never confirmed on his machine.
- **Overlay recreation.** If YouTube removes the overlay from its subtree, the extension rebuilds it, and a freshly created element renders with stylesheet defaults, white and 24px, until the layout is applied. That would produce a white flash. It was not observed in 30 seconds of local recording, but it would look identical to the reported symptom and deserves a check if anything similar is reported after the fix ships.

## 9. How to verify

```bash
cd utilities
node popupsim.mjs                     # the click-before-load case, must pass
node popupsim_old.mjs                 # the same test against the released code, must fail
cd ext-live-loop
python loop.py --ext ../../ketuvia/dist/firefox --browser firefox --seed-from "<a real profile>"
python -u -X utf8 flashhunt.py        # every styling change the overlay goes through, from inside the page
python -u -X utf8 settlecheck.py      # each change lands in one step and stays
```

For the recording itself, `utilities/videoframes.py` pulls frames out of an mp4 and `utilities/captiontimeline.py` counts the caption colours per frame, which is how the one-frame flash was found.

## 10. Bold: attempted, deferred, evidence preserved

A Bold toggle was built alongside Outline and failed verification: with bold on, 5 to 6 of 7 captions rendered three rows on a two line setting. Three fixes were tried against three theories. Setting the measurer's weight before measuring fixed the first-order cause but not the symptom; routing bold through DOM measurement instead of canvas did not either. The decisive evidence, from measure.compare in the harness: at rest the measurer and overlay agree exactly (weight 700 both, width 456 both, three lines both) for a caption that the chunker had nonetheless packed as two. So the mismeasure happens only inside the rebuild window, in state not yet identified. Rather than ship a known three-rows-at-two defect, the toggle is hidden from the popup; the plumbing (textBold in settings, the weight variable, the DOM measurement route) remains, inert at default false. To resume: bolddebug.py reproduces it, and the open question is what differs about the measurer between chunkWords probing and afterwards.
