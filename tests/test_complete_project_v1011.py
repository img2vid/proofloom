import json
import shutil
import wave
import zipfile
from pathlib import Path
from dataclasses import asdict
from unittest.mock import patch
import pytest
from openvoice.audiobooks import Book, Chapter
from openvoice.character_voices import CharacterProfile, VoiceProject
from openvoice.project_archive import ProjectData, save_project, load_project
from openvoice.engines.base import SpeechSettings
from openvoice.multivoice import render_multivoice


def project_with_assets(tmp_path):
    assets = tmp_path / 'original assets'
    assets.mkdir()
    model = assets / 'bn_BD-test-medium.onnx'
    model.write_bytes(b'fake-model-for-portable-project')
    Path(str(model) + '.json').write_text('{"test": true}', encoding='utf-8')
    cover = assets / 'cover.jpg'
    cover.write_bytes(b'fake-cover')
    audio = assets / 'recording.wav'
    audio.write_bytes(b'fake-sound')
    chapter = assets / 'chapter.txt'
    chapter.write_text('A complete story with all its punctuation.', encoding='utf-8')
    ipa = assets / 'ipa.json'
    ipa.write_text('[]', encoding='utf-8')
    custom = VoiceProject([CharacterProfile('Narrator', str(model), age='Adult', gender='Male', characteristics='dramatic'),
                           CharacterProfile('Alice', str(model), age='Teen', gender='Female', characteristics='cheerful', pitch=3)],
                          '[Narrator] The sun rose. [Alice] Hello!', [str(ipa)])
    book_voices = assets / 'book-voices.json'
    custom.save(book_voices)
    return ProjectData(text='[Narrator] First line.\n[Alice] Next line <ipa:həˈloʊ|hello>.',
                       settings={'engine':'piper','model':str(model),'rate':2,'pitch':1,'volume':87,'ocr':True,
                                 'dictionary':str(ipa),'ipa_dictionary':str(ipa),'font_size':17},
                       voice_project=custom,
                       books=[Book('The Example Book',[Chapter('Chapter One',[cover],chapter,'',audio),
                                                         Chapter('Chapter Two',[cover],text='A chapter stored directly in the project.')],
                                   voice_project=book_voices)],
                       video_images=[cover],video_audio=audio,
                       video_settings={'aspect':'9:16','resolution':'1080p','fps':30,'fit':'cover','captions':True},
                       book_settings={'mode':'both','output_type':'video','audio_format':'mp3'},
                       active_character='Alice',use_character_voices=True,current_filename='my-story.txt')


def test_complete_project_roundtrip_even_without_original_files(tmp_path):
    project = project_with_assets(tmp_path)
    target = save_project(tmp_path/'complete.oamproj',project)
    assert zipfile.is_zipfile(target)
    shutil.rmtree(tmp_path/'original assets')
    imported = load_project(target,tmp_path/'new location')
    assert imported.text == project.text
    assert imported.settings['rate'] == 2
    assert imported.settings['ocr'] is True
    assert imported.settings['font_size'] == 17
    assert Path(imported.settings['model']).read_bytes() == b'fake-model-for-portable-project'
    assert Path(imported.settings['model']+'.json').is_file()
    assert imported.voice_project.profiles[1].name == 'Alice'
    assert imported.voice_project.profiles[1].pitch == 3
    assert Path(imported.voice_project.profiles[1].voice).is_file()
    assert Path(imported.voice_project.pronunciation_files[0]).read_text() == '[]'
    assert imported.books[0].chapters[0].images[0].read_bytes() == b'fake-cover'
    assert imported.books[0].chapters[0].audio.read_bytes() == b'fake-sound'
    assert imported.books[0].chapters[0].text_file.read_text().startswith('A complete story')
    assert imported.books[0].chapters[1].text.startswith('A chapter stored')
    assert VoiceProject.load(imported.books[0].voice_project).profiles[1].name == 'Alice'
    assert imported.video_images[0].read_bytes() == b'fake-cover'
    assert imported.video_audio.is_file()
    assert imported.video_settings['aspect'] == '9:16'
    assert imported.book_settings['mode'] == 'both'
    assert imported.active_character == 'Alice'
    assert imported.current_filename == 'my-story.txt'


def test_missing_resource_blocks_incomplete_project(tmp_path):
    p=project_with_assets(tmp_path)
    Path(p.voice_project.profiles[0].voice).unlink()
    with pytest.raises(FileNotFoundError):
        save_project(tmp_path/'missing.oamproj',p)
    assert not (tmp_path/'missing.oamproj').exists()


def test_corrupted_resource_is_rejected(tmp_path):
    archive=save_project(tmp_path/'complete.oamproj',project_with_assets(tmp_path))
    with zipfile.ZipFile(archive) as z:
        items={name:z.read(name) for name in z.namelist()}
    asset=next(n for n in items if n.startswith('assets/'))
    items[asset]=b'corrupted'
    with zipfile.ZipFile(archive,'w') as z:
        for name,value in items.items():
            z.writestr(name,value)
    with pytest.raises(ValueError,match='size|checksum|metadata'):
        load_project(archive,tmp_path/'extraction')


def test_zip_slip_and_unknown_asset_are_rejected(tmp_path):
    archive=save_project(tmp_path/'complete.oamproj',project_with_assets(tmp_path))
    with zipfile.ZipFile(archive,'a') as z:
        z.writestr('../bad.txt','evil')
    with pytest.raises(ValueError):
        load_project(archive,tmp_path/'extraction')
    assert not (tmp_path/'bad.txt').exists()


def test_empty_project_is_portable(tmp_path):
    archive=save_project(tmp_path/'empty.oamproj',ProjectData(text='Some words.',settings={'engine':'auto'}))
    result=load_project(archive,tmp_path/'unpacked')
    assert result.text=='Some words.'
    assert result.voice_project.profiles[0].name == 'Narrator'


class FakeEngine:
    key='fake'
    def __init__(self): self.calls=[]
    def render_wav(self,text,output,settings,control=None):
        self.calls.append((text,settings.voice,settings.rate,settings.volume))
        with wave.open(str(output),'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(b'\x00\x00' * 2400)


@pytest.mark.skipif(not shutil.which('ffmpeg'),reason='FFmpeg required for character processing')
def test_same_voice_profiles_used_by_normal_audio_export(tmp_path):
    engine=FakeEngine()
    p=VoiceProject([CharacterProfile('Narrator',age='Senior',gender='Male',characteristics='calm',rate=-2),
                    CharacterProfile('Alice',age='Child',gender='Female',characteristics='cheerful',rate=2)])
    result=render_multivoice('[Narrator] This is me. [Alice] Hello there!',tmp_path/'out.wav',p,
                            default_engine=engine,default_settings=SpeechSettings(voice='GeneralVoice',rate=1,volume=73))
    assert result.is_file() and result.stat().st_size > 1000
    assert len(engine.calls)==2
    assert all(c[1]=='GeneralVoice' and c[3]==73 for c in engine.calls)
    assert engine.calls[0][2] != engine.calls[1][2]
