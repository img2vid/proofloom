# Haiku recipe starter

Openmukti Audiobook Maker can be tested from source if CPython >=3.10 and a functional Tk runtime, FFmpeg and an offline speech engine are installed. The GUI has not been verified on Haiku. Haiku's `.hpkg` requires native packaging tools and an architecture-appropriate dependency graph. Use `python3 -m pip install --user .` for preliminary compatibility testing before preparing a HaikuPorts recipe. No prebuilt .hpkg is provided.
