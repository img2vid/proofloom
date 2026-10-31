from __future__ import annotations
import argparse
import shutil
import subprocess
import tarfile
import tempfile
import sys
import zipapp
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.12'
sys.path.insert(0, str(ROOT))


def build(output: Path) -> list[Path]:
    from openvoice.edition import EDITION
    edition = 'app'
    output.mkdir(parents=True, exist_ok=True)
    built = []
    with tempfile.TemporaryDirectory(prefix='openmukti-package-') as name:
        temp = Path(name)
        app = temp / 'app'
        app.mkdir()
        shutil.copytree(ROOT / 'openvoice', app / 'openvoice', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        (app / '__main__.py').write_text('from openvoice.cli import main\nraise SystemExit(main())\n')
        pyz = output / f'openmukti-audiobook-maker-{edition}-{VERSION}.pyz'
        zipapp.create_archive(app, target=pyz, interpreter='/usr/bin/env python3', compressed=True)
        built.append(pyz)
        portable = temp / f'Openmukti-Audiobook-Maker-{edition}'
        portable.mkdir()
        shutil.copy2(pyz, portable / 'openmukti.pyz')
        for file in ['README.md', 'LICENSE', 'USER_MANUAL.html', 'USER_MANUAL.md', 'PIPER_SETUP.md', 'FILE_NAMING.md', 'ABOUT_US.md']:
            shutil.copy2(ROOT / file, portable / file)
        (portable / 'openmukti').write_text('#!/bin/sh\nexec python3 "$(dirname "$0")/openmukti.pyz" "$@"\n')
        (portable / 'openmukti-gui').write_text('#!/bin/sh\nexec python3 "$(dirname "$0")/openmukti.pyz" gui "$@"\n')
        for name in ['openmukti', 'openmukti-gui']:
            (portable / name).chmod(0o755)
        tarpath = output / f'Openmukti-Audiobook-Maker-{edition}-Linux-{VERSION}.tar.gz'
        with tarfile.open(tarpath, 'w:gz') as archive:
            archive.add(portable, arcname=portable.name)
        built.append(tarpath)
        if shutil.which('dpkg-deb'):
            stage = temp / 'deb'
            share = stage / 'usr' / 'share' / f'openmukti-audiobook-maker-{edition}'
            share.mkdir(parents=True)
            shutil.copy2(pyz, share / 'openmukti.pyz')
            for file in ['USER_MANUAL.html', 'USER_MANUAL.md', 'PIPER_SETUP.md', 'FILE_NAMING.md', 'ABOUT_US.md']:
                shutil.copy2(ROOT / file, share / file)
            binfolder = stage / 'usr' / 'bin'
            binfolder.mkdir(parents=True)
            for binary, args in [(f'openmukti-{edition}', ''), (f'openmukti-gui-{edition}', 'gui')]:
                script = binfolder / binary
                script.write_text(f'#!/bin/sh\nexec python3 /usr/share/openmukti-audiobook-maker-{edition}/openmukti.pyz {args} "$@"\n')
                script.chmod(0o755)
            desktop = stage / 'usr' / 'share' / 'applications'
            desktop.mkdir(parents=True)
            (desktop / f'openmukti-audiobook-maker-{edition}.desktop').write_text('[Desktop Entry]\nType=Application\nName=Openmukti Audiobook Maker (' + EDITION + ')\nExec=openmukti-gui-' + edition + '\nTerminal=false\nIcon=openmukti-audiobook-maker\nCategories=AudioVideo;Audio;Utility;\n')
            iconfolder = stage / 'usr' / 'share' / 'icons' / 'hicolor' / '192x192' / 'apps'
            iconfolder.mkdir(parents=True)
            shutil.copy2(ROOT / 'openvoice' / 'resources' / 'openmukti-icon.png',iconfolder / 'openmukti-audiobook-maker.png')
            licensefolder = stage / 'usr' / 'share' / 'doc' / f'openmukti-audiobook-maker-{edition}'
            licensefolder.mkdir(parents=True)
            shutil.copy2(ROOT / 'LICENSE', licensefolder / 'copyright')
            meta = stage / 'DEBIAN'
            meta.mkdir()
            (meta / 'control').write_text(f'Package: openmukti-audiobook-maker-{edition}\nVersion: {VERSION}\nSection: sound\nPriority: optional\nArchitecture: all\nMaintainer: Aishik Dutta\nDepends: python3 (>= 3.10), ffmpeg\nRecommends: python3-tk, espeak-ng\nDescription: Openmukti Audiobook Maker Version 1\n Narrated audio, videos, chapter covers and bulk ebook conversion.\n')
            deb = output / f'openmukti-audiobook-maker-{edition}_{VERSION}_all.deb'
            subprocess.run(['dpkg-deb', '--root-owner-group', '--build', str(stage), str(deb)], check=True, capture_output=True)
            built.append(deb)
    return built


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--out',default=str(ROOT / 'dist'))
    args=p.parse_args()
    for item in build(Path(args.out)):
        print(item)
