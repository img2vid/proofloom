"""Collect a build-time Tesseract installation into a portable runtime tree."""
from __future__ import annotations
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def prepare():
    override = os.environ.get('OPENMUKTI_TESSERACT_DIR', '').strip()
    target = ROOT / 'vendor' / 'tesseract' / 'windows-x64'
    candidates = [Path(override).expanduser()] if override else []
    candidates.append(target)
    if shutil.which('tesseract'):
        candidates.append(Path(shutil.which('tesseract')).resolve().parent)
    for key in ('ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'):
        if os.environ.get(key):
            candidates.append(Path(os.environ[key]) / 'Tesseract-OCR')
    source = next((p.resolve() for p in candidates if (p / 'tesseract.exe').is_file() and all((p / 'tessdata' / f'{lang}.traineddata').is_file() for lang in ('eng', 'osd'))), None)
    if source is None:
        raise RuntimeError('Install Tesseract 5 with eng and osd data on the BUILD computer, or set OPENMUKTI_TESSERACT_DIR to a complete portable Tesseract folder. End users will not need to install it.')
    if source != target.resolve():
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        for path in source.iterdir():
            if path.is_file() and (path.suffix.lower() in {'.dll', '.txt', '.md', '.html'} or path.name.lower().startswith(('license', 'copying', 'authors')) or path.name.lower() == 'tesseract.exe'):
                shutil.copy2(path, target / path.name)
        (target / 'tessdata').mkdir()
        for lang in ('eng', 'osd'):
            shutil.copy2(source / 'tessdata' / f'{lang}.traineddata', target / 'tessdata' / f'{lang}.traineddata')
        for subdir in ('configs', 'tessconfigs'):
            if (source / 'tessdata' / subdir).is_dir():
                shutil.copytree(source / 'tessdata' / subdir, target / 'tessdata' / subdir)
        for subdir in ('doc', 'licenses'):
            if (source / subdir).is_dir():
                shutil.copytree(source / subdir, target / subdir)
    shutil.copy2(ROOT / 'openvoice' / 'resources' / 'TESSERACT_LICENSE.txt', target / 'TESSERACT_LICENSE.txt')
    result = subprocess.run([str(target / 'tesseract.exe'), '--list-langs', '--tessdata-dir', str(target / 'tessdata')], capture_output=True, text=True, timeout=30, check=True)
    if not all(lang in result.stdout.split() for lang in ('eng', 'osd')):
        raise RuntimeError('Bundled Tesseract is missing eng / osd language data')
    return target
