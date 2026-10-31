# Openmukti Audiobook Maker — Version 1.0.12

**New: scanned-book OCR and English spelling review.** Import scanned/mixed PDFs,
page images, multipage TIFFs and ZIP/CBZ image books with local Tesseract OCR,
adaptive black-and-white preprocessing, contrast cleanup, deskew and orientation
correction. Click underlined words for suggestions or use **Correct all OCR**
with one-step undo. Book Studio includes a chapter spelling-review editor.
See [OCR_AND_SPELLING.md](OCR_AND_SPELLING.md) for setup and Proofloom attribution.

**New: Complete project import/export (`.oamproj`) and character voices in every main-window export.** Choose File → Export entire project to bundle text, chapters, covers, narration files, profiles, pronunciation dictionaries, ONNX voices and settings into one portable archive; restore with File → Open entire project. See [COMPLETE_PROJECTS.md](COMPLETE_PROJECTS.md).

![Openmukti Audiobook Maker logo](assets/openmukti-logo.png)

An open-source, offline-capable audiobook creation desktop app and CLI by **Aishik Dutta**, open-source developer. Version 1 adds character/narrator voice projects, sentence-level speaker tags, a language-organized Piper voice downloader, multilingual language detection, and audio-only **and** video audiobook exports. The project is MIT-licensed. Third-party voice binaries, models, and FFmpeg are separately licensed.


## Inline IPA directly inside a story (no dictionary needed)

In **any story editor, imported chapter, audio-only book, audiobook video, or Character Voices script**, put IPA between ordinary angle brackets. Openmukti synthesizes the IPA instead of reading it as text. It works in the same document as speaker tags:

```text
[Narrator] The sign read <həˈloʊ>.
[Alice] The French greeting sounds like <bɔ̃ʒuʁ>!
[Bob] I call the machine <ipa:ˈoʊpənmukti|open mukti>.
[Narrator] We continued down the road.
```

- `<həˈloʊ>` means **speak these phonemes**, not the angle brackets.
- `<ipa:həˈloʊ>` is the explicit form. Use this form for IPA written only with ordinary ASCII letters, such as `<ipa:kat>`, to avoid confusion with HTML tags.
- `<ipa:həˈloʊ|hello>` adds an **optional ordinary-text fallback** for SAPI, eSpeak, macOS voices or Piper configurations without compatible phonemes. This text is not a phonetic-accuracy guarantee.
- `<ipa:/həˈloʊ/|hello>` and `<ipa:[həˈloʊ]|hello>` also work. The enclosing transcription marks are optional.
- The same tags work inside `[Narrator]`, `[Alice]`, or any other speaker's portion, including in the middle of a paragraph. Tags are preserved across chunking, and inline IPA takes priority over pronunciation dictionaries for that span.
- The **Voices → Insert inline IPA in text** menu command adds tags without remembering their syntax.
- Literal common HTML tags such as `<i>` and `<br>` are not treated as IPA. To avoid ambiguity in HTML content or ASCII-only IPA, always use the explicit `ipa:` form.

**What synthesizes it?** Phoneme-level pronunciation requires the Piper Python backend (or the self-contained portable Piper worker) and a Piper voice whose phoneme mapping contains those IPA sounds. Merely installing the legacy Piper executable is not enough. If the model cannot represent a phoneme, the app reports a clear error, or uses the optional fallback. Openmukti cannot force one ONNX model to pronounce the entire IPA inventory of every language. Direct IPA with unsupported engines needs a fallback.

**Command-line examples:**

```bash
openmukti render --engine piper -n en_US-amy-medium -t 'Hello <ipa:həˈloʊ|hello>!' -w hello.wav
openmukti multivoice --project characters.json -f tagged-story.txt -w story.mp3
openmukti video --engine piper -f tagged-story.txt --images cover.png -w story.mp4
```

You do **not** need `--ipa-dictionary` for inline tags. Existing JSON/TSV pronunciation rules still work beside them.

## Quick start

Install **Python 3.10+** and extract the source archive. Open a terminal in its directory:

```bash
python -m pip install ".[ocr]"
python -m openvoice.cli gui
```

Windows x64 users with CPython 3.15.2 may double-click `Build-Portable-EXEs.bat` to build fully portable desktop and command-line executables with a separately bundled Piper helper. See `PYTHON_315_PORTABLE_BUILD.md`. The build downloads FFmpeg/FFprobe and needs internet access. **The source ZIP does not contain prebuilt Windows EXEs.** Linux users can install the included `.deb` or run the generated portable archive, with Python, Tkinter, FFmpeg, and an available TTS engine.

For stronger offline Latin-script language identification (optional):

```bash
python -m pip install '.[languages]'
```

## Character voices

Open **Character Voices** in the main window. Create or auto-detect a narrator and characters. Select a Piper voice for each character or leave their voice blank for automatic synthesis. The script accepts speaker tags anywhere in a line:

```text
[Narrator] The door opened slowly.
[Alice] Is anybody here? [Bob] I am here.
[Narrator] The two friends went home.
```

Save a `.json` voice project for reuse. Each tag changes the synthesizer for the next passage. If you use Piper models, the actual Piper executable must also be installed. The text-to-audio and text-to-video exporters and the bulk book converter can all use the same voice project.

## Download Piper voices

In the GUI choose **Voices → Download Piper voices by language**, select a language or search for a particular voice, then download selected, all shown, or the entire catalog. Large catalog downloads can consume **many gigabytes**; the app shows an estimated size and asks for confirmation. Each voice is downloaded as a model `.onnx` and configuration `.onnx.json` with verification against the [rhasspy/piper-voices voices.json](https://huggingface.co/rhasspy/piper-voices/blob/main/voices.json) metadata. Models download on demand, not in this source archive. Some voice models have additional conditions; check the individual model cards before redistribution.

Piper provides voices in multiple languages. The catalog does not reliably list gender, age, or vocal character: those profile preferences are editable descriptions, not guarantees about a model. Language detection is a heuristic with an optional higher-accuracy backend and should be reviewed for mixed-language fiction, transliterated languages, or very short passages.

## Command-line examples

```bash
openmukti voice-catalog --language English
openmukti voice-download en_US-amy-medium --yes
openmukti detect-language -f chapter.txt
openmukti character-profiles -f chapter.txt -w characters.json
openmukti multivoice --project characters.json -f chapter.txt -w audiobook.mp3
openmukti multivoice --project characters.json -f chapter.txt --images cover.png -w audiobook.mp4
openmukti audiobooks --folder books --output-dir output --output-type audio --audio-format mp3 --voices-project characters.json --mode both
openmukti audiobooks --folder books --output-dir output --output-type video --voices-project characters.json --mode both
```

## File naming for bulk conversion

```text
MyLibrary/
  First Book/
    Chapter 01.txt
    Chapter 01.png
    Chapter 02.txt
    Chapter 02.jpg
  Second Book/
    Chapter 01.txt
    Chapter 01.jpg
```

Covers are necessary for videos but **not** for audio-only audiobooks. You can also use a JSON manifest to explicitly match chapter text, cover images, recorded narration, and per-book character voice projects. See `examples/` and `USER_MANUAL.md`.

## Honest compatibility notes

- Native Windows x64 and Windows ARM64 executables must be built on compatible Windows machines. Build scripts are included; prebuilt native EXEs are **not** included here.
- No voice ONNX models are included. The catalog downloader requires internet access for first use; previously fetched metadata is cached for later reference.
- Piper is a separate runtime. The app can use OS voices or eSpeak while Piper is absent.
- FFmpeg/FFprobe are embedded by the native Windows release builder; `.deb` installs FFmpeg as a system dependency.
- Version 1 intentionally does not include Gutenberg Mode.

See `USER_MANUAL.html`, `USER_MANUAL.md`, `VOICE_STUDIO.md`, `IPA_PRONUNCIATION.md`, and `ABOUT_US.md`.

## Windowed, maximized, and fullscreen display (1.0.2)

The desktop window automatically fits the available display at startup. The main audio and export buttons stay visible at the bottom while the voice-settings panel scrolls independently. Chapter management, character voices, Piper downloads, and video settings use scrollbars when their full contents cannot fit vertically. Chapter tables also have horizontal scrolling.

Press **F11** to toggle fullscreen. Press **Esc** to leave fullscreen (outside fullscreen, Esc retains its Stop behavior). You can resize the main window or popups freely, including on low-resolution screens; scroll within a popup to reach its bottom actions. See `USER_MANUAL.md` for layout details.


## Version 1.0.2: Bengali Piper and live display adjustment

The app now checks Piper configuration before synthesis. Some voice configurations contain phoneme-map entries with multi-character keys (for example `ar`) that the legacy Piper executable rejects while loading the configuration. The app uses a temporary compatibility configuration containing only codepoints the legacy engine can process. Original ONNX and `.onnx.json` files remain unchanged. If a voice cannot be safely adapted, the app explains the problem and offers the optional Python Piper backend instead of displaying an opaque process exit code. This is not a Bengali text-encoding issue.

The GUI checks the available display area periodically and moves/resizes its windows into the visible desktop when Windows changes resolution, display scaling, taskbar or monitor. Fullscreen is left alone until exited. The main action controls remain outside the scrollable editing panel and toolbar secondary actions collapse on smaller windows (they remain available in File/Tools/Voices menus). Popup forms scroll when needed. All screen sizes are bounded by the desktop work area and OS window decorations; displays smaller than 640×480 may require scrolling or a larger usable desktop area.

Rebuild the Windows EXE from this source with `Build-Portable-EXEs.bat`. An EXE compiled from older source won't acquire these fixes automatically.

## Version 1.0.3 — Windows Piper playback repair

Windows WAV playback now invokes a packaged PowerShell script using `-File` and a separately passed `-WavPath` argument. This fixes the unexpected-token error when Windows paths are interpreted as PowerShell source text. Piper synthesis and audio export remain unchanged. Rebuild both Windows EXE programs from this source; older EXEs will retain the error.


## 6A. Real voice design: age, presentation, and personality

Character age, voice presentation, and personality now affect **generated speech** rather than simply recording a description. Open **Character Voices**, select or add a profile, and choose an **Age**, **Voice presentation**, and **Voice personality**. You can combine personality words separated by commas, for example `warm, calm`, `cheerful, energetic`, or `mysterious, dramatic`. The available keywords are shown in the dropdown. Set **Voice transformation strength** to 0 for the unmodified model voice, or raise it to increase the audible change. Use **Pitch correction** to fine-tune the result. Click **Preview character voice with effects** and listen before producing an entire book. For a non-English model, choose or enter a passage in the model's language.

The voice designer calculates a bounded pitch adjustment, small pacing change, low/high frequency tone adjustments and, for selected styles, dynamics compression. Piper's synthesis speed and an FFmpeg audio filter chain are applied to **each character passage**, so the same controls work with any Piper language model and also in audio-only, per-chapter, whole-book and video audiobook outputs. FFmpeg is required for audible transformations; the application reports an error rather than silently ignoring requested effects when FFmpeg is unavailable. The same profile settings are saved in the voice project JSON and reused during batch exports.

**Important limitations:** These are audio effects, not neural voice conversion or newly trained age/gender-specific models. The base voice model strongly determines naturalness. The presentation settings are artistic pitch/timbre preferences, not verified biological voice attributes. Changing the profile cannot reliably make a voice sound like every age or gender; extreme changes may introduce artifacts. Results differ by model, language, accent and recording quality. There is no separate claim that the official Piper catalog supplies verified age/gender metadata. For the most realistic performance, start with a suitable model and make modest changes.

The processor prefers FFmpeg's Rubber Band pitch-shifting filter when available and falls back to FFmpeg's standard pitch/tempo filters when the bundled FFmpeg build does not include it. The fallback may create more artifacts. Character voice processing is performed entirely on audio and does not translate speech or rewrite language-specific phonemes.

For examples of age, voice presentation, and personality effects, see `VOICE_DESIGNER.md` and `examples/Voice-Designer-Profiles.json`.


## Windows security-focused release packaging (1.0.7)

Native Windows packages now default to self-contained PyInstaller **onefile** executables with embedded FFmpeg and Piper runtime components. The complete portable ZIP preserves all application features and includes per-file SHA-256 hashes. See `SECURITY_AND_RELEASE.md` for build, inspection, signing and false-positive reporting.

## IPA pronunciations (Version 1.0.7)

Open **Voices → IPA Pronunciation Editor** to assign Unicode IPA pronunciations to words and phrases. Choose a language such as `en`, `bn`, `hi`, `fr` or `*` for all languages. Save a JSON/TSV dictionary and use it for normal speech, character projects, audio-only audiobooks and audiobook videos.

```bash
openmukti ipa-check examples/ipa-pronunciations.json
openmukti render --engine piper --ipa-dictionary examples/ipa-pronunciations.json -f chapter.txt -w chapter.wav
openmukti multivoice --project characters.json --ipa-dictionary examples/ipa-pronunciations.json -f chapter.txt -w story.mp3
```

Direct IPA-to-speech uses the **optional Python Piper runtime** with a model whose phoneme map supports the chosen IPA symbols. Standard Piper CLI and ordinary speech engines do **not** accept arbitrary IPA; provide a `spoken` fallback for them. See [IPA_PRONUNCIATION.md](IPA_PRONUNCIATION.md) for the format, setup, language rules, scope and limitations.

## GitHub source distribution

This repository contains source, tests, essential assets, examples, user documentation, and packaging scripts. Generated EXEs, compiled packages, caches, demos, large voice models, and third-party binaries are intentionally **not committed**. Use `.gitignore` to keep build artifacts out of pull requests.

## Python 3.15.2 portable Windows build (Version 1.0.11)

Use `Build-Portable-EXEs.bat` on Windows x64 with CPython **3.15.2**. The main GUI and CLI use Python 3.15.2, while a bundled Piper helper built with Python 3.12 preserves neural IPA synthesis despite the current ONNX Runtime wheel limitation. Both runtimes are frozen into the portable package, so destination computers need no Python installation. See `PYTHON_315_PORTABLE_BUILD.md` for detailed instructions.
