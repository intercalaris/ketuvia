"""Build the Chrome Web Store screenshots from the current build: 1280x800, 24-bit, no alpha."""
import os
import subprocess
import sys
import time

from PIL import Image

HARNESS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', '..', 'utilities', 'ext-live-loop')
sys.path.insert(0, os.path.abspath(HARNESS))
import harness as H  # noqa: E402  the generic browser driver lives in utilities

DESKTOP = os.path.abspath(os.path.join(HARNESS, '..', 'desktop', 'desktop.py'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'meta', 'store')
SIZE = (1280, 800)
VIDEO = 'wXUEIIeDQ5c'

# The look from the published screenshots: Cascadia at size 3 with the outline on, which already
# differs from the defaults of Atkinson at medium with no outline.
LOOK = {'targetLines': 2, 'textSize': 'large', 'font': 'cascadia', 'position': 'center-low',
        'allCaps': False, 'textColor': 'white', 'textOpacity': 100, 'background': 50,
        'captionWidth': 'auto', 'textOutline': True, 'textBold': False}
SEEK_CANDIDATES = (35, 80, 130, 190, 250)


def grab(path):
    subprocess.run([sys.executable, DESKTOP, 'shotwin', 'Mozilla Firefox', path],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
    if not os.path.exists(path) or os.path.getsize(path) < 5000:
        raise H.SetupError(f'window capture failed: {path}')
    return Image.open(path).convert('RGB')


def panel_image():
    """The settings panel on its own, cropped to its content."""
    url = H.send('runtime.url', {'path': 'popup.html'})
    H.send('tabs.only', {'url': url})
    time.sleep(4)
    shot = grab(os.path.join(OUT, '_panel_raw.png'))
    # Trim the window border first: it is a different black from the page and would stretch the crop to the whole window.
    m = round(min(shot.size) * 0.02)
    shot = shot.crop((m, m, shot.width - m, shot.height - m))
    px = shot.load()
    w, h = shot.size

    def near(c, d, tol=12):
        return abs(c[0] - d[0]) + abs(c[1] - d[1]) + abs(c[2] - d[2]) < tol

    bg = px[int(w * 0.05), int(h * 0.7)]

    # Skip the browser's own toolbar: the page begins at the first row that is entirely background.
    cols = list(range(0, w, 12))
    page_top = 0
    for y in range(0, h, 2):
        if sum(1 for x in cols if near(px[x, y], bg)) > len(cols) * 0.95:
            page_top = y
            break

    xs, ys = [], []
    for y in range(page_top, h, 3):
        for x in range(0, w, 3):
            if not near(px[x, y], bg, 24):
                xs.append(x)
                ys.append(y)
    if len(xs) < 200:
        raise H.SetupError('could not find the panel content')
    xs.sort()
    ys.sort()

    def span(vals, lo=0.01, hi=0.99):
        return vals[int(len(vals) * lo)], vals[min(len(vals) - 1, int(len(vals) * hi))]

    x0, x1 = span(xs)
    y0, y1 = span(ys)
    pad = round(w * 0.012)
    return shot.crop((max(0, x0 - pad), max(page_top, y0 - pad),
                      min(w, x1 + pad), min(h, y1 + pad)))


def caption_text():
    snap = H.send('snapshot', {'match': '*', 'selector': '#rechunk-overlay'})
    page = (snap or {}).get('page') or {}
    if (page.get('dataset') or {}).get('empty') != '0':
        return ''
    return (page.get('text') or '').strip()


def readable(text):
    """Transcript markers like {quote} read as artefacts in a store picture."""
    return bool(text) and not any(ch in text for ch in '{}[]<>')


def face_score(img):
    """How much of the frame a face fills, so the shot shows the speaker rather than a cutaway."""
    import cv2
    import numpy as np
    grey = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = cascade.detectMultiScale(grey, 1.1, 5, minSize=(60, 60))
    return max((fw * fh for _, _, fw, fh in faces), default=0)


def video_image():
    """A real frame with captions showing, chosen for one with the speaker on camera."""
    H.send('window.size', {'width': 1600, 'height': 1000})
    time.sleep(2)
    H.open_video(f'https://www.youtube.com/watch?v={VIDEO}')
    H.apply_settings(LOOK)

    best, best_score = None, -1
    for seek in SEEK_CANDIDATES:
        H.send('video', {'match': '*', 'seek': seek, 'play': True, 'mute': True})
        shown = ''
        for _ in range(10):
            shown = caption_text()
            if readable(shown):
                break
            time.sleep(1)
        if not readable(shown):
            print(f'  {seek}s: no clean caption', flush=True)
            continue
        H.send('video', {'match': '*', 'pause': True})
        time.sleep(0.5)
        frame = grab(os.path.join(OUT, '_video_raw.png'))
        score = face_score(frame)
        print(f'  {seek}s: face {score} px  "{shown[:44]}"', flush=True)
        if score > best_score:
            best, best_score = frame, score

    if best is None:
        raise H.SetupError('no caption appeared to photograph')
    if best_score <= 0:
        print('  no face found, using the best frame anyway', flush=True)

    w, h = best.size
    want = SIZE[0] / SIZE[1]
    if w / h > want:
        cut = round((w - h * want) / 2)
        best = best.crop((cut, 0, w - cut, h))
    else:
        cut = round((h - w / want) / 2)
        best = best.crop((0, cut, w, h - cut))
    return best.resize(SIZE, Image.LANCZOS)


def save(img, name):
    path = os.path.join(OUT, name)
    img.convert('RGB').save(path, 'PNG')
    print(f'  {name}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB', flush=True)


def fit_to_store(src, dest, top=0, bottom=0, left=0, right=0):
    """Crop the given edges off a capture, then letterbox it onto the 1280x800 the store requires."""
    img = Image.open(src).convert('RGB')
    w, h = img.size
    img = img.crop((left, top, w - right, h - bottom))
    scale = min(SIZE[0] / img.width, SIZE[1] / img.height)
    small = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGB', SIZE, (0, 0, 0))
    canvas.paste(small, ((SIZE[0] - small.width) // 2, (SIZE[1] - small.height) // 2))
    canvas.save(dest, 'PNG')
    print(f'{dest}  {canvas.size[0]}x{canvas.size[1]}  mode {canvas.mode}  '
          f'{os.path.getsize(dest) // 1024} KB', flush=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    H.ensure_visible()
    panel = panel_image()
    video = video_image()

    # Screenshot 1: the extension at work, with the panel where the browser puts it.
    wide = video.copy()
    target_w = round(SIZE[0] * 0.30)
    scaled = panel.resize((target_w, round(panel.height * target_w / panel.width)), Image.LANCZOS)
    wide.paste(scaled, (SIZE[0] - target_w - 12, 12))
    save(wide, 'screenshot-1-captions-and-settings.png')

    # Screenshot 2: the panel alone, centred.
    fit = min((SIZE[0] - 120) / panel.width, (SIZE[1] - 60) / panel.height)
    big = panel.resize((round(panel.width * fit), round(panel.height * fit)), Image.LANCZOS)
    canvas = Image.new('RGB', SIZE, (13, 13, 13))
    canvas.paste(big, ((SIZE[0] - big.width) // 2, (SIZE[1] - big.height) // 2))
    save(canvas, 'screenshot-2-settings.png')

    for junk in ('_panel_raw.png', '_video_raw.png'):
        p = os.path.join(OUT, junk)
        if os.path.exists(p):
            os.remove(p)
    print(f'written to {os.path.abspath(OUT)}', flush=True)


if __name__ == '__main__':
    if len(sys.argv) > 3 and sys.argv[1] == 'fit':
        edges = dict(zip(('top', 'bottom', 'left', 'right'),
                         (int(v) for v in sys.argv[4:])))
        fit_to_store(sys.argv[2], sys.argv[3], **edges)
    else:
        main()
