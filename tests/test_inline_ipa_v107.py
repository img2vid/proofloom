from pathlib import Path
import json
import wave
import pytest
from openvoice.ipa_pronunciation import parse_inline_ipa, display_inline_ipa, PronunciationError
from openvoice.service import JobOptions, prepared_speech_units, render_text
from openvoice.character_voices import CharacterProfile, VoiceProject, parse_passages
from openvoice.multivoice import render_multivoice
from openvoice.engines import get_engine
from openvoice.engines.base import SpeechSettings


def test_simple_angle_brackets_between_text():
    result = parse_inline_ipa('Say <həˈloʊ> now!')
    assert [(r.text,r.ipa,r.spoken) for r in result] == [
        ('Say ','',''),('<həˈloʊ>','həˈloʊ',''),(' now!','','')]


def test_explicit_ipa_and_fallback_with_slashes():
    segment = parse_inline_ipa('<ipa:/bɔ̃ʒuʁ/|bonjour>')[0]
    assert (segment.ipa,segment.spoken) == ('bɔ̃ʒuʁ','bonjour')


def test_plain_ascii_ipa_with_explicit_tag():
    assert parse_inline_ipa('<ipa:kat>')[0].ipa == 'kat'
    assert parse_inline_ipa('<kat>')[0].ipa == 'kat'


def test_html_remains_literal_and_not_ipa():
    result = parse_inline_ipa('<i>Bonjour</i> and <br> then <ipa:kat>')
    assert len([s for s in result if s.ipa]) == 1
    assert result[0].text.startswith('<i>Bonjour</i>')


def test_fallback_produces_human_readable_captions():
    assert display_inline_ipa('A <ipa:kat|cat> sat.') == 'A cat sat.'
    assert display_inline_ipa('Hello <həˈloʊ>') == 'Hello /həˈloʊ/'


def test_inline_overrides_dictionary_in_same_line(tmp_path):
    d = tmp_path/'dict.json'
    d.write_text(json.dumps([{'word':'hello','ipa':'hɛlo','spoken':'hello'}]))
    units = prepared_speech_units('hello <ipa:bɔ̃ʒuʁ|bonjour> hello', JobOptions(ipa_dictionaries=(str(d),)))
    assert [s.ipa for s in units if s.ipa] == ['hɛlo','bɔ̃ʒuʁ','hɛlo']


def test_inline_survives_ocr_and_word_chunking():
    units = prepared_speech_units('Chapter\nOne <ipa:həˈloʊ|hello> The story continues again.',
                                  JobOptions(repair_ocr=True, chunk_size=16))
    assert len([unit for unit in units if unit.ipa]) == 1
    assert [unit.ipa for unit in units if unit.ipa] == ['həˈloʊ']
    assert all(len(unit.text) <= 16 for unit in units if not unit.ipa)


def test_character_tags_and_ipa_are_independent():
    text='[Narrator] It is <həˈloʊ>. [Alice] Say <ipa:kat|cat>! [Narrator] The end.'
    passages=parse_passages(text,[CharacterProfile('Narrator'),CharacterProfile('Alice')])
    assert [p.speaker for p in passages] == ['Narrator','Alice','Narrator']
    units=[(p.speaker,u.ipa) for p in passages for u in prepared_speech_units(p.text,JobOptions()) if u.ipa]
    assert units == [('Narrator','həˈloʊ'),('Alice','kat')]


def test_inline_ipa_does_not_need_dictionary():
    assert [x.ipa for x in prepared_speech_units('A <həˈloʊ> test',JobOptions()) if x.ipa] == ['həˈloʊ']


def test_empty_explicit_ipa_rejected():
    with pytest.raises(PronunciationError,match='Invalid inline IPA'):
        prepared_speech_units('Hello <ipa:>',JobOptions())


def test_empty_fallback_rejected():
    with pytest.raises(PronunciationError,match='Invalid inline IPA'):
        prepared_speech_units('<ipa:kat|>',JobOptions())


def test_ipa_engine_without_fallback_fails_loudly(tmp_path):
    engine=get_engine('espeak')
    if not engine.available():
        pytest.skip('eSpeak unavailable')
    with pytest.raises(PronunciationError,match='spoken fallback'):
        render_text('Hello <ipa:kat> world.',tmp_path/'output.wav',engine,SpeechSettings())


def test_real_wav_with_inline_fallback(tmp_path):
    engine=get_engine('espeak')
    if not engine.available():
        pytest.skip('eSpeak unavailable')
    out=tmp_path/'inline.wav'
    render_text('Hello <ipa:həˈloʊ|hello> in the story.',out,engine,SpeechSettings())
    with wave.open(str(out),'rb') as audio:
        assert audio.getnframes() > 1000


def test_multi_character_real_wav_with_inline_fallback(tmp_path):
    engine=get_engine('espeak')
    if not engine.available():
        pytest.skip('eSpeak unavailable')
    project=VoiceProject([CharacterProfile('Narrator'),CharacterProfile('Alice')])
    out=tmp_path/'characters.wav'
    render_multivoice('[Narrator] Listen <ipa:kat|cat>. [Alice] I say <ipa:dog|dog>.',out,project)
    with wave.open(str(out),'rb') as audio:
        assert audio.getnframes() > 1000
