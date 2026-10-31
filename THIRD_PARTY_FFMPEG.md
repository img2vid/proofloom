# FFmpeg and FFprobe distribution

Openmukti Audiobook Maker application source: MIT. FFmpeg and FFprobe are external programs. This source project neither incorporates FFmpeg code into the MIT source license nor transfers ownership of FFmpeg to Openmukti Audiobook Maker.

The one-click builder stages an architecture-compatible GPL-enabled FFmpeg release from https://github.com/BtbN/FFmpeg-Builds/releases/tag/latest, verifies its SHA-256 against GitHub release asset metadata, and embeds the `ffmpeg` and `ffprobe` executables. Upstream project: https://ffmpeg.org/. Licensing: https://ffmpeg.org/legal.html.

Public redistribution of these builds requires GPL compliance, including the complete corresponding source code for the exact binary build and GPL components linked into it, build/configuration information where applicable, license texts, and notices. The downloaded build may include code under additional compatible licenses. The SHA-256 metadata and upstream notices are retained under `vendor/ffmpeg/<platform>-<arch>/`. The source of FFmpeg is not included in the Openmukti Audiobook Maker source archive and cannot be inferred from a generic FFmpeg branch. Publishers must obtain or build and provide the matching corresponding sources before distributing compiled packages.

The DEB package instead declares `ffmpeg` as an installation dependency; the distro package manager installs its own FFmpeg packages with its own licensing and source distribution. Flatpak, BSD, and less common platform packages need separate compliance evaluation.

FFmpeg may also involve codec patent considerations depending on the country and use.
