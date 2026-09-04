# Install ComfyUI locally for DiffuseCut renders (SDXL, IP-Adapter, LTX). Music uses native ACE-Step, not Comfy.
param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\DiffuseCut\comfyui",
  [int]$Port = 8188
)

$ErrorActionPreference = "Stop"

function Log($m) {
  Write-Output "$(Get-Date -Format o) $m"
}

$AppDir = Join-Path $InstallRoot "app"
$RepoUrl = "https://github.com/comfyanonymous/ComfyUI.git"

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is required."
}

if (-not (Test-Path (Join-Path $AppDir ".git"))) {
  Log "Cloning ComfyUI into $AppDir"
  git clone --depth 1 $RepoUrl $AppDir
} else {
  Log "ComfyUI already present at $AppDir"
}

$Python = $null
foreach ($candidate in @(
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
)) {
  if (Test-Path $candidate) { $Python = $candidate; break }
}

if (-not $Python) {
  throw "Python 3.11 or 3.12 is required for ComfyUI. Install from python.org, then re-run this script."
}

$VenvPy = Join-Path $AppDir "venv\Scripts\python.exe"
if (-not (Test-Path $VenvPy)) {
  Log "Creating venv with $Python"
  & $Python -m venv (Join-Path $AppDir "venv")
}

Log "Installing ComfyUI requirements"
& $VenvPy -m pip install --upgrade pip wheel 2>&1 | ForEach-Object { Log $_ }
& $VenvPy -m pip install -r (Join-Path $AppDir "requirements.txt") 2>&1 | ForEach-Object { Log $_ }

$StartScript = Join-Path $InstallRoot "start-comfyui.ps1"
@(
  "# Start local ComfyUI for DiffuseCut",
  "`$Py = Join-Path `"$AppDir`" `"venv\Scripts\python.exe`"",
  "Set-Location `"$AppDir`"",
  "& `$Py main.py --listen 127.0.0.1 --port $Port"
) | Set-Content -Path $StartScript -Encoding UTF8

Log "ComfyUI installed."
Log "Start with: powershell -File `"$StartScript`""
Log "Then set DiffuseCut Settings ComfyUI endpoint to http://127.0.0.1:$Port"
