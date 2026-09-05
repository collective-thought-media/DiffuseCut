# Start ACE-Step OpenRouter API on a remote GPU host.
# Run on that host. Point DiffuseCut Settings at http://your-comfy-host:8002

param(
  [string]$InstallDir = "M:\ACE-Step-1.5",
  [int]$Port = 8002,
  [string]$BindHost = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

function Log($msg) {
  Write-Host "[ace-step-api-workhorse] $msg"
}

$candidates = @(
  $InstallDir,
  "$env:LOCALAPPDATA\DiffuseCut\ace-step\ACE-Step-1.5",
  "G:\ACE-Step-1.5"
) | Where-Object { $_ -and (Test-Path $_) }

$root = $candidates | Select-Object -First 1
if (-not $root) {
  throw "ACE-Step install not found. Expected M:\ACE-Step-1.5 on workhorse."
}

$uvCandidates = @(
  "$env:LOCALAPPDATA\DiffuseCut\tools\uv.exe",
  "$env:USERPROFILE\.local\bin\uv.exe",
  "$env:USERPROFILE\.cargo\bin\uv.exe",
  "uv"
)
$uv = $uvCandidates | Where-Object { $_ -eq "uv" -or (Test-Path $_) } | Select-Object -First 1
if (-not $uv) {
  throw "uv not found on workhorse."
}

Log "Syncing ACE-Step environment..."
& $uv sync 2>&1 | ForEach-Object { Log $_ }
& $uv pip install python-dotenv 2>&1 | ForEach-Object { Log $_ }

# Stop prior listener on this port
Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }

Push-Location $root
try {
  Log "Starting ACE-Step API on ${BindHost}:$Port from $root"
  & $uv run python -m openrouter.openrouter_api_server --host $BindHost --port $Port
}
finally {
  Pop-Location
}
