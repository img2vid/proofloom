from __future__ import annotations
import json
import os
import shutil
from .fftools import find_binary
import subprocess
import tempfile
import wave
from pathlib import Path
FORMATS = ('wav', 'mp3', 'flac', 'ogg', 'm4a', 'opus', 'aac', 'aiff', 'wma')

def audio_info(path: str | Path) -> dict:
    path = Path(path)
    if not path.is_file():
        raise ValueError(f'Audio file not found: {path}')
    info = {'path': str(path), 'bytes': path.stat().st_size, 'format': path.suffix.lower().lstrip('.')}
    if path.suffix.lower() == '.wav':
        with wave.open(str(path), 'rb') as source:
            info.update(channels=source.getnchannels(), sample_rate=source.getframerate(), sample_width_bits=source.getsampwidth() * 8, frames=source.getnframes(), duration_seconds=round(source.getnframes() / source.getframerate(), 4))
        return info
    probe = find_binary('ffprobe')
    if not probe:
        raise RuntimeError('FFprobe is unavailable. Use an Openmukti Audiobook Maker build with integrated media tools.')
    run = subprocess.run([probe, '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels,codec_name', '-of', 'json', str(path)], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stderr[:500])
    data = json.loads(run.stdout)
    info['duration_seconds'] = float(data.get('format', {}).get('duration', 0))
    info['streams'] = data.get('streams', [])
    return info

def process_audio(inputs: list[str | Path], output: str | Path, *, operation: str='convert', start: float=0, duration: float=0, speed: float=1, gain: float=0, sample_rate: int=0, channels: int=0, fade_seconds: float=1, compression: int=0) -> Path:
    ffmpeg = find_binary('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('FFmpeg is unavailable. Use an Openmukti Audiobook Maker build with integrated media tools.')
    if not inputs:
        raise ValueError('At least one audio input is required')
    output = Path(output).expanduser()
    if output.suffix.lower().lstrip('.') not in FORMATS:
        raise ValueError('Unsupported audio output format')
    if not 0.25 <= speed <= 4 or not -60 <= gain <= 30:
        raise ValueError('Speed must be 0.25..4 and gain must be -60..30 dB')
    if not 0 <= start <= 24 * 3600 or not 0 <= duration <= 24 * 3600:
        raise ValueError('Invalid trim bounds')
    if sample_rate and (not 8000 <= sample_rate <= 192000):
        raise ValueError('Sample rate must be 8000..192000')
    if channels not in (0, 1, 2):
        raise ValueError('Channels must be 1 or 2')
    if not 0 <= fade_seconds <= 60 or not 0 <= compression <= 100:
        raise ValueError('Invalid fade or compression value')
    allowed = {'convert', 'join', 'trim', 'speed', 'gain', 'normalize', 'reverse', 'fade-in', 'fade-out', 'mono', 'stereo', 'resample', 'denoise', 'compress'}
    if operation not in allowed:
        raise ValueError(f'Unknown audio operation: {operation}')
    if operation == 'join' and len(inputs) < 2:
        raise ValueError('Joining requires two or more files')
    if operation != 'join' and len(inputs) != 1:
        raise ValueError('Only join accepts multiple files')
    input_paths = [Path(p).expanduser().resolve() for p in inputs]
    for path in input_paths:
        if not path.is_file():
            raise ValueError(f'Missing audio input: {path}')
    if output.resolve() in input_paths:
        raise ValueError('Output cannot be the same as an input')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='openvoice-audio-') as work:
        staging = Path(work) / ('processed' + output.suffix.lower())
        cmd = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y']
        for path in input_paths:
            cmd += ['-i', str(path)]
        if operation == 'join':
            connections = ''.join((f'[{i}:a:0]' for i in range(len(input_paths))))
            cmd += ['-filter_complex', f'{connections}concat=n={len(input_paths)}:v=0:a=1[a]', '-map', '[a]']
        else:
            filters = []
            if operation == 'trim':
                if not duration:
                    raise ValueError('Trim requires a positive duration')
                filters.append(f'atrim=start={start}:duration={duration}')
                filters.append('asetpts=PTS-STARTPTS')
            if operation == 'speed':
                filters.append(f'atempo={speed}')
            if operation == 'gain':
                filters.append(f'volume={gain}dB')
            if operation == 'normalize':
                filters.append('loudnorm=I=-16:TP=-1.5:LRA=11')
            if operation == 'reverse':
                filters.append('areverse')
            if operation == 'fade-in':
                filters.append(f'afade=t=in:st=0:d={fade_seconds}')
            if operation == 'fade-out':
                if duration <= 0:
                    raise ValueError('Fade-out requires --duration (total audio duration)')
                filters.append(f'afade=t=out:st={max(0, duration - fade_seconds)}:d={fade_seconds}')
            if operation == 'denoise':
                filters.append('afftdn')
            if operation == 'compress':
                threshold = -40 + compression * 0.3
                filters.append(f'acompressor=threshold={10 ** (threshold / 20):.5f}:ratio=3:attack=15:release=150')
            if filters:
                cmd += ['-af', ','.join(filters)]
        if operation == 'mono':
            channels = 1
        if operation == 'stereo':
            channels = 2
        if channels:
            cmd += ['-ac', str(channels)]
        if sample_rate:
            cmd += ['-ar', str(sample_rate)]
        cmd += [str(staging)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(f'FFmpeg failed: {result.stderr[:1600]}')
        if not staging.is_file() or staging.stat().st_size == 0:
            raise RuntimeError('Audio processing produced no output')
        fd, tmp_name = tempfile.mkstemp(prefix='.openvoice-', suffix=output.suffix, dir=output.parent)
        os.close(fd)
        try:
            shutil.copyfile(staging, tmp_name)
            os.replace(tmp_name, output)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
    return output
