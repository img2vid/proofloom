from __future__ import annotations
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .fftools import find_binary
from .engines import RunControl, SpeechEngine, SpeechSettings
from .ipa_pronunciation import display_inline_ipa
from .service import JobOptions, render_text

ASPECTS = {'16:9': (16, 9), '9:16': (9, 16), '1:1': (1, 1)}
HEIGHTS = {'360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '2160p': 2160}
VIDEO_FORMATS = {'.mp4': ('libx264', 'aac'), '.mkv': ('libx264', 'aac'), '.mov': ('libx264', 'aac'), '.webm': ('libvpx-vp9', 'libopus')}
IMAGE_FORMATS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}

@dataclass(frozen=True)
class VideoOptions:
    aspect: str = '16:9'
    resolution: str = '720p'
    fps: int = 30
    fit: str = 'contain'
    background: str = 'black'
    captions: bool = False
    crf: int = 23


def video_size(aspect: str, resolution: str) -> tuple[int, int]:
    if aspect not in ASPECTS:
        raise ValueError('Aspect must be 16:9, 9:16, or 1:1')
    if resolution not in HEIGHTS:
        raise ValueError('Resolution must be: ' + ', '.join(HEIGHTS))
    a, b = ASPECTS[aspect]
    height = HEIGHTS[resolution]
    width = round(height * a / b / 2) * 2
    return max(width, 2), height


def binary(name: str) -> str:
    return find_binary(name)


def _run(command: list[str], control: RunControl | None = None) -> None:
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    try:
        while True:
            try:
                _, errors = process.communicate(timeout=0.2)
                break
            except subprocess.TimeoutExpired:
                if control is not None:
                    control.check()
        if process.returncode:
            raise RuntimeError('FFmpeg error: ' + errors[-1600:].strip())
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        raise


def audio_duration(audio: str | Path) -> float:
    probe = binary('ffprobe')
    if not probe:
        raise RuntimeError('FFprobe is required for audiobook videos. Install FFmpeg and FFprobe or place both beside the executable.')
    result = subprocess.run([probe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(audio)], text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError('Cannot inspect audio: ' + result.stderr[-500:])
    try:
        seconds = float(result.stdout.strip())
    except ValueError as exc:
        raise ValueError('Audio duration is unavailable') from exc
    if not (0 < seconds < 2592000):
        raise ValueError('Audio duration must be between 0 and 30 days')
    return seconds


def _srt_time(seconds: float) -> str:
    ms = max(0, round(seconds * 1000))
    hours, ms = divmod(ms, 3600000)
    minutes, ms = divmod(ms, 60000)
    whole, milli = divmod(ms, 1000)
    return f'{hours:02}:{minutes:02}:{whole:02},{milli:03}'


def write_approximate_captions(text: str, seconds: float, destination: str | Path) -> Path:
    words = text.split()
    if not words:
        raise ValueError('Captions need narration text')
    batches = [' '.join(words[index:index + 11]) for index in range(0, len(words), 11)]
    weights = [max(1, len(batch.split())) for batch in batches]
    total = sum(weights)
    output = []
    cursor = 0.0
    for index, (part, weight) in enumerate(zip(batches, weights), 1):
        end = seconds if index == len(batches) else cursor + seconds * weight / total
        output.append(f'{index}\n{_srt_time(cursor)} --> {_srt_time(end)}\n{part}\n')
        cursor = end
    target = Path(destination)
    target.write_text('\n'.join(output), encoding='utf-8')
    return target


def _concat_image_list(images: list[Path], duration: float, target: Path) -> None:
    per_image = duration / len(images)
    lines = ['ffconcat version 1.0']
    for image in images:
        name = image.resolve().as_posix().replace("'", "'\\''")
        lines.extend([f"file '{name}'", f'duration {per_image:.8f}'])
    name = images[-1].resolve().as_posix().replace("'", "'\\''")
    lines.append(f"file '{name}'")
    target.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def render_video(images: list[str | Path], output: str | Path, *, audio: str | Path | None = None, text: str = '', engine: SpeechEngine | None = None, settings: SpeechSettings | None = None, speech_options: JobOptions = JobOptions(), video_options: VideoOptions = VideoOptions(), control: RunControl | None = None, progress: Callable[[int, int], None] | None = None) -> Path:
    ffmpeg = binary('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('FFmpeg is required for audiobook videos. Install it or place FFmpeg beside the executable.')
    if not images:
        raise ValueError('Choose at least one image')
    picture_paths = [Path(p).expanduser().resolve() for p in images]
    for path in picture_paths:
        if path.suffix.lower() not in IMAGE_FORMATS or not path.is_file():
            raise ValueError(f'Image does not exist or its format is unsupported: {path}')
    target = Path(output).expanduser().resolve()
    if target.suffix.lower() not in VIDEO_FORMATS:
        raise ValueError('Supported video formats: MP4, MKV, MOV, WebM')
    opts = video_options
    width, height = video_size(opts.aspect, opts.resolution)
    if opts.fps not in (24, 25, 30, 60):
        raise ValueError('FPS must be 24, 25, 30 or 60')
    if opts.fit not in ('contain', 'cover'):
        raise ValueError('Image fit must be contain or cover')
    if not re.fullmatch(r'(?:[0-9a-fA-F]{6}|black|white|gray|navy)', opts.background):
        raise ValueError('Background must be a six-digit hexadecimal RGB color or black, white, gray, navy')
    if not 0 <= opts.crf <= 45:
        raise ValueError('CRF must be between 0 and 45')
    if not audio and not text.strip():
        raise ValueError('Supply an existing audio file or narration text')
    if opts.captions and not text.strip():
        raise ValueError('Approximate captions need narration text')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='openvoice-video-') as directory:
        work = Path(directory)
        if audio:
            sound = Path(audio).expanduser().resolve()
            if not sound.is_file():
                raise ValueError(f'Audio file does not exist: {sound}')
        else:
            if engine is None or settings is None:
                raise ValueError('A speech engine and voice settings are needed for text narration')
            sound = work / 'narration.wav'
            render_text(text, sound, engine, settings, speech_options, control=control, progress=progress)
        if control:
            control.check()
        duration = audio_duration(sound)
        normalized = []
        for number, picture in enumerate(picture_paths, 1):
            normalized_picture = work / f'slide-{number:06d}.png'
            if opts.fit == 'contain':
                prep_filter = f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={opts.background},setsar=1,format=rgb24'
            else:
                prep_filter = f'scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,format=rgb24'
            _run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(picture), '-vf', prep_filter, '-frames:v', '1', str(normalized_picture)], control)
            if not normalized_picture.is_file() or not normalized_picture.stat().st_size:
                raise RuntimeError(f'Cannot prepare image: {picture}')
            normalized.append(normalized_picture)
        concat = work / 'images.ffconcat'
        _concat_image_list(normalized, duration, concat)
        vf = f'fps={opts.fps},format=yuv420p'
        video_codec, audio_codec = VIDEO_FORMATS[target.suffix.lower()]
        staged = work / ('output' + target.suffix.lower())
        cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-safe', '0', '-f', 'concat', '-i', str(concat), '-i', str(sound), '-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-r', str(opts.fps), '-c:v', video_codec]
        if video_codec == 'libx264':
            cmd += ['-preset', 'veryfast', '-crf', str(opts.crf)]
        else:
            cmd += ['-deadline', 'realtime', '-cpu-used', '5', '-b:v', '0', '-crf', str(max(4, min(45, opts.crf + 8)))]
        cmd += ['-c:a', audio_codec]
        if audio_codec == 'aac':
            cmd += ['-b:a', '160k', '-ar', '48000', '-ac', '2']
        else:
            cmd += ['-b:a', '128k', '-ar', '48000', '-ac', '2']
        if target.suffix.lower() in {'.mp4', '.mov'}:
            cmd += ['-movflags', '+faststart']
        cmd += ['-t', f'{duration:.5f}', '-shortest', str(staged)]
        _run(cmd, control)
        if not staged.is_file() or staged.stat().st_size <= 0:
            raise RuntimeError('Video encoder did not produce a file')
        if control:
            control.check()
        os.replace(staged, target)
        if opts.captions:
            write_approximate_captions(display_inline_ipa(text), duration, target.with_suffix('.srt'))
    return target
