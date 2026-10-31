# illumos / OpenIndiana / Solaris recipe starter

Use `python3 -m pip install --user .` where Python >=3.10 and Tk work. FFmpeg and an installed speech engine are needed for audiovisual output. For OpenIndiana, publish an IPS `pkg(5)` manifest after verifying runtime dependencies on an actual illumos machine. A Solaris-native IPS package cannot be built on Linux and is not included.
