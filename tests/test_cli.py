from openvoice.cli import main, make_parser, make_legacy_parser

def test_direct_parser_accepts_common_flags():
    args = make_legacy_parser().parse_args(['-f', 'hello.txt', '-w', 'hello.wav', '-n', 'Anna', '-s', '2', '-v', '90'])
    assert args.file == ['hello.txt']
    assert args.output == 'hello.wav' and args.voice == 'Anna' and (args.rate == 2)

def test_modern_parser_accepts_batch_and_render():
    args = make_parser().parse_args(['batch', 'one.txt', 'two.docx', '--output-dir', 'out'])
    assert args.files == ['one.txt', 'two.docx']
    args = make_parser().parse_args(['render', 'hello world', '-w', 'speech.mp3'])
    assert args.text == 'hello world' and args.output == 'speech.mp3'

def test_engines_command_runs_without_speech_installed(capsys):
    assert main(['engines']) == 0
    assert 'espeak' in capsys.readouterr().out

def test_invalid_rate_is_reported(capsys):
    assert main(['-t', 'Hi', '-s', '999']) == 1
    assert 'Rate must be' in capsys.readouterr().err
