# Release-building matrix and verification

The source distribution targets Python 3.10+ and intentionally avoids OS-specific Python dependencies except for the system GUI toolkit, voice engines, audio/video binaries and optional readers. `Build-All-Available.sh` and `Build-All-Available.bat` are front ends to native packaging programs. They do not cross-compile all target operating systems and should not be marketed as doing so.

## Checklist before release

1. Validate the CLI (`openvoice engines`, `openvoice video --help`) and GUI on the actual target OS.
2. Generate WAV and MP4 using locally supported speech and video engines; test 16:9, 9:16, and 1:1.
3. Test paths with whitespace and non-ASCII text, source document import, drag/drop if implemented, and multiple slide files.
4. Scan binary dependencies and check licensing for FFmpeg, FFprobe and any bundled voice engines and models.
5. Test startup on a clean VM without Python installed for every claimed standalone build.
6. Digitally sign Windows binaries if you have a signing certificate. Code signing is not supplied by this project.
7. Test Flatpak and Snap sandbox permissions for audio playback, user-selected files, and their own bundled FFmpeg and speech engine.
8. Record architecture (x86_64, ARM64, etc.), libc family, minimum OS and major dependency versions beside each download.
9. Never claim a template-only recipe is a working installable package. Publish test logs and SHA256 checksums.

## Third-party binaries

On Windows, to include your own properly licensed FFmpeg and FFprobe files, put them into `vendor/ffmpeg/windows/` before the EXE builder runs. A local application can also use executables placed beside `Openmukti Audiobook Maker.exe`. On Linux and BSD, installing FFmpeg from each OS package manager is the recommended default for source/Python packages.

## Notes

The FFmpeg encoder uses H.264/AAC for MP4, MOV and MKV and VP9/Opus for WebM. A supplied still image is repeated for the track duration; with multiple images the total duration is evenly distributed. Images are displayed without transitions. The `.srt` files are estimated, not synchronized against phonemes. Very large 4K encodes can be CPU-intensive.

## Integrated media engine in v0.4.0

Windows x64 and ARM64 native builders fetch checksum-verified FFmpeg and FFprobe into `vendor/ffmpeg/windows-<arch>` and embed both in the EXEs. Linux native PyInstaller/AppImage builds similarly use staged `vendor/ffmpeg/linux-<arch>` files. Generic Linux portable tarballs include sidecar media binaries **when staged**; otherwise they use installed ones. The DEB has a required `ffmpeg` package dependency, installed by APT with the app. Snap stages FFmpeg as a dependency. Flatpak and rare OS recipes still need target-specific media tooling, sandbox, and redistribution validation.

Prebuilt FFmpeg releases are third-party GPL-enabled distributions and are not part of the MIT Openmukti Audiobook Maker source. Do not publish compiled packages before reviewing and satisfying all associated license and corresponding-source obligations.
