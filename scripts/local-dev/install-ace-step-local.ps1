# Install native ACE-Step 1.5 locally for DiffuseCut (same machine as the app).
# Requires: git, NVIDIA GPU recommended, ~15GB disk for repo + models (first run downloads weights).
param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\DiffuseCut\ace-step\ACE-Step-1.5"
)

$ErrorActionPreference = "Stop"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  Write-Output $line
}

$ToolsDir = Join-Path $env:LOCALAPPDATA "DiffuseCut\tools"
$UvExe = Join-Path $ToolsDir "uv.exe"
$RepoUrl = "https://github.com/ACE-Step/ACE-Step-1.5.git"

New-Item -ItemType Directory -Force -Path (Split-Path $InstallRoot) | Out-Null
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is required. Install Git for Windows first."
}

if (-not (Test-Path $UvExe)) {
  Log "Installing uv to $UvExe"
  irm https://astral.sh/uv/install.ps1 | iex
  $downloaded = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
  if (Test-Path $downloaded) {
    Copy-Item $downloaded $UvExe -Force
  } elseif (Get-Command uv -ErrorAction SilentlyContinue) {
    $UvExe = (Get-Command uv).Source
  } else {
    throw "uv install did not produce uv.exe"
  }
}

if (-not (Test-Path (Join-Path $InstallRoot ".git"))) {
  Log "Cloning ACE-Step 1.5 into $InstallRoot"
  git clone --depth 1 $RepoUrl $InstallRoot
} else {
  Log "ACE-Step repo already present at $InstallRoot"
}

Push-Location $InstallRoot
try {
  if (Test-Path (Join-Path $InstallRoot ".venv")) {
    $venvPy = Join-Path $InstallRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPy)) {
      Log "Removing invalid .venv before sync"
      Remove-Item -Recurse -Force (Join-Path $InstallRoot ".venv")
    }
  }

  Log "uv sync (Python 3.12 venv + dependencies)"
  & $UvExe sync 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "uv sync failed with exit $LASTEXITCODE" }

  Log "Smoke import acestep"
  & $UvExe run python -c "import acestep; print('acestep import ok')" 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "acestep import failed" }
} finally {
  Pop-Location
}

Log "Done. Set ACE-Step install folder in DiffuseCut Settings if not using default:"
Log "  $InstallRoot"
Log "First score generation downloads model weights (several GB)."
