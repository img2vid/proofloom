from __future__ import annotations
import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.12'
DIST = ROOT / 'dist'
EXCLUDE = {'.git', '.flatpak-build', '.venv', '.build-venv', '.piper-build-venv', '.piper-pyinstaller-work', '.piper-pyinstaller-spec', '.ocr-pyinstaller-work', '.ocr-pyinstaller-spec', '.pytest_cache', '__pycache__', 'dist', 'build', 'demo-export', '.pyinstaller-build', '.pyinstaller-spec', '.flatpak-builder', }


def run(*args: str, cwd: Path | None = None) -> None:
    print('+', ' '.join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd or ROOT, check=True)


def source_files():
    for path in ROOT.rglob('*'):
        if not path.is_file() or any(p in EXCLUDE or p.endswith('.egg-info') for p in path.relative_to(ROOT).parts) or 'vendor' in path.relative_to(ROOT).parts and path.suffix.lower() in ('.exe', '.dll', '.so') or path.relative_to(ROOT).parts[:2] == ('vendor', 'ffmpeg') and path.name in ('ffmpeg', 'ffprobe'):
            continue
        if path.suffix in ('.pyc', '.pyo'):
            continue
        yield path


def source():
    DIST.mkdir(exist_ok=True)
    basename = f'Openmukti-Audiobook-Maker-{VERSION}-Source'
    sourcezip = DIST / (basename + '.zip')
    with zipfile.ZipFile(sourcezip, 'w', zipfile.ZIP_DEFLATED, compresslevel=8) as archive:
        for path in source_files():
            archive.write(path, str(Path(basename) / path.relative_to(ROOT)))
    sourcetar = DIST / (basename + '.tar.gz')
    with tarfile.open(sourcetar, 'w:gz') as archive:
        for path in source_files():
            archive.add(path, str(Path(basename) / path.relative_to(ROOT)))
    return [sourcezip, sourcetar]


def portable():
    from build_linux import build
    return build(DIST)


def wheel():
    run(sys.executable, '-m', 'pip', 'wheel', '--no-deps', '--no-build-isolation', '-w', str(DIST), '.')
    return list(DIST.glob(f'openmukti_audiobook_maker-{VERSION}-*.whl'))


def freeze():
    if shutil.which('pyinstaller') is None and subprocess.run([sys.executable, '-c', 'import PyInstaller'], capture_output=True).returncode:
        raise RuntimeError('PyInstaller not installed: run python -m pip install pyinstaller')
    mode = '--onefile' if os.name == 'nt' else '--onedir'
    options = ['--clean', '--noconfirm', mode, '--noupx', '--collect-data', 'openvoice', '--distpath', str(DIST), '--workpath', str(ROOT / '.pyinstaller-build'), '--specpath', str(ROOT / '.pyinstaller-spec')]
    from fetch_ffmpeg import prepare, target_platform
    vendor = prepare()
    family, arch = target_platform()
    for name in ('ffmpeg', 'ffprobe'):
        binary = vendor / (name + ('.exe' if family == 'windows' else ''))
        options += ['--add-binary', str(binary) + os.pathsep + 'ffmpeg']
    try:
        import importlib.util
        if importlib.util.find_spec('piper') is not None:
            options += ['--collect-all','piper']
        if importlib.util.find_spec('onnxruntime') is not None:
            options += ['--collect-all','onnxruntime']
    except (ImportError,ModuleNotFoundError,ValueError):
        pass
    for notice in vendor.glob('*.txt'):
        options += ['--add-data', str(notice) + os.pathsep + 'ffmpeg']
    origin = vendor / 'FFMPEG-ORIGIN.json'
    if origin.is_file():
        options += ['--add-data', str(origin) + os.pathsep + 'ffmpeg']
    if os.name == 'nt':
        worker = DIST / 'OpenmuktiPiperWorker.exe'
        if not worker.is_file():
            raise RuntimeError('A standalone Piper worker must be built before the Windows single-file applications')
        options += ['--add-binary', str(worker) + os.pathsep + 'piper_worker']
        ocr_worker = DIST / 'OpenmuktiOCRWorker.exe'
        if not ocr_worker.is_file():
            raise RuntimeError('Build the standalone OCR worker with scripts/build_windows_py315.py first')
        options += ['--add-binary', str(ocr_worker) + os.pathsep + 'ocr_worker']
        from prepare_tesseract import prepare as prepare_ocr
        options += ['--add-data', str(prepare_ocr()) + os.pathsep + 'tesseract']
    else:
        # Native Linux bundles Python imaging libraries; Tesseract is supplied
        # by the host distribution with its matching shared libraries.
        options += ['--collect-all', 'PIL', '--collect-all', 'numpy', '--collect-all', 'cv2',
                    '--collect-all', 'pypdfium2', '--collect-all', 'pypdfium2_raw']
    outputs = []
    for name, entry, gui in [('OpenmuktiAudiobookMaker', 'openvoice_gui.py', True), ('OpenmuktiAudiobookMakerCMD', 'openvoice_cli.py', False)]:
        icon_options = ['--icon', str(ROOT / 'assets' / 'openmukti.ico')] if os.name == 'nt' else []
        info_options = ['--version-file', str(ROOT / 'packaging' / 'windows_version.txt')] if os.name == 'nt' else []
        run(sys.executable, '-m', 'PyInstaller', *(options + icon_options + info_options + ['--windowed' if gui else '--console', '--name', name, str(ROOT / entry)]))
        folder = DIST / name
        path = (DIST / (name + '.exe')) if os.name == 'nt' else folder / name
        if not path.exists():
            raise RuntimeError(f'PyInstaller did not create {path}')
        outputs.append(path if os.name == 'nt' else folder)
    if os.name == 'nt':
        from package_windows_exes import build
        outputs.append(build(DIST))
    return outputs

def rpm():
    if not shutil.which('rpmbuild'):
        raise RuntimeError('rpmbuild is unavailable; build on an RPM-based Linux system')
    from build_linux import build
    build(DIST)
    with tempfile.TemporaryDirectory(prefix='openvoice-rpm-') as d:
        top = Path(d)
        for name in ('SOURCES', 'BUILD', 'RPMS', 'SRPMS', 'SPECS', 'BUILDROOT'):
            (top / name).mkdir()
        shutil.copy2(DIST / f'openmukti-audiobook-maker-app-{VERSION}.pyz', top / 'SOURCES' / f'openmukti-audiobook-maker-app-{VERSION}.pyz')
        run('rpmbuild', '--define', f'_topdir {top}', '-bb', str(ROOT / 'packaging' / 'openvoice.spec'))
        result = []
        for package in (top / 'RPMS').rglob('*.rpm'):
            dest = DIST / package.name
            shutil.copy2(package, dest)
            result.append(dest)
        return result


def flatpak():
    if not shutil.which('flatpak-builder') or not shutil.which('flatpak'):
        raise RuntimeError('Flatpak tools are missing: install flatpak and flatpak-builder, then org.freedesktop.Sdk and Platform 24.08')
    from build_linux import build
    build(DIST)
    builddir = ROOT / '.flatpak-build'
    repo = DIST / 'flatpak-repo'
    manifest = ROOT / 'packaging' / 'flatpak' / 'org.openmukti.AudiobookMaker.yml'
    run('flatpak-builder', '--force-clean', f'--repo={repo}', str(builddir), str(manifest))
    target = DIST / f'Openmukti-Audiobook-Maker-{VERSION}.flatpak'
    run('flatpak', 'build-bundle', str(repo), str(target), 'org.openmukti.AudiobookMaker')
    return [target]


def snap():
    if not shutil.which('snapcraft'):
        raise RuntimeError('Snapcraft unavailable; build on Linux with Snapcraft installed')
    run('snapcraft', 'pack', '--output', str(DIST / f'Openmukti-Audiobook-Maker-{VERSION}.snap'))
    return [DIST / f'Openmukti-Audiobook-Maker-{VERSION}.snap']


def appimage():
    if platform.system() != 'Linux':
        raise RuntimeError('AppImage builds require Linux')
    if not shutil.which('appimagetool'):
        raise RuntimeError('Install appimagetool in PATH to build an AppImage')
    if subprocess.run([sys.executable, '-c', 'import PyInstaller'], capture_output=True).returncode:
        raise RuntimeError('Install PyInstaller first: python -m pip install pyinstaller')
    with tempfile.TemporaryDirectory(prefix='openvoice-appimage-') as td:
        temp = Path(td)
        appdir = temp / 'OpenmuktiAudiobookMaker.AppDir'
        targetbin = appdir / 'usr' / 'bin'
        targetbin.mkdir(parents=True)
        from fetch_ffmpeg import prepare
        vendor = prepare()
        binary_options = []
        for tool in ('ffmpeg', 'ffprobe'):
            binary_options += ['--add-binary', str(vendor / tool) + os.pathsep + 'ffmpeg']
        try:
            import importlib.util
            if importlib.util.find_spec('piper') is not None:
                binary_options += ['--collect-all','piper']
        except (ImportError,ModuleNotFoundError,ValueError):
            pass
        for notice in vendor.glob('*.txt'):
            binary_options += ['--add-data', str(notice) + os.pathsep + 'ffmpeg']
        run(sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed', '--name', 'OpenmuktiAudiobookMaker', '--collect-data', 'openvoice', *binary_options, '--distpath', str(temp / 'build'), '--workpath', str(temp / 'work'), '--specpath', str(temp), 'openvoice_gui.py')
        shutil.copytree(temp / 'build' / 'OpenmuktiAudiobookMaker', targetbin / 'OpenmuktiAudiobookMaker')
        shutil.copy2(ROOT / 'assets' / 'openmukti-logo.png', appdir / 'openvoice.png')
        shutil.copy2(ROOT / 'packaging' / 'openvoice.desktop', appdir / 'openvoice.desktop')
        entry = appdir / 'AppRun'
        entry.write_text('#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/usr/bin/OpenmuktiAudiobookMaker/OpenmuktiAudiobookMaker" "$@"\n')
        entry.chmod(0o755)
        iconpath = appdir / 'usr' / 'share' / 'icons' / 'hicolor' / '256x256' / 'apps'
        iconpath.mkdir(parents=True)
        shutil.copy2(ROOT / 'assets' / 'openmukti-logo.png', iconpath / 'openvoice.png')
        dest = DIST / f'Openmukti-Audiobook-Maker-{VERSION}-{platform.machine()}.AppImage'
        run('appimagetool', str(appdir), str(dest))
        return [dest]


def arch():
    if not shutil.which('makepkg'):
        raise RuntimeError('makepkg unavailable; build on Arch Linux or a compatible environment')
    from build_linux import build
    build(DIST)
    with tempfile.TemporaryDirectory(prefix='openvoice-arch-') as td:
        work = Path(td)
        shutil.copy2(ROOT / 'packaging' / 'PKGBUILD', work / 'PKGBUILD')
        shutil.copy2(DIST / f'openmukti-audiobook-maker-app-{VERSION}.pyz', work / f'openmukti-audiobook-maker-app-{VERSION}.pyz')
        run('makepkg', '-f', '--noconfirm', cwd=work)
        result = []
        for package in work.glob('*.pkg.tar.*'):
            dest = DIST / package.name
            shutil.copy2(package, dest)
            result.append(dest)
        return result


def freebsd():
    if platform.system() != 'FreeBSD' or not shutil.which('pkg'):
        raise RuntimeError('Native FreeBSD pkg builds require FreeBSD with pkg installed')
    from build_linux import build
    build(DIST)
    with tempfile.TemporaryDirectory(prefix='openvoice-freebsd-') as td:
        work = Path(td)
        stage = work / 'stage'
        path = stage / 'usr' / 'local' / 'share' / 'openvoice'
        path.mkdir(parents=True)
        shutil.copy2(DIST / f'openmukti-audiobook-maker-app-{VERSION}.pyz', path / 'openvoice.pyz')
        binpath = stage / 'usr' / 'local' / 'bin'
        binpath.mkdir(parents=True)
        for name, sub in [('openvoice', ''), ('openvoice-gui', 'gui')]:
            shell = binpath / name
            shell.write_text(f'#!/bin/sh\nexec python3 /usr/local/share/openvoice/openvoice.pyz {sub} "$@"\n')
            shell.chmod(0o755)
        manifest = work / 'manifest.yaml'
        manifest.write_text(f'name: openvoice\nversion: "{VERSION}"\norigin: audio/openvoice\ncomment: Offline speech and audiobook videos\nmaintainer: maintainers@example.invalid\nwww: https://example.invalid/openvoice\nprefix: /usr/local\ndesc: Openmukti Audiobook Maker offline text-to-speech, GUI, CLI and audiobook video rendering\nlicenses: [MIT]\n')
        run('pkg', 'create', '-M', str(manifest), '-r', str(stage), '-o', str(DIST))
        return list(DIST.glob(f'openvoice-{VERSION}*.pkg'))


def execute(target: str):
    dispatch = {'source': source, 'portable': portable, 'wheel': wheel, 'native': freeze, 'rpm': rpm, 'flatpak': flatpak, 'snap': snap, 'appimage': appimage, 'arch': arch, 'freebsd': freebsd}
    return dispatch[target]()


def main():
    parser = argparse.ArgumentParser(description='Build Openmukti Audiobook Maker Version 1 artifacts natively, with bundled FFmpeg in native binaries')
    parser.add_argument('targets', nargs='*', default=['all'], choices=['all', 'source', 'portable', 'wheel', 'native', 'rpm', 'flatpak', 'snap', 'appimage', 'arch', 'freebsd'])
    parser.add_argument('--strict', action='store_true', help='Fail when a requested target cannot be built on this computer')
    args = parser.parse_args()
    DIST.mkdir(exist_ok=True)
    targets = args.targets
    if 'all' in targets:
        targets = ['source', 'native', 'portable', 'wheel', 'rpm', 'flatpak', 'snap', 'appimage', 'arch', 'freebsd']
    results = {}
    for target in dict.fromkeys(targets):
        print(f'\n== BUILD {target.upper()} ==', flush=True)
        try:
            built = execute(target)
            results[target] = {'status': 'built', 'files': [str(p.relative_to(DIST)) for p in built]}
        except (RuntimeError, FileNotFoundError, subprocess.CalledProcessError, OSError) as exc:
            print(f'SKIPPED / FAILED: {exc}', flush=True)
            results[target] = {'status': 'unavailable', 'reason': str(exc)}
    report = DIST / 'release-report.json'
    report.write_text(json.dumps({'host': platform.platform(), 'architecture': platform.machine(), 'results': results}, indent=2) + '\n')
    print('\nBuild report:', report)
    if args.strict and any(item['status'] != 'built' for item in results.values()):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
