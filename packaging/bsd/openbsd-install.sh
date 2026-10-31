#!/bin/sh
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/openvoice"
cp "$DIR/dist/openvoice-0.4.0.pyz" "$HOME/.local/share/openvoice/openvoice.pyz"
printf '%s\n' '#!/bin/sh' 'exec python3 "$HOME/.local/share/openvoice/openvoice.pyz" "$@"' > "$HOME/.local/bin/openvoice"
printf '%s\n' '#!/bin/sh' 'exec python3 "$HOME/.local/share/openvoice/openvoice.pyz" gui "$@"' > "$HOME/.local/bin/openvoice-gui"
chmod +x "$HOME/.local/bin/openvoice" "$HOME/.local/bin/openvoice-gui"
