# Rechunk Captions for YouTube

Replaces YouTube's word-by-word auto-captions with phrase-based captions.
For people who find rolling word-by-word reveals unreadable: Deaf and hard-of-hearing
viewers, autistic viewers, viewers with processing differences, language learners,
or anyone who wants captions that group into clauses instead of bouncing one word
at a time.

## What it does

YouTube's auto-CC (the `kind: "asr"` track) ships words with millisecond-level
per-word timestamps in its JSON3 caption format, but YouTube's player chooses
to render them one word at a time as they are recognized. This extension reads
the same data, regroups the words into phrase chunks at clause boundaries,
and renders them in its own overlay.

It only activates on videos that have auto-generated captions. Videos with
manual captions are left alone, since those are typically already chunked well.

## Install (developer mode)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open any YouTube video with auto-CC. A small `CC+` button appears in the
   player's right-side controls. Green means active, gray means no auto-CC
   on this video, red means failed to load.

## Files

```
manifest.json   16 lines   MV3, MAIN-world content script, no permissions
inject.js      302 lines   Single content script. Patches fetch, intercepts
                           /youtubei/v1/player, fetches JSON3 for the asr
                           track, runs the chunker, mounts the overlay,
                           polls video.currentTime at 100ms.
overlay.css     65 lines   Overlay positioning and toggle button styling
```

No build step. No npm. No third-party libraries. No background service worker.
No popup. No remote API calls. The extension talks only to youtube.com,
using the same session cookies the browser already has.

## Design principle: one path

There is exactly one way the extension obtains captions:

1. Patch `window.fetch` at `document_start` in MAIN world.
2. Watch every response for the `/youtubei/v1/player` URL substring.
3. Read `captions.playerCaptionsTracklistRenderer.captionTracks` from the JSON.
4. Find the entry where `kind === "asr"`.
5. Fetch its `baseUrl + "&fmt=json3"` with the user's existing session.
6. Run the chunker on the result.
7. Render to the overlay synced via 100ms polling of `video.currentTime`.

If any step fails, the toggle button turns red and the overlay flashes a
message describing what went wrong. There is no DOM-scraping fallback, no
secondary endpoint, no third-party transcription service. If the primary
path stops working because YouTube changes its API, the extension stops
working and tells the user, rather than silently degrading to a worse
experience that pretends to be the same thing.

## Chunker parameters (in `inject.js`, `CFG`)

- `pauseMs: 700` — gap between consecutive word starts that ends a chunk.
  This is what catches clause and sentence boundaries.
- `maxChars: 80` — soft cap on chunk text length, roughly two readable lines.
- `maxWords: 14` — hard cap on words per chunk.
- `maxDurMs: 6000` — chunk display will not exceed six seconds.
- `minDurMs: 1200` — chunk will display for at least 1.2 seconds.
- `lookaheadMs: 400` — captions appear this many ms before the audio,
  giving the reader a moment to absorb the phrase before the speaker says it.
- `pollMs: 100` — how often the overlay updates.

Tune by editing the CFG block at the top of `inject.js`.

## Why MAIN world

The content script declares `"world": "MAIN"` in `manifest.json`. This makes
it run in the same JavaScript context as YouTube's own scripts, which is
required for two things:

- Patching `window.fetch` so it intercepts YouTube's own player requests.
- Reading `window.ytInitialPlayerResponse` if needed.

Because we operate inside the page's own context with the user's session,
our caption fetches are indistinguishable from YouTube's: same cookies,
same User-Agent, same TLS session, same baseUrl with the signature
parameters YouTube itself just generated. Bot-detection systems that flag
external scrapers do not apply.

## Limitations

- Live streams: the timedtext endpoint behaves differently and may not
  provide complete word streams. Untested.
- Translations: only the first `kind: "asr"` track is used. If you want
  the auto-translated track instead, swap the `find(t => t.kind === 'asr')`
  call to filter by `languageCode`.
- The `CC+` button placement assumes desktop YouTube. The mobile site
  (`m.youtube.com`) has a different player shell and the button may not
  appear, though the overlay still mounts.

## License

Public domain / CC0. Do whatever helps people.
