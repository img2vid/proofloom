import struct
import wave
from pathlib import Path
import pytest
from openvoice.engines import RunControl, SpeechEngine, SpeechSettings
from openvoice.engines.base import Cancelled
from openvoice.service import JobOptions, render_text, speak_text

class DeterministicTestEngine(SpeechEngine):
    key = 'test'
    label = 'In-process testing backend'

    def __init__(self):
        self.chunks = []

    def available(self):
        return True

    def render_wav(self, text, output, settings, control=None):
        self.chunks.append(text)
        with wave.open(str(output), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(8000)
            wav.writeframes(struct.pack('<' + 'h' * 160, *[100] * 160))

    def speak(self, text, settings, control=None):
        self.chunks.append(text)

def test_render_stitches_chunks_and_inserts_pause(tmp_path):
    engine = DeterministicTestEngine()
    output = tmp_path / 'speech.wav'
    progress = []
    render_text('Hello! World! ' * 16, output, engine, SpeechSettings(), JobOptions(chunk_size=40, pause_ms=50), progress=lambda x, n: progress.append((x, n)))
    assert output.exists()
    assert len(engine.chunks) > 1
    assert progress[-1] == (len(engine.chunks), len(engine.chunks))
    with wave.open(str(output), 'rb') as wav:
        assert wav.getframerate() == 8000
        assert wav.getnframes() == len(engine.chunks) * 160 + (len(engine.chunks) - 1) * 400

def test_cancel_preserves_existing_output(tmp_path):
    engine = DeterministicTestEngine()
    output = tmp_path / 'output.wav'
    output.write_bytes(b'existing file')
    control = RunControl()
    control.stop()
    with pytest.raises(Cancelled):
        render_text('One sentence.', output, engine, SpeechSettings(), control=control)
    assert output.read_bytes() == b'existing file'

def test_empty_text_is_an_error(tmp_path):
    with pytest.raises(ValueError):
        render_text('  ', tmp_path / 'out.wav', DeterministicTestEngine(), SpeechSettings())

def test_speak_progress_and_pause_control():
    engine = DeterministicTestEngine()
    progress = []
    count = speak_text('A. B. C.', engine, SpeechSettings(), JobOptions(chunk_size=16), progress=lambda a, b: progress.append((a, b)))
    assert count >= 1
    assert progress[-1] == (count, count)
