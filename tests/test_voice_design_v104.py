import math
import shutil
import struct
import wave
from pathlib import Path
from unittest.mock import patch
import pytest
from openvoice.character_voices import CharacterProfile, VoiceProject
from openvoice.voice_design import design_for_profile, audio_filters, process_character_audio
from openvoice.multivoice import render_multivoice


def test_all_profile_axes_have_audible_design():
    base = design_for_profile(CharacterProfile('Narrator'))
    children = design_for_profile(CharacterProfile('Child', age='Child'))
    older = design_for_profile(CharacterProfile('Senior', age='Senior'))
    female = design_for_profile(CharacterProfile('A', gender='Female'))
    male = design_for_profile(CharacterProfile('B', gender='Male'))
    styles = design_for_profile(CharacterProfile('C', characteristics='warm, dramatic'))
    assert base.semitones == 0
    assert children.semitones > older.semitones
    assert female.semitones > male.semitones
    assert styles.bass_db > base.bass_db
    assert styles.compression > 0
    assert design_for_profile(CharacterProfile('D', gender='Female', age='Child', characteristics='cheerful', design_strength=0)).semitones == 0


def test_clamps_prevent_excessively_large_pitch():
    profile = CharacterProfile('X', gender='Female', age='Child', characteristics='cheerful', pitch=999, design_strength=500)
    design = design_for_profile(profile)
    assert -9 <= design.semitones <= 9
    assert -6 <= design.bass_db <= 6
    assert abs(design.speed_adjust) <= 5


def test_profile_save_load_with_strength_and_legacy_compatibility(tmp_path):
    original=VoiceProject([CharacterProfile('Narrator',age='Teen',gender='Female',characteristics='warm, calm',design_strength=45)])
    out=tmp_path/'voice.json'
    original.save(out)
    restored=VoiceProject.load(out)
    assert restored.profiles[0].design_strength == 45
    out.write_text('{"profiles":[{"name":"Narrator","age":"Adult","gender":"Unspecified"}]}')
    assert VoiceProject.load(out).profiles[0].design_strength == 85


def test_post_filters_change_pitch_without_changing_language_content():
    voice=design_for_profile(CharacterProfile('Speaker',age='Child',gender='Female',characteristics='warm'))
    filters=audio_filters(voice,rubberband=True)
    assert 'rubberband=pitch=' in filters[0]
    assert 'bass=' in ','.join(filters)
    assert 'atempo=' in ','.join(audio_filters(voice,rubberband=False))


def _wave(path, frequency=220, rate=24000):
    with wave.open(str(path),'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        pcm=[int(9000*math.sin(2*math.pi*frequency*i/rate)) for i in range(rate)]
        wav.writeframes(struct.pack('<'+'h'*len(pcm),*pcm))


def _pitch_frequency(path):
    with wave.open(str(path),'rb') as wav:
        rate=wav.getframerate()
        frames=wav.readframes(wav.getnframes())
    samples=struct.unpack('<'+'h'*(len(frames)//2), frames)
    samples=samples[rate//4:3*rate//4]
    positive=sum(a<=0<b for a,b in zip(samples,samples[1:]))
    return positive/(len(samples)/rate)


@pytest.mark.skipif(not shutil.which('ffmpeg'),reason='Needs FFmpeg')
def test_real_audio_pitch_transformation(tmp_path):
    source=tmp_path/'source.wav'
    out=tmp_path/'changed.wav'
    _wave(source)
    design=design_for_profile(CharacterProfile('Child',age='Child',gender='Female',characteristics='cheerful'))
    process_character_audio(source,out,design)
    assert 210 < _pitch_frequency(source) < 230
    assert _pitch_frequency(out)>_pitch_frequency(source)*1.13


class FakePiper:
    key='piper'
    def __init__(self,calls): self.calls=calls
    def render_wav(self,text,path,settings,control=None):
        self.calls.append((text,settings.voice,settings.rate))
        _wave(path,frequency=180,rate=24000)


@pytest.mark.skipif(not shutil.which('ffmpeg'),reason='Needs FFmpeg')
def test_multilingual_different_profiles_are_used_in_render(tmp_path,monkeypatch):
    calls=[]
    monkeypatch.setattr('openvoice.multivoice.get_engine',lambda *args:FakePiper(calls))
    profiles=[CharacterProfile('Narrator','en_US-amy-medium'),
              CharacterProfile('আশা','bn_BD-google-medium',gender='Female',age='Child',characteristics='cheerful'),
              CharacterProfile('Maya','hi_IN-voice-medium',gender='Male',age='Senior',characteristics='serious')]
    text='[Narrator] A story. [আশা] আমি বই পড়তে ভালোবাসি। [Maya] यह मेरी कहानी है।'
    output=render_multivoice(text,tmp_path/'voices.wav',VoiceProject(profiles,text))
    assert output.is_file()
    assert len(calls)==3
    assert any('আমি' in t for t,_,_ in calls)
    assert any('कहानी' in t for t,_,_ in calls)
    assert calls[1][2] != calls[2][2]
