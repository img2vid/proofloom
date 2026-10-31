import importlib.util
import os
import sys
from pathlib import Path
from types import SimpleNamespace
import pytest


def collector():
    path=Path(__file__).resolve().parents[1]/'packaging'/'prepare_tesseract.py'
    spec=importlib.util.spec_from_file_location('test_tesseract_collector',path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


def test_portable_collector_copies_dlls_models_configs_and_notices(tmp_path,monkeypatch):
    module=collector()
    root=tmp_path/'source';root.mkdir()
    notices=root/'openvoice/resources';notices.mkdir(parents=True)
    (notices/'TESSERACT_LICENSE.txt').write_text('Apache license')
    install=tmp_path/'Tesseract with spaces';install.mkdir()
    for name in ('tesseract.exe','liblept.dll','libpng.dll','LICENSE.txt'):
        (install/name).write_text('test binary or notice')
    (install/'uninstall.exe').write_text('not a runtime dependency')
    data=install/'tessdata';data.mkdir()
    for language in ('eng','osd'):
        (data/f'{language}.traineddata').write_bytes(b'model')
    (data/'configs').mkdir();(data/'configs/tsv').write_text('tessedit_create_tsv 1')
    monkeypatch.setattr(module,'ROOT',root)
    monkeypatch.setenv('OPENMUKTI_TESSERACT_DIR',str(install))
    calls=[]
    def run(command,**kwargs):
        calls.append((command,kwargs));return SimpleNamespace(stdout='List of available languages (2):\neng\nosd\n')
    monkeypatch.setattr(module.subprocess,'run',run)
    result=module.prepare()
    assert all((result/name).is_file() for name in ('tesseract.exe','liblept.dll','libpng.dll','LICENSE.txt','TESSERACT_LICENSE.txt','tessdata/eng.traineddata','tessdata/osd.traineddata','tessdata/configs/tsv'))
    assert not (result/'uninstall.exe').exists()
    assert '--list-langs' in calls[0][0]


def test_frozen_ocr_worker_discovery(tmp_path,monkeypatch):
    from openvoice import ocr_sidecar
    base=tmp_path/'_MEI123';worker=base/'ocr_worker'/'OpenmuktiOCRWorker.exe'
    worker.parent.mkdir(parents=True);worker.write_bytes(b'MZtest')
    monkeypatch.setattr(sys,'_MEIPASS',str(base),raising=False)
    monkeypatch.setattr(ocr_sidecar,'os',SimpleNamespace(name='nt',environ={}))
    assert ocr_sidecar.find_worker()==worker
