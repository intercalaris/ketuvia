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


COMMANDS = {'flows': cmd_flows, 'fit': cmd_fit, 'text': cmd_text, 'lines': cmd_lines,
            'width': cmd_width, 'popup': cmd_popup}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(USAGE)
        raise SystemExit(2)
    failures, good_msg, bad_msg = COMMANDS[sys.argv[1]](sys.argv[2:])
    print(flush=True)
    print(good_msg.upper() if not failures else bad_msg, flush=True)
    raise SystemExit(0 if not failures else 1)
