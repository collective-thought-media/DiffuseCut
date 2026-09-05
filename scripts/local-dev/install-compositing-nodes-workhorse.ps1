# Install optional compositing helpers on workhorse ComfyUI.
# Run on workhorse or any machine with M:\ComfyUI mapped:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-compositing-nodes-workhorse.ps1

$ErrorActionPreference = "Stop"
$AppRoot = "M:\ComfyUI\app"
$CustomNodes = Join-Path $AppRoot "custom_nodes"
$Log = "M:\ComfyUI\_agent\install-compositing-nodes.log"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  New-Item -ItemType Directory -Force -Path (Split-Path $Log -Parent) | Out-Null
  Add-Content -Path $Log -Value $line -Encoding ascii
  Write-Output $line
}

Log "begin compositing nodes install"

$git = $null
foreach ($c in @(
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\bin\git.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\git.exe"
)) {
  if (Test-Path $c) { $git = $c; break }
}

New-Item -ItemType Directory -Force -Path $CustomNodes | Out-Null

$impactRepo = Join-Path $CustomNodes "ComfyUI-Impact-Pack"
if (Test-Path $impactRepo) {
  Log "Impact Pack already present"
} elseif ($git) {
  Log "clone ComfyUI-Impact-Pack"
  & $git clone --depth 1 https://github.com/ltdrdata/ComfyUI-Impact-Pack.git $impactRepo
} else {
  Log "git missing; skip Impact Pack clone"
}

$pip = Join-Path $AppRoot "venv\Scripts\pip.exe"
$impactReq = Join-Path $impactRepo "requirements.txt"
if ((Test-Path $pip) -and (Test-Path $impactReq)) {
  Log "pip install Impact Pack requirements"
  & $pip install -r $impactReq
}

if (Test-Path $pip) {
  Log "pip install rembg CPU backend (onnxruntime)"
  & $pip install "rembg[cpu]" onnxruntime
}

try {
  $obj = Invoke-RestMethod http://127.0.0.1:8188/object_info -TimeoutSec 60
  foreach ($node in @("ImageCompositeMasked", "ImageBlur", "ImageScale", "RemBGSession+", "ImageRemoveBackground+", "MaskBlur+", "GrowMask", "VAEEncode", "ImageColorMatch+")) {
    if ($obj.PSObject.Properties.Name -contains $node) { Log "NODE OK $node" }
    else { Log "NODE MISSING $node (restart ComfyUI after install)" }
  }
} catch {
  Log "ComfyUI not reachable locally; restart ComfyUI after install"
}

Log "install-compositing-nodes done"
