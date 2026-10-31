# Complete projects (.oamproj) — Openmukti Audiobook Maker v1.0.11

A `.oamproj` file is a portable project archive. It saves your actual project, not just a list of paths on your computer. It is supported by the graphical interface and command line. Version 1 (without Gutenberg Mode) is the only edition changed in this release.

## Save a complete project

1. Open Openmukti Audiobook Maker and enter or import your text. Character tags like `[Alice]` and inline IPA like `<ipa:həˈloʊ|hello>` remain part of the saved text.
2. Under **Voices → Character Voice Studio**, create your narrator and character profiles. Save each profile's settings in the editor. The regular editor remains the main story text.
3. Optionally open **Combine Chapters** to import books, chapter texts, recorded narration and images. The book list stays in memory even after closing the dialog.
4. Optionally open **Text + Images → Video** to add cover images, a prerecorded soundtrack, and video size settings.
5. Under **File → Export entire project (.oamproj)**, choose where to save the file. The app includes references' actual files in the archive and verifies them with SHA-256 values.

The archive contains the editor text, separate Character Voices script, narrator and speaker profiles, age/gender/personality/audio-effect settings, voice selections, rate/pitch/volume, OCR setting, text replacement and IPA dictionaries, Piper ONNX model files and matching `.onnx.json` configuration files, chapter descriptions, imported chapter documents, cover images, prerecorded audio, book-specific voice profiles, video source images, soundtrack, export options, and editor font size.

**Important:** Voice model weights and prerecorded audio can be very large. Project export requires enough disk space. An archive is not necessarily shareable without permission to redistribute its included voice models, book text, recordings and images. Review their respective licenses and privacy implications.

If a referenced model, config, or file is missing, project export produces a visible error instead of silently creating an incomplete archive. Character profiles that name a Piper voice must have a downloaded matching model and configuration before export. No speech engine executable is included; the destination Openmukti installation still needs a compatible speech engine (and FFmpeg for some exports).

## Import a project

1. Choose **File → Open entire project (.oamproj)**.
2. Select the archive. The program checks file inventory and SHA-256 checksums, then extracts included resources to a private working directory. Original folders are not needed.
3. The editor, voice profiles, books, video images and settings are restored. Open **Combine Chapters** or **Text + Images → Video** to see and edit the imported project.
4. Save a revised project with **File → Export entire project (.oamproj)**.

The in-use extracted resources are temporary and cleaned up when the app closes; the `.oamproj` file remains intact. Do not delete your archive if you wish to reopen it later.

## Character profiles now affect the whole app

In the main **Voice Settings** panel, select a speaker using **Speaker for untagged text** and leave **Apply character profiles to Speak / Audio / Video / Batch** enabled. The chosen character provides the default for text without an explicit tag. Explicit `[Narrator]`, `[Alice]`, and other speaker tags switch to their corresponding profiles mid-paragraph or mid-chapter. Profiles govern the selected Piper model, age/pitch profile, gender-presentation audio processing, personality, rate, IPA rules, and language handling.

The same voice-profile pipeline is now used for the main **Speak** button, **Export audio**, **Text + Images → Video** when narration is synthesized, main-window **Batch**, and **Combine Chapters**. The dedicated Character Voices workflow remains available. If **Apply character profiles** is turned off, the original single-voice workflow is used. Prerecorded audio does not get resynthesized or assigned to characters automatically.

The main voice/engine settings are the fallback when a profile has no specific Piper model. For example, if `[Alice]` has her own model but the Narrator model is empty, Alice uses her model and Narrator uses the main window's selected engine/voice. Speech volume, rate and other applicable settings are carried into the shared renderer.

## Command line examples

```bat
openmukti project-pack -f story.txt -w story.oamproj --voice-project characters.json --images cover.png
openmukti project-verify story.oamproj
openmukti project-unpack story.oamproj --output-dir extracted
openmukti project-render story.oamproj -w finished-audiobook.wav
openmukti project-render story.oamproj -w finished-video.mp4
```

`project-pack` supports additional `--model` and `--ipa-dictionary` arguments. `project-render` uses the voice settings saved inside the archive. The `project-verify` command checks resources, and `project-unpack` extracts them into a chosen folder. The GUI saves significantly more settings than a minimal `project-pack` invocation.

## Notes on compatibility

Complete projects use a versioned JSON manifest inside a ZIP-compatible archive with SHA-256 checksums. Project v1 import rejects unknown versions, unsafe paths, extra archive entries and corrupted assets. The `.oamproj` file is data, not an executable; opening it does not install apps or execute code. The portable Windows EXE build scripts remain supported with Python 3.15.2 and the separately embedded compatible Piper helper.
