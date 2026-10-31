@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Building Windows executables with compatible Python and PyInstaller...
call "%~dp0scripts\build-windows-exes.bat"
if errorlevel 1 (
  echo Windows executable build failed.
  pause
  exit /b 1
)
echo Building source and portable Python distributions...
"%~dp0.build-venv\Scripts\python.exe" packaging\build_release.py source portable wheel
if errorlevel 1 (
  pause
  exit /b 1
)
echo Completed builds are under dist. Native Windows ARM64 builds require ARM64 Python.
pause
exit /b 0
