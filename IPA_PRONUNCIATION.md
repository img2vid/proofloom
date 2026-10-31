# Custom IPA pronunciations — Openmukti Audiobook Maker 1.0.7

Openmukti accepts pronunciation rules written in **Unicode International Phonetic Alphabet (IPA)**. Rules are organized by language and can be shared by the text editor, character voices, audiobook audio export, and audiobook video export.

## Quick start (desktop)

1. Open **Voices → IPA Pronunciation Editor**.
2. Enter the written word or phrase, its IPA transcription, and an optional ISO language code such as `en`, `bn`, `hi`, `fr` or `ja`. Use `*` to apply a rule to every language.
3. Optionally provide a **Spoken fallback** (ordinary words or spelling) for TTS engines that cannot synthesize IPA.
4. Click **Add / Update**, then **Save + Activate**. The saved JSON file will appear in the main window's **IPA pronunciations** field.
5. Select your voice, enter your story, and use **Speak**, **Export Audio**, or **Text + Images → Video**.
6. For narrator and character voices, open **Character Voices**, set **IPA pronunciation dictionary** to the same JSON file, and save your voice project. Each character retains its own voice and language profile.

## JSON dictionary

Save UTF-8 as `my-pronunciations.json`:

```json
[
  {"word": "hello", "ipa": "/həˈloʊ/", "language": "en", "spoken": "heh-low"},
  {"word": "বাংলা", "ipa": "/baŋla/", "language": "bn", "spoken": "বাংলা"},
  {"word": "Openmukti", "ipa": "/oʊpənmukti/", "language": "*", "spoken": "Open Mukti"}
]
```

A JSON object with `"entries": [...]` also works. `word` is the literal word or multiword phrase in the ebook. `ipa` is a phonetic transcription, optionally surrounded by `/.../` or `[...]`. `language` limits the rule to a language, including region variants (`en` applies to `en-US`; `en-US` applies only to that region). The `spoken` fallback is optional but useful with eSpeak NG, SAPI, macOS voices, and legacy Piper.

### TSV dictionaries

Four **tab-separated** columns per line: `word`, `ipa`, `language`, `spoken`. The final two fields are optional; language defaults to all languages. Files are UTF-8. Example:

```text
hello\thəˈloʊ\ten\theh-low
বাংলা\tbaŋla\tbn\tবাংলা
```

Here `\t` represents a **real tab** between fields. Lines beginning with `#` are ignored.

## Synthesis behavior and limitations

For **direct phoneme-level IPA speech**, Openmukti uses the optional **Python Piper runtime** (`python -m pip install piper-tts`) and a compatible downloaded `.onnx` model with its `.onnx.json` configuration. It maps IPA characters to phoneme IDs in that model, then invokes the model's phoneme-ID synthesizer. This bypasses ordinary spelling-based pronunciation for the matched word. The source IPA is never sent to Piper's legacy text-only CLI as if it were regular text.

The model must actually contain the needed phoneme symbols in its `phoneme_id_map`. The program detects missing symbols and reports them instead of silently inventing sounds. **IPA is a writing system for phonetic transcription, not proof that a given model can produce every language's sounds**. Models differ in phoneme inventory, accent, and training. The optional Python Piper runtime may need to be included when compiling your Windows EXE.

For an engine without a direct IPA input, Openmukti uses `spoken` when supplied. Without it, the program reports a clear error. Such fallbacks are ordinary text and do not guarantee the exact IPA pronunciation. Neither phonetic accuracy nor language coverage can be guaranteed for every TTS model and every language; audition and adjust your rules.

- Rules match whole words or phrases, ignoring case and preserving other surrounding text.
- Language-specific rules take priority over matching all-language entries for the same word.
- A blank or unrecognized language cannot select a language-specific rule unless automatic detection succeeds. Set the language explicitly when necessary.
- Only the user-selected dictionary is read; no ebook text is uploaded to a server to process IPA rules.

## Command line

```bash
openmukti ipa-check my-pronunciations.json
openmukti ipa-check my-pronunciations.json --language bn
openmukti render --engine piper -n en_US-amy-medium --language en --ipa-dictionary my-pronunciations.json -f chapter.txt -w chapter.wav
openmukti video --engine piper -n en_US-amy-medium --ipa-dictionary my-pronunciations.json -f chapter.txt --images cover.png -w chapter.mp4
openmukti multivoice --project characters.json --ipa-dictionary my-pronunciations.json -f chapter.txt -w story.mp3
openmukti audiobooks --folder books --output-dir output --output-type audio --ipa-dictionary my-pronunciations.json
```

Voice projects may contain `"pronunciation_files": ["my-pronunciations.json"]`. Relative paths are resolved relative to the saved voice project when opened.

## Diagnostics

- **Piper Python backend required**: install `piper-tts` for the Python app, or include it in your build. The legacy Piper CLI alone is not sufficient for direct IPA.
- **The Piper model cannot pronounce IPA symbol**: choose a compatible model, simplify the transcription to available symbols, or supply a `spoken` fallback.
- **A word is not matched**: check spelling, diacritics, the rule's language, and whether you're using the IPA dictionary field rather than the separate text-substitution dictionary.
- **Pronunciation sounds unnatural**: IPA transcription and a model's phoneme inventory may not map perfectly. Try a different model or a spoken fallback.
- **On Windows an IPA rule fails in a bundled build**: the executable may lack the optional Python Piper libraries even though the Piper CLI is bundled. Build with the Python Piper runtime or use `spoken` fallbacks.


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
