from __future__ import annotations
import os
import shutil
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
VENV = ROOT / '.build-venv'
PIPER_VENV = ROOT / '.piper-build-venv'
PYINSTALLER = 'pyinstaller==6.22.3'
PIPER_VERSION = 'piper-tts==1.8.0'


def run(*args, cwd=ROOT):
    print('+', ' '.join(str(arg) for arg in args), flush=True)
    subprocess.run([str(arg) for arg in args], cwd=str(cwd), check=True)


def executable(venv: Path) -> Path:
    return venv / 'Scripts' / 'python.exe'


def clean_environment(path: Path):
    if path.exists():
        shutil.rmtree(path)
        if path.exists():
            raise RuntimeError(f'Unable to remove previous build environment: {path}')


def ensure_python315():
    if os.name != 'nt':
        raise RuntimeError('Build on a Windows computer; PyInstaller cannot cross-compile Windows EXEs from Linux')
    if sys.version_info[:3] != (3, 15, 2):
        raise RuntimeError(f'This builder requires CPython 3.15.2; found {sys.version.split()[0]}. Install Python 3.15.2 and retry.')
    if sys.implementation.name != 'cpython' or struct.calcsize('P') * 8 != 64:
        raise RuntimeError('A 64-bit CPython 3.15.2 interpreter is required')
    if 'arm' in os.environ.get('PROCESSOR_ARCHITECTURE', '').casefold():
        raise RuntimeError('This build recipe is for Windows x64. A separate native ARM64 Piper worker is not yet available.')


def build_main_environment() -> Path:
    clean_environment(VENV)
    run(sys.executable, '-m', 'venv', VENV)
    python = executable(VENV)
    run(python, '-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', PYINSTALLER)
    run(python, '-c', 'import PyInstaller; print("Windows main Python:", __import__("sys").version)')
    return python


def build_worker(main_python: Path) -> Path:
    run(main_python, '-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', 'uv>=0.9,<1')
    uv = VENV / 'Scripts' / 'uv.exe'
    if not uv.exists():
        raise RuntimeError('uv could not be installed to fetch the build-only Python 3.12 runtime')
    clean_environment(PIPER_VENV)
    print('Installing an isolated Python 3.12 to build a portable Piper companion; it will be bundled with the application.', flush=True)
    run(uv, 'venv', '--python', '3.12', '--managed-python', PIPER_VENV)
    python = executable(PIPER_VENV)
    run(uv, 'pip', 'install', '--python', python, '--only-binary=:all:', PYINSTALLER, PIPER_VERSION,
        'Pillow>=10.4', 'numpy>=1.26', 'opencv-python-headless>=4.10', 'pypdfium2>=4.30')
    run(python, '-c', 'from piper.voice import PiperVoice; import onnxruntime, sys; assert sys.version_info[:2] == (3,12); print("Piper runtime ready:", onnxruntime.__version__)')
    work = ROOT / '.piper-pyinstaller-work'
    spec = ROOT / '.piper-pyinstaller-spec'
    run(python, '-m', 'PyInstaller', '--clean', '--noconfirm', '--onefile', '--noupx',
        '--console', '--name', 'OpenmuktiPiperWorker', '--collect-all', 'piper',
        '--collect-all', 'onnxruntime', '--distpath', DIST,
        '--workpath', work, '--specpath', spec, ROOT / 'scripts' / 'piper_worker.py')
    exe = DIST / 'OpenmuktiPiperWorker.exe'
    if not exe.exists():
        raise RuntimeError('Piper worker executable was not generated')
    run(exe, '--health')
    return exe


def build_ocr_worker() -> Path:
    python = executable(PIPER_VENV)
    run(python, '-m', 'PyInstaller', '--clean', '--noconfirm', '--onefile', '--noupx',
        '--console', '--name', 'OpenmuktiOCRWorker', '--paths', ROOT,
        '--collect-all', 'PIL', '--collect-all', 'numpy', '--collect-all', 'cv2',
        '--collect-all', 'pypdfium2', '--collect-all', 'pypdfium2_raw',
        '--collect-data', 'openvoice', '--distpath', DIST,
        '--workpath', ROOT / '.ocr-pyinstaller-work', '--specpath', ROOT / '.ocr-pyinstaller-spec',
        ROOT / 'scripts' / 'ocr_worker.py')
    worker = DIST / 'OpenmuktiOCRWorker.exe'
    if not worker.is_file():
        raise RuntimeError('Portable OCR worker was not generated')
    run(worker, '--health')
    return worker


def verify_single_file_release(worker: Path, main_python: Path) -> Path:
    programs = ('OpenmuktiAudiobookMaker', 'OpenmuktiAudiobookMakerCMD')
    for name in programs:
        exe = DIST / f'{name}.exe'
        if not exe.is_file() or exe.stat().st_size < 1024 * 1024:
            raise RuntimeError(f'Standalone executable was not generated: {exe}')
        if (DIST / name).is_dir():
            raise RuntimeError(f'Unexpected folder-based build: {DIST / name}')
    run(DIST / 'OpenmuktiAudiobookMakerCMD.exe', '--help')
    run(main_python, '-c', 'import sys; assert sys.version_info[:3] == (3,15,2); print("Main interpreter verified: 3.15.2")')
    sys.path.insert(0, str(ROOT / 'packaging'))
    from package_windows_exes import build
    archive = build(DIST)
    with zipfile.ZipFile(archive) as package:
        bad = package.testzip()
        if bad:
            raise RuntimeError(f'Standalone ZIP contains a corrupt member: {bad}')
        exe_names = {n for n in package.namelist() if n.lower().endswith('.exe')}
        expected = {f'{name}.exe' for name in programs}
        if exe_names != expected:
            raise RuntimeError(f'Unexpected executable inventory: {sorted(exe_names)}')
        if any('_internal' in n.casefold() or 'piper_worker/' in n.casefold() for n in package.namelist()):
            raise RuntimeError('Portable ZIP unexpectedly contains a runtime folder')
    return archive


def main() -> int:
    ensure_python315()
    main_python = build_main_environment()
    worker = build_worker(main_python)
    build_ocr_worker()
    if not worker.is_file():
        raise RuntimeError('Built-in Piper worker is missing')
    run(main_python, ROOT / 'packaging' / 'build_release.py', 'native', '--strict')
    run(DIST / 'OpenmuktiAudiobookMakerCMD.exe', 'ocr', '--status')
    archive = verify_single_file_release(worker, main_python)
    print('\nPORTABLE WINDOWS BUILD COMPLETE', flush=True)
    print('Main application: Python 3.15.2; Piper companion: isolated bundled Python 3.12.', flush=True)
    print(f'Download/distribute this file: {archive}', flush=True)
    print('Each EXE runs without a neighboring _internal folder or installed Python.', flush=True)
    print('Piper, Tesseract OCR, English OCR data, imaging runtime, FFmpeg and FFprobe are embedded and extracted temporarily at runtime.', flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f'BUILD FAILED: {exc}', file=sys.stderr)
        raise SystemExit(1)
