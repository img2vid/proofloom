# Voice Designer — Openmukti Audiobook Maker 1.0.4

## What changes in the sound?

For every named character and the Narrator, the voice profile uses the selected age group, voice presentation, voice personality, and the manual pitch/rate settings to control an audio effects chain after Piper synthesis. Unlike descriptive profile labels, these controls change exported audio. They operate on WAV audio and therefore work with every language supported by the selected voice engine.

## Getting started

1. Install Piper and at least one voice model that can read your story language. Pair each `.onnx` with its `.onnx.json` configuration.
2. Open **Character Voices** and add/select a character.
3. Select the voice model. Choose **Age**, **Voice presentation** and one or more **Voice personality** values (comma separated).
4. Adjust **Voice transformation strength**. A setting of 0 restores the original voice; try 35–75 before stronger changes.
5. Press **Preview character voice with effects** to listen. A short passage in the model language gives the most useful feedback.
6. Save your project and export audio or video. The same profile transforms every passage assigned to that speaker, even across chapters and batch book exports.

## Available age groups

Unspecified, Child, Teen, Young adult, Adult, Middle aged, Senior. Their pitch, pacing and equalizer settings are artistic approximations. Child and Teen tend toward higher pitch; some older-character profiles use lower pitch and slightly slower delivery.

## Voice presentation

Unspecified, Female, Male, Nonbinary, Androgynous. These are **user-selected artistic voice preferences**, not automatic biological inferences from a story or a voice file. Female and Male apply different pitch/tone starting points. Nonbinary and Androgynous do not impose a stereotyped pitch: use the manual pitch dial to choose the preferred sound.

## Personality styles

Natural, Warm, Calm, Expressive, Serious, Cheerful, Dramatic, Gentle, Soft, Energetic, Mysterious, Gruff, Whispery, Angry, Sad, Shy, Confident, Robotic, Villainous. Combinations are averaged for tone and pacing. Speech-level emotion recognition, true whisper synthesis and expressive neural retraining are **not** implemented: the audio effects approximate the selected qualities.

## Technical behavior

The exporter synthesizes each passage with the selected Piper ONNX model and modifies playback rate slightly where appropriate. FFmpeg then applies pitch shifting, bass and treble filtering, compression and gain adjustments to each passage before joining chapters. It uses FFmpeg's Rubber Band filter when available or its standard pitch/tempo filters as a fallback. Adjustments can introduce artifacts or unnatural resonance. If FFmpeg is missing and the profile requires audio effects, Openmukti reports an error rather than pretending those effects were applied. No GPU is required for the FFmpeg transformations.

## Saving profiles and advanced users

Each voice project JSON saves `gender`, `age`, `characteristics`, `pitch`, `rate`, and the new `design_strength` field. Old projects load with the default strength of 85. A value of 0 disables transformations. The CLI `openmukti multivoice --project voices.json -f story.txt -w story.wav` and batch `--voices-project` options use exactly the same processing pipeline as the GUI.

## Compatibility and limits

The system can process model audio from different languages, but **cannot make a model speak a language it was not trained for**. Use an appropriate Piper language model for each speaking part. A single model cannot be guaranteed to sound convincingly like all ages or genders: pitch and EQ are not the same as training a new voice. Results differ by voice. Licensed Piper models and FFmpeg may have additional redistribution obligations.
