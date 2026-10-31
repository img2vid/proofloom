from __future__ import annotations
import json
import shutil
import subprocess
import wave
from pathlib import Path
import pytest
from openvoice.audiobooks import Book, Chapter, BookExportOptions, discover_books, load_manifest, export_books, safe_name, _match_cover
from openvoice.video import VideoOptions, audio_duration

def test_cover_mapping_and_book_discovery(tmp_path):
    library = tmp_path / 'library'
    for name in ['Story A', 'Story B']:
        folder = library / name
        folder.mkdir(parents=True)
        for n in (1, 2):
            (folder / f'Chapter {n}.txt').write_text(f'Chapter {n}\n\nThis is chapter {n}.', encoding='utf-8')
            (folder / f'{n:02d} - cover.png').write_bytes(b'PNG')
    books = discover_books(library)
    assert len(books) == 2
    assert all((len(book.chapters) == 2 for book in books))
    assert all((c.images and c.images[0].name[:2] == f'{i:02d}' for book in books for i, c in enumerate(book.chapters, 1)))

def test_manifest_custom_cover_and_dry_run(tmp_path):
    cover = tmp_path / 'cover.png'
    cover.write_bytes(b'test')
    doc = tmp_path / 'Chapter One.txt'
    doc.write_text('Hello world', encoding='utf-8')
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps({'books': [{'title': 'Book / One', 'chapters': [{'title': 'Opening', 'text_file': doc.name, 'cover': cover.name}, {'title': 'Ending', 'text': 'Goodbye', 'cover': cover.name}]}]}))
    books = load_manifest(manifest)
    report = export_books(books, tmp_path / 'output', options=BookExportOptions(), dry_run=True)
    assert len(report['books']) == 1
    assert not report['failures']
    assert len(report['books'][0]['chapters']) == 2
    assert not (tmp_path / 'output').exists()
    assert safe_name('a/b\\c:d*e') == 'a b c d e'

def test_bulk_dry_run_cli(tmp_path):
    from openvoice.cli import main
    (tmp_path / 'chapter1.txt').write_text('Chapter 1\n\nThis is a test.', encoding='utf-8')
    (tmp_path / 'chapter1.png').write_bytes(b'test')
    assert main(['audiobooks', '--folder', str(tmp_path), '--output-dir', str(tmp_path / 'out'), '--dry-run']) == 0

def test_ambiguous_cover_detected(tmp_path):
    a = tmp_path / '1-cover.png'
    b = tmp_path / '1-illustration.png'
    for x in (a, b):
        x.write_bytes(b'123')
    with pytest.raises(ValueError, match='Ambiguous'):
        _match_cover('Chapter 1', [a, b])

def _audio(path):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b'\x00\x00' * (8000 * 2))

@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='needs FFmpeg')
def test_real_multichapter_video_and_multi_book_bulk(tmp_path):
    pil = pytest.importorskip('PIL.Image')
    books = []
    for b in (1, 2):
        chapters = []
        for n in (1, 2):
            img = tmp_path / f'{b}-{n}.png'
            pil.new('RGB', (120, 60), (b * 65, n * 90, 110)).save(img)
            audio = tmp_path / f'{b}-{n}.wav'
            _audio(audio)
            chapters.append(Chapter(f'Chapter {n}', [img], text=f'Story {b} chapter {n}', audio=audio))
        books.append(Book(f'Book {b}', chapters))
    output = tmp_path / 'result'
    report = export_books(books, output, options=BookExportOptions(mode='both', video=VideoOptions(resolution='360p', fps=24)))
    assert not report['failures'], report['failures']
    assert len(report['videos']) == 6
    for item in report['books']:
        assert item['combined'] and Path(item['combined']).is_file()
        assert audio_duration(item['combined']) >= 3.8
        assert all((ch['status'] == 'created' for ch in item['chapters']))
        assert len(set((ch['cover'][0] for ch in item['chapters']))) == 2
    assert (output / 'openvoice-batch-report.json').is_file()

def test_book_mode_tracks_only_persistent_output(tmp_path):
    from openvoice.audiobooks import Book, Chapter, export_books
    source = tmp_path / 'chapter.txt'
    source.write_text('Text')
    cover = tmp_path / 'image.png'
    cover.write_bytes(b'X')
    report = export_books([Book('Book', [Chapter('Part 1', [cover], text_file=source)])], tmp_path / 'out', options=BookExportOptions(mode='book'), dry_run=True)
    assert report['books'][0]['chapters'][0]['output'] is None
    assert not report['videos']

def test_manifest_ebook_chapter_covers(tmp_path):
    ebook = tmp_path / 'book.txt'
    ebook.write_text('Chapter 1\n\nFirst chapter\n\nChapter 2\n\nSecond chapter', encoding='utf-8')
    for n in [1, 2]:
        (tmp_path / f'{n}.png').write_bytes(b'test')
    m = tmp_path / 'manifest.json'
    m.write_text(json.dumps({'title': 'Book', 'ebook': 'book.txt', 'chapter_covers': {'1': '1.png', '2': '2.png'}}))
    books = load_manifest(m)
    assert books[0].chapters[0].images[0].name == '1.png'
    assert books[0].chapters[1].images[0].name == '2.png'
