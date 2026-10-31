from __future__ import annotations
import argparse
import hashlib
import json
import platform
import sys
import sysconfig
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAMS = ('OpenmuktiAudiobookMaker', 'OpenmuktiAudiobookMakerCMD')
VERSION = '1.0.12'


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def components(folder: Path) -> list[tuple[Path, str]]:
    files = []
    for name in PROGRAMS:
        exe = folder / f'{name}.exe'
        if not exe.is_file() or exe.read_bytes()[:2] != b'MZ':
            raise ValueError(f'Missing or invalid Windows executable: {exe}')
        if (folder / name).is_dir():
            raise ValueError(f'Unexpected folder-based executable: {folder / name}')
        files.append((exe, exe.name))
    return files


def architecture() -> str:
    value = sysconfig.get_platform().lower()
    if 'arm64' in value:
        return 'arm64'
    if 'amd64' in value or 'x86_64' in value:
        return 'x64'
    if 'win32' in value or 'x86' in value:
        return 'x86'
    return platform.machine().lower()


def build(folder: Path) -> Path:
    folder = folder.resolve()
    files = components(folder)
    arch = architecture()
    archive = folder / f'Openmukti-Audiobook-Maker-Windows-{arch}-Standalone-EXEs.zip'
    notice = (
        f'Openmukti Audiobook Maker {VERSION} — standalone Windows applications\n\n'
        'Run OpenmuktiAudiobookMaker.exe to open the GUI.\n'
        'Run OpenmuktiAudiobookMakerCMD.exe --help for the command-line interface.\n'
        'Neither EXE needs an _internal folder, another EXE, Python, or a separate FFmpeg installation.\n'
        'Piper synthesis, FFmpeg, and FFprobe are bundled inside each EXE.\n'
        'Tesseract OCR, eng/osd OCR data, the imaging worker, and the English spelling dictionary are also embedded.\n'
        'The EXEs self-extract runtime files into a temporary folder while running.\n'
        'Keep write access to your Windows temporary directory and sufficient free disk space.\n'
        'Downloaded Piper ONNX voice models remain user-provided external data, not built into these EXEs.\n\n'
        'SHA256SUMS.txt verifies the two executable files.\n'
        'FFmpeg binaries may carry GPL obligations; see THIRD_PARTY_FFMPEG.md in source.\n'
        'Self-extracting executables can cause antivirus false positives. Submit samples for vendor review; '
        'do not disable antivirus as a workaround.\n'
    )
    hashes = [f'{sha256(path)}  {name}' for path, name in files]
    build_info = {
        'application': 'Openmukti Audiobook Maker',
        'version': VERSION,
        'platform': 'Windows',
        'architecture': arch,
        'build_time_utc': datetime.now(timezone.utc).isoformat(),
        'python_version': sys.version,
        'format': 'PyInstaller onefile; no external _internal directory',
        'python_runtime': 'CPython 3.15.2 embedded in each main EXE',
        'piper_helper_runtime': 'CPython 3.12 embedded in a onefile Piper helper nested within each main EXE',
        'media_tools': 'FFmpeg and FFprobe embedded in each main EXE',
        'ocr': 'Tesseract 5, eng/osd traineddata, and a Python 3.12 native imaging worker embedded in each main EXE',
        'files': len(files),
    }
    try:
        import PyInstaller
        build_info['pyinstaller_version'] = PyInstaller.__version__
    except ImportError:
        build_info['pyinstaller_version'] = 'unavailable'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as output:
        for path, name in files:
            output.write(path, name)
        output.writestr('README.txt', notice)
        output.writestr('SHA256SUMS.txt', '\n'.join(hashes) + '\n')
        output.writestr('BUILD_PROVENANCE.json', json.dumps(build_info, indent=2) + '\n')
        output.write(ROOT / 'LICENSE', 'LICENSE')
        for name in ('PROOFLOOM_LICENSE.txt', 'ENGLISH_DICTIONARY_LICENSE.txt', 'TESSERACT_LICENSE.txt'):
            output.write(ROOT / 'openvoice' / 'resources' / name, 'OCR-notices/' + name)
        if (ROOT / 'OCR_AND_SPELLING.md').is_file():
            output.write(ROOT / 'OCR_AND_SPELLING.md', 'OCR_AND_SPELLING.md')
        vendor = ROOT / 'vendor' / 'ffmpeg' / f'windows-{arch}'
        for path in sorted(vendor.glob('*')):
            if path.suffix.lower() in ('.txt', '.json'):
                output.write(path, f'FFmpeg-notices/{path.name}')
    return archive


def main() -> None:
    parser = argparse.ArgumentParser(description='Archive two independent standalone Windows EXE files')
    parser.add_argument('--folder', type=Path, default=Path('dist'))
    args = parser.parse_args()
    print(build(args.folder))


if __name__ == '__main__':
    main()
