@echo off
set PATH=%~dp0..\..\node-v24.18.0-win-x64;%PATH%
echo Node PATH configured. Testing...
node -v
npm -v
cmd /k