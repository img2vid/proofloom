from __future__ import annotations
import argparse
import shutil
import tempfile
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def build(pyz: Path, output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='openvoice-win-') as directory:
        stage = Path(directory) / 'Openmukti-Audiobook-Maker-Windows'
        stage.mkdir()
        shutil.copy2(pyz, stage / 'openmukti.pyz')
        shutil.copy2(ROOT / 'LICENSE', stage / 'LICENSE')
        (stage / 'Openmukti-GUI.bat').write_text('@echo off\r\npy -3 "%~dp0openmukti.pyz" gui %*\r\n', encoding='ascii')
        (stage / 'Openmukti-CMD.bat').write_text('@echo off\r\npy -3 "%~dp0openmukti.pyz" %*\r\n', encoding='ascii')
        (stage / 'README.txt').write_text('Windows Python portable edition. Python 3.10+ required.\nDouble-click Openmukti-GUI.bat or run Openmukti-CMD.bat engines.\nFor Windows EXE builds without GitHub, extract the complete source and double-click Build-Portable-EXEs.bat on a Windows computer with Python 3.10+.\nThe batch files in this archive are not precompiled Windows executables.\n', encoding='utf-8')
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in stage.iterdir():
                z.write(file, f'Openmukti-Audiobook-Maker-Windows/{file.name}')
    return output
if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--pyz', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    print(build(Path(args.pyz), Path(args.out)))
