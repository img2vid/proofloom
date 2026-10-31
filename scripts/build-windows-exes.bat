@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
if defined OPENMUKTI_PYTHON315 goto CUSTOM
py -3.15 -c "import sys; sys.exit(0 if sys.version_info[:3] == (3,15,2) else 1)" >nul 2>&1
if not errorlevel 1 goto PYLAUNCHER
python -c "import sys; sys.exit(0 if sys.version_info[:3] == (3,15,2) else 1)" >nul 2>&1
if not errorlevel 1 goto PYTHONPATH
echo ERROR: Cannot find 64-bit CPython 3.15.2.
echo Install Python 3.15.2 from python.org or set OPENMUKTI_PYTHON315 to its python.exe path.
exit /b 1
:CUSTOM
"%OPENMUKTI_PYTHON315%" "%~dp0build_windows_py315.py"
exit /b %ERRORLEVEL%
:PYLAUNCHER
py -3.15 "%~dp0build_windows_py315.py"
exit /b %ERRORLEVEL%
:PYTHONPATH
python "%~dp0build_windows_py315.py"
exit /b %ERRORLEVEL%
