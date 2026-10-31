# Openmukti Audiobook Maker Version 1

## Complete user manual

*Created by Aishik Dutta, open-source developer.*

This guide is written for people who have never used an audiobook creator. All steps apply to Version 1, the edition without Gutenberg Mode.

## 1. What does the software do?

Openmukti turns written text into narration, creates audio-only audiobooks or illustrated audiobook videos, and combines multiple chapters into a complete book. It supports separate voices for the narrator and characters, can import existing chapter audio, and can process entire folders of ebooks. It can work offline after the necessary speech engines and Piper models have been installed. Internet is used to download additional voices.

## 2. First installation

**Windows:** Install Python 3.10 or newer from its official website and check **Add Python to PATH** during setup. Extract the ZIP and open Command Prompt in the extracted folder. Enter `py -m pip install .`, then `py -m openvoice.cli gui`. To create portable EXEs on your own Windows PC without GitHub, double-click `Build-Portable-EXEs.bat`. The script requires internet the first time for its build tools and FFmpeg downloads. The GUI executable it creates is `OpenmuktiAudiobookMaker.exe` and the command-line program is `OpenmuktiAudiobookMakerCMD.exe`. Python is only needed for *building*, not for running the finished EXE on a compatible Windows PC.

**Linux:** Use `python3 -m pip install .` in a Python virtual environment, then `python3 -m openvoice.cli gui`. For Debian, Ubuntu, and Lubuntu, the `.deb` release can install Python and FFmpeg dependencies, but Tkinter and an actual speech engine must still be present. Other Linux distributions can use the source or supported release recipes. Native GUI support also requires an active desktop environment.

**macOS and BSD:** Use Python 3.10+, Tkinter, FFmpeg, and a supported engine. Platform compatibility depends on available speech engines and operating-system packages. Refer to `PACKAGING_MATRIX.md` for recipes and limits.

## 3. The main window

The main text editor accepts pasted text or an imported document. Voice settings are on the right; playback, audio export, and video export are below. The **Character Voices** button opens the multi-speaker workspace. **Combine Chapters** imports many chapters/books. The **Voices** menu lets you add or download neural voice models. **Help** contains this manual, Piper setup instructions, file-naming examples, and About Us.

## 4. How to install the Piper speech engine

Piper is a separate local neural speech engine. First install the Piper runtime that matches your computer's OS and CPU architecture, using the official Piper project or its maintained distribution packages. Confirm that `piper --help` works in a terminal, or place the `piper` (`piper.exe` on Windows) executable in the appropriate application vendor folder. If your system needs additional Piper runtime libraries, include those with the executable.

Piper is optional. Without it, the app uses Windows SAPI, macOS system voices, or eSpeak if available. A user-selected Piper voice does not silently fall back to a different voice.

## 5. How to download Piper voices — easiest method

1. In the application, open **Voices → Download Piper voices by language**.
2. Let the official voice catalog load. On first use, this requires internet access.
3. Use the **Language** selector to choose English, Bengali, Hindi, French, etc. The list comes from the actual catalog and will change when the publisher adds models.
4. Search for a voice name or model ID. Each row shows the model name, language, quality, speaker count, and size.
5. Ctrl-click to select multiple voices; click **Download Selected**. There are also **Download All Shown** and **Download Entire Catalog** options. The latter can use enormous disk space: read the size estimate before confirming.
6. The app downloads each `.onnx` and its matching `.onnx.json`, verifies metadata checksums and byte sizes, and installs them into its voice library. Failed downloads are not installed.
7. Return to the main window and click **Refresh installed voices**. Select **Piper** as the engine, or leave **Auto** enabled to prioritize Piper when a model and runtime are available.

You can alternatively download model pairs manually from the [Piper voice catalog](https://huggingface.co/rhasspy/piper-voices/tree/main) and choose **Add local Piper model + configuration**. The two filenames must match exactly: `en_US-amy-medium.onnx` and `en_US-amy-medium.onnx.json`.

Individual voices may have specific licenses, attribution requirements, or usage restrictions. Check their model cards before distributing voice files or audio made from them.

## 6. Narrator and character voices

1. Open **Character Voices**.
2. Type story text into the script editor, or open a document in the main editor first.
3. Add a `Narrator` and each character. You can click **Find Characters** to search existing dialogue tags and typical lines such as “Alice said.” Always review the suggestions.
4. Select a character, choose a downloaded Piper model, and save the profile.
5. Set language, optional age/gender labels, characteristics, and speed/pitch preferences. These settings now drive an adjustable post-synthesis voice-design effect; refer to section 6A for supported adjustments and naturalness limits.
6. Mark speakers in the story with explicit tags. Example:

```text
[Narrator] The school bell rang.
[Anika] Hurry up! [Rohan] I'm coming.
[Narrator] They raced to the classroom.
```

7. Click **Export Audio** and choose `.wav`, `.mp3`, `.m4a`, `.flac`, or `.ogg`, or click **Export Video**, choose `.mp4` etc., and select a cover image or series of images.
8. Save the project as JSON so you can reuse profiles in later chapters and books.

Speaker tags can occur anywhere in a line and can surround one sentence, an entire paragraph, or only a passage. The software synthesizes each segment using the assigned voice, normalizes sample rates using FFmpeg, and joins the pieces into one continuous audio track. When creating video, this track is used as the video's narration.

## 7. Automatic language detection and voice recommendations

Use **Detect Language + Recommend** in the voice studio, or `openmukti detect-language -f chapter.txt` in the CLI. The software distinguishes several writing scripts locally and uses language words to differentiate commonly encountered Latin-script languages. Installing the optional `lingua-language-detector` package improves offline recognition for longer ambiguous passages. The voice recommendations prioritize available languages, dialects, model quality, and voice variety—not demographic assumptions. For very short dialogue, transliteration, or mixed-language text, review and manually correct language selections.

## 8. How to create an audio-only audiobook

For a single story, create a character voice project and click **Export Audio**. For a library of several books, open **Combine Chapters**, add book folders or a JSON manifest, set **Output** to `audio`, and choose MP3 or WAV. Choose **Export** as `book`, `chapters`, or `both`. Enable **Use my Character Voice Studio profiles** if your chapters contain speaker tags. Choose an output directory and click **One-click export all books**.

Audio-only projects do not need any cover images.

## 9. How to create a video audiobook

In **Character Voices**, click **Export Video** after making profiles, and select one or more images. Or open **Combine Chapters**, set **Output** to `video`, and assign images to chapters. Choose landscape 16:9, portrait 9:16, or square 1:1, then select a resolution and output format. The resulting video uses each chapter's cover while its corresponding narration is playing. For multi-chapter books, complete-book export joins chapter videos in order.

## 10. File naming and bulk conversion

Use one folder per book. Name files with matching chapter numbers. Example:

```text
Audiobook Library/
  The Island Adventure/
    Chapter 01.txt
    Chapter 01.png
    Chapter 02.txt
    Chapter 02.jpg
  Another Story/
    Chapter 01.txt
    Chapter 01.png
```

For more control, create a JSON manifest (see `examples/books.json`) and specify each chapter's text/audio/cover, book title, and optional `voice_project` path. You can import many ebooks at once. The batch exporter records errors and successes in a JSON report and can skip files that already exist.

## 11. Command-line recipes

```bash
openmukti voice-catalog --language Bengali
openmukti voice-download bn_BD-google-medium --yes
openmukti detect-language -f story.txt
openmukti character-profiles -f story.txt -w my-voices.json
openmukti multivoice --project my-voices.json -f story.txt -w story.mp3
openmukti multivoice --project my-voices.json -f story.txt --images cover.png -w story.mp4 --aspect 16:9
openmukti audiobooks --folder "Audiobook Library" --output-dir Export --output-type audio --audio-format mp3 --voices-project my-voices.json --mode both
openmukti audiobooks --folder "Audiobook Library" --output-dir Export --output-type video --voices-project my-voices.json --mode both
```

For all catalog models, use `openmukti voice-download --all --yes`. This can consume very large amounts of data and storage; prefer a single language or selected voices.

## 12. Troubleshooting

**No Piper voices:** Install the Piper runtime; download both the ONNX model and its matching configuration; refresh voices. **Wrong narrator/character voice:** Check explicit speaker tags and profile names; automatic character detection is not guaranteed to be correct. **No voice for a given language:** Confirm the official catalog offers a compatible model. **MP3/video export fails:** Make sure FFmpeg/FFprobe are available or use a release build with embedded tools. **Downloaded model failed verification:** Retry with a stable connection; the publisher may have updated its catalog during the download. **No covers:** Video books require images, audio-only books do not. **Book text appears as a single chapter:** Check chapter heading formats or use an explicit manifest. **Windows build fails:** Read `BUILD_WINDOWS_WITHOUT_GITHUB.md`; use a matching Windows/Python architecture and internet during setup. **Slow conversion:** Neural synthesis is CPU-intensive; reduce concurrent exports or use a lighter voice.

## 13. Privacy and licensing

The software synthesizes locally. When downloading voices, it contacts the Piper voice repository, and models are stored locally. It does not send your story text to Piper's catalog. Openmukti source code is MIT-licensed. Piper runtimes, FFmpeg binaries, and individual voices have their own licenses; review them when redistributing a bundled application. User-provided stories and images must be used with appropriate rights.

## 14. About the developer

**Aishik Dutta** — open-source developer and creator of Openmukti Audiobook Maker. The project aims to make audiobook creation and multilingual narration accessible through local processing, a friendly desktop interface, and reusable open formats.

## Display size, window resizing and fullscreen

Openmukti Audiobook Maker automatically opens inside your display limits. On smaller screens, select the scrollbar at the far right of the Character Voices, Combine Chapters, or Video window to reach the remaining controls. The main editor and voice settings have independent scrollbars, and the export controls remain on screen. Chapter-file tables can also scroll sideways.

For fullscreen, press **F11**. Press **Escape** to return to a windowed view. Drag the window edges to resize it, and use your operating system's maximize button to fill the desktop. Avoid enabling text scaling beyond what your screen can accommodate; if controls feel crowded, maximize the window or use the scrollbars.


## Display resolution changes and Bengali Piper troubleshooting

When Windows changes display resolution while Openmukti is running, Version 1.0.2 automatically constrains the main window and dialogs to the visible work area. You can drag a window smaller or use F11 for fullscreen, Esc for windowed. On small screens, use File, Tools, or Voices menus to reach commands hidden from the compact toolbar, and scroll dialogs using their scrollbars.

If `bn_BD-google-medium` reports `'ar' is not a single codepoint`, the Piper executable is refusing phoneme configuration data, not your Bengali text. Version 1.0.2 repairs only the temporary configuration passed to the legacy runtime, leaving your original downloaded files unmodified. If the voice remains incompatible, try a different voice or the optional Python Piper backend. Always use a model and its matching `.onnx.json`.

## Windows Piper playback error (Version 1.0.3)

If you previously saw `PlaySync()` followed by `Unexpected token` and a temporary `openmukti-piper-...\speech.wav` path in a PowerShell error, install or rebuild Version 1.0.3. The cause was the WAV playback command, not the content of your text and not the Piper voice model. The repaired app passes the WAV filename as a separate parameter to `resources/play_wav.ps1`.

Open the extracted Version 1.0.3 source directory in Windows and double-click `Build-Portable-EXEs.bat`. Then use the new executable in `dist` instead of an older one.


## 6A. Real voice design: age, presentation, and personality

Character age, voice presentation, and personality now affect **generated speech** rather than simply recording a description. Open **Character Voices**, select or add a profile, and choose an **Age**, **Voice presentation**, and **Voice personality**. You can combine personality words separated by commas, for example `warm, calm`, `cheerful, energetic`, or `mysterious, dramatic`. The available keywords are shown in the dropdown. Set **Voice transformation strength** to 0 for the unmodified model voice, or raise it to increase the audible change. Use **Pitch correction** to fine-tune the result. Click **Preview character voice with effects** and listen before producing an entire book. For a non-English model, choose or enter a passage in the model's language.

The voice designer calculates a bounded pitch adjustment, small pacing change, low/high frequency tone adjustments and, for selected styles, dynamics compression. Piper's synthesis speed and an FFmpeg audio filter chain are applied to **each character passage**, so the same controls work with any Piper language model and also in audio-only, per-chapter, whole-book and video audiobook outputs. FFmpeg is required for audible transformations; the application reports an error rather than silently ignoring requested effects when FFmpeg is unavailable. The same profile settings are saved in the voice project JSON and reused during batch exports.

**Important limitations:** These are audio effects, not neural voice conversion or newly trained age/gender-specific models. The base voice model strongly determines naturalness. The presentation settings are artistic pitch/timbre preferences, not verified biological voice attributes. Changing the profile cannot reliably make a voice sound like every age or gender; extreme changes may introduce artifacts. Results differ by model, language, accent and recording quality. There is no separate claim that the official Piper catalog supplies verified age/gender metadata. For the most realistic performance, start with a suitable model and make modest changes.

The processor prefers FFmpeg's Rubber Band pitch-shifting filter when available and falls back to FFmpeg's standard pitch/tempo filters when the bundled FFmpeg build does not include it. The fallback may create more artifacts. Character voice processing is performed entirely on audio and does not translate speech or rewrite language-specific phonemes.


## Publishing portable Windows release 1.0.7

The Windows build now uses single-file self-extracting EXEs with no required `_internal` directory. Copy either EXE by itself to a compatible Windows PC. The EXE needs access to the system temporary directory while running. `SECURITY_AND_RELEASE.md` documents checksum verification, third-party binaries and antivirus false-positive reporting. No vendor-cleanliness guarantee is possible.


## Custom IPA pronunciations (Version 1.0.7)

You can teach Openmukti how to pronounce names, places, rare words and invented vocabulary in many languages. Open **Voices → IPA Pronunciation Editor**, enter the written word, its **IPA** sound transcription (e.g. `hello` → `/həˈloʊ/`), and language `en`. Choose `*` for all languages. Add an optional **spoken fallback** such as `heh-low`. Select **Add / Update**, then **Save + Activate** to save a JSON pronunciation dictionary.

The main app includes an **IPA pronunciations** field. For multi-speaker stories, open **Character Voices**, enter the same IPA dictionary filename in the studio, and save the character project. Each character keeps their own Piper voice and language settings. The dictionary is also used when that project produces an audiobook video.

CLI: `openmukti ipa-check examples/ipa-pronunciations.json`, `openmukti render --engine piper --ipa-dictionary my-pronunciations.json -f chapter.txt -w chapter.wav`, or `openmukti multivoice --project characters.json --ipa-dictionary my-pronunciations.json -f chapter.txt -w audiobook.mp3`. For a folder of audiobooks use `openmukti audiobooks --folder books --output-dir out --output-type audio --ipa-dictionary my-pronunciations.json`.

**For precise IPA synthesis:** install `piper-tts` Python and choose a Piper model containing the necessary IPA phoneme symbols. The application passes supported phonemes directly to Piper's neural phoneme-ID synthesis path. A model that lacks a phoneme will raise a helpful error. Ordinary TTS engines and the legacy Piper CLI use only the `spoken` text fallback; they cannot promise IPA-exact pronunciation. Models are language-specific, so you cannot assume every IPA sound works in every language. See **IPA_PRONUNCIATION.md** for the full JSON/TSV format, examples and troubleshooting.


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

**What synthesizes it?** Phoneme-level pronunciation requires the optional Piper Python backend and a Piper voice whose phoneme mapping contains those IPA sounds. Merely installing the legacy Piper executable is not enough. If the model cannot represent a phoneme, the app reports a clear error, or uses the optional fallback. Openmukti cannot force one ONNX model to pronounce the entire IPA inventory of every language. Direct IPA with unsupported engines needs a fallback.

**Command-line examples:**

```bash
openmukti render --engine piper -n en_US-amy-medium -t 'Hello <ipa:həˈloʊ|hello>!' -w hello.wav
openmukti multivoice --project characters.json -f tagged-story.txt -w story.mp3
openmukti video --engine piper -f tagged-story.txt --images cover.png -w story.mp4
```

You do **not** need `--ipa-dictionary` for inline tags. Existing JSON/TSV pronunciation rules still work beside them.


## Python 3.15.2 portable Windows build (Version 1.0.11)

Use `Build-Portable-EXEs.bat` on Windows x64 with CPython **3.15.2**. The main GUI and CLI use Python 3.15.2, while a bundled Piper helper built with Python 3.12 preserves neural IPA synthesis despite the current ONNX Runtime wheel limitation. Both runtimes are frozen into the portable package, so destination computers need no Python installation. See `PYTHON_315_PORTABLE_BUILD.md` for detailed instructions.


## Complete projects and shared character voices (v1.0.11)

Choose **File → Export entire project (.oamproj)** and **File → Open entire project (.oamproj)** to save and restore text, chapters, media, voice profiles, pronunciation dictionaries and downloaded ONNX/model configuration files. In the main Voice Settings panel choose **Speaker for untagged text** and enable **Apply character profiles to Speak / Audio / Video / Batch** so each character voice, age, gender presentation and personality is used across the whole app. See [COMPLETE_PROJECTS.md](COMPLETE_PROJECTS.md) for detailed GUI steps, CLI examples and licensing notes.


## Scanned-book OCR and English spelling (v1.0.12)

Use **Import scans** above the editor for scanned PDFs, images, multipage TIFFs or ZIP/CBZ image books. Choose adaptive black-and-white, Otsu, contrast, deskew, rotation and page-range options. Click underlined words for spelling suggestions, or use **Correct all OCR**; Ctrl+Z undoes corrections. Book Studio includes **Review chapter OCR / spelling**. Complete projects retain OCR settings, the recognition report and personal words. See **OCR_AND_SPELLING.md** or the new Help menu entry for installation, portable builds and Proofloom attribution.
