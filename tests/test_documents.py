import zipfile
from pathlib import Path
import pytest
from openvoice.documents import DocumentError, html_to_text, read_document

def test_html_excludes_script_and_style(tmp_path):
    file = tmp_path / 'a.html'
    file.write_text('<style>SECRET</style><h1>Welcome</h1><p>Hello &amp; goodbye</p><script>BAD</script>')
    txt = read_document(file)
    assert 'Welcome' in txt and 'Hello & goodbye' in txt
    assert 'SECRET' not in txt and 'BAD' not in txt

def test_docx_with_plain_stdlib_zip(tmp_path):
    file = tmp_path / 'example.docx'
    xml = b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World</w:t></w:r></w:p></w:body></w:document>'
    with zipfile.ZipFile(file, 'w') as z:
        z.writestr('word/document.xml', xml)
    assert read_document(file) == 'Hello\nWorld'

def test_epub_spine_order(tmp_path):
    file = tmp_path / 'sample.epub'
    container = '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
    opf = '<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'
    with zipfile.ZipFile(file, 'w') as z:
        z.writestr('META-INF/container.xml', container)
        z.writestr('OEBPS/content.opf', opf)
        z.writestr('OEBPS/a.xhtml', '<p>Chapter A</p>')
        z.writestr('OEBPS/b.xhtml', '<p>Chapter B</p>')
    text = read_document(file)
    assert text.find('Chapter B') < text.find('Chapter A')

def test_bad_extension(tmp_path):
    file = tmp_path / 'anything.zip'
    file.write_bytes(b'zip')
    with pytest.raises(DocumentError):
        read_document(file)

def test_utf16_txt(tmp_path):
    file = tmp_path / 'unicode.txt'
    file.write_bytes('Hello తెలుగు'.encode('utf-16'))
    assert read_document(file) == 'Hello తెలుగు'
