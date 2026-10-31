from dataclasses import replace
import json
from pathlib import Path
import pytest
from openvoice.spelling import EnglishSpeller,SpellIssue,apply_corrections,edit_distance
from openvoice.cli import main
from openvoice.project_archive import ProjectData,save_project,load_project


@pytest.fixture(scope='module')
def spell():
    return EnglishSpeller()


def test_common_typos_and_real_ocr_confusions(spell):
    text='Teh freind recieved a speling eror in the rnodern w0rld.'
    issues=spell.check(text)
    corrected,count=apply_corrections(text,issues)
    assert corrected=='The friend received a spelling error in the modern world.'
    assert count==7
    assert all(text[i.start:i.end]==i.original for i in issues)


def test_case_is_matched_even_when_suggestions_are_cached(spell):
    assert spell.suggest('freind')==('friend',)
    assert spell.suggest('Freind')==('Friend',)
    assert spell.suggest('FREIND')==('FRIEND',)


def test_protected_urls_speaker_tags_ipa_and_acronyms(spell):
    text='[Yui] <ipa:həˈloʊ|teh> https://example.com/teh aishik@example.com `speling` NASA PDF XML'
    assert not spell.check(text)


def test_dehyphenation_ligatures_and_soft_hyphens(spell):
    text='Useful infor-\nmation and a ﬁne ﬂower. Remove the soft\u00adhyphen.'
    corrected,count=apply_corrections(text,spell.check(text))
    assert 'information' in corrected
    assert 'fine flower' in corrected
    assert '\u00ad' not in corrected
    assert count>=4


def test_personal_words_and_real_words_are_never_rewritten():
    checker=EnglishSpeller(['Sakuragi','Kirisaawa'])
    text='Sakuragi and Kirisaawa read modern books in colour.'
    assert not checker.check(text,check_names=True)
    checker.add_word('qwertylanguage')
    assert not checker.check('qwertylanguage')


def test_stale_overlapping_edits_and_safe_mode():
    typo=SpellIssue(0,3,'teh',('the',),confidence=.98)
    overlap=SpellIssue(0,7,'teh cat',('a cat',),confidence=.8)
    stale=SpellIssue(4,7,'dog',('cat',))
    assert apply_corrections('teh cat',[typo,overlap,stale])==('the cat',1)
    assert apply_corrections('teh cat',[overlap],safe_only=True)==('teh cat',0)
    assert apply_corrections('the cat',[typo])==('the cat',0)


def test_word_offsets_with_unicode_before_english(spell):
    text='日本語 🌸 teh freind'
    issues=spell.check(text)
    assert [text[i.start:i.end] for i in issues]==['teh','freind']


def test_unknown_without_a_plausible_suggestion_remains_reviewable(spell):
    issues=spell.check('zzqxxvvzzqxxvvzz')
    assert len(issues)==1 and not issues[0].suggestions
    assert apply_corrections('zzqxxvvzzqxxvvzz',issues)==('zzqxxvvzzqxxvvzz',0)


def test_ocr_rules_can_be_disabled(spell):
    assert not spell.check('ﬁne',ocr=False)
    assert edit_distance('recieve','receive')==1


def test_british_indian_and_american_spellings_are_accepted(spell):
    assert not spell.check('colour colours colouring centre organisation organise recognise theatre travelled neighbours color center organization theater')


def test_cli_spellcheck_outputs_corrected_utf8_text(tmp_path,capsys):
    source=tmp_path/'input.txt';source.write_text('Teh freind recieved a letter.',encoding='utf-8')
    output=tmp_path/'corrected.txt'
    assert main(['spellcheck','-f',str(source),'--correct','-w',str(output),'--json'])==0
    data=json.loads(capsys.readouterr().out)
    assert data['corrections']==3
    assert output.read_text()=='The friend received a letter.'


def test_project_preserves_ocr_settings_report_and_personal_words(tmp_path):
    settings={'ocr_import':{'language':'eng','preprocessing':'otsu','dpi':300},'ocr_report':{'pages':[{'number':1,'text':'Raw scan','confidence':83}]},'spelling_words':['sakuragi'],'spelling_enabled':True}
    path=tmp_path/'scan.oamproj'
    save_project(path,ProjectData(text='Corrected scan',settings=settings))
    loaded=load_project(path,tmp_path/'unpacked')
    assert loaded.settings==settings
    assert loaded.text=='Corrected scan'
