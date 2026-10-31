#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
python3 packaging/build_release.py freebsd --strict
