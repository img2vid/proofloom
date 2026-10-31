from __future__ import annotations
import json
import struct
import sys
import types
import wave
from pathlib import Path
import pytest
from openvoice.ipa_pronunciation import (
    Pronunciation, PronunciationError, load_pronunciations,
    segment_pronunciations, ipa_to_model_phonemes, render_ipa_wav,
)
from openvoice.service import JobOptions, prepared_speech_units, render_text
from openvoice.character_voices import VoiceProject, CharacterProfile
from openvoice.engines.base import SpeechSettings
from openvoice.engines import get_engine


def test_json_multilingual_and_region_priority(tmp_path):
    target=tmp_path/'rules.json'
    target.write_text(json.dumps({'entries':[
        {'word':'read','ipa':'/rɛd/','language':'*'},
        {'word':'read','ipa':'/riːd/','language':'en'},
        {'word':'বাংলা','ipa':'/baŋla/','language':'bn'}
    ]},ensure_ascii=False),encoding='utf-8')
    rules=load_pronunciations([str(target)])
    pieces=segment_pronunciations('Read বাংলা and read.',rules,'en-US')
    assert [s.ipa for s in pieces if s.ipa]==['riːd','riːd']
    pieces=segment_pronunciations('বাংলা।',rules,'bn-BD')
    assert [s.ipa for s in pieces if s.ipa]==['baŋla']
    assert segment_pronunciations('read',rules,'fr')[0].ipa=='rɛd'


def test_tsv_with_language_and_spoken(tmp_path):
    file=tmp_path/'voices.tsv'
    file.write_text('bonjour\tbɔ̃ʒuʁ\tfr\tbon-jure\n#ignored\n',encoding='utf-8')
    rules=load_pronunciations([str(file)])
    assert rules[0].ipa=='bɔ̃ʒuʁ'
    assert rules[0].spoken=='bon-jure'


def test_invalid_dictionary_is_rejected(tmp_path):
    file=tmp_path/'bad.json'
    file.write_text('[{"word":"bad", "ipa":""}]',encoding='utf-8')
    with pytest.raises(PronunciationError):
        load_pronunciations([str(file)])


def test_ipa_codepoint_mapping_is_strict():
    mapping={'h':[10],'ə':[11],'ˈ':[12],'l':[13],'oʊ':[14],'i':[15]}
    assert ipa_to_model_phonemes('/həˈloʊ/',mapping)==['h','ə','ˈ','l','oʊ']
    with pytest.raises(PronunciationError,match='cannot pronounce IPA symbol'):
        ipa_to_model_phonemes('/hɛ/',mapping)


def test_model_backend_uses_phoneme_ids(tmp_path,monkeypatch):
    from openvoice import ipa_pronunciation as pronunciation
    model=tmp_path/'model.onnx'
    model.write_bytes(b'placeholder')
    (tmp_path/'model.onnx.json').write_text('{}')
    records=[]
    class Config:
        sample_rate=22050
        phoneme_id_map={'^':[1],'_':[0],'$':[2],'h':[10],'ə':[11],'ˈ':[12],'l':[13],'oʊ':[14]}
    class FakeVoice:
        config=Config()
        @classmethod
        def load(cls,*args,**kwargs):
            records.append(('loaded',args,kwargs))
            return cls()
        def phonemes_to_ids(self, tokens):
            records.append(('tokens',tokens))
            return [1]+[self.config.phoneme_id_map[x][0] for x in tokens]+[2]
        def synthesize_ids_to_raw(self,ids,**kwargs):
            records.append(('synthesize',ids,kwargs))
            return struct.pack('<'+'h'*64,*([0]*64))
    fake=types.ModuleType('piper')
    fake.__path__=[]
    voice_mod=types.ModuleType('piper.voice')
    voice_mod.PiperVoice=FakeVoice
    monkeypatch.setitem(sys.modules,'piper',fake)
    monkeypatch.setitem(sys.modules,'piper.voice',voice_mod)
    out=tmp_path/'spoken.wav'
    pronunciation.render_ipa_wav('həˈloʊ',out,SpeechSettings(model=str(model)))
    with wave.open(str(out)) as wav:
        assert wav.getframerate()==22050
        assert wav.getnframes()==64
    assert ('tokens',['h','ə','ˈ','l','oʊ']) in records
    assert [r for r in records if r[0]=='synthesize'][0][1]==[1,10,11,12,13,14,2]


def test_real_wav_export_with_spoken_fallback(tmp_path):
    engine=get_engine('espeak')
    if not engine.available():
        pytest.skip('espeak not installed')
    rules=tmp_path/'rules.json'
    rules.write_text(json.dumps([{'word':'Openmukti','ipa':'/əʊpənmukti/','language':'*','spoken':'open mukti'}]))
    path=tmp_path/'test.wav'
    render_text('Openmukti is here.',path,engine,SpeechSettings(),JobOptions(ipa_dictionaries=(str(rules),)))
    with wave.open(str(path)) as wav:
        assert wav.getnframes()>0


def test_engine_missing_ipa_fallback_fails_loudly(tmp_path):
    engine=get_engine('espeak')
    if not engine.available():
        pytest.skip('espeak not installed')
    rules=tmp_path/'rules.json'
    rules.write_text('[{"word":"hello","ipa":"həˈloʊ","language":"en"}]')
    with pytest.raises(PronunciationError,match='spoken fallback'):
        render_text('hello',tmp_path/'test.wav',engine,SpeechSettings(),JobOptions(ipa_dictionaries=(str(rules),),language='en'))


def test_voice_project_preserves_ipa_dictionary(tmp_path):
    project=VoiceProject([CharacterProfile('Narrator',language='bn')],'[Narrator] বাংলা',[str(tmp_path/'voices.json')])
    out=tmp_path/'project.json'
    project.save(out)
    restored=VoiceProject.load(out)
    assert restored.pronunciation_files==[str(tmp_path/'voices.json')]


def test_prepared_units_splits_ipa_without_losing_nearby_text(tmp_path):
    file=tmp_path/'dict.json'
    file.write_text('[{"word":"Alice","ipa":"ælɪs","language":"en","spoken":"al is"}]')
    units=prepared_speech_units('Hello Alice and Alice!',JobOptions(ipa_dictionaries=(str(file),),language='en'))
    assert [x.ipa for x in units if x.ipa]==['ælɪs','ælɪs']
    assert any('Hello' in x.text for x in units)
