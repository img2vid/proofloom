from __future__ import annotations
import json
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import pytest
from openvoice import video
from openvoice.video import HEIGHTS, VideoOptions, audio_duration, render_video, video_size, write_approximate_captions


def test_all_aspects_and_resolutions():
    for aspect in video.ASPECTS:
        for resolution in HEIGHTS:
            width, height = video_size(aspect, resolution)
            assert width > 0 and height > 0
            assert width % 2 == 0 and height % 2 == 0


@pytest.mark.parametrize('aspect,resolution', [('3:2', '720p'), ('16:9', '102p'), ('square', '1080p')])
def test_invalid_dimensions(aspect, resolution):
    with pytest.raises(ValueError):
        video_size(aspect, resolution)


def test_srt_timing(tmp_path):
    path = write_approximate_captions('One two three four five six ' * 6, 19.4, tmp_path / 'captions.srt')
    content = path.read_text()
    assert '00:00:00,000' in content
    assert '00:00:19,400' in content
    assert '-->' in content
    assert len(content.split('-->')) > 2


def test_captions_need_words(tmp_path):
    with pytest.raises(ValueError):
        write_approximate_captions('   ', 2, tmp_path / 'empty.srt')


def test_video_missing_ffmpeg(monkeypatch, tmp_path):
    monkeypatch.setattr(video, 'binary', lambda _: '')
    with pytest.raises(RuntimeError, match='FFmpeg'):
        render_video([], tmp_path / 'x.mp4', audio='no.wav')


def test_invalid_images(tmp_path):
    if not video.binary('ffmpeg'):
        pytest.skip('FFmpeg missing')
    with pytest.raises(ValueError, match='one image'):
        render_video([], tmp_path / 'x.mp4', audio='none.wav')
    with pytest.raises(ValueError, match='Image'):
        render_video(['missing.jpg'], tmp_path / 'x.mp4', audio='none.wav')


def make_images(tmp_path):
    from PIL import Image
    output = []
    for name, dimensions, color in [('one.png', (240, 140), (21, 147, 148)), ('two.png', (90, 160), (240, 141, 91))]:
        path = tmp_path / name
        Image.new('RGB', dimensions, color).save(path)
        output.append(path)
    return output


def make_wav(tmp_path):
    path = tmp_path / 'voice.wav'
    with wave.open(str(path), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b'\0\0' * 8000 * 2)
    return path


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='requires FFmpeg')
@pytest.mark.parametrize('aspect,expected', [('16:9', (640, 360)), ('9:16', (202, 360)), ('1:1', (360, 360))])
def test_real_video_export(tmp_path, aspect, expected):
    pytest.importorskip('PIL')
    pictures = make_images(tmp_path)
    audio = make_wav(tmp_path)
    target = tmp_path / (aspect.replace(':', '-') + '.mp4')
    result = render_video(pictures, target, audio=audio, text='This is a test narration.', video_options=VideoOptions(aspect=aspect, resolution='360p', captions=True))
    assert result.is_file() and result.stat().st_size > 3000
    assert result.with_suffix('.srt').is_file()
    check = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', str(result)], capture_output=True, text=True, check=True)
    data = json.loads(check.stdout)['streams'][0]
    assert (data['width'], data['height']) == expected
    assert audio_duration(result) >= 1.8
    frames = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=noprint_wrappers=1:nokey=1', str(result)], capture_output=True, text=True, check=True)
    assert int(frames.stdout.strip()) >= 40


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='requires FFmpeg')
def test_reject_unsupported_format(tmp_path):
    pytest.importorskip('PIL')
    with pytest.raises(ValueError, match='video formats'):
        render_video(make_images(tmp_path), tmp_path / 'bad.avi', audio=make_wav(tmp_path))


def test_cli_video_help():
    from openvoice.cli import main
    with pytest.raises(SystemExit) as error:
        main(['video', '--help'])
    assert error.value.code == 0


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='requires FFmpeg')
def test_mixed_image_formats(tmp_path):
    Image = pytest.importorskip('PIL.Image')
    pictures = make_images(tmp_path)
    jpg = tmp_path / 'mixed.jpg'
    Image.new('RGB', (140, 90), 'purple').save(jpg)
    target = tmp_path / 'mixed.mp4'
    render_video([pictures[0], jpg], target, audio=make_wav(tmp_path), video_options=VideoOptions(resolution='360p'))
    assert audio_duration(target) >= 1.8
    probe = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=noprint_wrappers=1:nokey=1', str(target)], capture_output=True, text=True, check=True)
    assert int(probe.stdout.strip()) >= 40
