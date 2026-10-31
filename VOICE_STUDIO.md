# Character Voice Studio — User Guide

## How speaker tags work

To change speakers, type a tag using the character name, surrounded by square brackets. Every following piece of text is read in that voice until another known tag appears. Multiple tagged speakers can appear **on one line**, including two sentences of a paragraph. Tags that do not match a profile are preserved as ordinary text.

```text
[Narrator] A narrow path led into the forest.
[Maya] Are you sure this is the way? [Ravi] Yes, follow me.
[Narrator] Maya hesitated. [Maya] All right.
```

Add `Narrator`, `Maya`, and `Ravi` in Character Voices, assign different installed Piper models, then choose Export Audio or Export Video. For video, select the image(s) after choosing a video filename.

## Automatic detection

Click **Find Characters** to search for tags and common attributions such as “Alice said” or “Bob asked.” The tool creates editable profiles with installed voice suggestions and guesses language from the character's speech. Character recognition is heuristic and can miss characters, confuse narrative attribution, or assign a language incorrectly. Review the results; the app does **not** infer real gender or age from fiction text.

## Model selection and recommendations

Click **Voices → Download Piper voices by language** to see the catalog sorted by language. Choose individual models, all voices in the filtered language, or the complete catalog. It shows a download-size estimate and asks for confirmation. Profiles store gender, age, voice characteristics, language, model key, and speed/pitch preferences. Gender, age and style profiles now apply adjustable pitch, pacing, and timbre processing to the generated audio in every model language. They cannot completely replace the base model's learned vocal identity; preview the result and choose a suitable voice before a long export.

## Save and reuse

Choose **Save Project** to create a `.json` file with speaker profiles and script, or **Open Project** to resume later. To apply profiles to a batch of books, select the checkbox in **Combine Chapters** or run:

```bash
openmukti audiobooks --folder Library --output-dir Final --output-type audio --voices-project voices.json --mode both
```

An explicit manifest can add `"voice_project": "voices.json"` to individual book objects to override the shared project.

## Model installation

Piper's executable must be installed separately. The downloader only manages models and paired `.onnx.json` configuration files, not the runtime. If Piper is not installed, Openmukti can still use supported system speech engines, but selecting a Piper voice will report an error rather than silently substitute another voice. This protects intended speaker differentiation.


## 6A. Real voice design: age, presentation, and personality

Character age, voice presentation, and personality now affect **generated speech** rather than simply recording a description. Open **Character Voices**, select or add a profile, and choose an **Age**, **Voice presentation**, and **Voice personality**. You can combine personality words separated by commas, for example `warm, calm`, `cheerful, energetic`, or `mysterious, dramatic`. The available keywords are shown in the dropdown. Set **Voice transformation strength** to 0 for the unmodified model voice, or raise it to increase the audible change. Use **Pitch correction** to fine-tune the result. Click **Preview character voice with effects** and listen before producing an entire book. For a non-English model, choose or enter a passage in the model's language.

The voice designer calculates a bounded pitch adjustment, small pacing change, low/high frequency tone adjustments and, for selected styles, dynamics compression. Piper's synthesis speed and an FFmpeg audio filter chain are applied to **each character passage**, so the same controls work with any Piper language model and also in audio-only, per-chapter, whole-book and video audiobook outputs. FFmpeg is required for audible transformations; the application reports an error rather than silently ignoring requested effects when FFmpeg is unavailable. The same profile settings are saved in the voice project JSON and reused during batch exports.

**Important limitations:** These are audio effects, not neural voice conversion or newly trained age/gender-specific models. The base voice model strongly determines naturalness. The presentation settings are artistic pitch/timbre preferences, not verified biological voice attributes. Changing the profile cannot reliably make a voice sound like every age or gender; extreme changes may introduce artifacts. Results differ by model, language, accent and recording quality. There is no separate claim that the official Piper catalog supplies verified age/gender metadata. For the most realistic performance, start with a suitable model and make modest changes.

The processor prefers FFmpeg's Rubber Band pitch-shifting filter when available and falls back to FFmpeg's standard pitch/tempo filters when the bundled FFmpeg build does not include it. The fallback may create more artifacts. Character voice processing is performed entirely on audio and does not translate speech or rewrite language-specific phonemes.


## Complete projects and shared character voices (v1.0.11)

Choose **File → Export entire project (.oamproj)** and **File → Open entire project (.oamproj)** to save and restore text, chapters, media, voice profiles, pronunciation dictionaries and downloaded ONNX/model configuration files. In the main Voice Settings panel choose **Speaker for untagged text** and enable **Apply character profiles to Speak / Audio / Video / Batch** so each character voice, age, gender presentation and personality is used across the whole app. See [COMPLETE_PROJECTS.md](COMPLETE_PROJECTS.md) for detailed GUI steps, CLI examples and licensing notes.
