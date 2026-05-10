#!/usr/bin/env python3
import json, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)

with open(ROOT / 'manifest.json', encoding='utf-8') as f:
    version = json.load(f)['version']

SOURCE_FILES = ['manifest.json', 'inject.js', 'overlay.css', 'popup.html', 'popup.css', 'popup.js']
SOURCE_DIRS  = ['icons', 'fonts']

FIREFOX_ADDON_ID = 'ketuvia@intercalaris'
FIREFOX_MIN_VER  = '140.0'


def copy_sources(dest: Path):
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for f in SOURCE_FILES:
        shutil.copy2(ROOT / f, dest / f)
    for d in SOURCE_DIRS:
        shutil.copytree(ROOT / d, dest / d)


def make_zip(source_dir: Path, zip_path: Path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(source_dir.rglob('*')):
            if file.is_file():
                zf.write(file, file.relative_to(source_dir))


def build_chrome():
    d = DIST / 'chrome'
    copy_sources(d)
    zip_path = DIST / f'ketuvia-chrome-{version}.zip'
    make_zip(d, zip_path)
    print(f'Chrome:   dist/ketuvia-chrome-{version}.zip')


def build_firefox():
    d = DIST / 'firefox'
    copy_sources(d)

    # Patch overlay.css: chrome-extension:// -> moz-extension://
    css_path = d / 'overlay.css'
    css_path.write_text(
        css_path.read_text(encoding='utf-8').replace('chrome-extension://', 'moz-extension://'),
        encoding='utf-8',
    )

    # Patch manifest.json: add gecko browser_specific_settings
    mf_path = d / 'manifest.json'
    mf = json.loads(mf_path.read_text(encoding='utf-8'))
    mf['browser_specific_settings'] = {
        'gecko': {'id': FIREFOX_ADDON_ID, 'strict_min_version': FIREFOX_MIN_VER},
    }
    mf_path.write_text(json.dumps(mf, indent=2), encoding='utf-8')

    print(f'Firefox:  dist/firefox/ (ready for web-ext sign)')


build_chrome()
build_firefox()
