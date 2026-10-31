@echo off
setlocal EnableExtensions
echo This Windows x64 Python 3.15.2 portable build includes an x64 Piper worker.
echo An equivalent native ARM64 worker requires compatible ARM64 ONNX Runtime and Piper wheels.
echo Use a Windows x64 build on x64 Windows; ARM64 is not provided by this builder.
exit /b 1
