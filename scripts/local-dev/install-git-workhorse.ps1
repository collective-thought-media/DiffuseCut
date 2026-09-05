# Install Git for Windows on the ComfyUI workhorse (3090 LAN box).
# Run ON the workhorse:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-git-workhorse.ps1
# From desk via SSH:
#   ssh chris@192.168.1.7 "winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements"

$ErrorActionPreference = "Stop"
$Log = "M:\ComfyUI\_agent\install-git.log"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  New-Item -ItemType Directory -Force -Path (Split-Path $Log -Parent) | Out-Null
  Add-Content -Path $Log -Value $line -Encoding ascii
  Write-Output $line
}

function Resolve-GitExe {
  $candidates = @(
    (Get-Command git -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\bin\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\git.exe"
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) {
      return $c
    }
  }
  return $null
}

Log "begin git install check"
$existing = Resolve-GitExe
if ($existing) {
  $version = & $existing --version 2>&1
  Log "git already present: $existing ($version)"
  exit 0
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "git not found and winget is unavailable. Install Git for Windows manually."
}

Log "installing Git.Git via winget"
& winget install --id Git.Git -e --source winget `
  --accept-package-agreements --accept-source-agreements

$installed = Resolve-GitExe
if (-not $installed) {
  throw "winget reported success but git.exe was not found"
}

$version = & $installed --version 2>&1
Log "git installed: $installed ($version)"
