Name: openvoice
Version: 1.0.6
Release: 1%{?dist}
Summary: Offline-first text to speech GUI and command line
License: MIT
BuildArch: noarch
Requires: python3 >= 3.10
Requires: ffmpeg
Source0: openmukti-audiobook-maker-app-1.0.6.pyz

%description
Openmukti Audiobook Maker desktop text to speech using system or installed speech engines.

%prep

%build

%install
mkdir -p %{buildroot}/usr/share/openvoice %{buildroot}/usr/bin
cp %{SOURCE0} %{buildroot}/usr/share/openvoice/openvoice.pyz
printf '%s\n' '#!/bin/sh' 'exec python3 /usr/share/openvoice/openvoice.pyz "$@"' > %{buildroot}/usr/bin/openvoice
printf '%s\n' '#!/bin/sh' 'exec python3 /usr/share/openvoice/openvoice.pyz gui "$@"' > %{buildroot}/usr/bin/openvoice-gui
chmod +x %{buildroot}/usr/bin/openvoice %{buildroot}/usr/bin/openvoice-gui

%files
/usr/share/openvoice/openvoice.pyz
/usr/bin/openvoice
/usr/bin/openvoice-gui
