from __future__ import annotations
import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from .documents import read_document
from .engines import RunControl, SpeechEngine, SpeechSettings
from .service import JobOptions
from .fftools import find_binary
from .chaptering import split_chapters
from .edition import GUTENBERG_ENABLED
if GUTENBERG_ENABLED:
    from .gutenberg import split_chapters

def clean_book_text(text: str) -> str:
    if not GUTENBERG_ENABLED:
        raise ValueError('This edition does not include Gutenberg Mode')
    from .gutenberg import clean_gutenberg
    return clean_gutenberg(text).content
from .video import VideoOptions, audio_duration, render_video, _run, VIDEO_FORMATS, IMAGE_FORMATS

DOCUMENTS = {'.txt', '.md', '.markdown', '.epub', '.docx', '.html', '.htm', '.pdf', '.rtf', '.zip', '.cbz'}
AUDIO = {'.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma', '.aiff'}
CHAPTER_NUMBER = re.compile(r'(?:^|[ _.-])(?:chapter|chap|ch|part|section)?[ _.-]*(\d{1,4})(?:$|[ _.-])', re.I)

@dataclass
class Chapter:
    title: str
    images: list[Path]
    text_file: Path | None = None
    text: str = ''
    audio: Path | None = None

@dataclass
class Book:
    title: str
    chapters: list[Chapter] = field(default_factory=list)
    gutenberg: bool | None = None
    voice_project: Path | None = None

@dataclass(frozen=True)
class BookExportOptions:
    mode: str = 'both'
    video: VideoOptions = VideoOptions()
    gutenberg: bool = False
    skip_existing: bool = False
    continue_on_error: bool = True
    video_format: str = 'mp4'
    output_type: str = 'video'
    audio_format: str = 'mp3'


def safe_name(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', ' ', name).strip(' .')
    name = re.sub(r'\s+', ' ', name)
    return name[:95] or 'Untitled'


def _paths(value, base: Path) -> list[Path]:
    if value is None:
        return []
    parts = value if isinstance(value, list) else [value]
    if not all(isinstance(p, str) and p.strip() for p in parts):
        raise ValueError('Image paths must be nonempty strings')
    return [(base / p).expanduser().resolve() for p in parts]


def _chapter_from_dict(item: dict, base: Path, default_cover=None) -> Chapter:
    if not isinstance(item, dict):
        raise ValueError('Each chapter must be a JSON object')
    images = _paths(item.get('covers', item.get('images', item.get('cover', default_cover))), base)
    text_file = _paths(item.get('text_file'), base)
    audio_file = _paths(item.get('audio'), base)
    title = str(item.get('title') or (text_file[0].stem if text_file else 'Chapter'))
    content = str(item.get('text') or '')
    if not text_file and not audio_file and not content.strip():
        raise ValueError(f'Chapter {title} requires text, text_file or audio')
    return Chapter(title, images, text_file[0] if text_file else None, content, audio_file[0] if audio_file else None)


def _split_ebook(file: Path, base_images: list[Path], *, gutenberg: bool, chapter_covers: dict | None = None) -> list[Chapter]:
    content = read_document(file)
    if gutenberg:
        content = clean_book_text(content)
    if not content.strip():
        raise ValueError(f'No content after cleanup: {file}')
    segments = split_chapters(content)
    chapters = []
    mapping = chapter_covers or {}
    for index, (title, body) in enumerate(segments, 1):
        manual = mapping.get(str(index), mapping.get(title))
        if manual:
            covers = list(manual)
        elif len(base_images) == 1:
            covers = list(base_images)
        elif len(base_images) == len(segments):
            covers = [base_images[index-1]]
        else:
            covers = _match_cover(title, base_images)
            if not covers:
                default = [p for p in base_images if p.stem.casefold() in ('cover','front','book-cover')]
                covers = default[:1]
        chapters.append(Chapter(title=title, images=covers, text=body))
    return chapters


def load_manifest(file: str | Path, *, gutenberg: bool = False) -> list[Book]:
    file = Path(file).expanduser().resolve()
    data = json.loads(file.read_text(encoding='utf-8-sig'))
    books = data.get('books') if isinstance(data, dict) and 'books' in data else [data]
    if not isinstance(books, list) or not books:
        raise ValueError('Manifest needs one or more books')
    result = []
    for value in books:
        if not isinstance(value, dict):
            raise ValueError('Each book must be a JSON object')
        title = str(value.get('title') or 'Untitled book')
        base = file.parent
        book_gutenberg = bool(value.get('gutenberg', gutenberg)) if GUTENBERG_ENABLED else False
        cover = value.get('cover', value.get('images'))
        if value.get('ebook'):
            ebook = _paths(value['ebook'], base)[0]
            chapter_images = value.get('covers', cover)
            explicit = value.get('chapter_covers', {})
            if not isinstance(explicit, dict):
                raise ValueError('chapter_covers must be a dictionary')
            explicit = {str(k): _paths(v, base) for k,v in explicit.items()}
            chapters = _split_ebook(ebook, _paths(chapter_images, base), gutenberg=book_gutenberg, chapter_covers=explicit)
        else:
            entries = value.get('chapters', [])
            if not isinstance(entries, list) or not entries:
                raise ValueError(f'Book {title} has no chapters')
            chapters = [_chapter_from_dict(item, base, cover) for item in entries]
        if not chapters:
            raise ValueError(f'Book {title} has no readable chapters')
        result.append(Book(title, chapters, book_gutenberg, (_paths(value.get('voice_project'),base) or [None])[0]))
    return result


def _number(stem: str) -> int | None:
    match = CHAPTER_NUMBER.search(' ' + stem.strip().lower() + ' ')
    return int(match.group(1)) if match else None


def _match_cover(stem: str, covers: list[Path]) -> list[Path]:
    exact = [p for p in covers if p.stem.casefold() == stem.casefold()]
    if exact:
        return [exact[0]]
    number = _number(stem)
    if number is not None:
        numbered = [p for p in covers if _number(p.stem) == number]
        if len(numbered) == 1:
            return numbered
        if len(numbered) > 1:
            raise ValueError(f'Ambiguous chapter cover match for {stem}: {", ".join(p.name for p in numbered)}')
    defaults = [p for p in covers if p.stem.casefold() in ('cover', 'book-cover', 'front', 'front-cover')]
    if defaults:
        return [defaults[0]]
    if len(covers) == 1:
        return covers[:]
    return []


def _files(base: Path, suffixes: set[str]) -> list[Path]:
    if not base.exists():
        return []
    folders = [base] + [base / sub for sub in ('chapters', 'texts', 'text', 'images', 'covers', 'audio', 'narration') if (base / sub).is_dir()]
    return sorted((p for folder in folders for p in folder.iterdir() if p.is_file() and p.suffix.lower() in suffixes), key=lambda p: p.as_posix().casefold())


def discover_book(folder: str | Path, *, gutenberg: bool = False) -> Book:
    root = Path(folder).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f'Book folder does not exist: {root}')
    docs = _files(root, DOCUMENTS)
    images = _files(root, IMAGE_FORMATS)
    audios = _files(root, AUDIO)
    if not docs and not audios:
        raise ValueError(f'No chapter documents or audio files in {root}')
    chapters = []
    if len(docs) == 1 and not audios and docs[0].stem.casefold() not in ('chapter 1','chapter 01','1'):
        return Book(root.name, _split_ebook(docs[0], images, gutenberg=gutenberg))
    items: dict[str, dict] = {}
    for path in docs:
        n = _number(path.stem)
        key = f'{n:07}' if n is not None else path.stem.casefold()
        if 'text_file' in items.setdefault(key, {}):
            raise ValueError(f'Conflicting chapter files for {key} in {root}')
        items[key]['text_file'] = path
    for path in audios:
        n = _number(path.stem)
        key = f'{n:07}' if n is not None else path.stem.casefold()
        if 'audio' in items.setdefault(key, {}):
            raise ValueError(f'Conflicting chapter audio for {key} in {root}')
        items[key]['audio'] = path
    for index, (key, entry) in enumerate(sorted(items.items(), key=lambda kv: (not kv[0].isdigit(), kv[0])), 1):
        path = entry.get('text_file') or entry.get('audio')
        covers = _match_cover(path.stem, images)
        title = f'Chapter {int(key)}' if key.isdigit() else path.stem
        chapters.append(Chapter(title, covers, entry.get('text_file'), audio=entry.get('audio')))
    return Book(root.name, chapters)


def discover_books(folder: str | Path, *, gutenberg: bool=False) -> list[Book]:
    root = Path(folder).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f'Import folder not found: {root}')
    manifest = root / 'openvoice-books.json'
    if manifest.is_file():
        return load_manifest(manifest, gutenberg=gutenberg)
    subfolders = [p for p in sorted(root.iterdir(), key=lambda p:p.name.casefold()) if p.is_dir() and not p.name.startswith('.')]
    book_folders = [p for p in subfolders if _files(p, DOCUMENTS | AUDIO)]
    if book_folders:
        return [discover_book(p, gutenberg=gutenberg) for p in book_folders]
    documents = _files(root, DOCUMENTS)
    audios = _files(root, AUDIO)
    if len(documents) > 1 and not audios and all(_number(p.stem) is None for p in documents):
        images = _files(root, IMAGE_FORMATS)
        return [Book(p.stem, _split_ebook(p, _match_cover(p.stem, images), gutenberg=gutenberg)) for p in documents]
    return [discover_book(root, gutenberg=gutenberg)]


def _chapter_text(chapter: Chapter, gutenberg: bool) -> str:
    content = chapter.text if chapter.text_file is None else read_document(chapter.text_file)
    return clean_book_text(content) if gutenberg and content.strip() else content


def _concat_videos(videos: list[Path], target: Path, control: RunControl | None=None):
    ffmpeg = find_binary('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('FFmpeg is required to merge audiobook chapters')
    with tempfile.TemporaryDirectory(prefix='openvoice-merge-', dir=str(target.parent)) as tmp:
        work = Path(tmp)
        concat = work / 'chapters.ffconcat'
        lines = ['ffconcat version 1.0']
        for video in videos:
            name = video.resolve().as_posix().replace("'", "'\\''")
            lines.append(f"file '{name}'")
        concat.write_text('\n'.join(lines)+'\n', encoding='utf-8')
        output = work / ('audiobook' + target.suffix)
        cmd = [ffmpeg, '-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-map','0:v:0','-map','0:a:0','-c','copy']
        if target.suffix in ('.mp4', '.mov'):
            cmd.extend(['-movflags','+faststart'])
        cmd.append(str(output))
        _run(cmd, control)
        if not output.exists() or not output.stat().st_size:
            raise RuntimeError('Combined video was not created')
        os.replace(output, target)


def _concat_audios(inputs: list[Path], target: Path, control: RunControl | None = None):
    ffmpeg = find_binary('ffmpeg')
    if not ffmpeg:
        if target.suffix.lower() != '.wav':
            raise RuntimeError('FFmpeg required to join audio chapters in this output format')
        from .audio import combine_wav
        combine_wav(inputs,target)
        return
    codecs={'.wav':'pcm_s16le','.mp3':'libmp3lame','.m4a':'aac','.flac':'flac','.ogg':'libvorbis'}
    with tempfile.TemporaryDirectory(prefix='openmukti-audio-join-',dir=str(target.parent)) as tmp:
        path=Path(tmp)/'input.ffconcat'
        lines=['ffconcat version 1.0']
        for file in inputs:
            escaped=file.resolve().as_posix().replace("'", "'\\''")
            lines.append(f"file '{escaped}'")
        path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
        output=Path(tmp)/('joined'+target.suffix)
        _run([ffmpeg,'-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',str(path),'-vn','-c:a',codecs[target.suffix.lower()],str(output)],control)
        os.replace(output,target)

def _merge_captions(chapters: list[Path], output: Path) -> None:
    entries = []
    offset = 0.0
    seq = 0
    timing = re.compile(r'(?P<begin>\d\d:\d\d:\d\d,\d{3})\s*-->\s*(?P<end>\d\d:\d\d:\d\d,\d{3})')
    def decode(t):
        h,m,rest = t.split(':')
        seconds,ms = rest.split(',')
        return int(h)*3600 + int(m)*60 + int(seconds) + int(ms)/1000
    from .video import _srt_time
    for chapter in chapters:
        file = chapter.with_suffix('.srt')
        if not file.is_file():
            return
        text = file.read_text(encoding='utf-8-sig')
        for block in re.split(r'\n\s*\n',text.strip()):
            rows=block.splitlines()
            index = next((i for i,line in enumerate(rows) if timing.search(line)),None)
            if index is None:
                continue
            match=timing.search(rows[index])
            seq+=1
            subtitle='\n'.join(rows[index+1:]).strip()
            entries.append(f'{seq}\n{_srt_time(offset+decode(match.group("begin")))} --> {_srt_time(offset+decode(match.group("end")))}\n{subtitle}\n')
        offset += audio_duration(chapter)
    if entries:
        output.with_suffix('.srt').write_text('\n'.join(entries),encoding='utf-8')


def export_books(books: list[Book], output_dir: str | Path, *, settings: SpeechSettings | None = None, engine: SpeechEngine | None = None, speech_options: JobOptions = JobOptions(), options: BookExportOptions = BookExportOptions(), control: RunControl | None = None, progress: Callable[[int,int,str], None] | None = None, dry_run: bool = False, voice_project=None) -> dict:
    if options.mode not in ('book', 'chapters', 'both'):
        raise ValueError('Export mode must be book, chapters or both')
    if options.video_format not in ('mp4', 'mkv', 'mov', 'webm'):
        raise ValueError('Video format must be mp4, mkv, mov, webm')
    if options.output_type not in ('audio','video'):
        raise ValueError('Output type must be audio or video')
    if options.audio_format not in ('wav','mp3','m4a','flac','ogg'):
        raise ValueError('Audio format must be wav, mp3, m4a, flac, ogg')
    if not books:
        raise ValueError('No books to process')
    destination = Path(output_dir).expanduser().resolve()
    if not dry_run:
        destination.mkdir(parents=True, exist_ok=True)
    results = {'books': [], 'failures': [], 'videos': [], 'audio': [], 'outputs': [], 'dry_run': dry_run}
    total = sum(len(b.chapters) for b in books)
    done = 0
    used = set()
    for book in books:
        base_name = safe_name(book.title)
        unique = base_name
        count = 2
        while unique.casefold() in used:
            unique = safe_name(base_name + f'-{count}')
            count += 1
        used.add(unique.casefold())
        book_folder = destination / unique
        chapter_folder = book_folder / 'chapters'
        extension = options.audio_format if options.output_type=='audio' else options.video_format
        combined = book_folder / (unique + '.' + extension)
        project = __import__('openvoice.character_voices',fromlist=['VoiceProject']).VoiceProject.load(book.voice_project) if book.voice_project else voice_project
        chapter_videos: list[Path] = []
        book_report = {'book': book.title, 'output': str(book_folder), 'chapters': [], 'combined': None}
        results['books'].append(book_report)
        if not dry_run:
            chapter_folder.mkdir(parents=True, exist_ok=True)
        book_failed = False
        if options.mode == 'book' and options.skip_existing and combined.is_file() and combined.stat().st_size:
            book_report['combined'] = str(combined)
            for chapter in book.chapters:
                book_report['chapters'].append({'chapter':chapter.title,'cover':[str(p) for p in chapter.images],'output':None,'status':'skipped'})
                done += 1
                if progress:
                    progress(done,total,f'{book.title}: {chapter.title}')
            continue
        with tempfile.TemporaryDirectory(prefix='openvoice-book-') if not dry_run else tempfile.TemporaryDirectory(prefix='openvoice-plan-') as temp:
            for n, chapter in enumerate(book.chapters, 1):
                if control:
                    control.check()
                name = f'{n:04d} - {safe_name(chapter.title)}.{extension}'
                output = chapter_folder / name if options.mode in ('chapters', 'both') else Path(temp) / name
                record = {'chapter': chapter.title, 'cover': [str(p) for p in chapter.images], 'output': str(output) if options.mode != 'book' else None, 'status': 'planned'}
                book_report['chapters'].append(record)
                try:
                    if options.output_type=='video' and not chapter.images:
                        raise ValueError(f'No matching cover for {chapter.title}. Add a cover image or use a manifest.')
                    for image in chapter.images:
                        if not image.is_file():
                            raise FileNotFoundError(f'Cover not found: {image}')
                    if chapter.text_file is not None and not chapter.text_file.is_file():
                        raise FileNotFoundError(f'Document not found: {chapter.text_file}')
                    if chapter.audio is not None and not chapter.audio.is_file():
                        raise FileNotFoundError(f'Audio not found: {chapter.audio}')
                    if dry_run:
                        record['status'] = 'planned'
                        chapter_videos.append(output)
                    elif options.skip_existing and output.exists() and output.stat().st_size:
                        chapter_videos.append(output)
                        record['status'] = 'skipped'
                    else:
                        content = _chapter_text(chapter, options.gutenberg if book.gutenberg is None else book.gutenberg)
                        if not chapter.audio and not content.strip():
                            raise ValueError(f'Chapter has no narration text: {chapter.title}')
                        if not chapter.audio and project is None and (engine is None or settings is None):
                            raise ValueError('A voice engine is required for chapters without recorded audio')
                        if options.output_type=='audio':
                            if chapter.audio:
                                import shutil
                                if chapter.audio.suffix.lower()==output.suffix.lower():
                                    shutil.copyfile(chapter.audio,output)
                                else:
                                    from .audiofx import process_audio
                                    process_audio('convert',[chapter.audio],output)
                            elif project is not None:
                                from .multivoice import render_multivoice
                                render_multivoice(content,output,project,control=control,default_engine=engine,default_settings=settings,speech_options=speech_options)
                            else:
                                from .service import render_text
                                render_text(content,output,engine,settings,speech_options,control=control)
                        elif project is not None and not chapter.audio:
                            from .multivoice import render_multivoice_video
                            render_multivoice_video(content,chapter.images,output,project,video_options=options.video,control=control,default_engine=engine,default_settings=settings,speech_options=speech_options)
                        else:
                            render_video(chapter.images, output, audio=chapter.audio, text=content, engine=engine if not chapter.audio else None, settings=settings if not chapter.audio else None, speech_options=speech_options, video_options=options.video, control=control)
                        chapter_videos.append(output)
                        record['status'] = 'created'
                    if record['status'] != 'planned' and options.mode in ('chapters','both'):
                        results['videos' if options.output_type=='video' else 'audio'].append(str(output))
                        results['outputs'].append(str(output))
                except (OSError, RuntimeError, ValueError) as exc:
                    record['status'] = 'failed'
                    record['error'] = str(exc)
                    results['failures'].append({'book': book.title, 'chapter': chapter.title, 'error': str(exc)})
                    book_failed = True
                    if not options.continue_on_error:
                        raise
                finally:
                    done += 1
                    if progress:
                        progress(done, total, f'{book.title}: {chapter.title}')
            if options.mode in ('book','both') and not book_failed and chapter_videos:
                if dry_run:
                    book_report['combined'] = str(combined)
                elif options.skip_existing and combined.is_file() and combined.stat().st_size:
                    book_report['combined'] = str(combined)
                else:
                    try:
                        if options.output_type=='audio':
                            _concat_audios(chapter_videos,combined,control)
                        else:
                            _concat_videos(chapter_videos,combined,control)
                        if options.video.captions and options.output_type=='video':
                            _merge_captions(chapter_videos, combined)
                        book_report['combined'] = str(combined)
                        results['videos' if options.output_type=='video' else 'audio'].append(str(combined))
                        results['outputs'].append(str(combined))
                    except (OSError, RuntimeError, ValueError) as exc:
                        results['failures'].append({'book':book.title,'chapter':'combined','error':str(exc)})
                        if not options.continue_on_error:
                            raise
        if not dry_run:
            (book_folder / 'export-report.json').write_text(json.dumps(book_report, ensure_ascii=False, indent=2), encoding='utf-8')
    if not dry_run:
        (destination / 'openvoice-batch-report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    return results
