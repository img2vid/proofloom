from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def test_main_builder_targets_py3152_and_pyinstaller():
    batch = (ROOT / 'scripts/build-windows-exes.bat').read_text()
    python = (ROOT / 'scripts/build_windows_py315.py').read_text()
    assert 'py -3.15' in batch
    assert 'sys.version_info[:3] != (3, 15, 2)' in python
    assert "PYINSTALLER = 'pyinstaller==6.22.3'" in python
    assert 'clean_environment(VENV)' in python


def test_windows_arm64_wrapper_is_explicit():
    wrapper = (ROOT / 'Build-Windows-ARM64.bat').read_text()
    assert 'ARM64' in wrapper
    python = (ROOT / 'scripts/build_windows_py315.py').read_text()
    assert 'native ARM64 Piper worker' in python


def test_windows_all_builder_reuses_venv():
    batch = (ROOT / 'Build-All-Available.bat').read_text()
    assert '.build-venv\\Scripts\\python.exe' in batch


def test_version_metadata_consistent():
    from openvoice import __version__
    assert tomllib.loads((ROOT / 'pyproject.toml').read_text())['project']['version'] == __version__
    from openvoice.edition import VERSION
    assert VERSION == __version__
