from __future__ import annotations
import json
import shutil
import struct
import wave
from pathlib import Path
import pytest
from openvoice.audiofx import audio_info, process_audio
from openvoice.cli import main, make_parser
from openvoice.service import JobOptions, prepared_chunks
from openvoice.texttools import TOOLS, text_stats, transform
EXAMPLE = 'A Quick SAMPLE! Mr. Example said hello, hello.\n\nVisit https://example.org. Café — a price of ₹20.\n1. First\n2. Second'

def test_transform_registry_is_large_and_unique():
    assert len(TOOLS) >= 130
    assert len(TOOLS) == len(set(TOOLS))
    assert all((t.title and t.group and callable(t.apply) for t in TOOLS.values()))

@pytest.mark.parametrize('tool', list(TOOLS))
def test_each_tool_runs_without_unexpected_errors(tool):
    result = transform(EXAMPLE, [tool])
    assert isinstance(result, str)

@pytest.mark.parametrize('name, text, expected', [('ocr-fix-hyphenated-lines', 're-\nturn', 'return'), ('remove-web-links', 'See https://test.org now', 'See  now'), ('say-currency', '₹10', ' rupees 10'), ('remove-repeated-words', 'the the moon', 'the moon'), ('spell-out-small-numbers', '19 stars', 'nineteen stars'), ('normalize-quotes', '‘yes’', "'yes'"), ('remove-markdown-headings', '## Title', 'Title'), ('drop-blank-lines', 'a\n\nb', 'a\nb'), ('sort-lines', 'b\na', 'a\nb'), ('number-lines', 'a\nb', '1. a\n2. b'), ('remove-page-numbers', 'Hello\n17\nWorld', 'Hello\n\nWorld'), ('remove-email-addresses', 'a@example.com', ''), ('ocr-expand-ligatures', 'ﬃ ﬂ', 'ffi fl')])
def test_specific_text_tools(name, text, expected):
    assert transform(text, [name]) == expected

def test_unrecognized_tool_rejected():
    with pytest.raises(ValueError, match='Unknown text tool'):
        transform('Hello', ['not-present'])

def test_job_options_applies_transformations():
    assert prepared_chunks('HELLO WORLD', JobOptions(operations=('lowercase',))) == ['hello world']

def test_statistics():
    report = text_stats('One two. Two three!', wpm=120)
    assert report['words'] == 4
    assert report['sentences'] == 2
    assert report['estimated_seconds'] == 2
    with pytest.raises(ValueError):
        text_stats('hello', 0)

def test_tools_cli_output(capsys):
    assert main(['tools', '--json']) == 0
    assert len(json.loads(capsys.readouterr().out)) >= 130

def test_transform_cli_output(capsys):
    assert main(['transform', '-t', 'HELLO', '--apply', 'lowercase']) == 0
    assert capsys.readouterr().out.strip() == 'hello'

def test_stats_cli_output(capsys):
    assert main(['stats', '-t', 'One two three', '--json']) == 0
    assert json.loads(capsys.readouterr().out)['words'] == 3

def test_split_cli_output(capsys):
    assert main(['split', '-t', 'Hello. Goodbye!', '--sentences', '--json']) == 0
    assert json.loads(capsys.readouterr().out) == ['Hello.', 'Goodbye!']

def test_batch_dry_run(tmp_path, capsys):
    args = ['batch', str(tmp_path / 'a.txt'), '--output-dir', str(tmp_path / 'out'), '--dry-run']
    assert main(args) == 0
    assert 'Would convert' in capsys.readouterr().out

def _wav(path):
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(16000)
        stream.writeframes(b''.join((struct.pack('<h', int(2000 * (i % 100 < 50))) for i in range(3200))))

def test_wave_audio_info(tmp_path):
    wav = tmp_path / 'input.wav'
    _wav(wav)
    result = audio_info(wav)
    assert result['sample_rate'] == 16000
    assert result['channels'] == 1
    assert abs(result['duration_seconds'] - 0.2) < 0.0001

@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg is optional')
@pytest.mark.parametrize('operation,kwargs', [('convert', {}), ('normalize', {}), ('gain', {'gain': -4}), ('speed', {'speed': 1.3}), ('reverse', {}), ('fade-in', {}), ('mono', {}), ('stereo', {}), ('resample', {'sample_rate': 22050}), ('denoise', {}), ('compress', {'compression': 40}), ('trim', {'start': 0.03, 'duration': 0.1})])
def test_ffmpeg_operations(tmp_path, operation, kwargs):
    source = tmp_path / 'original.wav'
    target = tmp_path / 'output.wav'
    _wav(source)
    process_audio([source], target, operation=operation, **kwargs)
    assert audio_info(target)['duration_seconds'] > 0

@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg is optional')
def test_ffmpeg_join(tmp_path):
    source = tmp_path / 'original.wav'
    target = tmp_path / 'joined.wav'
    _wav(source)
    process_audio([source, source], target, operation='join')
    assert audio_info(target)['duration_seconds'] >= 0.39

def test_audio_refuses_clobbering_input(tmp_path):
    source = tmp_path / 'original.wav'
    _wav(source)
    with pytest.raises(ValueError, match='same as an input'):
        process_audio([source], source)

def test_extended_cli_parser_accepts_effects():
    args = make_parser().parse_args(['audio', 'normalize', 'a.wav', '-w', 'b.wav'])
    assert args.operation == 'normalize'
