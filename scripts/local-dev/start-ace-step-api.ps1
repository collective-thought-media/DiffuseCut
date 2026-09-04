# Start ACE-Step OpenRouter-compatible API on a GPU machine.
# Run on the box that should generate scores (local desk or LAN GPU server).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File start-ace-step-api.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File start-ace-step-api.ps1 -Port 8002
#
# DiffuseCut Settings: ACE-Step compute = LAN GPU server, URL = http://THIS-MACHINE-IP:8002

param(
  [string]$InstallDir = "$env:LOCALAPPDATA\DiffuseCut\ace-step\ACE-Step-1.5",
  [int]$Port = 8002,
  [string]$Host = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

function Log($msg) {
  Write-Host "[ace-step-api] $msg"
}

if (-not (Test-Path $InstallDir)) {
  throw "ACE-Step not found at $InstallDir. Run install-ace-step-local.ps1 first."
}

$uvCandidates = @(
  "$env:LOCALAPPDATA\DiffuseCut\tools\uv.exe",
  "$env:USERPROFILE\.local\bin\uv.exe",
  "$env:USERPROFILE\.cargo\bin\uv.exe",
  "uv"
)

$uv = $uvCandidates | Where-Object { $_ -eq "uv" -or (Test-Path $_) } | Select-Object -First 1
if (-not $uv) {
  throw "uv not found. Run install-ace-step-local.ps1 or install uv manually."
}

Push-Location $InstallDir
try {
  Log "Starting ACE-Step API on ${Host}:$Port from $InstallDir"
  Log "DiffuseCut remote URL example: http://YOUR-LAN-IP:$Port"
  & $uv run python -m openrouter.openrouter_api_server --host $Host --port $Port
}
finally {
  Pop-Location
}
