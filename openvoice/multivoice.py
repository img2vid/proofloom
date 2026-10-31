from __future__ import annotations
import os
import shutil
import tempfile
from pathlib import Path
from .audio import combine_wav, convert_wav
from .engines import RunControl, SpeechSettings, get_engine, SpeechEngine
from .processing import split_text
from .service import JobOptions, prepared_speech_units, render_speech_unit
from .fftools import find_binary
from .character_voices import VoiceProject, parse_passages
from .ipa_pronunciation import display_inline_ipa
from .voice_design import design_for_profile, process_character_audio

AUDIO_EXTENSIONS = {'.wav','.mp3','.m4a','.flac','.ogg','.opus','.aac','.aiff','.wma'}

def render_multivoice(text: str, destination: str | Path, project: VoiceProject, *, control: RunControl | None=None, progress=None, auto_tag: bool=False, default_engine: SpeechEngine | None=None, default_settings: SpeechSettings | None=None, speech_options: JobOptions=JobOptions()) -> Path:
    destination = Path(destination).expanduser().resolve()
    if destination.suffix.lower() not in AUDIO_EXTENSIONS:
        raise ValueError('Unsupported audio export format')
    passage_list = parse_passages(text,project.profiles,auto_tag=auto_tag)
    if not passage_list:
        raise ValueError('No spoken passages found')
    profiles = {p.name.casefold():p for p in project.profiles}
    narrator = profiles.get('narrator')
    if narrator is None:
        raise ValueError('Narrator voice profile is required')
    ipa_files = tuple(dict.fromkeys([*speech_options.ipa_dictionaries, *project.pronunciation_files]))
    sections = [(p,part) for p in passage_list for part in prepared_speech_units(p.text,JobOptions(chunk_size=speech_options.chunk_size,pause_ms=speech_options.pause_ms,repair_ocr=speech_options.repair_ocr,dictionaries=speech_options.dictionaries,operations=speech_options.operations,ipa_dictionaries=ipa_files,language=p.language),language=next((x.language for x in project.profiles if x.name.casefold()==p.speaker.casefold() and x.language not in ('auto','und')),p.language))]
    if not sections:
        raise ValueError('No text after processing')
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='openmukti-multivoice-') as temporary:
        work = Path(temporary)
        files = []
        ffmpeg = find_binary('ffmpeg')
        for index,(passage,segment) in enumerate(sections,1):
            if control:
                control.check()
            profile = profiles.get(passage.speaker.casefold(), narrator)
            selected = profile.voice or (default_settings.model if default_settings else '')
            if selected:
                engine = get_engine('piper')
                engine_key = 'piper'
            else:
                engine = default_engine or get_engine('auto')
                engine_key = engine.key
            original = work / f'{index:06d}-raw.wav'
            model_path=selected if selected.lower().endswith('.onnx') else ''
            voice_name=selected if engine_key=='piper' and not model_path else ''
            design=design_for_profile(profile)
            base=default_settings or SpeechSettings()
            adjusted_rate=max(-10,min(10,base.rate + profile.rate + design.speed_adjust))
            render_speech_unit(segment,original,engine,SpeechSettings(voice=voice_name or (base.voice if not selected else ''),model=model_path,rate=adjusted_rate,pitch=base.pitch,volume=base.volume),control)
            if not original.is_file() or original.stat().st_size < 44:
                raise RuntimeError(f'No speech output for passage {index}')
            normalized = work / f'{index:06d}.wav'
            if ffmpeg:
                process_character_audio(original,normalized,design,control=control)
            else:
                if design.semitones or design.bass_db or design.treble_db or design.energy_db or design.compression:
                    raise RuntimeError('FFmpeg is required to apply character voice age, gender and personality effects.')
                shutil.copy2(original,normalized)
            files.append(normalized)
            if progress:
                progress(index,len(sections),passage.speaker)
        joined=work/'narration.wav'
        try:
            combine_wav(files,joined,pause_ms=speech_options.pause_ms)
        except Exception as exc:
            if not ffmpeg:
                raise RuntimeError('Mixed voices use different WAV formats; FFmpeg is required to normalize them') from exc
            raise
        converted = work/('narration'+destination.suffix.lower())
        if destination.suffix.lower()=='.wav':
            converted=joined
        else:
            convert_wav(joined,converted)
        staged=destination.with_name('.'+destination.name+'.partial')
        try:
            shutil.copy2(converted,staged)
            if control:
                control.check()
            os.replace(staged,destination)
        finally:
            staged.unlink(missing_ok=True)
    return destination

def render_multivoice_video(text: str, images: list[str | Path], destination: str | Path, project: VoiceProject, *, video_options=None, control=None, progress=None, auto_tag: bool=False, default_engine=None, default_settings=None, speech_options: JobOptions=JobOptions()):
    from .video import VideoOptions,render_video
    with tempfile.TemporaryDirectory(prefix='openmukti-voice-video-') as work:
        narration=render_multivoice(text,Path(work)/'audio.wav',project,control=control,progress=progress,auto_tag=auto_tag,default_engine=default_engine,default_settings=default_settings,speech_options=speech_options)
        return render_video(images,destination,audio=narration,text='\n'.join(display_inline_ipa(p.text) for p in parse_passages(text,project.profiles,auto_tag=auto_tag)),video_options=video_options or VideoOptions(),control=control)
