from __future__ import annotations
import hashlib
import json
import os
import re
import shutil
import tempfile
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from .piper_models import voice_directory

CATALOG_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json'
VOICE_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'
MAX_CATALOG_BYTES = 4_000_000

@dataclass(frozen=True)
class CatalogVoice:
    key: str
    language: str
    language_name: str
    region: str
    quality: str
    speakers: int
    model_path: str
    config_path: str
    model_bytes: int
    model_md5: str
    config_bytes: int
    config_md5: str

def parse_catalog(data: dict) -> list[CatalogVoice]:
    if not isinstance(data, dict):
        raise ValueError('Voice catalog is not a JSON object')
    output = []
    for key, record in data.items():
        if not isinstance(record, dict) or not isinstance(record.get('files'), dict):
            continue
        paths = record['files']
        model = next((p for p in paths if p.endswith('.onnx')), None)
        config = model + '.json' if model else None
        if not model or config not in paths or not re.fullmatch(r'[\w.-]+', key):
            continue
        if any(not _safe_path(x) for x in (model, config)):
            continue
        lang = record.get('language', {})
        if not isinstance(lang, dict):
            lang = {}
        m, c = paths[model], paths[config]
        try:
            output.append(CatalogVoice(key, str(lang.get('code', '')).replace('_', '-'), str(lang.get('name_english', 'Unknown')),
                                       str(lang.get('country_english', '')), str(record.get('quality', 'unknown')),
                                       max(1, int(record.get('num_speakers', 1))), model, config,
                                       int(m['size_bytes']), str(m['md5_digest']).lower(),
                                       int(c['size_bytes']), str(c['md5_digest']).lower()))
        except (KeyError, ValueError, TypeError):
            continue
    return sorted(output, key=lambda v: (v.language_name.casefold(), v.language, v.key))

def _safe_path(path: str) -> bool:
    parts = Path(path).parts
    return bool(parts) and not path.startswith('/') and '\\' not in path and all(part not in ('..', '.') for part in parts) and re.fullmatch(r'[\w./-]+', path) is not None

def catalog_cache() -> Path:
    return voice_directory().parent / 'piper-voices.json'

def fetch_catalog(*, force: bool = False, cache: Path | None = None, opener=None, max_age: int=7*86400) -> list[CatalogVoice]:
    cache = cache or catalog_cache()
    if not force and cache.is_file() and time.time() - cache.stat().st_mtime < max_age:
        try:
            return parse_catalog(json.loads(cache.read_text(encoding='utf-8')))
        except (OSError, ValueError):
            pass
    fetch = opener or urllib.request.urlopen
    try:
        with fetch(urllib.request.Request(CATALOG_URL, headers={'User-Agent':'Openmukti-Audiobook-Maker/1.0'}), timeout=30) as response:
            raw = response.read(MAX_CATALOG_BYTES + 1)
        if len(raw) > MAX_CATALOG_BYTES:
            raise ValueError('Catalog is unexpectedly large')
        data = json.loads(raw.decode('utf-8'))
        voices = parse_catalog(data)
        if not voices:
            raise ValueError('The online voice catalog contained no usable models')
        cache.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache.with_suffix('.download')
        temporary.write_bytes(raw)
        os.replace(temporary, cache)
        return voices
    except (OSError, ValueError, UnicodeError) as exc:
        if cache.is_file():
            try:
                voices = parse_catalog(json.loads(cache.read_text(encoding='utf-8')))
                if voices:
                    return voices
            except (OSError, ValueError):
                pass
        raise RuntimeError(f'Unable to load Piper voice catalog: {exc}') from exc

def catalog_languages(voices: list[CatalogVoice]) -> list[str]:
    return sorted({f'{v.language_name} ({v.language})' for v in voices})

def voice_download_size(voices: list[CatalogVoice]) -> int:
    return sum(v.model_bytes + v.config_bytes for v in voices)

def _download_verified(url: str, path: Path, size: int, digest: str, opener=None, progress=None) -> None:
    if size < 1 or size > 4_000_000_000 or not re.fullmatch(r'[0-9a-f]{32}', digest):
        raise ValueError('Missing or invalid catalog checksum or size')
    fetch = opener or urllib.request.urlopen
    md5 = hashlib.md5()
    total = 0
    with fetch(urllib.request.Request(url, headers={'User-Agent': 'Openmukti-Audiobook-Maker/1.0'}), timeout=90) as response, path.open('wb') as dest:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > size:
                raise ValueError('Downloaded file exceeds catalog size')
            md5.update(chunk)
            dest.write(chunk)
            if progress:
                progress(total, size)
    if total != size or md5.hexdigest() != digest:
        raise ValueError('Downloaded file failed catalog size/checksum verification')

def download_voice(voice: CatalogVoice, *, destination: Path | None=None, opener=None, progress=None) -> Path:
    destination = destination or voice_directory()
    destination.mkdir(parents=True, exist_ok=True)
    dest_model = destination / (voice.key + '.onnx')
    dest_config = destination / (voice.key + '.onnx.json')
    tasks = [(voice.model_path, dest_model, voice.model_bytes, voice.model_md5),
             (voice.config_path, dest_config, voice.config_bytes, voice.config_md5)]
    with tempfile.TemporaryDirectory(prefix='.piper-download-', dir=destination) as directory:
        staged = []
        for remote, target, size, digest in tasks:
            if not _safe_path(remote):
                raise ValueError('Invalid path in voice catalog')
            staged_file = Path(directory) / target.name
            url = VOICE_BASE_URL + urllib.parse.quote(remote, safe='/')
            _download_verified(url, staged_file, size, digest, opener, progress)
            staged.append((staged_file, target))
        for file, target in staged:
            os.replace(file, target)
    return dest_model

def download_selected(voices: list[CatalogVoice], *, progress=None) -> list[Path]:
    paths = []
    for number, voice in enumerate(voices, 1):
        if progress:
            progress(number, len(voices), voice.key)
        paths.append(download_voice(voice))
    return paths
