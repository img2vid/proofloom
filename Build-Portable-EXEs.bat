@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0scripts\build-windows-exes.bat"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo The build failed. Review the error messages above.
  echo.
  pause
  exit /b %RESULT%
)
echo.
echo Build complete. The ZIP in dist contains two standalone EXEs. No _internal folder is required.
echo.
pause
exit /b 0
