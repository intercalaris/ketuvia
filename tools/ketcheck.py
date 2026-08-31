"""Ketuvia's live checks in one tool, so a run states the question it answers."""
import json
import os
import re
import subprocess
import sys
import time

HARNESS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', '..', 'utilities', 'ext-live-loop')
sys.path.insert(0, os.path.abspath(HARNESS))
import harness as H  # noqa: E402  the generic browser driver lives in utilities

USAGE = """ketcheck.py <command> [args]

  flows [video]      four user configurations: render, fit, stranded word, timing drift
  fit   [video...]   no caption exceeds the chosen line count, over every caption built
  text  [video...]   no caption text is lost between transcript and captions
  lines [video] [n]  do captions use the line count asked for, and what ends them early
  width [px...]      what share of the player the Auto box takes, per size
  afterupdate [vid]  does an already-open tab still obey the panel after the extension updates
  staleprefs [video] can leftover page settings overwrite a choice made after reinstalling
  ccbutton [video]   what happens when YouTube's subtitles button is momentarily absent
  latency [video]    how long a change takes to reach the screen, and what shows meanwhile
  multitab [video]   two tabs open, change settings fast, watch for a value coming back
  panel              click every control in the real settings panel and check each one sticks
  flicker [video]    change settings on a playing video and watch for a setting that reverts
  popup [png]        screenshot the settings popup
"""

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_VIDEO = '4soZ33MvlW4'
DESKTOP = os.path.abspath(os.path.join(HARNESS, '..', 'desktop', 'desktop.py'))

DEFAULTS = {'targetLines': 2, 'textSize': 'medium', 'font': 'atkinson', 'position': 'center-low',
            'allCaps': False, 'textColor': 'white', 'textOpacity': 100, 'background': 50,
            'captionWidth': 'auto', 'textOutline': False, 'textBold': False}

FLOWS = [
    ('default', DEFAULTS, False),
    ('tv reader', dict(DEFAULTS, targetLines=3, textSize='xlarge', captionWidth='threequarters',
                       textBold=True, textOutline=True, textColor='yellow', allCaps=True), False),
    ('no box', dict(DEFAULTS, targetLines=1, background=0, textOutline=True,
                    captionWidth='half'), False),
    ('debug mode', DEFAULTS, True),
]

WORD = re.compile(r"[\w'’]+")


def transcript(vid):
    path = os.path.join(H.WORK, 'transcripts', f'{vid}.json')
    if not os.path.exists(path):
        raise H.SetupError(f'no stored transcript for {vid}, fetch it first')
    return json.load(open(path, encoding='utf-8')).get('events') or []


def word_times(vid):
    """Word start times the way inject.js builds them, so drift measures the extension rather than the gap between a word and its event."""
    events = [e for e in transcript(vid)
              if any((s.get('utf8') or '').strip() for s in (e.get('segs') or []))]
    out, last = [], -1
    for i, ev in enumerate(events):
        base = ev.get('tStartMs') or 0
        ev_end = base + (ev.get('dDurationMs') or 0)
        segs = ev.get('segs') or []
        for si, seg in enumerate(segs):
            text = (seg.get('utf8') or '').strip()
            if not text:
                continue
            start = base + (seg.get('tOffsetMs') or 0)
            nxt = segs[si + 1] if si + 1 < len(segs) else None
            if nxt:
                seg_end = base + (nxt.get('tOffsetMs') or 0)
            else:
                following = events[i + 1].get('tStartMs') if i + 1 < len(events) else None
                seg_end = min(ev_end, following) if following is not None else ev_end
            span = max(0, seg_end - start)
            tokens = WORD.findall(text.lower())
            for wi, tok in enumerate(tokens):
                t = max(last + 1, start + round((wi / max(1, len(tokens))) * span))
                out.append((tok, t / 1000))
                last = t
    return out


def scheduled_at(caption_text, trace):
    """When the extension itself scheduled this caption, so lateness is measured against the extension rather than a reconstruction of the transcript."""
    text = ' '.join(WORD.findall(caption_text.lower()))
    for t in trace:
        if ' '.join(WORD.findall((t.get('text') or '').lower())) == text:
            return (t.get('startMs') or 0) / 1000
    return None


def cmd_flows(args):
    vid = args[0] if args else DEFAULT_VIDEO
    pairs = word_times(vid)
    seek = round(pairs[0][1]) + 3 if pairs else 5
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    rows = []
    for name, settings, debug in FLOWS:
        H.send('storage.set', {'ketuviaDebug': debug})
        H.apply_settings(settings)
        trace = H.wait_for_trace(f'*{vid}*')
        over = sum(1 for t in trace if (t.get('lines') or 0) > settings['targetLines'])
        caps = H.captions(f'*{vid}*', 8, seek=seek, rate=3)
        stranded = sum(1 for c in caps
                       if len(c.get('rows') or []) > 1 and len(c['rows'][-1]['text'].split()) == 1)
        timed = []
        for c in caps:
            due = scheduled_at(c['text'], trace)
            # A caption scheduled before the seek was already on screen, so its lateness is the seek, not the extension.
            if due is not None and due >= seek:
                timed.append((round((c.get('t') or 0) - due, 1), c))
        worst_pair = max(timed, key=lambda dc: abs(dc[0])) if timed else None
        worst = worst_pair[0] if worst_pair else None
        if worst_pair and abs(worst) > 1.5:
            c = worst_pair[1]
            print(f"    late by {worst}s: shown at {c.get('t')}s, scheduled for "
                  f"{scheduled_at(c['text'], trace)}s", flush=True)
            print(f"      {c['text'][:74]}", flush=True)
        rows.append((name, len(trace), over, len(caps), stranded, worst))
    H.send('storage.set', {'ketuviaDebug': False})

    print(f"\n{'flow':<12}{'built':>7}{'over':>6}{'shown':>7}{'stranded':>10}{'worst drift':>13}",
          flush=True)
    for name, built, over, shown, stranded, worst in rows:
        print(f'{name:<12}{built:>7}{over:>6}{shown:>7}{stranded:>10}'
              f"{('n/a' if worst is None else f'{worst}s'):>13}", flush=True)
    bad = [r[0] for r in rows if r[2] or r[3] == 0 or (r[5] is not None and abs(r[5]) > 1.5)]
    return bad, 'every flow good', 'problem in: ' + ', '.join(bad)


def cmd_fit(args):
    lines, bad = 2, []
    for vid in (args or [DEFAULT_VIDEO]):
        H.open_video(f'https://www.youtube.com/watch?v={vid}')
        H.apply_settings(dict(DEFAULTS, targetLines=lines, textBold=True, textOutline=True))
        trace = H.wait_for_trace(f'*{vid}*')
        over = [t for t in trace if (t.get('lines') or 0) > lines]
        print(f'{vid:<14}{len(trace):>4} captions, {len(over)} over {lines} lines', flush=True)
        for t in over[:2]:
            print(f"    {t['lines']} lines, {t['reason']}: {str(t['text'])[:64]}", flush=True)
        if over:
            bad.append(vid)
    return bad, 'every caption fits', 'overflow in: ' + ', '.join(bad)


def cmd_text(args):
    bad = []
    for vid in (args or [DEFAULT_VIDEO]):
        pairs = word_times(vid)
        H.open_video(f'https://www.youtube.com/watch?v={vid}')
        H.apply_settings(dict(DEFAULTS, textBold=True))
        trace = H.wait_for_trace(f'*{vid}*')
        emitted = WORD.findall(' '.join(t.get('text') or '' for t in trace).lower())
        missing = len(pairs) - len(emitted)
        print(f'{vid:<14}transcript {len(pairs)} words, captions {len(emitted)}, '
              f'difference {missing}', flush=True)
        if missing > 0:
            bad.append(vid)
    return bad, 'no text lost', 'text lost in: ' + ', '.join(bad)


def cmd_lines(args):
    """Does a caption actually use the line count asked for, and what ends it early."""
    vid = args[0] if args else DEFAULT_VIDEO
    want = int(args[1]) if len(args) > 1 else 5
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    H.apply_settings(dict(DEFAULTS, targetLines=want))
    trace = H.wait_for_trace(f'*{vid}*')

    counts = {}
    reasons = {}
    for t in trace:
        n = t.get('lines') or 0
        counts[n] = counts.get(n, 0) + 1
        reasons[t.get('reason')] = reasons.get(t.get('reason'), 0) + 1
    total = len(trace) or 1
    print(f'{vid} at {want} lines, {total} captions built', flush=True)
    for n in sorted(counts):
        print(f'  {n} line(s): {counts[n]:>4}  {100 * counts[n] / total:>5.1f}%', flush=True)
    print('  ends because:', flush=True)
    for reason, n in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f'    {reason:<38}{n:>4}', flush=True)
    reaching = sum(v for k, v in counts.items() if k >= want)
    print(f'  reaching {want} lines: {reaching} of {total}', flush=True)
    return ([] if reaching else [vid]), f'captions reach {want} lines', \
           f'no caption reaches {want} lines'


def cmd_width(args):
    """What share of the player Auto takes, from the constants in inject.js. Pass 'live' to measure the real box for every option instead."""
    if args and args[0] == 'live':
        vid = args[1] if len(args) > 1 else DEFAULT_VIDEO
        H.open_video(f'https://www.youtube.com/watch?v={vid}')
        player = H.send('rect', {'match': f'*{vid}*', 'selector': '.html5-video-player'}) or {}
        picture = H.send('rect', {'match': f'*{vid}*', 'selector': 'video'}) or {}
        print(f"  player {player.get('width')} px, picture {picture.get('width')} px", flush=True)
        widths = {}
        for choice in ('auto', 'third', 'half', 'twothirds', 'threequarters'):
            H.apply_settings(dict(DEFAULTS, captionWidth=choice), settle=2)
            r = H.send('measure.compare', {'match': f'*{vid}*', 'text': 'measuring the box'})
            widths[choice] = ((r or {}).get('overlay') or {}).get('width') or 0
        auto = widths.get('auto') or 1
        print(f"  {'option':<15}{'box':>6}{'of player':>11}{'of picture':>12}{'chars':>7}", flush=True)
        for choice, box in widths.items():
            of_player = box / (player.get('width') or 1)
            of_pic = box / (picture.get('width') or 1)
            print(f'  {choice:<15}{box:>6}{of_player:>10.0%}{of_pic:>12.0%}'
                  f'{round(38 * box / auto):>7}', flush=True)
        return [], 'box widths measured', ''

    src = open(os.path.join(HERE, '..', 'inject.js'), encoding='utf-8').read()
    rows = dict(
        (m[0], {'small': int(m[1]), 'medium': int(m[2]), 'large': int(m[3]),
                'xwide': int(m[4]), 'ultra': int(m[5])})
        for m in re.findall(r'(\w+):\s*\{ small: (\d+), medium: (\d+), large: (\d+), '
                            r'xwide: (\d+), ultra: (\d+) \}', src))
    buckets = re.search(r'widthBuckets:\s*\{ medium: (\d+), large: (\d+), xwide: (\d+), '
                        r'ultra: (\d+) \}', src)
    base_em = int(re.search(r'textWidthEm:\s*(\d+)', src).group(1))
    reduce_em = int(re.search(r'normalWideReductionEm:\s*(\d+)', src).group(1))
    padding = int(re.search(r'playerPaddingPx:\s*(\d+)', src).group(1))
    med, lrg, xwd, ult = (int(g) for g in buckets.groups())

    def bucket_of(w):
        return ('ultra' if w >= ult else 'xwide' if w >= xwd else
                'large' if w >= lrg else 'medium' if w >= med else 'small')

    def auto_width(size, player):
        b = bucket_of(player)
        em = base_em
        if size == 'large':
            em -= reduce_em - 1
        elif size in ('medium', 'xlarge', 'xxlarge'):
            em -= reduce_em
        font = rows['medium'][b] if size == 'large' else rows[size][b]
        return min(round(font * em), round(player * 2 / 3), max(0, player - padding))

    players = [int(a) for a in args] or [854, 1280, 1920, 2560, 3840]
    sizes = ['small', 'medium', 'large', 'xlarge', 'xxlarge']
    print('Auto box as a share of player width', flush=True)
    print(f"{'size':<9}" + ''.join(f'{p:>10}' for p in players), flush=True)
    for size in sizes:
        cells = []
        for p in players:
            w = auto_width(size, p)
            cells.append(f'{w / p:>9.0%}')
        print(f'{size:<9}' + ''.join(cells), flush=True)
    print(f'\nbuckets: small <{med}, medium <{lrg}, large <{xwd}, xwide <{ult}, ultra >={ult}',
          flush=True)
    return [], 'width table computed', ''


CONTROLS = [
    ('targetLines', ['1', '3', '2']),
    ('textColor', ['yellow', 'cyan', 'white']),
    ('captionWidth', ['third', 'twothirds', 'auto']),
    ('background', ['0', '100', '50']),
    ('textOpacity', ['50', '100']),
    ('textSize', ['small', 'xxlarge', 'medium']),
]
TOGGLES = ['caps-toggle', 'outline-toggle', 'bold-toggle']
TOGGLE_KEY = {'caps-toggle': 'allCaps', 'outline-toggle': 'textOutline', 'bold-toggle': 'textBold'}


def stored_settings():
    got = H.send('storage.get', {'keys': ['ketuviaSettings']})
    return (got or {}).get('ketuviaSettings') or {}


def cmd_panel(args):
    """Click each control in the real rendered panel and check the click sticks and stays.

    Pass a number to slow the panel's storage reads by that many ms, which is what a slower machine
    does and what opens every race the panel has.
    """
    delay = next((a for a in args if a.isdigit()), None)
    url = H.send('runtime.url', {'path': 'popup.html'})
    if delay:
        url = f'{url}?probeDelay={delay}'
        print(f'  storage reads slowed by {delay}ms', flush=True)
    H.send('storage.set', {'ketuviaSettings': dict(DEFAULTS)})
    H.send('tabs.only', {'url': url})
    time.sleep(4)

    hello = H.send('panel', {'op': 'ping'})
    if not (hello or {}).get('ok'):
        raise H.SetupError(f'the panel probe did not answer: {hello}')
    print(f"  probe answered from {hello.get('url')}", flush=True)

    bad = []
    for setting, values in CONTROLS:
        for value in values:
            sel = f'[data-setting="{setting}"] button[data-value="{value}"]'
            res = H.send('panel', {'op': 'click', 'selector': sel})
            if not (res or {}).get('ok'):
                bad.append(f'{setting}={value}: {(res or {}).get("reason")}')
                continue
            # Watch rather than read once: a click that lands then reverts is the reported fault.
            w = H.send('panel', {'op': 'watch', 'selector': sel, 'prop': 'active',
                                 'ms': 1500, 'everyMs': 50}, timeout=40)
            series = (w or {}).get('series') or []
            settled = series[-1] if series else None
            reverted = any(series[i] != '1' for i in range(1, len(series)))
            saved = str(stored_settings().get(setting))
            ok = settled == '1' and saved == str(value) and not reverted
            if not ok:
                bad.append(f'{setting}={value}: stored {saved}, ended {settled}, reverted {reverted}')
            print(f'  {setting:<13}{value:<10}stored {saved:<10}ended {settled}'
                  f"{'  REVERTED' if reverted else ''}", flush=True)

    for toggle in TOGGLES:
        for _ in range(2):
            before = bool(stored_settings().get(TOGGLE_KEY[toggle]))
            H.send('panel', {'op': 'click', 'selector': f'#{toggle}'})
            time.sleep(1.0)
            after = bool(stored_settings().get(TOGGLE_KEY[toggle]))
            if after == before:
                bad.append(f'{toggle} did not change ({before} -> {after})')
            print(f'  {toggle:<16}{before} -> {after}', flush=True)

    return bad, 'every control sticks in the real panel', 'did not stick: ' + '; '.join(bad)


def rendered_font(match):
    r = H.send('measure.compare', {'match': match, 'text': 'x'})
    return ((r or {}).get('overlay') or {}).get('size')


def cmd_afterupdate(args):
    """An auto-update restarts the extension and orphans every open tab. Does the tab still listen?"""
    vid = args[0] if args else DEFAULT_VIDEO
    match = f'*{vid}*'
    H.open_video(f'https://www.youtube.com/watch?v={vid}')

    H.apply_settings(dict(DEFAULTS, textSize='small'))
    before = rendered_font(match)
    H.apply_settings(dict(DEFAULTS, textSize='xxlarge'))
    grew = rendered_font(match)
    print(f'  before the update: {before} then {grew}', flush=True)
    if before == grew:
        raise H.SetupError('settings were not being applied even before the update')

    print('  restarting the extension, the way an auto-update does', flush=True)
    H.send('runtime.reload')
    time.sleep(8)
    for attempt in range(8):
        ping = H.send('tabs.list')
        if isinstance(ping, list):
            print(f'  extension back after about {8 + attempt * 4}s', flush=True)
            break
        time.sleep(4)
    else:
        raise H.SetupError('the extension never came back after restarting')

    # The tab was never reloaded. This is the state a user is in when an update lands mid-video.
    H.apply_settings(dict(DEFAULTS, textSize='small'), settle=4)
    after = rendered_font(match)
    print(f'  after the update, asked for small: {after}', flush=True)

    bad = []
    if after == grew:
        bad.append(f'an already-open tab ignored the change ({grew} stayed) until reloaded')
    return bad, 'an open tab still obeys the panel after an update', '; '.join(bad)


# The settings a real user reported the fault on, rather than the defaults.
JOHAN = {'targetLines': 2, 'textSize': 'xlarge', 'font': 'noto', 'position': 'center-lowish',
         'allCaps': False, 'textColor': 'yellow', 'textOpacity': 75, 'background': 100,
         'captionWidth': 'half', 'textOutline': False, 'textBold': False}


def cmd_staleprefs(args):
    """Uninstalling clears extension storage but not the page's localStorage. Can the old copy win?"""
    vid = args[0] if args else DEFAULT_VIDEO
    match = f'*{vid}*'
    H.open_video(f'https://www.youtube.com/watch?v={vid}')

    old = dict(DEFAULTS, textSize='xxlarge', textColor='green', targetLines=1)
    new = dict(DEFAULTS, textSize='small', textColor='cyan', targetLines=3)

    H.send('localStorage.set', {'match': match, 'key': 'ketuviaSettings',
                                'value': json.dumps(old)})
    # What a fresh install looks like: extension storage empty, the page's copy left behind.
    H.send('storage.remove', {'keys': ['ketuviaSettings']})
    time.sleep(0.5)

    # The user reloads the video and picks something new at about the same moment.
    H.send('tabs.reload', {'match': match})
    time.sleep(0.35)
    H.send('storage.set', {'ketuviaSettings': new})

    for _ in range(6):
        time.sleep(2)
        got = stored_settings()
        if got:
            break
    print(f"  chose {new['textSize']}/{new['textColor']}, "
          f"storage now holds {got.get('textSize')}/{got.get('textColor')}", flush=True)

    bad = []
    if got.get('textSize') == old['textSize'] and got.get('textColor') == old['textColor']:
        bad.append('the leftover page copy overwrote the choice made after reinstalling')
    return bad, 'a leftover page copy cannot overwrite a new choice', '; '.join(bad)


def cmd_ccbutton(args):
    """Captions and settings both hang off YouTube's subtitles button. What if it is not there?"""
    vid = args[0] if args else DEFAULT_VIDEO
    match = f'*{vid}*'
    pairs = word_times(vid)
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    H.apply_settings(JOHAN)
    H.send('video', {'match': match, 'seek': round(pairs[0][1]) + 3 if pairs else 5,
                     'play': True, 'mute': True})
    time.sleep(3)

    def overlay():
        snap = H.send('snapshot', {'match': match, 'selector': '#rechunk-overlay'})
        page = (snap or {}).get('page') or {}
        return (page.get('text') or '').strip(), (page.get('dataset') or {}).get('empty')

    text_before, empty_before = overlay()
    size_before = rendered_font(match)
    print(f'  with the button: empty={empty_before}, size={size_before}, '
          f'caption {text_before[:34]!r}', flush=True)
    if empty_before == '1':
        raise H.SetupError('no caption on screen to begin with')

    gone = H.send('dom.remove', {'match': match, 'selector': '.ytp-subtitles-button'})
    print(f'  removing the button: {gone}', flush=True)
    if not (gone or {}).get('ok'):
        raise H.SetupError(f'could not remove the button, nothing was tested: {gone}')
    time.sleep(1.0)

    text_gone, empty_gone = overlay()
    print(f'  without the button: empty={empty_gone}, caption {text_gone[:34]!r}', flush=True)

    # A settings change while the button is away: does it survive?
    H.send('storage.set', {'ketuviaSettings': dict(JOHAN, textSize='small')})
    time.sleep(2)
    size_while_gone = rendered_font(match)

    back = H.send('dom.restore', {'match': match})
    print(f'  restoring: {back}', flush=True)
    if not (back or {}).get('restored'):
        raise H.SetupError(f'the button was not put back: {back}')
    time.sleep(2)
    text_after, empty_after = overlay()
    size_after = rendered_font(match)
    print(f'  after restoring: empty={empty_after}, size={size_after}, '
          f'caption {text_after[:34]!r}', flush=True)

    # The other half: a real "off" must still hide them, or this fix would break turning CC off.
    H.send('video', {'match': match, 'captions': False})
    time.sleep(2)
    text_off, empty_off = overlay()
    print(f'  captions turned off: empty={empty_off}, caption {text_off[:30]!r}', flush=True)
    H.send('video', {'match': match, 'captions': True})
    time.sleep(2)
    _, empty_on = overlay()
    print(f'  captions turned back on: empty={empty_on}', flush=True)

    bad = []
    if empty_off != '1':
        bad.append('turning captions off no longer hides the overlay')
    if empty_on == '1':
        bad.append('captions did not come back after turning them on again')
    if empty_gone == '1':
        bad.append('captions were wiped while the button was momentarily absent')
    if size_after == size_before:
        bad.append(f'the settings change made while the button was away never applied '
                   f'(still {size_after})')
    return bad, 'a missing subtitles button does not disturb captions or settings', '; '.join(bad)


def cmd_latency(args):
    """How long a change takes to show, and whether anything wrong shows on the way."""
    vid = args[0] if args else DEFAULT_VIDEO
    match = f'*{vid}*'
    pairs = word_times(vid)
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    H.apply_settings(JOHAN)
    H.send('video', {'match': match, 'seek': round(pairs[0][1]) + 3 if pairs else 5,
                     'play': True, 'mute': True})
    time.sleep(3)

    bad = []
    steps = [('textSize', 'large', 'fontSize'), ('textSize', 'xlarge', 'fontSize'),
             ('font', 'cascadia', 'fontFamily'), ('font', 'noto', 'fontFamily'),
             ('textColor', 'cyan', 'color'), ('captionWidth', 'twothirds', 'width')]
    for setting, value, prop in steps:
        # Read first: without a before value, a change that already landed looks like no change.
        pre = H.send('watch', {'match': match, 'selector': '#rechunk-overlay .rechunk-text',
                               'prop': prop, 'ms': 1, 'everyMs': 10}, timeout=20)
        before_value = pre[0] if isinstance(pre, list) and pre else None
        H.send('storage.set', {'ketuviaSettings': dict(JOHAN, **{setting: value})})
        series = H.send('watch', {'match': match, 'selector': '#rechunk-overlay .rechunk-text',
                                  'prop': prop, 'ms': 3000, 'everyMs': 50}, timeout=45)
        if not isinstance(series, list) or not series:
            bad.append(f'{setting}={value}: nothing to watch')
            continue
        changed_at = next((i for i, v in enumerate(series) if v != before_value), None)
        distinct = [v for i, v in enumerate(series) if i == 0 or v != series[i - 1]]
        took = 'never' if changed_at is None else f'{changed_at * 50}ms'
        print(f'  {setting}={value:<10}{prop:<12}was {str(before_value)[:18]:<20}'
              f'took {took:<8}{len(distinct)} states', flush=True)
        if changed_at is None:
            bad.append(f'{setting}={value} never reached the screen (stayed {before_value})')
        elif changed_at * 50 > 1500:
            bad.append(f'{setting}={value} took {changed_at * 50}ms to show')
        if len(distinct) > 2:
            bad.append(f'{setting}={value} passed through {len(distinct)} states: {distinct}')
    return bad, 'changes reach the screen promptly and cleanly', '; '.join(bad)


def cmd_multitab(args):
    """Two YouTube tabs, settings changed quickly. A value that comes back is another tab echoing a stale copy."""
    vid = args[0] if args else DEFAULT_VIDEO
    second = args[1] if len(args) > 1 else 'wXUEIIeDQ5c'
    match = f'*{vid}*'
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    H.apply_settings(DEFAULTS)

    H.send('tabs.create', {'url': f'https://www.youtube.com/watch?v={second}', 'active': False})
    time.sleep(8)
    tabs = H.send('tabs.list')
    print(f'  {len(tabs) if isinstance(tabs, list) else "?"} tabs open', flush=True)
    H.send('video', {'match': f'*{second}*', 'mute': True, 'play': True, 'captions': True})
    time.sleep(3)
    H.send('video', {'match': match, 'mute': True, 'play': True, 'captions': True})
    time.sleep(2)

    sizes = ['small', 'xxlarge', 'small', 'xxlarge']
    for size in sizes:
        H.send('storage.set', {'ketuviaSettings': dict(DEFAULTS, textSize=size)})
        time.sleep(0.35)
    series = H.send('watch', {'match': match, 'selector': '#rechunk-overlay .rechunk-text',
                              'prop': 'fontSize', 'ms': 4000, 'everyMs': 50}, timeout=45)
    if not isinstance(series, list) or not series:
        raise H.SetupError(f'nothing to watch: {series}')
    seen = [v for i, v in enumerate(series) if i == 0 or v != series[i - 1]]
    settled = seen[-1]
    want = H.send('storage.get', {'keys': ['ketuviaSettings']})
    wanted_size = ((want or {}).get('ketuviaSettings') or {}).get('textSize')
    print(f'  font size went {seen}', flush=True)
    print(f'  storage says {wanted_size}, screen settled at {settled}', flush=True)

    # After the last change nothing should move again, and it must not land on an earlier value.
    tail = series[len(series) // 2:]
    late_change = len(set(tail)) > 1
    bad = []
    if late_change:
        bad.append(f'the caption was still changing after the last setting: {seen}')
    return bad, 'two tabs do not fight over settings', '; '.join(bad)


def cmd_flicker(args):
    """A setting that lands and then reverts. One reading cannot see it, so watch over time."""
    vid = args[0] if args else DEFAULT_VIDEO
    match = f'*{vid}*'
    pairs = word_times(vid)
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    H.apply_settings(DEFAULTS)
    H.send('video', {'match': match, 'seek': round(pairs[0][1]) + 3 if pairs else 5,
                     'play': True, 'mute': True})
    time.sleep(3)

    bad = []
    changes = [('textSize', 'xxlarge', 'fontSize'), ('textSize', 'medium', 'fontSize'),
               ('textColor', 'yellow', 'color'), ('targetLines', 1, '--rechunk-text-width')]
    for setting, value, prop in changes:
        H.send('storage.set', {'ketuviaSettings': dict(DEFAULTS, **{setting: value})})
        series = H.send('watch', {'match': match, 'selector': '#rechunk-overlay .rechunk-text',
                                  'prop': prop, 'ms': 2500, 'everyMs': 50}, timeout=40)
        if not isinstance(series, list) or not series:
            bad.append(f'{setting}={value}: nothing to watch')
            continue
        seen = [v for i, v in enumerate(series) if i == 0 or v != series[i - 1]]
        # Settling is one change. Going back to a value already left behind is the flash.
        reverted = any(seen[i] in seen[:i] for i in range(1, len(seen)))
        print(f'  {setting}={value:<9}{prop:<22}{len(seen)} distinct: {seen[:6]}', flush=True)
        if reverted:
            bad.append(f'{setting}={value} reverted: {seen}')

    return bad, 'no setting reverted after it landed', 'reverting: ' + '; '.join(bad)


def cmd_popup(args):
    out_png = args[0] if args else os.path.join(H.WORK, 'popup.png')
    url = H.send('runtime.url', {'path': 'popup.html'})
    if not isinstance(url, str) or not url:
        raise H.SetupError(f'no popup url: {url}')
    H.send('tabs.only', {'url': url})
    time.sleep(5)
    r = subprocess.run([sys.executable, DESKTOP,
                        'shotwin', 'Ketuvia', out_png],
                       capture_output=True, text=True, encoding='utf-8')
    print((r.stdout or r.stderr).strip(), flush=True)
    size = os.path.getsize(out_png) if os.path.exists(out_png) else 0
    if size < 5000:
        raise H.SetupError(f'screenshot is {size} bytes, a blank window rather than the popup')
    print(f'saved {out_png} ({size} bytes)', flush=True)
    return [], 'popup captured', ''


def cmd_pipmirror(args):
    """Firefox's pop-out copies the first caption element in YouTube's container, so it has to be Ketuvia's."""
    vid = args[0] if args else DEFAULT_VIDEO
    match = f'*{vid}*'
    H.open_video(f'https://www.youtube.com/watch?v={vid}')
    H.apply_settings(JOHAN)

    snap = H.send('snapshot', {'match': match, 'globals': ['navigator.userAgent']})
    agent = ((snap or {}).get('page') or {}).get('navigator.userAgent') or ''
    if 'firefox' not in agent.lower():
        print('  not Firefox, so there is no pop-out to feed', flush=True)
        return [], 'pop-out mirror does not apply to this browser', ''

    bad = []
    for attempt in range(6):
        H.send('video', {'match': match, 'seek': 40 + attempt * 12, 'play': True, 'mute': True})
        time.sleep(3)
        d = H.send('pipdiag', {'match': match}) or {}
        overlay = (d.get('overlay') or '').strip()
        if not overlay:
            continue
        copied = ' '.join((d.get('firefoxWouldRead') or '').split(' / ')).strip()
        print(f'  ours first={d.get("firstChildIsOurs")} present={d.get("ourNodePresent")} '
              f'copied={copied[:44]!r} overlay={overlay[:44]!r}', flush=True)
        if not d.get('ourNodePresent'):
            bad.append('Ketuvia has no element in YouTube\'s caption container')
        if d.get('firstChildIsOurs') is not True:
            bad.append('Ketuvia\'s element is not the one the pop-out would read')
        # The rows are re-broken for the pop-out, so compare the words rather than the line breaks.
        if copied.split() != overlay.split():
            bad.append(f'the pop-out would show {copied[:40]!r}, the player shows {overlay[:40]!r}')
        break
    else:
        raise H.SetupError('no caption appeared, nothing was tested')

    return bad, 'the pop-out reads Ketuvia\'s phrasing', 'THE POP-OUT WOULD NOT SHOW KETUVIA\'S PHRASING'


COMMANDS = {'flows': cmd_flows, 'fit': cmd_fit, 'text': cmd_text, 'lines': cmd_lines, 'pipmirror': cmd_pipmirror,
            'width': cmd_width, 'panel': cmd_panel, 'multitab': cmd_multitab, 'latency': cmd_latency, 'ccbutton': cmd_ccbutton, 'staleprefs': cmd_staleprefs, 'afterupdate': cmd_afterupdate, 'flicker': cmd_flicker,
            'popup': cmd_popup}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(USAGE)
        raise SystemExit(2)
    failures, good_msg, bad_msg = COMMANDS[sys.argv[1]](sys.argv[2:])
    print(flush=True)
    print(good_msg.upper() if not failures else bad_msg, flush=True)
    raise SystemExit(0 if not failures else 1)
