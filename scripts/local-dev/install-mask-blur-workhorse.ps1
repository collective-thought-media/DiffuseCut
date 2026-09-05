# Install mask blur support on workhorse ComfyUI (ComfyUI Essentials -> MaskBlur+).
# Run on workhorse or any machine with M:\ComfyUI mapped:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-mask-blur-workhorse.ps1

$ErrorActionPreference = "Stop"
$AppRoot = "M:\ComfyUI\app"
$CustomNodes = Join-Path $AppRoot "custom_nodes"
$EssentialsRepo = Join-Path $CustomNodes "ComfyUI_essentials"
$Log = "M:\ComfyUI\_agent\install-mask-blur.log"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  New-Item -ItemType Directory -Force -Path (Split-Path $Log -Parent) | Out-Null
  Add-Content -Path $Log -Value $line -Encoding ascii
  Write-Output $line
}

Log "begin mask blur install"

$git = $null
foreach ($c in @(
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\bin\git.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\git.exe"
)) {
  if (Test-Path $c) { $git = $c; break }
}

New-Item -ItemType Directory -Force -Path $CustomNodes | Out-Null

if (Test-Path $EssentialsRepo) {
  Log "ComfyUI_essentials already present"
} elseif ($git) {
  Log "clone ComfyUI_essentials"
  & $git clone --depth 1 https://github.com/cubiq/ComfyUI_essentials.git $EssentialsRepo
} else {
  $zipPath = Join-Path $env:TEMP "ComfyUI_essentials-main.zip"
  Log "git missing; downloading ComfyUI_essentials zip"
  Invoke-WebRequest -Uri "https://github.com/cubiq/ComfyUI_essentials/archive/refs/heads/main.zip" -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $CustomNodes -Force
  $extracted = Join-Path $CustomNodes "ComfyUI_essentials-main"
  if (Test-Path $extracted) {
    if (Test-Path $EssentialsRepo) {
      Remove-Item -Recurse -Force $EssentialsRepo
    }
    Rename-Item -Path $extracted -NewName "ComfyUI_essentials"
  }
  Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
}

$pip = Join-Path $AppRoot "venv\Scripts\pip.exe"
$req = Join-Path $EssentialsRepo "requirements.txt"
if ((Test-Path $pip) -and (Test-Path $req)) {
  Log "pip install ComfyUI_essentials requirements"
  & $pip install -r $req
}

try {
  $obj = Invoke-RestMethod http://127.0.0.1:8188/object_info/MaskBlur%2B -TimeoutSec 60
  if ($obj."MaskBlur+") { Log "NODE OK MaskBlur+" }
  else { Log "NODE MISSING MaskBlur+ (restart ComfyUI after install)" }
} catch {
  Log "ComfyUI not reachable locally; restart ComfyUI after install"
}

Log "install-mask-blur done"