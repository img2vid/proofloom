from pathlib import Path
from types import SimpleNamespace
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_exact_python_version_and_64bit_required(monkeypatch):
    from scripts import build_windows_py315 as builder
    monkeypatch.setattr(builder, 'os', SimpleNamespace(name='nt', environ={}))
    monkeypatch.setattr(builder, 'sys', SimpleNamespace(version_info=(3, 15, 2), implementation=SimpleNamespace(name='cpython'), version='3.15.2'))
    builder.ensure_python315()
    monkeypatch.setattr(builder, 'sys', SimpleNamespace(version_info=(3, 15, 1), implementation=SimpleNamespace(name='cpython'), version='3.15.1'))
    with pytest.raises(RuntimeError, match='3.15.2'):
        builder.ensure_python315()


def test_worker_phoneme_validation():
    from scripts.piper_worker import to_phonemes
    assert to_phonemes('həˈloʊ', {'h':[1], 'ə':[2], 'ˈ':[3], 'l':[4], 'oʊ':[5]}) == ['h','ə','ˈ','l','oʊ']
    with pytest.raises(ValueError, match='does not contain IPA'):
        to_phonemes('hɑ', {'h':[1]})


def test_worker_search_in_frozen_directory(monkeypatch, tmp_path):
    from openvoice import piper_sidecar
    executable = tmp_path / 'frozen' / 'app.exe'
    executable.parent.mkdir()
    name = 'OpenmuktiPiperWorker.exe' if piper_sidecar.os.name == 'nt' else 'OpenmuktiPiperWorker'
    worker = executable.parent / '_internal' / 'piper_worker' / name
    worker.parent.mkdir(parents=True)
    worker.write_bytes(b'binary')
    monkeypatch.setattr(piper_sidecar.sys, 'executable', str(executable))
    monkeypatch.delenv('OPENMUKTI_PIPER_WORKER', raising=False)
    assert piper_sidecar.find_worker() == worker


def test_worker_is_invoked_without_shell(monkeypatch, tmp_path):
    from openvoice import piper_sidecar
    worker = tmp_path / 'Piper Worker.exe'
    worker.write_bytes(b'placeholder')
    model = tmp_path / 'voice with spaces.onnx'
    config = tmp_path / 'voice with spaces.onnx.json'
    output = tmp_path / 'synthesized.wav'
    calls = []
    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        output.write_bytes(b'RIFF' + b'\0' * 120)
        return SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
    monkeypatch.setattr(piper_sidecar, 'find_worker', lambda: worker)
    monkeypatch.setattr(piper_sidecar.subprocess, 'run', fake_run)
    piper_sidecar.render_with_worker(mode='ipa', model=model, config=config,
                                     output=output, ipa='həˈloʊ', length_scale=1.1)
    assert calls[0][0][0] == str(worker)
    assert calls[0][0][calls[0][0].index('--ipa')+1] == 'həˈloʊ'
    assert 'shell' not in calls[0][1]


def test_windows_portable_build_protects_piper_and_includes_main_python():
    source = (ROOT / 'scripts/build_windows_py315.py').read_text()
    bat = (ROOT / 'scripts/build-windows-exes.bat').read_text()
    assert 'sys.version_info[:3] != (3, 15, 2)' in source
    assert "'uv'" not in bat
    assert "'--python', '3.12'" in source
    assert "'piper-tts==1.8.0'" in source
    assert 'OpenmuktiPiperWorker.exe' in source
    assert 'verify_single_file_release(worker, main_python)' in source
    assert "'--onefile'" in source
    assert 'package.testzip()' in source
    assert 'py -3.15' in bat


def test_release_zips_exclude_build_venvs():
    import importlib.util
    spec = importlib.util.spec_from_file_location('release_builder', ROOT / 'packaging' / 'build_release.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert '.piper-build-venv' in module.EXCLUDE
    assert '.build-venv' in module.EXCLUDE


def test_ipa_render_uses_bundled_worker_if_local_python_piper_missing(monkeypatch, tmp_path):
    import sys
    import wave
    from openvoice.ipa_pronunciation import render_ipa_wav
    from openvoice.engines.base import SpeechSettings
    from openvoice import piper_sidecar
    model = tmp_path / 'voice.onnx'
    model.write_bytes(b'mock onnx')
    (tmp_path / 'voice.onnx.json').write_text('{}')
    fake_worker = tmp_path / 'OpenmuktiPiperWorker.exe'
    fake_worker.write_bytes(b'placeholder')
    monkeypatch.setitem(sys.modules, 'piper', None)
    monkeypatch.setattr(piper_sidecar, 'find_worker', lambda: fake_worker)
    output = tmp_path / 'output.wav'
    def worker_run(args, **kwargs):
        with wave.open(str(output), 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(22050)
            out.writeframes(b'\0' * 256)
        return SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
    monkeypatch.setattr(piper_sidecar.subprocess, 'run', worker_run)
    render_ipa_wav('həˈloʊ', output, SpeechSettings(model=str(model)))
    with wave.open(str(output)) as wav:
        assert wav.getnframes() == 128


def test_worker_is_discovered_by_piper_availability(monkeypatch, tmp_path):
    from openvoice import piper_sidecar, piper_compat
    path = tmp_path / 'OpenmuktiPiperWorker.exe'
    path.write_bytes(b'placeholder')
    monkeypatch.setattr(piper_sidecar, 'find_worker', lambda: path)
    assert piper_compat.python_piper_available()


def test_piper_worker_supports_v18_api(monkeypatch, tmp_path):
    import sys
    import types
    import wave
    import numpy as np
    from scripts import piper_worker
    sound = tmp_path / 'speech.wav'
    config = tmp_path / 'voice.onnx.json'
    model = tmp_path / 'voice.onnx'
    model.write_bytes(b'fake')
    config.write_text('{}')
    class SynthesisConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
    class Voice:
        config=SimpleNamespace(phoneme_id_map={'^':[0], '$':[1], 'h':[2], 'ə':[3]}, sample_rate=22050)
        @staticmethod
        def load(*a, **kw):return Voice()
        def phonemes_to_ids(self, tokens):return [1, 2, 3, 4]
        def phoneme_ids_to_audio(self, ids, syn_config=None):
            assert syn_config.kwargs['length_scale'] == 1.1
            return np.asarray([0.5, -0.5, 0, 1, -1], dtype=np.float32)
    piper_mod=types.ModuleType('piper');piper_mod.__path__=[]
    voice_mod=types.ModuleType('piper.voice');voice_mod.PiperVoice=Voice
    config_mod=types.ModuleType('piper.config');config_mod.SynthesisConfig=SynthesisConfig
    ort_mod=types.ModuleType('onnxruntime');ort_mod.__version__='1.31.0'
    monkeypatch.setitem(sys.modules,'piper',piper_mod)
    monkeypatch.setitem(sys.modules,'piper.voice',voice_mod)
    monkeypatch.setitem(sys.modules,'piper.config',config_mod)
    monkeypatch.setitem(sys.modules,'onnxruntime',ort_mod)
    monkeypatch.setattr(sys,'argv',['piper_worker.py','--mode','ipa','--model',str(model),'--config',str(config),'--output',str(sound),'--ipa','hə','--length-scale','1.1'])
    assert piper_worker.main()==0
    with wave.open(str(sound)) as wav:
        assert wav.getframerate()==22050
        assert wav.getnframes()==5
        assert wav.getsampwidth()==2
