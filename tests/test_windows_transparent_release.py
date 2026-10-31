from __future__ import annotations
import hashlib
import importlib.util
import json
import zipfile
from pathlib import Path


def module():
    file = Path(__file__).resolve().parents[1] / 'packaging' / 'package_windows_exes.py'
    spec = importlib.util.spec_from_file_location('openmukti_windows_package', file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_standalone_windows_packaging_includes_only_exes_and_checksums(tmp_path):
    m = module()
    for name in m.PROGRAMS:
        (tmp_path / (name + '.exe')).write_bytes(b'MZ' + name.encode())
    package = m.build(tmp_path)
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        assert all((name + '.exe') in names for name in m.PROGRAMS)
        assert all('_internal' not in name for name in names)
        assert not any(name.startswith('OpenmuktiAudiobookMaker/') for name in names)
        assert not any('PiperWorker.exe' in name for name in names)
        hashes = archive.read('SHA256SUMS.txt').decode().splitlines()
        assert len(hashes) == 2
        for line in hashes:
            expected, name = line.split('  ', 1)
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected
        metadata = json.loads(archive.read('BUILD_PROVENANCE.json'))
        assert metadata['format'].startswith('PyInstaller onefile')


def test_windows_packaging_rejects_missing_or_folder_based_executables(tmp_path):
    import pytest
    with pytest.raises(ValueError, match='Missing or invalid'):
        module().build(tmp_path)
    for name in module().PROGRAMS:
        (tmp_path / f'{name}.exe').write_bytes(b'MZtest')
    (tmp_path / module().PROGRAMS[0]).mkdir()
    with pytest.raises(ValueError, match='Unexpected folder-based'):
        module().build(tmp_path)


def test_windows_native_build_uses_onefile_and_disables_upx():
    source = (Path(__file__).resolve().parents[1] / 'packaging' / 'build_release.py').read_text()
    native = source[source.index('def freeze():'):source.index('def rpm():')]
    assert "'--onefile' if os.name == 'nt'" in native
    assert "str(worker) + os.pathsep + 'piper_worker'" in native
    assert "'--noupx'" in native


def test_onefile_piper_helper_is_discovered_after_extract(monkeypatch, tmp_path):
    import sys
    import os
    from types import SimpleNamespace
    from openvoice import piper_sidecar
    bundled = tmp_path / '_MEI1234' / 'piper_worker'
    bundled.mkdir(parents=True)
    (bundled / 'OpenmuktiPiperWorker.exe').write_bytes(b'MZmock')
    monkeypatch.setattr(sys, '_MEIPASS', str(tmp_path / '_MEI1234'), raising=False)
    monkeypatch.setattr(piper_sidecar, 'os', SimpleNamespace(name='nt', environ=os.environ))
    monkeypatch.delenv('OPENMUKTI_PIPER_WORKER', raising=False)
    assert piper_sidecar.find_worker() == bundled / 'OpenmuktiPiperWorker.exe'


def test_nested_piper_onefile_worker_resets_extraction_environment(monkeypatch, tmp_path):
    import sys
    from types import SimpleNamespace
    from openvoice import piper_sidecar
    meipass = tmp_path / '_MEI1234'
    worker = meipass / 'piper_worker' / 'OpenmuktiPiperWorker.exe'
    worker.parent.mkdir(parents=True)
    worker.write_bytes(b'MZmock')
    output = tmp_path / 'speech.wav'
    seen = {}
    def fake_run(command, **kwargs):
        seen.update(kwargs)
        output.write_bytes(b'RIFF' + b'\x00' * 100)
        return SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
    monkeypatch.setattr(sys, 'frozen', True, raising=False)
    monkeypatch.setattr(sys, '_MEIPASS', str(meipass), raising=False)
    monkeypatch.setattr(piper_sidecar, 'find_worker', lambda: worker)
    monkeypatch.setattr(piper_sidecar.subprocess, 'run', fake_run)
    piper_sidecar.render_with_worker(mode='text', model=tmp_path / 'model.onnx',
                                      config=tmp_path / 'model.onnx.json',
                                      output=output, text='Hello')
    assert seen['env']['PYINSTALLER_RESET_ENVIRONMENT'] == '1'


def test_windows_single_file_build_embeds_both_media_tools():
    source = (Path(__file__).resolve().parents[1] / 'packaging' / 'build_release.py').read_text()
    native = source[source.index('def freeze():'):source.index('def rpm():')]
    assert "for name in ('ffmpeg', 'ffprobe')" in native
    assert "str(binary) + os.pathsep + 'ffmpeg'" in native
