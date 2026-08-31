"""Runs every check against the current code and records a receipt. A release push needs that receipt."""
import hashlib
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
HARNESS = os.path.abspath(os.path.join(ROOT, '..', 'utilities', 'ext-live-loop'))
UTILS = os.path.abspath(os.path.join(ROOT, '..', 'utilities'))
RECEIPT = os.path.join(HERE, '.preflight.json')

# Everything that ships. The receipt is void the moment any of it changes.
SHIPPED = ['manifest.json', 'inject.js', 'popup.js', 'popup.html', 'popup.css',
           'background.js', 'storage-bridge.js', 'overlay.css', 'welcome.html', 'welcome.js']

STATIC = [
    ('settings panel scenarios', ['node', os.path.join(HERE, 'popupsim.mjs')]),
    ('configuration audit', ['node', os.path.join(HARNESS, 'configaudit.mjs')]),
    ('welcome page rules', ['node', os.path.join(UTILS, 'tests', 'welcometest.mjs')]),
    ('caption classifier', ['node', os.path.join(HARNESS, 'classify_real.mjs')]),
]

LIVE = [
    ('captions fit the chosen lines', ['fit', '4soZ33MvlW4', 'Kh8Yng88tU0', 'wP1uQNueWXA']),
    ('no caption text lost', ['text', '4soZ33MvlW4', 'wXUEIIeDQ5c', 'wP1uQNueWXA']),
    ('four user configurations', ['flows']),
    ('every control in the real panel', ['panel', '600', 'reopen']),
    ('changes reach the screen', ['latency']),
    ('two tabs agree', ['multitab']),
    ('an open tab obeys after an update', ['afterupdate']),
    ('a missing subtitles button', ['ccbutton']),
    ('leftover page settings', ['staleprefs']),
    ('the pop-out reads Ketuvia', ['pipmirror']),
]


def source_hash():
    h = hashlib.sha256()
    for name in sorted(SHIPPED):
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            h.update(name.encode())
            h.update(open(path, 'rb').read())
    return h.hexdigest()


def run(label, cmd, cwd=None):
    started = time.time()
    print(f'  {label} ...', flush=True)
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    tail = [l for l in (r.stdout or '').strip().splitlines() if l.strip()][-1:] or ['no output']
    mark = 'ok ' if r.returncode == 0 else 'BAD'
    print(f'  {mark} {label}  ({time.time() - started:.0f}s)  {tail[0][:80]}', flush=True)
    return r.returncode == 0, tail[0][:120]


def harness_up():
    try:
        port_file = os.path.join(HARNESS, '.work', 'port')
        if not os.path.exists(port_file):
            return False
        sys.path.insert(0, HARNESS)
        import harness as H
        return isinstance(H.send('tabs.list'), list)
    except Exception:
        return False


def main():
    print('building', flush=True)
    ok, _ = run('build', [sys.executable, os.path.join(ROOT, 'build.py')], cwd=ROOT)
    if not ok:
        print('BUILD FAILED, nothing else run', flush=True)
        return 1

    results = {}
    print('static checks', flush=True)
    for label, cmd in STATIC:
        results[label], _ = run(label, cmd)

    if not harness_up():
        print('\nno browser harness running, so the live checks cannot run.', flush=True)
        print('start one:  python loop.py --ext <dist/firefox> --browser firefox', flush=True)
        return 1

    print('live checks', flush=True)
    for label, args in LIVE:
        results[label], _ = run(label, [sys.executable, os.path.join(HERE, 'ketcheck.py')] + args)

    failed = [k for k, v in results.items() if not v]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed', flush=True)
    if failed:
        for name in failed:
            print(f'  FAILED: {name}', flush=True)
        if os.path.exists(RECEIPT):
            os.remove(RECEIPT)
        return 1

    json.dump({'hash': source_hash(), 'when': time.strftime('%Y-%m-%dT%H:%M:%S'),
               'checks': sorted(results)}, open(RECEIPT, 'w', encoding='utf-8'), indent=2)
    print(f'receipt written for {source_hash()[:12]}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
