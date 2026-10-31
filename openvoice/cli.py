from __future__ import annotations
import argparse
import json
import sys
import tempfile
from pathlib import Path
from . import __version__
from .audio import write_raw_pcm
from .audiofx import audio_info, process_audio
from .documents import read_document
from .fftools import media_tools_status
from .engines import SpeechSettings, all_engines, get_engine
from .service import JobOptions, render_text, speak_text
from .texttools import TOOLS, text_stats, transform
from .video import ASPECTS, HEIGHTS, VideoOptions, render_video
from .audiobooks import load_manifest, discover_books, export_books, BookExportOptions
from .edition import APP_NAME, EDITION, GUTENBERG_ENABLED
from .voice_catalog import fetch_catalog, download_selected, voice_download_size
from .character_voices import VoiceProject, auto_profiles, detect_language, detected_languages
from .multivoice import render_multivoice,render_multivoice_video
from .piper_models import discover_voices
from .project_archive import ProjectData, save_project, load_project
if GUTENBERG_ENABLED:
    from .gutenberg import clean_gutenberg, GutenbergOptions

def _general(parser: argparse.ArgumentParser) -> None:
    parser.add_argument('--engine', choices=['auto', *all_engines().keys()], default='auto')
    parser.add_argument('-n', '--voice', default='')
    parser.add_argument('-s', '--rate', type=int, default=0)
    parser.add_argument('-p', '--pitch', type=int, default=0)
    parser.add_argument('-v', '--volume', type=int, default=100)
    parser.add_argument('--model', default='')
    parser.add_argument('-d', '--dictionary', action='append', default=[])
    parser.add_argument('--ipa-dictionary',action='append',default=[],help='IPA pronunciation dictionary (.json or .tsv); supports per-language words')
    parser.add_argument('--language',default='auto',help='Language for IPA rule matching (ISO code; auto detects script/text)')
    parser.add_argument('--repair-ocr', action='store_true')
    parser.add_argument('--chunk-size', type=int, default=450)
    parser.add_argument('--pause-ms', type=int, default=80)
    parser.add_argument('--apply', action='append', default=[], choices=list(TOOLS), metavar='TOOL')

def _text_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument('text', nargs='?')
    parser.add_argument('-t', '--text', dest='text_args', action='append')
    parser.add_argument('-f', '--file', action='append')
    parser.add_argument('-i', '--stdin', action='store_true')

def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='openmukti', description=f'{APP_NAME} Version 1. Inline IPA: <ipa:həˈloʊ|hello> (no dictionary required)')
    parser.add_argument('--version', action='version', version=f'{APP_NAME} {__version__}')
    parser.add_argument('-?', action='help')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('gui', help='Start desktop GUI')
    ocr = sub.add_parser('ocr', help='Recognize scanned PDFs, images, ZIP/CBZ books or page-image folders locally')
    ocr.add_argument('source', nargs='?')
    ocr.add_argument('-w', '--output', help='Write recognized UTF-8 text')
    ocr.add_argument('--json', action='store_true', help='Output page text, confidence and warnings as JSON')
    ocr.add_argument('--status', action='store_true', help='List Tesseract availability and installed languages')
    ocr.add_argument('--language', default='eng')
    ocr.add_argument('--dpi', type=int, default=300)
    ocr.add_argument('--preprocessing', choices=['auto','adaptive','otsu','contrast','original'], default='auto')
    ocr.add_argument('--contrast', type=float, default=1.4)
    ocr.add_argument('--psm', type=int, choices=[3,4,6,11,12], default=3)
    ocr.add_argument('--first-page', type=int, default=1)
    ocr.add_argument('--last-page', type=int, default=0)
    ocr.add_argument('--force-ocr', action='store_true')
    ocr.add_argument('--split-spreads', action='store_true')
    ocr.add_argument('--no-deskew', action='store_true')
    ocr.add_argument('--no-denoise', action='store_true')
    ocr.add_argument('--no-rotate', action='store_true')
    ocr.add_argument('--correct', action='store_true', help='Apply top English spelling/OCR suggestions to recognized text')
    spelling = sub.add_parser('spellcheck', help='Offline English spelling and OCR restoration')
    spelling.add_argument('-f', '--file', required=True)
    spelling.add_argument('-w', '--output')
    spelling.add_argument('--correct', action='store_true')
    spelling.add_argument('--safe-only', action='store_true')
    spelling.add_argument('--check-names', action='store_true')
    spelling.add_argument('--json', action='store_true')
    pack = sub.add_parser('project-pack', help='Create a portable .oamproj from text, voices and images')
    pack.add_argument('-f','--file',required=True)
    pack.add_argument('-w','--output',required=True)
    pack.add_argument('--voice-project',help='Optional Character Voices JSON file')
    pack.add_argument('--images',nargs='*',default=[])
    pack.add_argument('--model',default='',help='Optional installed Piper ONNX model')
    pack.add_argument('--ipa-dictionary',default='',help='Optional IPA dictionary')
    unpack = sub.add_parser('project-unpack',help='Verify and unpack a complete Openmukti project')
    unpack.add_argument('project')
    unpack.add_argument('--output-dir',required=True)
    create = sub.add_parser('project-render',help='Render from a saved project with all its character voices')
    create.add_argument('project')
    create.add_argument('-w','--output',required=True)
    verify = sub.add_parser('project-verify',help='Verify all checksums and content in a saved project')
    verify.add_argument('project')
    catalog = sub.add_parser('voice-catalog',help='Browse Piper voices from the official language-organized catalog')
    catalog.add_argument('--language',default='',help='Language code or English language name')
    catalog.add_argument('--refresh',action='store_true')
    catalog.add_argument('--json',action='store_true')
    downloads = sub.add_parser('voice-download',help='Download selected Piper ONNX model(s), verified by checksum')
    downloads.add_argument('models',nargs='*',help='Exact catalog voice keys, e.g. en_US-amy-medium')
    downloads.add_argument('--language',default='',help='Download all voices for a language, requires --all')
    downloads.add_argument('--all',action='store_true',help='Download all catalog models or all in --language')
    downloads.add_argument('--yes',action='store_true',help='Confirm potentially large downloads without interactive prompt')
    downloads.add_argument('--refresh',action='store_true')
    detect = sub.add_parser('detect-language',help='Detect language from one or more paragraphs, offline heuristic')
    _text_args(detect)
    detect.add_argument('--json',action='store_true')
    create_profiles = sub.add_parser('character-profiles',help='Detect characters and create a multilingual voice project')
    _text_args(create_profiles)
    create_profiles.add_argument('-w','--output',required=True)
    multi = sub.add_parser('multivoice',help='Create character-voiced audio or video from a voice project')
    _text_args(multi)
    multi.add_argument('--project',required=True,help='Saved character voice profile JSON')
    multi.add_argument('--images',nargs='*',default=[],help='Required for video exports')
    multi.add_argument('-w','--output',required=True)
    multi.add_argument('--ipa-dictionary',action='append',default=[],help='IPA dictionary for character voice synthesis')
    multi.add_argument('--auto-tag',action='store_true',help='Guess character from dialogue attribution; review output')
    multi.add_argument('--aspect',choices=list(ASPECTS),default='16:9')
    multi.add_argument('--resolution',choices=list(HEIGHTS),default='720p')
    ipa_check = sub.add_parser('ipa-check',help='Validate IPA pronunciation dictionary and show entries')
    ipa_check.add_argument('dictionary',nargs='+')
    ipa_check.add_argument('--language',default='*')
    media = sub.add_parser('media-tools', help='Show built-in FFmpeg and FFprobe availability')
    media.add_argument('--json', action='store_true')
    engines = sub.add_parser('engines', help='List installed speech engines')
    engines.add_argument('--json', action='store_true')
    voices = sub.add_parser('voices', help='List available voices')
    voices.add_argument('--engine', choices=['auto', *all_engines().keys()], default='auto')
    voices.add_argument('--model', default='')
    voices.add_argument('--json', action='store_true')
    speak = sub.add_parser('speak', help='Speak text')
    _general(speak)
    _text_args(speak)
    render = sub.add_parser('render', help='Render speech to audio')
    _general(render)
    _text_args(render)
    render.add_argument('-w', '--output', required=True)
    batch = sub.add_parser('batch', help='Convert multiple documents')
    _general(batch)
    batch.add_argument('files', nargs='+')
    batch.add_argument('--output-dir', required=True)
    batch.add_argument('--format', choices=['wav', 'mp3', 'flac', 'ogg', 'm4a', 'opus', 'aac', 'aiff', 'wma'], default='wav')
    batch.add_argument('--dry-run', action='store_true')
    batch.add_argument('--skip-existing', action='store_true')
    tools = sub.add_parser('tools', help='List all available text transformations')
    tools.add_argument('--json', action='store_true')
    tools.add_argument('--group', default='')
    change = sub.add_parser('transform', help='Apply text transformations')
    _text_args(change)
    change.add_argument('--apply', action='append', required=True, choices=list(TOOLS), metavar='TOOL')
    change.add_argument('-w', '--output')
    stats = sub.add_parser('stats', help='Report document and reading statistics')
    _text_args(stats)
    stats.add_argument('--wpm', type=int, default=160)
    stats.add_argument('--json', action='store_true')
    split = sub.add_parser('split', help='Split a text into chunks or sentences')
    _text_args(split)
    split.add_argument('--chunk-size', type=int, default=450)
    split.add_argument('--sentences', action='store_true')
    split.add_argument('--json', action='store_true')
    inspect = sub.add_parser('audio-info', help='Inspect an existing audio file')
    inspect.add_argument('input')
    audio = sub.add_parser('audio', help='Modify existing audio with FFmpeg')
    audio.add_argument('operation', choices=['convert', 'join', 'trim', 'speed', 'gain', 'normalize', 'reverse', 'fade-in', 'fade-out', 'mono', 'stereo', 'resample', 'denoise', 'compress'])
    audio.add_argument('inputs', nargs='+')
    audio.add_argument('-w', '--output', required=True)
    audio.add_argument('--start', type=float, default=0)
    audio.add_argument('--duration', type=float, default=0)
    audio.add_argument('--speed', type=float, default=1)
    audio.add_argument('--gain', type=float, default=0)
    audio.add_argument('--sample-rate', type=int, default=0)
    audio.add_argument('--channels', type=int, default=0)
    audio.add_argument('--fade-seconds', type=float, default=1)
    audio.add_argument('--compression', type=int, default=50)
    video = sub.add_parser('video', help='Create an audiobook video from images with narration')
    _general(video)
    _text_args(video)
    video.add_argument('--images', nargs='+', required=True, help='Image paths, in display order')
    video.add_argument('--audio', help='Optional existing audio; skips speech synthesis')
    video.add_argument('-w', '--output', required=True, help='MP4, MKV, MOV or WebM video')
    video.add_argument('--aspect', choices=list(ASPECTS), default='16:9')
    video.add_argument('--resolution', choices=list(HEIGHTS), default='720p')
    video.add_argument('--fps', type=int, choices=[24, 25, 30, 60], default=30)
    video.add_argument('--fit', choices=['contain', 'cover'], default='contain')
    video.add_argument('--background', default='black')
    video.add_argument('--captions', action='store_true', help='Write an approximate-timing SRT subtitle sidecar')
    video.add_argument('--crf', type=int, default=23)
    if GUTENBERG_ENABLED:
        gt = sub.add_parser('gutenberg', help='Clean Gutenberg text or bulk ebook files')
        gt.add_argument('files', nargs='+')
        gt.add_argument('--output-dir', required=True)
        gt.add_argument('--keep-toc', action='store_true')
        gt.add_argument('--keep-placeholders', action='store_true')
        gt.add_argument('--keep-page-numbers', action='store_true')
        gt.add_argument('--no-reflow', action='store_true')
        gt.add_argument('--split-chapters', action='store_true')
        gt.add_argument('--json', action='store_true')
    books = sub.add_parser('audiobooks', help='Bulk audio-only or video audiobook production with optional multi-speaker narration')
    _general(books)
    source = books.add_mutually_exclusive_group(required=True)
    source.add_argument('--folder', help='Folder with one subfolder per book; auto-match covers by filename/chapter number')
    source.add_argument('--manifest', help='JSON manifest with explicit books, chapters and cover paths')
    books.add_argument('--output-dir', required=True)
    books.add_argument('--mode', choices=['book','chapters','both'], default='both')
    books.add_argument('--format', choices=['mp4','mkv','mov','webm'], default='mp4')
    books.add_argument('--output-type',choices=['audio','video'],default='video')
    books.add_argument('--audio-format',choices=['wav','mp3','m4a','flac','ogg'],default='mp3')
    books.add_argument('--voices-project',help='Voice project JSON shared by all books; individual manifests can override')
    if GUTENBERG_ENABLED:
        books.add_argument('--gutenberg', action='store_true', help='Clean Gutenberg headers, footers and artifacts before narration')
    books.add_argument('--dry-run', action='store_true')
    books.add_argument('--skip-existing', action='store_true')
    books.add_argument('--fail-fast', action='store_true')
    books.add_argument('--aspect', choices=list(ASPECTS), default='16:9')
    books.add_argument('--resolution', choices=list(HEIGHTS), default='720p')
    books.add_argument('--fps', type=int, choices=[24,25,30,60], default=30)
    books.add_argument('--fit', choices=['contain','cover'], default='contain')
    books.add_argument('--captions', action='store_true')
    books.add_argument('--crf', type=int, default=23)
    books.add_argument('--json', action='store_true')
    return parser

def make_legacy_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog='openmukti', description=f'{APP_NAME} — direct command-line mode')
    _general(p)
    _text_args(p)
    p.add_argument('-w', '--output')
    p.add_argument('-o', '--raw-stdout', action='store_true')
    p.add_argument('--stdout-wav', action='store_true')
    p.add_argument('-l', '--list-voices', action='store_true')
    p.add_argument('-?', action='help')
    p.add_argument('--version', action='version', version=f'{APP_NAME} {__version__}')
    return p

def _validate(args: argparse.Namespace) -> None:
    if not -10 <= args.rate <= 10:
        raise ValueError('Rate must be between -10 and 10')
    if not -10 <= args.pitch <= 10:
        raise ValueError('Pitch must be between -10 and 10')
    if not 0 <= args.volume <= 100:
        raise ValueError('Volume must be between 0 and 100')
    if not 16 <= args.chunk_size <= 10000:
        raise ValueError('Chunk size must be 16..10000')

def _load_input(args: argparse.Namespace) -> str:
    parts = []
    if args.text:
        parts.append(args.text)
    parts.extend(args.text_args or [])
    for file in args.file or []:
        parts.append(read_document(file))
    if args.stdin or (not parts and (not sys.stdin.isatty())):
        parts.append(sys.stdin.read())
    result = '\n\n'.join(parts).strip()
    if not result:
        raise ValueError('No input text: pass text, -t, -f or --stdin')
    return result

def _settings(args: argparse.Namespace) -> SpeechSettings:
    _validate(args)
    return SpeechSettings(voice=args.voice, rate=args.rate, pitch=args.pitch, volume=args.volume, model=args.model)

def _options(args: argparse.Namespace) -> JobOptions:
    return JobOptions(chunk_size=args.chunk_size, pause_ms=args.pause_ms, repair_ocr=args.repair_ocr, dictionaries=tuple(args.dictionary), operations=tuple(args.apply),ipa_dictionaries=tuple(args.ipa_dictionary),language=args.language)

def _list_voices(engine_name: str, model: str, json_output: bool=False) -> None:
    engine = get_engine(engine_name, model)
    names = engine.voices()
    if json_output:
        print(json.dumps({'engine': engine.key, 'voices': names}, ensure_ascii=False, indent=2))
    else:
        print(f'Engine: {engine.key} — {engine.label}')
        print('\n'.join(names) if names else 'No voice identifiers available. External models may be required.')

def _run_speech_command(args, *, output: str | None=None, raw: bool=False, stdout_wav: bool=False) -> None:
    settings = _settings(args)
    options = _options(args)
    engine = get_engine(args.engine, args.model)
    if settings.pitch and (not engine.supports_pitch) or (settings.rate and (not engine.supports_rate)):
        print(f'Notice: {engine.key} ignores unsupported pitch or rate settings.', file=sys.stderr)
    text = _load_input(args)
    if raw or stdout_wav:
        with tempfile.TemporaryDirectory(prefix='openvoice-pipe-') as work:
            wav = Path(work) / 'output.wav'
            render_text(text, wav, engine, settings, options)
            if raw:
                write_raw_pcm(wav, sys.stdout.buffer)
            else:
                with wav.open('rb') as stream:
                    import shutil
                    shutil.copyfileobj(stream, sys.stdout.buffer)
            sys.stdout.buffer.flush()
    elif output:
        print(f'Saved: {render_text(text, output, engine, settings, options)}')
    else:
        speak_text(text, engine, settings, options)

def _batch(args) -> int:
    settings = _settings(args)
    options = _options(args)
    engine = None if args.dry_run else get_engine(args.engine, args.model)
    destination = Path(args.output_dir)
    failures = 0
    used = set()
    for file in args.files:
        path = Path(file)
        suffix = f'.{args.format}'
        dest = destination / (path.stem + suffix)
        number = 2
        while str(dest).lower() in used:
            dest = destination / f'{path.stem}-{number}{suffix}'
            number += 1
        used.add(str(dest).lower())
        if dest.exists() and args.skip_existing:
            print(f'Skipped: {dest}')
            continue
        if args.dry_run:
            print(f'Would convert: {path} -> {dest}')
            continue
        try:
            render_text(read_document(path), dest, engine, settings, options)
            print(f'Saved: {dest}')
        except (OSError, ValueError, RuntimeError) as exc:
            failures += 1
            print(f'FAILED {path}: {exc}', file=sys.stderr)
    return 1 if failures else 0

def main(argv: list[str] | None=None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    commands = {'project-pack','project-unpack','project-render','project-verify','voice-catalog','voice-download','detect-language','character-profiles','multivoice','ipa-check','audiobooks', 'gui', 'engines', 'voices', 'speak', 'render', 'batch', 'tools', 'transform', 'stats', 'split', 'audio-info', 'audio', 'video', 'media-tools'}
    commands.update({'ocr', 'spellcheck'})
    if GUTENBERG_ENABLED:
        commands.add('gutenberg')
    try:
        if not GUTENBERG_ENABLED and argv and argv[0] == 'gutenberg':
            raise ValueError('Gutenberg Mode is not included in Version 1')
        if (argv and argv[0] in commands) or argv in (['--help'], ['-h'], ['--version']):
            args = make_parser().parse_args(argv)
            if args.command == 'project-pack':
                voice = VoiceProject.load(args.voice_project) if args.voice_project else VoiceProject()
                project = ProjectData(text=read_document(args.file),voice_project=voice,
                                      current_filename=Path(args.file).name,
                                      settings={'engine':'auto','model':args.model,'ipa_dictionary':args.ipa_dictionary},
                                      video_images=[Path(x) for x in args.images])
                print(f'Saved: {save_project(args.output,project)}')
                return 0
            if args.command in ('project-unpack','project-render','project-verify'):
                with tempfile.TemporaryDirectory(prefix='openmukti-project-cli-') as temporary:
                    root=Path(args.output_dir) if args.command=='project-unpack' else Path(temporary)
                    saved=load_project(args.project,root)
                    if args.command == 'project-verify':
                        print(json.dumps({'valid':True,'characters':len(saved.voice_project.profiles),
                                          'books':len(saved.books),'chapters':sum(len(x.chapters) for x in saved.books),
                                          'image_count':len(saved.video_images)},indent=2))
                        return 0
                    if args.command == 'project-unpack':
                        (root/'project-text.txt').write_text(saved.text,encoding='utf-8')
                        saved.voice_project.save(root/'character-voices.json')
                        print(f'Project extracted: {root}')
                        return 0
                    settings=saved.settings
                    engine_name=settings.get('engine','auto')
                    speech=SpeechSettings(voice=settings.get('voice',''),model=settings.get('model',''),
                                         rate=int(settings.get('rate',0)),pitch=int(settings.get('pitch',0)),
                                         volume=int(settings.get('volume',100)))
                    opts=JobOptions(repair_ocr=bool(settings.get('ocr',False)),
                                    dictionaries=(settings['dictionary'],) if settings.get('dictionary') else (),
                                    ipa_dictionaries=(settings['ipa_dictionary'],) if settings.get('ipa_dictionary') else ())
                    script=saved.text
                    if saved.active_character.casefold()!='narrator':
                        script=f'[{saved.active_character}] '+script
                    target=Path(args.output)
                    engine=get_engine(engine_name,speech.model)
                    if saved.use_character_voices:
                        if target.suffix.lower() in ('.mp4','.mkv','.mov','.webm') and saved.video_audio:
                            result=render_video(saved.video_images,target,audio=saved.video_audio,text=saved.text,video_options=VideoOptions(**saved.video_settings) if saved.video_settings else VideoOptions())
                        elif target.suffix.lower() in ('.mp4','.mkv','.mov','.webm'):
                            if not saved.video_images:
                                raise ValueError('Saved project has no video images')
                            video_opts=VideoOptions(**saved.video_settings) if saved.video_settings else VideoOptions()
                            result=render_multivoice_video(script,saved.video_images,target,saved.voice_project,
                                            video_options=video_opts,default_engine=engine,default_settings=speech,speech_options=opts)
                        else:
                            result=render_multivoice(script,target,saved.voice_project,
                                            default_engine=engine,default_settings=speech,speech_options=opts)
                    else:
                        if target.suffix.lower() in ('.mp4','.mkv','.mov','.webm'):
                            result=render_video(saved.video_images,target,audio=saved.video_audio,text=saved.text,
                                                engine=engine,settings=speech,speech_options=opts,
                                                video_options=VideoOptions(**saved.video_settings) if saved.video_settings else VideoOptions())
                        else:
                            result=render_text(saved.text,target,engine,speech,opts)
                    print(f'Saved: {result}')
                    return 0
            if args.command == 'gui':
                from .gui import main as launch
                return launch()
            if args.command == 'ocr':
                from .ocr import OCRSettings, import_ocr, ocr_status
                from .spelling import EnglishSpeller, apply_corrections
                if args.status:
                    print(json.dumps(ocr_status(), ensure_ascii=False, indent=2))
                    return 0
                if not args.source:
                    raise ValueError('Pass an OCR source file or folder, or use --status.')
                result = import_ocr(args.source, OCRSettings(language=args.language, dpi=args.dpi,
                    preprocessing=args.preprocessing, contrast=args.contrast, psm=args.psm,
                    first_page=args.first_page, last_page=args.last_page, force_ocr=args.force_ocr,
                    split_spreads=args.split_spreads, denoise=not args.no_denoise,
                    deskew=not args.no_deskew, auto_rotate=not args.no_rotate),
                    progress=lambda page,total,label: print(f'Page {page}: {label}', file=sys.stderr))
                content = result.text
                if args.correct:
                    checker = EnglishSpeller()
                    for page in result.pages:
                        page.text, _ = apply_corrections(page.text, checker.check(page.text, ocr=True))
                    content = result.text
                if args.json:
                    content = json.dumps(result.to_dict(), ensure_ascii=False, indent=2)
                if args.output:
                    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
                    Path(args.output).write_text(content, encoding='utf-8')
                else:
                    print(content)
                return 0
            if args.command == 'spellcheck':
                from dataclasses import asdict
                from .spelling import EnglishSpeller, apply_corrections
                checker = EnglishSpeller()
                original = read_document(args.file)
                issues = checker.check(original, ocr=True, check_names=args.check_names)
                content, count = apply_corrections(original, issues, safe_only=args.safe_only) if args.correct else (original, 0)
                if args.output:
                    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
                    Path(args.output).write_text(content, encoding='utf-8')
                if args.json:
                    print(json.dumps({'issues': [asdict(i) for i in issues], 'corrections': count, 'text': content}, ensure_ascii=False, indent=2))
                elif args.correct and not args.output:
                    print(content)
                else:
                    print(f'{len(issues)} issues; {count} corrections applied.')
                return 0
            if args.command == 'engines':
                items = [{'key': key, 'available': engine.available(), 'label': engine.label} for key, engine in all_engines().items()]
                print(json.dumps(items, indent=2) if args.json else '\n'.join((f"{v['key']:10} {('available' if v['available'] else 'unavailable'):11} {v['label']}" for v in items)))
                return 0
            if args.command == 'voices':
                _list_voices(args.engine, args.model, args.json)
                return 0
            if args.command == 'tools':
                matches = [t for t in TOOLS.values() if not args.group or args.group.casefold() in t.group.casefold()]
                print(json.dumps([{'id': t.name, 'title': t.title, 'group': t.group} for t in matches], indent=2) if args.json else '\n'.join((f'{t.name:34} {t.title} ({t.group})' for t in matches)))
                return 0
            if args.command == 'transform':
                result = transform(_load_input(args), args.apply)
                if args.output:
                    path = Path(args.output)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(result, encoding='utf-8')
                    print(f'Saved: {path}')
                else:
                    print(result)
                return 0
            if args.command == 'stats':
                data = text_stats(_load_input(args), args.wpm)
                print(json.dumps(data, ensure_ascii=False, indent=2) if args.json else '\n'.join((f'{key}: {value}' for key, value in data.items())))
                return 0
            if args.command == 'split':
                from .processing import split_text
                from .texttools import split_sentences
                segments = split_sentences(_load_input(args)) if args.sentences else split_text(_load_input(args), args.chunk_size)
                print(json.dumps(segments, ensure_ascii=False, indent=2) if args.json else '\n\n'.join(segments))
                return 0
            if args.command == 'media-tools':
                status = media_tools_status()
                if args.json:
                    print(json.dumps(status, ensure_ascii=False, indent=2))
                else:
                    for key, value in status.items():
                        state = 'integrated' if value['bundled'] else ('system fallback' if value['available'] else 'not available')
                        print(f"{key}: {state} | {value['version']} | {value['path']}")
                return 0 if all(item['available'] for item in status.values()) else 1
            if args.command == 'audio-info':
                print(json.dumps(audio_info(args.input), ensure_ascii=False, indent=2))
                return 0
            if args.command == 'audio':
                result = process_audio(args.inputs, args.output, operation=args.operation, start=args.start, duration=args.duration, speed=args.speed, gain=args.gain, sample_rate=args.sample_rate, channels=args.channels, fade_seconds=args.fade_seconds, compression=args.compression)
                print(f'Saved: {result}')
                return 0
            if GUTENBERG_ENABLED and args.command == 'gutenberg':
                from .gutenberg import split_chapters
                output = Path(args.output_dir)
                output.mkdir(parents=True, exist_ok=True)
                results = []
                for file in args.files:
                    try:
                        result = clean_gutenberg(read_document(file), GutenbergOptions(remove_toc=not args.keep_toc, remove_image_placeholders=not args.keep_placeholders, remove_page_numbers=not args.keep_page_numbers, reflow_paragraphs=not args.no_reflow))
                        stem = Path(file).stem
                        destination = output / f'{stem}-cleaned.txt'
                        destination.write_text(result.content, encoding='utf-8')
                        if args.split_chapters:
                            folder = output / (stem + '-chapters')
                            folder.mkdir(exist_ok=True)
                            for n, (title, content) in enumerate(split_chapters(result.content), 1):
                                (folder / f'{n:04d}.txt').write_text(content, encoding='utf-8')
                        results.append({'file':file, 'output':str(destination),'chapters':result.chapter_count,'removed_header':result.removed_header,'removed_footer':result.removed_footer,'removed_toc':result.removed_toc,'placeholders':result.removed_placeholders})
                    except (OSError, ValueError, RuntimeError) as exc:
                        results.append({'file': file, 'error':str(exc)})
                if args.json:
                    print(json.dumps(results, indent=2))
                else:
                    for r in results:
                        print('FAILED' if 'error' in r else 'Saved', r)
                return 1 if any('error' in r for r in results) else 0
            if args.command == 'voice-catalog':
                catalog=fetch_catalog(force=args.refresh)
                found=[v for v in catalog if not args.language or args.language.casefold() in (v.language+' '+v.language_name).casefold()]
                if args.json:
                    from dataclasses import asdict
                    print(json.dumps([asdict(v) for v in found],indent=2,ensure_ascii=False))
                else:
                    for v in found:
                        print(f'{v.language_name:16} {v.language:8} {v.key:36} {v.quality:8} {(v.model_bytes+v.config_bytes)/1048576:7.1f} MB')
                    print(f'{len(found)} voices')
                return 0
            if args.command == 'voice-download':
                catalog=fetch_catalog(force=args.refresh)
                selected=[v for v in catalog if v.key in args.models]
                if len(selected)!=len(set(args.models)):
                    missing=set(args.models)-{v.key for v in selected}
                    raise ValueError(f'Unknown voice models: {sorted(missing)}')
                if args.all:
                    selected=[v for v in catalog if not args.language or args.language.casefold() in (v.language+' '+v.language_name).casefold()]
                if not selected:
                    raise ValueError('No voices selected')
                size=voice_download_size(selected)
                if not args.yes:
                    if not sys.stdin.isatty():
                        raise ValueError('Pass --yes to confirm large downloads in non-interactive usage')
                    print(f'Download {len(selected)} models; estimated {size/1048576:,.1f} MB? [y/N] ',end='',flush=True)
                    if input().lower() not in ('y','yes'):
                        return 1
                result=download_selected(selected,progress=lambda n,total,key:print(f'{n}/{total} {key}',file=sys.stderr))
                for path in result:
                    print(path)
                return 0
            if args.command == 'ipa-check':
                from .ipa_pronunciation import load_pronunciations,language_matches
                rows=load_pronunciations(args.dictionary)
                matched=[row for row in rows if args.language=='*' or language_matches(row.language,args.language)]
                print(json.dumps([row.__dict__ for row in matched],ensure_ascii=False,indent=2))
                return 0
            if args.command == 'detect-language':
                content=_load_input(args)
                data=detected_languages(content)
                if args.json:
                    print(json.dumps(data,ensure_ascii=False))
                else:
                    for language,confidence in data:
                        print(f'{language}: heuristic confidence {confidence:.2f}')
                return 0
            if args.command == 'character-profiles':
                content=_load_input(args)
                project=auto_profiles(content,installed=[v.name for v in discover_voices()])
                project.save(args.output)
                print(f'Saved {len(project.profiles)} voice profiles: {args.output}')
                return 0
            if args.command == 'multivoice':
                project=VoiceProject.load(args.project)
                project.pronunciation_files.extend(args.ipa_dictionary)
                script=_load_input(args) if any([args.text,args.text_args,args.file,args.stdin]) else project.script
                if not script.strip():
                    raise ValueError('Voice project does not contain a script')
                if Path(args.output).suffix.lower() in {'.mp4','.mkv','.mov','.webm'}:
                    if not args.images:
                        raise ValueError('--images is required for multivoice video')
                    result=render_multivoice_video(script,args.images,args.output,project,video_options=VideoOptions(aspect=args.aspect,resolution=args.resolution),auto_tag=args.auto_tag)
                else:
                    result=render_multivoice(script,args.output,project,auto_tag=args.auto_tag)
                print(f'Saved: {result}')
                return 0
            if args.command == 'audiobooks':
                imported = load_manifest(args.manifest, gutenberg=getattr(args, 'gutenberg', False)) if args.manifest else discover_books(args.folder, gutenberg=getattr(args, 'gutenberg', False))
                missing_voice = any(c.audio is None for book in imported for c in book.chapters)
                engine = get_engine(args.engine, args.model) if missing_voice and not args.dry_run else None
                video_options = VideoOptions(aspect=args.aspect, resolution=args.resolution, fps=args.fps, fit=args.fit, captions=args.captions, crf=args.crf)
                opts = BookExportOptions(mode=args.mode, video=video_options, gutenberg=getattr(args, 'gutenberg', False), skip_existing=args.skip_existing, continue_on_error=not args.fail_fast, video_format=args.format,output_type=args.output_type,audio_format=args.audio_format)
                report = export_books(imported, args.output_dir, engine=engine, settings=_settings(args) if missing_voice and not args.dry_run else None, speech_options=_options(args), options=opts, voice_project=VoiceProject.load(args.voices_project) if args.voices_project else None,dry_run=args.dry_run, progress=None if args.json else lambda i,n,title: print(f'[{i}/{n}] {title}', file=sys.stderr))
                if args.json:
                    print(json.dumps(report, ensure_ascii=False, indent=2))
                else:
                    print(f'Processed {len(report["books"])} books; {len(report["outputs"])} outputs; {len(report["failures"])} errors. Report: {Path(args.output_dir) / "openvoice-batch-report.json"}')
                    for error in report['failures']:
                        print(f'ERROR {error}', file=sys.stderr)
                return 1 if report['failures'] else 0
            if args.command == 'video':
                opts = VideoOptions(aspect=args.aspect, resolution=args.resolution, fps=args.fps, fit=args.fit, background=args.background, captions=args.captions, crf=args.crf)
                narration = _load_input(args) if not args.audio or args.captions else ''
                engine = get_engine(args.engine, args.model) if not args.audio else None
                result = render_video(args.images, args.output, audio=args.audio, text=narration, engine=engine, settings=_settings(args) if not args.audio else None, speech_options=_options(args), video_options=opts)
                print(f'Saved: {result}')
                if opts.captions:
                    print(f'Approximate captions: {result.with_suffix(".srt")}')
                return 0
            if args.command == 'speak':
                _run_speech_command(args)
                return 0
            if args.command == 'render':
                _run_speech_command(args, output=args.output)
                return 0
            if args.command == 'batch':
                return _batch(args)
        elif not argv or argv == ['--gui']:
            from .gui import main as launch
            return launch()
        else:
            args = make_legacy_parser().parse_args(argv)
            if args.list_voices:
                _list_voices(args.engine, args.model)
                return 0
            if args.raw_stdout and args.stdout_wav:
                raise ValueError('Choose either -o or --stdout-wav')
            if args.output and (args.raw_stdout or args.stdout_wav):
                raise ValueError('Cannot combine -w with stdout audio')
            _run_speech_command(args, output=args.output, raw=args.raw_stdout, stdout_wav=args.stdout_wav)
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f'{APP_NAME} error: {exc}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('\nCancelled.', file=sys.stderr)
        return 130
if __name__ == '__main__':
    raise SystemExit(main())
