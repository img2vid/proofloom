from __future__ import annotations
import io
import json
import shutil
import subprocess
import sys
import threading
import zipfile
from dataclasses import replace
from pathlib import Path

import pytest

from openvoice.ocr import (OCRError, OCRCancelled, OCRSettings, OCRPage, OCRResult,
    import_ocr, parse_tsv, preprocess_image, find_tesseract, natural_key)
from openvoice.documents import read_document


@pytest.fixture
def imaging():
    pytest.importorskip('numpy')
    pytest.importorskip('cv2')
    return pytest.importorskip('PIL.Image')


def sample_image(imaging, text='The modern world of books', *, color='white'):
    from PIL import ImageDraw, ImageFont
    image = imaging.new('RGB', (1600, 700), color)
    # Pillow bundles a scalable default font in recent versions.
    try:
        font = ImageFont.truetype('DejaVuSans.ttf', 42)
    except OSError:
        font = ImageFont.load_default(size=42)
    ImageDraw.Draw(image).multiline_text((90, 100), text + '\n\nThe friend received a letter.\nThis information is useful.', font=font, fill='black', spacing=30)
    return image


@pytest.mark.parametrize('settings', [OCRSettings(dpi=99), OCRSettings(contrast=4), OCRSettings(language='eng;echo bad'), OCRSettings(psm=0), OCRSettings(first_page=0), OCRSettings(first_page=5,last_page=2), OCRSettings(timeout=1)])
def test_invalid_ocr_settings_rejected(settings):
    with pytest.raises(OCRError):
        settings.validate()


def test_natural_book_page_order():
    assert sorted(['page10.png','page2.png','page1.png'], key=natural_key) == ['page1.png','page2.png','page10.png']


def test_tsv_preserves_lines_paragraphs_and_weighted_confidence():
    text = 'level\tpage_num\tblock_num\tpar_num\tline_num\tconf\ttext\n5\t1\t1\t1\t1\t90\tHello\n5\t1\t1\t1\t1\t80\tworld\n5\t1\t1\t1\t2\t95\tNext\n5\t1\t1\t2\t1\t99\tParagraph\n'
    result, conf = parse_tsv(text)
    assert result == 'Hello world\nNext\n\nParagraph'
    assert 85 < conf < 99


def test_black_and_white_preprocessing_and_alpha(imaging):
    import numpy as np
    image = sample_image(imaging).convert('RGBA')
    result = preprocess_image(image, OCRSettings(preprocessing='otsu', auto_rotate=False, deskew=False))
    assert result.mode == 'L'
    assert set(np.unique(np.asarray(result))) <= {0,255}
    assert result.getpixel((0,0)) == 255


def test_zip_natural_order_and_page_range_without_extraction(imaging, tmp_path, monkeypatch):
    from openvoice import ocr
    book = tmp_path / 'book.cbz'
    with zipfile.ZipFile(book, 'w') as archive:
        for number in (10, 2, 1):
            data=io.BytesIO(); imaging.new('RGB',(40,60),(number,0,0)).save(data,format='PNG')
            archive.writestr(f'book/page{number}.png',data.getvalue())
        archive.writestr('__MACOSX/._page1.png',b'not an image')
    monkeypatch.setattr(ocr, 'recognize_page', lambda image,settings,**kw:(str(image.getpixel((0,0))[0]),99,'test'))
    result = import_ocr(book, OCRSettings(first_page=2,last_page=3), _local=True)
    assert [p.text for p in result.pages] == ['2','10']
    assert not (tmp_path/'book').exists()
    assert read_document(book)  # Same public reader routes scan archives to OCR.


@pytest.mark.parametrize('name', ['../page.png', '/page.png', 'C:/page.png', 'dir/../../page.png', '..\\page.png'])
def test_unsafe_archive_rejected_before_decoding(tmp_path, name):
    archive = tmp_path/'evil.zip'
    with zipfile.ZipFile(archive,'w') as z:
        z.writestr(name,b'bad')
    with pytest.raises(OCRError,match='Unsafe'):
        import_ocr(archive,_local=True)


def test_empty_archive_and_bad_range_report_errors(tmp_path):
    archive = tmp_path/'no-pages.zip'
    with zipfile.ZipFile(archive,'w') as z:
        z.writestr('readme.txt','This is not an image book')
    with pytest.raises(OCRError,match='no supported'):
        import_ocr(archive,_local=True)


def test_multipage_tiff_and_folder(imaging, tmp_path, monkeypatch):
    from openvoice import ocr
    frames = [imaging.new('RGB',(40,60),(n,0,0)) for n in (1,2,3)]
    path=tmp_path/'book.tiff';frames[0].save(path,save_all=True,append_images=frames[1:])
    monkeypatch.setattr(ocr,'recognize_page',lambda im,settings,**kw:(str(im.getpixel((0,0))[0]),95,'test'))
    assert [p.text for p in import_ocr(path,_local=True).pages] == ['1','2','3']
    folder=tmp_path/'scans';folder.mkdir()
    for n in (10,1,2):
        imaging.new('RGB',(40,60),(n,0,0)).save(folder/f'page{n}.png')
    assert [p.text for p in import_ocr(folder,_local=True).pages] == ['1','2','10']


def test_cancellation_never_returns_partial_results(imaging,tmp_path):
    path=tmp_path/'scan.png';sample_image(imaging).save(path)
    cancel=threading.Event();cancel.set()
    with pytest.raises(OCRCancelled):
        import_ocr(path,cancel=cancel,_local=True)


def test_real_tesseract_image_and_scanned_pdf(imaging,tmp_path):
    if not find_tesseract():
        pytest.skip('Tesseract not installed')
    pytest.importorskip('pypdfium2')
    image=sample_image(imaging)
    path=tmp_path/'book.png';image.save(path)
    settings=OCRSettings(psm=6,auto_rotate=False,deskew=False)
    result=import_ocr(path,settings,_local=True)
    assert 'modern world' in result.text.lower()
    assert result.confidence > 70
    assert result.pages[0].used_ocr
    pdf=tmp_path/'scan.pdf';image.save(pdf,'PDF',resolution=150)
    result=import_ocr(pdf,settings,_local=True)
    assert 'modern world' in result.text.lower()
    assert result.pages[0].used_ocr


def test_mixed_pdf_keeps_text_page_and_ocr_scanned_page(imaging,tmp_path):
    if not find_tesseract():
        pytest.skip('Tesseract not installed')
    pytest.importorskip('pypdfium2')
    pypdf=pytest.importorskip('pypdf')
    from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
    scanned=io.BytesIO();sample_image(imaging).save(scanned,'PDF',resolution=150)
    writer=pypdf.PdfWriter()
    page=writer.add_blank_page(width=600,height=800)
    font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
    page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
    stream=DecodedStreamObject();stream.set_data(b'BT /F1 18 Tf 50 700 Td (Digital text must remain exactly unchanged on this page.) Tj ET')
    page[NameObject('/Contents')]=writer._add_object(stream)
    writer.add_page(pypdf.PdfReader(scanned).pages[0])
    file=tmp_path/'mixed.pdf'
    with file.open('wb') as f:
        writer.write(f)
    result=import_ocr(file,OCRSettings(auto_rotate=False,deskew=False,psm=6),_local=True)
    assert len(result.pages)==2
    assert result.pages[0].text=='Digital text must remain exactly unchanged on this page.'
    assert result.pages[0].used_ocr is False
    assert result.pages[1].used_ocr is True
    assert 'modern world' in result.pages[1].text.lower()


def test_worker_json_protocol_with_real_ocr(imaging,tmp_path,monkeypatch):
    if not find_tesseract():
        pytest.skip('Tesseract not installed')
    from openvoice import ocr_sidecar
    path=tmp_path/'page with spaces.png';sample_image(imaging).save(path)
    real_popen=subprocess.Popen
    worker=Path(__file__).resolve().parents[1]/'scripts'/'ocr_worker.py'
    calls=[]
    def start(command,**kwargs):
        calls.append(command)
        return real_popen([sys.executable,str(worker),*command[1:]],**kwargs)
    monkeypatch.setattr(ocr_sidecar,'find_worker',lambda:Path(sys.executable))
    monkeypatch.setattr(ocr_sidecar.subprocess,'Popen',start)
    result=ocr_sidecar.import_with_worker(path,OCRSettings(psm=6,auto_rotate=False,deskew=False))
    assert 'modern world' in result.text.lower()
    assert '--request' in calls[0]


def test_ocr_report_roundtrip():
    value=OCRResult([OCRPage(1,'source.png','Hello',92)],['Review scan'])
    assert OCRResult.from_dict(json.loads(json.dumps(value.to_dict()))) == value
