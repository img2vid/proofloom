from __future__ import annotations
import hashlib
import io
import json
import wave
from pathlib import Path
from unittest.mock import patch
import pytest
from openvoice.character_voices import CharacterProfile,VoiceProject,auto_profiles,detect_language,detect_characters,parse_passages,recommend_voices
from openvoice.voice_catalog import parse_catalog,download_voice,voice_download_size
from openvoice.multivoice import render_multivoice
from openvoice.audiobooks import Book,Chapter,BookExportOptions,export_books
from openvoice.video import VideoOptions

SAMPLE='''[Narrator] A new day began. [Alice] Hello, Bob! [Bob] Good morning.\n[Narrator] We continued our journey.'''

def make_project():
    return VoiceProject([CharacterProfile('Narrator','en_US-amy-medium'),CharacterProfile('Alice','en_US-ryan-medium'),CharacterProfile('Bob','en_US-sam-medium')],SAMPLE)

def fake_audio(path,framerate=22050):
    with wave.open(str(path),'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(framerate)
        out.writeframes(b'\x00\x00'*int(framerate*0.12))

class FakePiper:
    key='piper'
    def __init__(self,calls): self.calls=calls
    def render_wav(self,text,output,settings,control=None):
        self.calls.append((text,settings.voice))
        fake_audio(output,22050 if settings.voice.endswith('amy-medium') else 24000)

def test_inline_multi_character_passages():
    p=parse_passages(SAMPLE,make_project().profiles)
    assert [s.speaker for s in p]==['Narrator','Alice','Bob','Narrator']
    assert 'Hello' in p[1].text

def test_unknown_tags_not_removed():
    p=parse_passages('[Unknown] Keep this literary text.',make_project().profiles)
    assert '[Unknown]' in p[0].text

def test_profile_roundtrip(tmp_path):
    path=tmp_path/'project.json'
    make_project().save(path)
    result=VoiceProject.load(path)
    assert result.profiles[2].name=='Bob'
    assert result.script==SAMPLE

def test_invalid_voice_profile(tmp_path):
    p=tmp_path/'empty.json'
    p.write_text('{"profiles":[],"script":""}')
    with pytest.raises(ValueError,match='Narrator'):
        VoiceProject.load(p)

def test_detects_character_names():
    assert 'Alice' in detect_characters('"Yes," Alice replied. "No," Bob said.')
    assert 'Bob' in detect_characters('"Yes," Alice replied. "No," Bob said.')

def test_detects_nonlatin_languages():
    assert detect_language('বাংলা ভাষা সুন্দর।')[0]=='bn'
    assert detect_language('यह हिन्दी भाषा का एक उदाहरण है।')[0]=='hi'
    assert detect_language('Привет как твои дела сегодня')[0]=='ru'

def test_auto_profiles_assign_installed_models():
    project=auto_profiles('"Hello," Alice said. [Bob] Hello.',installed=['en_US-amy-medium','en_US-ryan-medium'])
    assert len(project.profiles)==3
    assert project.profiles[0].name=='Narrator'
    assert project.profiles[1].voice!=''

def sample_catalog():
    model=b'hello-voice-data'
    config=b'{"language":"en"}'
    doc={'en_US-example-medium':{'language':{'code':'en_US','name_english':'English','country_english':'USA'},'quality':'medium','num_speakers':1,'files':{
        'en/en_US/example/medium/en_US-example-medium.onnx':{'size_bytes':len(model),'md5_digest':hashlib.md5(model).hexdigest()},
        'en/en_US/example/medium/en_US-example-medium.onnx.json':{'size_bytes':len(config),'md5_digest':hashlib.md5(config).hexdigest()}}}}
    return doc,model,config

def test_catalog_language_and_recommend():
    doc,_,_=sample_catalog()
    entries=parse_catalog(doc)
    assert entries[0].language=='en-US'
    assert recommend_voices(CharacterProfile('Alice',language='en-US'),entries)[0].key=='en_US-example-medium'
    assert voice_download_size(entries)>0

def test_catalog_rejects_unsafe_paths():
    doc,_,_=sample_catalog()
    voice=doc['en_US-example-medium']['files']
    first=next(k for k in voice if k.endswith('.onnx'))
    value=voice.pop(first)
    voice['../../bad.onnx']=value
    assert parse_catalog(doc)==[]

class FakeResponse(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self,*args): self.close()

def test_verified_piper_download(tmp_path):
    doc,model,config=sample_catalog()
    v=parse_catalog(doc)[0]
    def openurl(request,timeout):
        return FakeResponse(config if str(request.full_url).endswith('.json') else model)
    target=download_voice(v,destination=tmp_path,opener=openurl)
    assert target.read_bytes()==model
    assert Path(str(target)+'.json').read_bytes()==config

def test_wrong_catalog_checksum_does_not_publish(tmp_path):
    doc,_,_=sample_catalog()
    v=parse_catalog(doc)[0]
    def openurl(request,timeout): return FakeResponse(b'X'*v.model_bytes)
    with pytest.raises(ValueError,match='verification'):
        download_voice(v,destination=tmp_path,opener=openurl)
    assert not list(tmp_path.glob('*.onnx'))

def test_multivoice_actual_audio(tmp_path,monkeypatch):
    calls=[]
    monkeypatch.setattr('openvoice.multivoice.get_engine',lambda *args: FakePiper(calls))
    out=render_multivoice(SAMPLE,tmp_path/'story.wav',make_project())
    with wave.open(str(out),'rb') as wav:
        assert wav.getframerate()==24000
        assert wav.getnframes()>5000
    assert set(voice for _,voice in calls)=={'en_US-amy-medium','en_US-ryan-medium','en_US-sam-medium'}


def test_audio_book_two_chapters_with_character_voices(tmp_path,monkeypatch):
    calls=[]
    monkeypatch.setattr('openvoice.multivoice.get_engine',lambda *args: FakePiper(calls))
    b=Book('New Story',[Chapter('Chapter 1',[],text='[Narrator] This is chapter one. [Alice] Hello.'),Chapter('Chapter 2',[],text='[Bob] This is chapter two.')])
    output=tmp_path/'out'
    options=BookExportOptions(output_type='audio',audio_format='wav',mode='both')
    result=export_books([b],output,options=options,voice_project=make_project())
    assert not result['failures']
    assert len(result['audio'])==3
    assert len(result['videos'])==0
    assert Path(result['books'][0]['combined']).exists()


def test_voice_project_does_not_force_audio_export_without_covers(tmp_path):
    b=Book('Story',[Chapter('Chapter 1',[],text='Hello')])
    report=export_books([b],tmp_path/'output',options=BookExportOptions(output_type='audio'),dry_run=True)
    assert not report['failures']
