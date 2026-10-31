@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0Build-Portable-EXEs.bat"
exit /b %ERRORLEVEL%
