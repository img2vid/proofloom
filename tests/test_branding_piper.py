from __future__ import annotations
import sys
from pathlib import Path
import pytest
from openvoice.edition import APP_NAME, EDITION, GUTENBERG_ENABLED
from openvoice.piper_models import discover_voices, get_voice, install_voice, voice_directory
from openvoice.engines import get_engine, SpeechSettings
from openvoice.engines.builtin import Piper
from openvoice.cli import make_parser


def test_brand_and_cli_command():
    assert APP_NAME == 'Openmukti Audiobook Maker'
    assert EDITION == ''
    assert not GUTENBERG_ENABLED
    assert make_parser().prog == 'openmukti'


def test_edition_has_correct_cli_features():
    parser = make_parser()
    commands = set(next(a for a in parser._actions if a.dest == 'command').choices)
    assert ('gutenberg' in commands) == GUTENBERG_ENABLED
    assert 'audiobooks' in commands


def test_resources_are_bundled():
    import importlib.resources
    root = importlib.resources.files('openvoice') / 'resources'
    assert (root / 'USER_MANUAL.txt').read_text(encoding='utf-8').count('Piper') > 10
    assert 'Chapter 01.txt' in (root / 'FILE_NAMING.txt').read_text(encoding='utf-8')


def test_voice_discovery_requires_model_pair(monkeypatch, tmp_path):
    monkeypatch.setenv('OPENMUKTI_PIPER_VOICES', str(tmp_path))
    (tmp_path / 'en_US-amy-medium.onnx').write_bytes(b'model')
    assert get_voice('en_US-amy-medium') is None
    (tmp_path / 'en_US-amy-medium.onnx.json').write_text('{}')
    voices = discover_voices()
    assert any(v.name == 'en_US-amy-medium' for v in voices)
    assert get_voice('en_US-amy-medium').config.is_file()


def test_install_voice_copies_model_and_config(monkeypatch, tmp_path):
    from openvoice import piper_models
    destination = tmp_path / 'library'
    monkeypatch.setattr(piper_models, 'voice_directory', lambda: destination)
    source = tmp_path / 'download' / 'voice.onnx'
    source.parent.mkdir()
    source.write_bytes(b'some model data')
    Path(str(source) + '.json').write_text('{}')
    voice = install_voice(source)
    assert voice.name == 'voice'
    assert voice.model.read_bytes() == b'some model data'
    assert voice.config.read_text() == '{}'


def test_install_rejects_missing_config(tmp_path):
    model = tmp_path / 'voice.onnx'
    model.write_bytes(b'x')
    with pytest.raises(ValueError, match='configuration'):
        install_voice(model)


def test_piper_is_preferred_with_ready_voice(monkeypatch, tmp_path):
    monkeypatch.setenv('OPENMUKTI_PIPER_VOICES', str(tmp_path))
    (tmp_path / 'en_US-test-medium.onnx').write_bytes(b'x')
    (tmp_path / 'en_US-test-medium.onnx.json').write_text('{}')
    monkeypatch.setattr('openvoice.engines.builtin.piper_binary', lambda: '/fake/piper')
    assert get_engine('auto').key == 'piper'
    assert 'en_US-test-medium' in Piper().voices()


def test_piper_render_uses_selected_model(monkeypatch, tmp_path):
    monkeypatch.setenv('OPENMUKTI_PIPER_VOICES', str(tmp_path))
    (tmp_path / 'voice.onnx').write_bytes(b'x')
    (tmp_path / 'voice.onnx.json').write_text('{}')
    calls = []
    monkeypatch.setattr('openvoice.engines.builtin.piper_binary', lambda: '/fake/piper')
    monkeypatch.setattr('openvoice.engines.builtin.invoke', lambda argv, **kwargs: calls.append((argv, kwargs)))
    Piper().render_wav('Some sample text', tmp_path / 'out.wav', SpeechSettings(voice='voice'))
    assert '--model' in calls[0][0]
    assert str(tmp_path / 'voice.onnx') in calls[0][0]
    assert calls[0][1]['stdin'] == b'Some sample text'


def test_piper_errors_with_missing_voice(monkeypatch, tmp_path):
    from openvoice.engines.base import EngineError
    monkeypatch.setenv('OPENMUKTI_PIPER_VOICES', str(tmp_path))
    monkeypatch.setattr('openvoice.piper_models.search_directories', lambda: [tmp_path])
    with pytest.raises(EngineError, match='Install a Piper voice'):
        Piper().render_wav('Hello', tmp_path/'x.wav', SpeechSettings())
