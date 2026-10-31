from __future__ import annotations
import io
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path
import pytest
from openvoice import fftools
from openvoice.audio import convert_wav
from openvoice.audiofx import audio_info, process_audio
from openvoice.cli import main
from openvoice.video import audio_duration


def test_allowed_binary_only():
    with pytest.raises(ValueError):
        fftools.find_binary('fake-binary')


def test_resolves_bundled_before_system(tmp_path, monkeypatch):
    suffix = '.exe' if os.name == 'nt' else ''
    for tool in ('ffmpeg', 'ffprobe'):
        candidate = tmp_path / (tool + suffix)
        candidate.write_text('#!/bin/sh\necho bundled\n')
        candidate.chmod(0o755)
    monkeypatch.setenv('OPENVOICE_FFMPEG_DIR', str(tmp_path))
    assert Path(fftools.find_binary('ffmpeg', allow_system=False)).parent == tmp_path
    assert Path(fftools.find_binary('ffprobe', allow_system=False)).parent == tmp_path


def test_no_bundled_engine_with_disabled_path(tmp_path, monkeypatch):
    monkeypatch.setattr(fftools, 'bundled_locations', lambda: [tmp_path])
    monkeypatch.setattr(fftools.shutil, 'which', lambda *_: '')
    assert fftools.find_binary('ffmpeg') == ''
    assert fftools.find_binary('ffprobe') == ''


def test_meipass_resolves_binary(tmp_path, monkeypatch):
    media = tmp_path / 'ffmpeg'
    media.mkdir()
    p = media / ('ffprobe.exe' if os.name == 'nt' else 'ffprobe')
    p.write_text('stub')
    p.chmod(0o755)
    monkeypatch.setattr(sys, '_MEIPASS', str(tmp_path), raising=False)
    assert fftools.find_binary('ffprobe', allow_system=False) == str(p)


def test_cli_media_status(capsys):
    code = main(['media-tools', '--json'])
    report = json.loads(capsys.readouterr().out)
    assert code in (0, 1)
    assert 'ffmpeg' in report and 'ffprobe' in report
    assert isinstance(report['ffmpeg']['bundled'], bool)


def test_media_conversion_with_vendored_tools(tmp_path, monkeypatch):
    ffmpeg = shutil.which('ffmpeg')
    ffprobe = shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        pytest.skip('integration tests require FFmpeg available on build host')
    for tool, path in [('ffmpeg', ffmpeg), ('ffprobe', ffprobe)]:
        (tmp_path / tool).symlink_to(path)
    monkeypatch.setenv('OPENVOICE_FFMPEG_DIR', str(tmp_path))
    import wave
    source = tmp_path / 'voice.wav'
    with wave.open(str(source), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b'\0\0' * 32000)
    result = tmp_path / 'speech.mp3'
    convert_wav(source, result)
    assert result.stat().st_size > 1000
    assert audio_info(result)['duration_seconds'] > 1
    assert audio_duration(result) > 1
    dest = tmp_path / 'adjusted.mp3'
    process_audio([result], dest, operation='gain', gain=2)
    assert dest.stat().st_size > 1000
    assert fftools.find_binary('ffmpeg', allow_system=False) == str((tmp_path / 'ffmpeg').resolve())


def test_zip_contents_validate_before_extract(tmp_path):
    import importlib.util
    module = Path(__file__).resolve().parents[1] / 'packaging' / 'fetch_ffmpeg.py'
    spec = importlib.util.spec_from_file_location('fetch_ffmpeg', module)
    pkg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pkg)
    sample = tmp_path / 'sample.zip'
    with zipfile.ZipFile(sample, 'w') as archive:
        archive.writestr('ffmpeg-example/bin/ffmpeg', b'fake')
    with pytest.raises(RuntimeError, match='missing'):
        pkg.install_from_archive(sample, tmp_path / 'dest', 'linux', {})


def test_linux_tar_stage(tmp_path):
    import importlib.util
    import tarfile
    module = Path(__file__).resolve().parents[1] / 'packaging' / 'fetch_ffmpeg.py'
    spec = importlib.util.spec_from_file_location('fetch_ffmpeg', module)
    pkg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pkg)
    archive = tmp_path / 'fake.tar.xz'
    with tarfile.open(archive, 'w:xz') as output:
        for name in ('ffmpeg', 'ffprobe'):
            body = b'#!/bin/sh\necho test-version\n'
            info = tarfile.TarInfo(f'build/bin/{name}')
            info.size = len(body)
            info.mode = 0o755
            output.addfile(info, io.BytesIO(body))
    dest = pkg.install_from_archive(archive, tmp_path / 'media', 'linux', {'archive': 'test'})
    assert pkg.valid_install(dest, 'linux')
    assert (dest / 'FFMPEG-ORIGIN.json').is_file()
    assert (dest / 'REDISTRIBUTION.txt').is_file()
