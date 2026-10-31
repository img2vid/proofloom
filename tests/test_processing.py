from pathlib import Path
import pytest
from openvoice.processing import TextProcessingError, apply_replacements, load_replacements, normalize_text, split_text

def test_normalization_preserves_paragraphs_and_non_latin():
    original = '\ufeffHello\xa0world!\r\n\r\nনমস্কার। こんにちは。'
    assert normalize_text(original) == 'Hello world!\n\nনমস্কার। こんにちは。'

def test_ocr_repair_joins_hyphenated_words_and_wrapped_lines():
    assert normalize_text('A docu-\nment\ncontinues.', repair_ocr=True) == 'A document continues.'

def test_dictionary_exact_words_not_substrings(tmp_path):
    dic = tmp_path / 'pronunciation.tsv'
    dic.write_text('GIF\tJif\nGPU\tG P U\n', encoding='utf-8')
    rows = load_replacements([str(dic)])
    assert apply_replacements('GIF gift GPU', rows) == 'Jif gift G P U'

def test_dictionary_json_regex(tmp_path):
    dic = tmp_path / 'pronunciation.json'
    dic.write_text('[{"find":"\\\\bDr\\\\.","replace":"Doctor","regex":true}]', encoding='utf-8')
    assert apply_replacements('Dr. Ada', load_replacements([str(dic)])) == 'Doctor Ada'

def test_bad_dictionary_format_is_rejected(tmp_path):
    dic = tmp_path / 'bad.json'
    dic.write_text('{"find":"x"}', encoding='utf-8')
    with pytest.raises(TextProcessingError):
        load_replacements([str(dic)])

def test_split_long_text_at_defined_limit():
    chunks = split_text('An example sentence. ' * 60, max_chars=55)
    assert len(chunks) > 1
    assert all((0 < len(chunk) <= 55 for chunk in chunks))
    assert 'An example sentence.' in ' '.join(chunks)

def test_split_long_word_and_empty():
    assert split_text(' ') == []
    chunks = split_text('X' * 160, max_chars=40)
    assert ''.join(chunks) == 'X' * 160
