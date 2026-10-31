from __future__ import annotations
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class PiperVoice:
    name: str
    model: Path
    config: Path


def voice_directory() -> Path:
    if os.name == 'nt':
        root = Path(os.environ.get('APPDATA') or Path.home() / 'AppData' / 'Roaming')
        return root / 'Openmukti Audiobook Maker' / 'voices'
    if sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Openmukti Audiobook Maker' / 'voices'
    return Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local' / 'share') / 'openmukti-audiobook-maker' / 'voices'


def search_directories() -> list[Path]:
    explicit = [os.environ.get('OPENMUKTI_PIPER_VOICES', ''), os.environ.get('PIPER_VOICES_DIR', '')]
    paths = [Path(p).expanduser() for p in explicit if p]
    paths += [voice_directory(), Path(sys.executable).resolve().parent / 'voices', Path(__file__).resolve().parents[1] / 'voices']
    unique = []
    for p in paths:
        if p not in unique:
            unique.append(p)
    return unique


def discover_voices() -> list[PiperVoice]:
    found = {}
    for folder in search_directories():
        if not folder.is_dir():
            continue
        try:
            models = sorted(folder.rglob('*.onnx'))
        except OSError:
            continue
        for model in models[:1000]:
            config = Path(str(model) + '.json')
            if model.is_file() and config.is_file() and model.stat().st_size > 0:
                found.setdefault(model.stem.casefold(), PiperVoice(model.stem, model, config))
    return sorted(found.values(), key=lambda item: item.name.casefold())


def get_voice(name: str='') -> PiperVoice | None:
    voices = discover_voices()
    if not name:
        return voices[0] if voices else None
    return next((v for v in voices if v.name.casefold() == name.casefold()), None)


def piper_binary() -> str | None:
    suffix = '.exe' if os.name == 'nt' else ''
    for folder in [Path(sys.executable).resolve().parent, Path(__file__).resolve().parents[1] / 'vendor' / 'piper']:
        file = folder / ('piper' + suffix)
        if file.is_file():
            return str(file)
    return shutil.which('piper')


def install_voice(model: str | Path) -> PiperVoice:
    source = Path(model).expanduser().resolve()
    config = Path(str(source) + '.json')
    if source.suffix.lower() != '.onnx' or not source.is_file():
        raise ValueError('Choose a Piper .onnx model file')
    if not config.is_file():
        raise ValueError(f'The matching configuration is missing: {config.name}')
    target = voice_directory()
    target.mkdir(parents=True, exist_ok=True)
    dest = target / source.name
    if source != dest:
        shutil.copy2(source, dest)
        shutil.copy2(config, target / config.name)
    return PiperVoice(dest.stem, dest, target / config.name)
