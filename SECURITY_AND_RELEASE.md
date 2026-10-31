# Openmukti Audiobook Maker — transparent Windows release guidance (v1.0.6)

## Important: a detection is not proof of either a threat or a false positive

The reported VirusTotal result was 2/69, with Bkav Pro (`W32.Malware.3F71999A`) and DeepInstinct (`MALICIOUS`). No exact offending Windows EXE, SHA-256, VirusTotal link, or behavioral-analysis report was supplied. Consequently this source update cannot verify whether those reports were false positives or whether the file was affected by an unexpected dependency or modification.

VirusTotal aggregates vendor findings, not an authoritative clean bill of health. Don't bypass or disable security software. Keep any flagged build isolated until its source and distribution chain have been investigated and the antivirus vendors clarify their findings.

## Packaging changes without removing application features

1. Windows single-file releases now use PyInstaller **onefile** to provide standalone EXEs. They self-extract Python, FFmpeg, FFprobe, and the Piper worker into a temporary folder at runtime, which may increase antivirus heuristic alerts.
2. UPX remains disabled. Runtime text-to-speech, video output, voice selection, model downloading, and speech playback remain available.
3. The distribution ZIP contains `SHA256SUMS.txt` and `BUILD_PROVENANCE.json`. All files have individual hashes so reviewers can identify whether the detection concerns the app's EXE, FFmpeg, Piper, or an included library.
4. Windows EXEs include product/version/publisher metadata. They are **not code signed** unless the publisher signs them using a legitimate signing certificate.
5. The Windows build uses a pinned PyInstaller version. Dependency security reviews and version updates are still needed before publishing.
6. Windows PowerShell helper scripts use local script files and the `RemoteSigned` execution policy. Corporate execution policy can still prohibit them; do not override organizational restrictions.

## Build and verify on Windows without GitHub

1. Download the **source** package from the developer, review it, and install a Python 3.10+ matching the PC architecture.
2. Run `Build-Portable-EXEs.bat`. The builder downloads PyInstaller and verified FFmpeg/FFprobe from their respective providers on first use.
3. The result is `dist/Openmukti-Audiobook-Maker-Windows-<arch>-Standalone-EXEs.zip` containing two **independently portable EXEs**, hashes, licenses, and notices. No `_internal` folder is distributed.
4. Use `Get-FileHash -Algorithm SHA256 <path-to-file>` in PowerShell to verify the individual binaries against the archive's `SHA256SUMS.txt` entries. For unsigned builds, note the publisher is unverified; metadata alone is not proof of trust.
5. Scan the archive and the extracted component files using your security products. If something is flagged, inspect the specific file and its hash; request independent review before distributing.

## Code signing and verification

Use a code-signing certificate from a trusted authority and an up-to-date Windows SDK SignTool, with the private signing key held securely by the publisher. Sign after building and before generating the final public checksums, since signing changes file hashes. Microsoft documents the SignTool and Authenticode process at https://learn.microsoft.com/en-us/windows/win32/seccrypto/time-stamping-authenticode-signatures . Signatures prove publisher identity and that the file has not changed after signing; they do not guarantee that antivirus will label a build clean.

If signing the resulting EXEs, generate a new signed package and new hashes after signing; never reuse hashes from the unsigned package. This release does not contain a signing certificate or any private keys.

## Disputing confirmed false positives

VirusTotal says third-party vendors, not VirusTotal, control antivirus detections. The detecting vendors must confirm false positives and update their signatures: https://docs.virustotal.com/docs/false-positive .

Report to **Bkav Pro** and **DeepInstinct** through their official security support/false-positive channels, including the precise SHA-256, VirusTotal report URL, original unmodified EXE, source repository, details of the build system, and `BUILD_PROVENANCE.json`. Re-analyse the same file on VirusTotal only after the vendors have addressed it. If the file contains third-party FFmpeg binaries, disclose the exact versions and suppliers.

No result on VirusTotal or elsewhere can be guaranteed in advance. If any vendor continues to classify the file as malicious, investigate rather than attempting to evade its detection.
