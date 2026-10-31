from __future__ import annotations
import hashlib
import json
import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from .audiobooks import Book, Chapter
from .character_voices import CharacterProfile, VoiceProject
from .piper_models import get_voice

EXTENSION = '.oamproj'
MAX_FILES = 10000
MAX_EXTRACTED_BYTES = 24 * 1024 ** 3
MAX_MANIFEST_BYTES = 8 * 1024 ** 2

@dataclass
class ProjectData:
    text: str = ''
    settings: dict = field(default_factory=dict)
    voice_project: VoiceProject = field(default_factory=VoiceProject)
    books: list[Book] = field(default_factory=list)
    video_images: list[Path] = field(default_factory=list)
    video_audio: Path | None = None
    video_settings: dict = field(default_factory=dict)
    book_settings: dict = field(default_factory=dict)
    current_filename: str = ''
    active_character: str = 'Narrator'
    use_character_voices: bool = True


def _model_path(value: str) -> Path | None:
    if not value:
        return None
    direct = Path(value).expanduser()
    if direct.suffix.lower() == '.onnx' or direct.is_file():
        return direct
    installed = get_voice(value)
    if installed:
        return installed.model
    return None


def save_project(destination: str | Path, project: ProjectData) -> Path:
    target = Path(destination).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    paths: dict[Path, str] = {}
    resource_info: dict[str, dict[str, Any]] = {}

    def add_file(value: str | Path | None, *, optional=False) -> str | None:
        if not value:
            return None
        path = Path(value).expanduser().resolve()
        if not path.is_file():
            if optional:
                return None
            raise FileNotFoundError(f'Project resource is missing: {path}')
        if path in paths:
            return paths[path]
        if len(paths) >= MAX_FILES:
            raise ValueError('Project has too many included files')
        folder = hashlib.sha256(str(path.parent).encode('utf-8')).hexdigest()[:20]
        name = path.name
        if name in ('.', '..') or not name or '/' in name or '\\' in name:
            raise ValueError('Invalid project resource name')
        entry = 'assets/' + folder + '/' + name
        if entry in resource_info:
            raise ValueError('Project resource name collision')
        digest = hashlib.sha256()
        with path.open('rb') as source:
            while buffer := source.read(1024 * 1024):
                digest.update(buffer)
        paths[path] = entry
        resource_info[entry] = {'sha256': digest.hexdigest(), 'size': path.stat().st_size}
        return entry

    def voice_ref(value: str) -> str:
        if not value:
            return ''
        model = _model_path(value)
        if model is None:
            raise ValueError(f'Cannot package Piper voice {value!r}. Download or install its model and configuration first.')
        model = model.resolve()
        config = Path(str(model) + '.json')
        add_file(config)
        return add_file(model) or ''

    def pack_voice(voice: VoiceProject) -> dict:
        return {
            'script': voice.script,
            'pronunciation_files': [add_file(x) for x in voice.pronunciation_files if x],
            'profiles': [{**asdict(p), 'voice': voice_ref(p.voice)} for p in voice.profiles],
        }

    manifest = {'format': 'openmukti-project', 'version': 1, 'text': project.text,
                'settings': dict(project.settings), 'current_filename': project.current_filename,
                'active_character': project.active_character,
                'use_character_voices': bool(project.use_character_voices),
                'video_settings': dict(project.video_settings),
                'book_settings': dict(project.book_settings),
                'video_images': [add_file(x) for x in project.video_images],
                'video_audio': add_file(project.video_audio),
                'voices': pack_voice(project.voice_project), 'books': [], 'resources': resource_info}
    selected_voice = manifest['settings'].get('voice', '')
    if selected_voice and get_voice(selected_voice):
        manifest['settings']['model'] = str(get_voice(selected_voice).model)
    for setting in ('model', 'dictionary', 'ipa_dictionary'):
        value = manifest['settings'].get(setting)
        if value:
            manifest['settings'][setting] = voice_ref(value) if setting == 'model' else add_file(value)
    for book in project.books:
        stored = {'title': book.title, 'gutenberg': book.gutenberg, 'chapters': []}
        if book.voice_project:
            stored['voices'] = pack_voice(VoiceProject.load(book.voice_project))
        for chapter in book.chapters:
            stored['chapters'].append({'title': chapter.title, 'text': chapter.text,
                                       'text_file': add_file(chapter.text_file),
                                       'audio': add_file(chapter.audio),
                                       'images': [add_file(x) for x in chapter.images]})
        manifest['books'].append(stored)
    payload = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(payload) > MAX_MANIFEST_BYTES:
        raise ValueError('Project metadata is too large')
    descriptor, temp_name = tempfile.mkstemp(prefix='openmukti-project-', suffix='.tmp', dir=str(target.parent))
    os.close(descriptor)
    temp = Path(temp_name)
    try:
        with zipfile.ZipFile(temp, 'w', allowZip64=True) as archive:
            archive.writestr('project.json', payload, compress_type=zipfile.ZIP_DEFLATED)
            for original, entry in paths.items():
                compress = zipfile.ZIP_STORED if original.suffix.lower() in ('.onnx', '.mp3', '.mp4', '.jpg', '.jpeg', '.png', '.webp', '.pdf', '.epub') else zipfile.ZIP_DEFLATED
                archive.write(original, entry, compress_type=compress)
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
    return target


def load_project(source: str | Path, workspace: str | Path) -> ProjectData:
    location = Path(source).expanduser().resolve()
    root = Path(workspace).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(location, 'r') as archive:
        names = archive.namelist()
        if not names or names.count('project.json') != 1 or len(names) > MAX_FILES + 1 or len(names) != len(set(names)):
            raise ValueError('Invalid or oversized Openmukti project archive')
        descriptor = archive.getinfo('project.json')
        if descriptor.file_size > MAX_MANIFEST_BYTES:
            raise ValueError('Project metadata is too large')
        data = json.loads(archive.read('project.json'))
        if not isinstance(data, dict) or data.get('format') != 'openmukti-project' or data.get('version') != 1:
            raise ValueError('Unsupported Openmukti project format')
        resources = data.get('resources')
        if not isinstance(resources, dict) or set(names) != set(resources) | {'project.json'}:
            raise ValueError('Project has missing or unexpected bundled assets')
        if sum(i.file_size for i in archive.infolist()) > MAX_EXTRACTED_BYTES:
            raise ValueError('Project archive expands beyond the safety limit')
        allowed = re.compile(r'assets/[a-f0-9]{20}/[^/\\]+')
        for name, info in resources.items():
            if not allowed.fullmatch(name) or not isinstance(info, dict):
                raise ValueError('Unsafe project resource path')
            if not re.fullmatch('[a-f0-9]{64}', str(info.get('sha256', ''))):
                raise ValueError('Missing project resource checksum')
            entry = archive.getinfo(name)
            if entry.is_dir() or entry.file_size != info.get('size') or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Invalid project asset metadata')
        def extract(name: str | None) -> Path | None:
            if not name:
                return None
            if name not in resources:
                raise ValueError('Project references a missing bundled resource')
            target = root.joinpath(*name.split('/'))
            if not target.resolve().is_relative_to(root):
                raise ValueError('Project contains an unsafe resource path')
            if not target.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                with archive.open(name, 'r') as original, target.open('wb') as dest:
                    while block := original.read(1024 * 1024):
                        digest.update(block)
                        dest.write(block)
                if digest.hexdigest() != resources[name]['sha256']:
                    target.unlink(missing_ok=True)
                    raise ValueError(f'Project resource failed checksum verification: {name}')
            else:
                digest_hasher = hashlib.sha256()
                with target.open('rb') as already:
                    while block := already.read(1024 * 1024):
                        digest_hasher.update(block)
                digest = digest_hasher.hexdigest()
                if digest != resources[name]['sha256']:
                    raise ValueError(f'Existing project resource has incorrect checksum: {name}')
            if name.endswith('.onnx') and name + '.json' in resources:
                extract(name + '.json')
            return target
        for resource_name in resources:
            extract(resource_name)
        def restore_voices(voices: dict) -> VoiceProject:
            profiles = []
            for obj in voices.get('profiles', []):
                item = dict(obj)
                item['voice'] = str(extract(item['voice'])) if item.get('voice') else ''
                profiles.append(CharacterProfile(**item))
            if not any(p.name.casefold() == 'narrator' for p in profiles):
                raise ValueError('Project requires a Narrator profile')
            return VoiceProject(profiles, voices.get('script', ''), [str(extract(x)) for x in voices.get('pronunciation_files', [])])
        settings = dict(data.get('settings', {}))
        for key in ('model', 'dictionary', 'ipa_dictionary'):
            if settings.get(key):
                settings[key] = str(extract(settings[key]))
        books = []
        for index, stored in enumerate(data.get('books', [])):
            chapters = [Chapter(c['title'], [extract(x) for x in c.get('images', [])], extract(c.get('text_file')), c.get('text', ''), extract(c.get('audio'))) for c in stored['chapters']]
            voice_source = None
            if stored.get('voices'):
                voice_source = root / f'book-voices-{index}.json'
                restore_voices(stored['voices']).save(voice_source)
            books.append(Book(stored['title'], chapters, stored.get('gutenberg'), voice_source))
        return ProjectData(text=data.get('text', ''), settings=settings, voice_project=restore_voices(data['voices']),
                           books=books, video_images=[extract(x) for x in data.get('video_images', [])],
                           video_audio=extract(data.get('video_audio')), video_settings=dict(data.get('video_settings', {})),
                           book_settings=dict(data.get('book_settings', {})), current_filename=data.get('current_filename', ''),
                           active_character=data.get('active_character', 'Narrator'),
                           use_character_voices=bool(data.get('use_character_voices', True)))
