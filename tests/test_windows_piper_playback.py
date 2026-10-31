from pathlib import Path
import importlib.resources
from openvoice.engines.base import RunControl
from openvoice.engines import builtin


def test_windows_piper_playback_uses_file_script_not_command(monkeypatch, tmp_path):
    wave = tmp_path / 'বই ১ it\'s here; x & y.wav'
    wave.write_bytes(b'RIFF')
    calls = []
    token = RunControl()

    monkeypatch.setattr(builtin.platform, 'system', lambda: 'Windows')
    monkeypatch.setattr(builtin.shutil, 'which', lambda name: r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' if name == 'powershell.exe' else None)

    def fake_invoke(args, *, control):
        calls.append((args, control))

    monkeypatch.setattr(builtin, 'invoke', fake_invoke)
    builtin.play_wav(wave, token)
    assert len(calls) == 1
    args, observed_token = calls[0]
    assert observed_token is token
    assert args[1:7] == ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', args[6]]
    assert Path(args[6]).name == 'play_wav.ps1'
    assert args[7:] == ['-WavPath', str(wave.resolve())]
    assert '-Command' not in args
    assert '.PlaySync()' not in ' '.join(args)


def test_wav_player_resource_expects_parameter_and_plays_sync():
    text = importlib.resources.files('openvoice').joinpath('resources/play_wav.ps1').read_text(encoding='utf-8')
    assert '[string]$WavPath' in text
    assert '$player.SoundLocation = $WavPath' in text
    assert '$player.PlaySync()' in text
    assert 'param(' in text


def test_other_platform_uses_existing_player(monkeypatch, tmp_path):
    wave = tmp_path / 'test.wav'
    calls = []
    monkeypatch.setattr(builtin.platform, 'system', lambda: 'Linux')
    monkeypatch.setattr(builtin.shutil, 'which', lambda name: '/usr/bin/aplay' if name == 'aplay' else None)
    monkeypatch.setattr(builtin, 'invoke', lambda args, *, control: calls.append(args))
    builtin.play_wav(wave)
    assert calls == [['aplay', '-q', str(wave)]]
