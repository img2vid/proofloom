from __future__ import annotations
import json
from pathlib import Path
import pytest
from openvoice.engines.builtin import Piper
from openvoice.engines.base import SpeechSettings, EngineError
from openvoice.piper_compat import inspect_config, compatible_cli_config, incompatibility_message
from openvoice.windowing import WorkArea, bounded_geometry, keep_window_visible


def _model(tmp_path: Path, phoneme_type='espeak') -> Path:
    model = tmp_path / 'bn_BD-google-medium.onnx'
    model.write_bytes(b'fake onnx model')
    config = {
        'phoneme_type': phoneme_type,
        'phoneme_id_map': {'_': [0], '^': [1], '$': [2], ' ': [3], 'a': [41], 'r': [42], 'ar': [161]},
        'phoneme_map': {'ar': ['a'], 'a': ['ar', 'r'], 'r': ['a']},
        'inference': {'phoneme_silence': {'ar': .5, 'a': .1}},
    }
    Path(str(model) + '.json').write_text(json.dumps(config), encoding='utf-8')
    return model


@pytest.mark.parametrize('type_', ['espeak', 'text'])
def test_legacy_multicodepoint_config_is_repaired_in_temporary_copy(monkeypatch, tmp_path, type_):
    model = _model(tmp_path, type_)
    original = Path(str(model) + '.json').read_bytes()
    calls = []

    def fake_invoke(args, *, stdin, control):
        assert args[0] == 'piper-executable'
        assert '--config' in args
        temp = Path(args[args.index('--config') + 1])
        fixed, problems = inspect_config(temp)
        assert problems == {}
        assert fixed['phoneme_id_map']['a'] == [41]
        assert 'ar' not in fixed['phoneme_id_map']
        assert fixed['phoneme_map']['a'] == ['r']
        assert 'ar' not in fixed['inference']['phoneme_silence']
        assert stdin.decode('utf-8') == 'স্বাগতম আপনারাও ভালো আছেন'
        calls.append(args)
        return b''

    monkeypatch.setattr('openvoice.engines.builtin.piper_binary', lambda: 'piper-executable')
    monkeypatch.setattr('openvoice.engines.builtin.invoke', fake_invoke)
    Piper().render_wav('স্বাগতম আপনারাও ভালো আছেন', tmp_path / 'result.wav', SpeechSettings(model=str(model)))
    assert len(calls) == 1
    assert Path(str(model) + '.json').read_bytes() == original
    assert not list(tmp_path.glob('compatible.onnx.json'))


def test_unrepairable_config_reports_actionable_message(tmp_path):
    model = _model(tmp_path)
    config = {'phoneme_id_map': {'ar': [161]}}
    assert compatible_cli_config(config, {'phoneme_id_map': ['ar']}) is None
    assert 'not an error in the text' in incompatibility_message(model, {'phoneme_id_map': ['ar']})


def test_invalid_json_reports_helpful_error(tmp_path):
    f = tmp_path / 'broken.onnx.json'
    f.write_text('not json')
    with pytest.raises(EngineError, match='Download the matching'):
        inspect_config(f)


def test_window_constrained_when_screen_shrinks(monkeypatch):
    from openvoice import windowing
    class Window:
        def __init__(self):
            self.geo = None
            self.x, self.y, self.width, self.height = 400, 250, 1150, 750
        def winfo_exists(self): return True
        def attributes(self, name): return False
        def winfo_width(self): return self.width
        def winfo_height(self): return self.height
        def winfo_x(self): return self.x
        def winfo_y(self): return self.y
        def minsize(self, w, h): self.min = (w, h)
        def state(self): return 'normal'
        def geometry(self, value): self.geo = value
    w = Window()
    monkeypatch.setattr(windowing, 'work_area', lambda _: WorkArea(20, 40, 760, 480))
    keep_window_visible(w)
    assert w.geo == '760x480+20+40'
    assert w.min == (480, 330)
    w.geo = None
    w.x, w.y, w.width, w.height = 25, 45, 740, 450
    keep_window_visible(w)
    assert w.geo is None


def test_secondary_monitor_offset_and_small_screen():
    assert bounded_geometry(WorkArea(1920, 80, 480, 320), 2300, 200, 900, 740) == '480x320+1920+80'
