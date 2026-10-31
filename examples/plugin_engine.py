from pathlib import Path
from openvoice.engines.base import EngineError, RunControl, SpeechEngine, SpeechSettings

class SampleEngine(SpeechEngine):
    key = 'sample'
    label = 'Example provider plugin'

    def available(self) -> bool:
        return False

    def voices(self) -> list[str]:
        return []

    def speak(self, text: str, settings: SpeechSettings, control: RunControl | None=None) -> None:
        raise EngineError('Implement sample engine playback')

    def render_wav(self, text: str, output: Path, settings: SpeechSettings, control: RunControl | None=None) -> None:
        raise EngineError('Implement WAV synthesis in sample engine')
