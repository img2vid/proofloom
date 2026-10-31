# Windows Piper installation compatibility

## Why Python 3.15 shows a Piper dependency error

The error about `piper-tts`, `onnxruntime` and `ResolutionImpossible` is a dependency compatibility warning, not an error in Openmukti's speech or audio code. `piper-tts` 1.8.0 requires ONNX Runtime, which currently publishes native Windows wheels for Python 3.11–3.14, but not Python 3.15. PyInstaller 6.22.3 itself works with Python 3.15.

The updated `Build-Portable-EXEs.bat` looks for compatible interpreters first and uses Python 3.15 only as a fallback. If it selects 3.15, it will skip the unsupported Python Piper installation instead of trying all Piper versions and printing a pip dependency-resolution error. The build still includes normal audiobook output, bundled FFmpeg, voice model selection through a compatible external Piper executable, chapter voices, and video generation. Direct IPA phoneme synthesis through the Python Piper backend is unavailable in that build.

## Full-featured build (Windows x64)

1. Install the official Windows x64 Python 3.12, keeping your existing Python 3.15 if you wish.
2. Open Command Prompt and enter `py -0p`. Confirm that Python 3.12 appears.
3. Double-click **Build-With-Piper.bat** in the project root.
4. The builder creates a new `.build-venv`, installs PyInstaller and Piper, checks that both `piper.voice` and `onnxruntime` import successfully, and builds the native portable application folders.
5. Find the built apps and ZIP file under `dist`. Keep every `_internal` directory with its executable.

The strict builder stops when Piper cannot be included, rather than producing an incomplete direct-IPA release. The default `Build-Portable-EXEs.bat` still supports building without this optional dependency and gives an explicit warning. The build will not overwrite your global Python installation.

## Building with Python 3.15 only

Run `Build-Portable-EXEs.bat` normally. The script will skip installing incompatible Python Piper packages. This is a successful build if FFmpeg download, PyInstaller compilation and startup checks all complete. Use an external Piper runtime for ordinary speech, or install a Python 3.12 environment to compile Python Piper direct IPA into the Windows EXEs.

## Known limitations

This source has been tested in a Linux environment. Windows native PyInstaller builds, actual Windows Piper wheels and all ONNX speech models need validation on a Windows computer. Native Windows ARM64 wheels for Piper may be unavailable even when ONNX Runtime supports the architecture. No build includes downloaded voice models by default.


## Python 3.15.2 portable Windows build (Version 1.0.10)

Use `Build-Portable-EXEs.bat` on Windows x64 with CPython **3.15.2**. The main GUI and CLI use Python 3.15.2, while a bundled Piper helper built with Python 3.12 preserves neural IPA synthesis despite the current ONNX Runtime wheel limitation. Both runtimes are frozen into the portable package, so destination computers need no Python installation. See `PYTHON_315_PORTABLE_BUILD.md` for detailed instructions.
