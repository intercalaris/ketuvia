#!/usr/bin/env python3
import json, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)

with open(ROOT / 'manifest.json', encoding='utf-8') as f:
    version = json.load(f)['version']

SOURCE_FILES = ['manifest.json', 'inject.js', 'storage-bridge.js', 'overlay.css',
                'popup.html', 'popup.css', 'popup.js', 'background.js',
                'welcome.html', 'welcome.css', 'welcome.js']
SOURCE_DIRS  = ['icons', 'fonts']

FIREFOX_ADDON_ID = 'ketuvia@intercalaris'
FIREFOX_MIN_VER  = '128.0'


def copy_sources(dest: Path):
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for f in SOURCE_FILES:
        shutil.copy2(ROOT / f, dest / f)
        print(f'  {dest.name}: {f}', flush=True)
    for d in SOURCE_DIRS:
        shutil.copytree(ROOT / d, dest / d)
        print(f'  {dest.name}: {d}/', flush=True)


def make_zip(source_dir: Path, zip_path: Path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        files = [f for f in sorted(source_dir.rglob('*')) if f.is_file()]
        print(f'  zipping {len(files)} files', flush=True)
        for file in files:
            zf.write(file, file.relative_to(source_dir))


def build_chrome():
    print(f'building chrome {version}', flush=True)
    d = DIST / 'chrome'
    copy_sources(d)
    zip_path = DIST / f'ketuvia-chrome-{version}.zip'
    make_zip(d, zip_path)
    print(f'Chrome:   dist/ketuvia-chrome-{version}.zip')


def build_firefox():
    print(f'building firefox {version}', flush=True)
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
    # Firefox has no background service worker; it uses an event page.
    mf['background'] = {'scripts': ['background.js']}

    mf['browser_specific_settings'] = {
        'gecko': {
            'id': FIREFOX_ADDON_ID,
            'strict_min_version': FIREFOX_MIN_VER,
            'data_collection_permissions': {
                'required': ['none'],
            },
        },
    }
    mf_path.write_text(json.dumps(mf, indent=2), encoding='utf-8')

    print(f'Firefox:  dist/firefox/ (ready for web-ext sign)')


build_chrome()
build_firefox()
