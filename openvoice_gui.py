import os
import sys
from pathlib import Path

if getattr(sys, 'frozen', False):
    os.environ['PATH'] = str(Path(sys.executable).resolve().parent) + os.pathsep + os.environ.get('PATH', '')

from openvoice.gui import main

if __name__ == '__main__':
    raise SystemExit(main())
