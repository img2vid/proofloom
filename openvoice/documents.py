from __future__ import annotations
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET
MAX_UNCOMPRESSED = 80 * 1024 * 1024

class DocumentError(RuntimeError):
    pass

class _HTMLText(HTMLParser):

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'li', 'tr', 'section'):
            self.out.append('\n')

    def handle_endtag(self, tag: str) -> None:
        if tag in ('script', 'style') and self.skip:
            self.skip -= 1
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'li', 'tr', 'section'):
            self.out.append('\n')

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.out.append(data)

def html_to_text(source: str) -> str:
    parser = _HTMLText()
    parser.feed(source)
    return ''.join(parser.out)

def _safe_zip_read(z: zipfile.ZipFile, item: str) -> bytes:
    obj = z.getinfo(item)
    if obj.file_size > MAX_UNCOMPRESSED:
        raise DocumentError('Document part is too large')
    return z.read(item)

def _docx_text(path: Path) -> str:
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(_safe_zip_read(z, 'word/document.xml'))
    paragraphs = []
    for p in root.iter(ns + 'p'):
        bits = []
        for node in p.iter():
            if node.tag == ns + 't':
                bits.append(node.text or '')
            elif node.tag == ns + 'tab':
                bits.append('\t')
            elif node.tag == ns + 'br':
                bits.append('\n')
        paragraphs.append(''.join(bits))
    return '\n'.join(paragraphs)

def _epub_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        container = ET.fromstring(_safe_zip_read(z, 'META-INF/container.xml'))
        opf_path = next((node.attrib['full-path'] for node in container.iter() if node.tag.endswith('rootfile')), None)
        if opf_path is None:
            raise DocumentError('EPUB package file is missing')
        opf = ET.fromstring(_safe_zip_read(z, opf_path))
        manifest = {node.attrib.get('id'): node.attrib.get('href') for node in opf.iter() if node.tag.endswith('item') and node.attrib.get('id') and node.attrib.get('href')}
        spine = [node.attrib['idref'] for node in opf.iter() if node.tag.endswith('itemref') and node.attrib.get('idref')]
        root_dir = PurePosixPath(opf_path).parent
        chapters = []
        for item_id in spine:
            href = manifest.get(item_id)
            if not href:
                continue
            href = href.split('#')[0].split('?')[0]
            candidate = root_dir.joinpath(href)
            parts = []
            for p in candidate.parts:
                if p == '..':
                    if parts:
                        parts.pop()
                    else:
                        raise DocumentError('Unsafe EPUB path')
                elif p not in ('.', '/'):
                    parts.append(p)
            entry = '/'.join(parts)
            if entry.lower().endswith(('.xhtml', '.html', '.htm')):
                chapters.append(html_to_text(_safe_zip_read(z, entry).decode('utf-8-sig', errors='replace')))
        return '\n\n'.join(chapters)

def _decode_text_file(path: Path) -> str:
    raw = path.read_bytes()
    if len(raw) > MAX_UNCOMPRESSED:
        raise DocumentError('Input text exceeds the size limit')
    for encoding in ('utf-8-sig', 'utf-16', 'cp1252'):
        try:
            return raw.decode(encoding)
        except UnicodeError:
            pass
    return raw.decode('utf-8', errors='replace')

def read_document(path: str | Path, *, ocr_settings=None, progress=None, cancel=None) -> str:
    path = Path(path)
    ext = path.suffix.lower()
    try:
        if ext in ('.txt', '.md', '.markdown', '.csv', '.log', '.json', '.xml'):
            return _decode_text_file(path)
        if ext in ('.html', '.htm'):
            return html_to_text(_decode_text_file(path))
        if ext in ('.srt', '.vtt'):
            text = _decode_text_file(path)
            text = re.sub('(?m)^\\s*\\d+\\s*$', '', text)
            text = re.sub('(?m)^.*\\d\\d:\\d\\d:\\d\\d[.,]\\d+\\s*-->.*$', '', text)
            text = re.sub('(?m)^.*\\d\\d:\\d\\d[.,]\\d+\\s*-->.*$', '', text)
            return text.replace('WEBVTT', '', 1)
        if ext == '.docx':
            return _docx_text(path)
        if ext == '.epub':
            return _epub_text(path)
        if ext == '.pdf':
            # Assess every PDF page independently, including mixed text/scan
            # books. Fall back to the original text reader when OCR extras are
            # absent and the PDF already has a complete text layer.
            from .ocr import import_ocr
            try:
                import importlib.util
                from .ocr_sidecar import find_worker
                can_render = importlib.util.find_spec('pypdfium2') is not None or find_worker() is not None
                if can_render:
                    return import_ocr(path, ocr_settings, progress=progress, cancel=cancel).text
                from pypdf import PdfReader
                texts = [(page.extract_text() or '') for page in PdfReader(str(path)).pages]
                if any(not text.strip() for text in texts):
                    raise DocumentError('This PDF contains scanned or blank pages. Install OCR support with: python -m pip install ".[ocr]"')
                return '\n\n'.join(texts)
            except ImportError as exc:
                raise DocumentError('PDF support requires: python -m pip install ".[ocr]"') from exc
        if ext == '.rtf':
            try:
                from striprtf.striprtf import rtf_to_text
            except ImportError as exc:
                raise DocumentError("RTF support requires: pip install 'openvoice-desktop[rtf]'") from exc
            return rtf_to_text(_decode_text_file(path))
        if ext in ('.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.webp', '.pnm', '.pgm', '.ppm', '.zip', '.cbz') or path.is_dir():
            from .ocr import import_ocr
            return import_ocr(path, ocr_settings, progress=progress, cancel=cancel).text
        raise DocumentError(f"Unsupported input format: {ext or '(none)'}")
    except (OSError, KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        raise DocumentError(f'Cannot read {path}: {exc}') from exc
