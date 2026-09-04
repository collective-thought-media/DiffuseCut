# Install ComfyUI_IPAdapter_plus + SDXL weights on workhorse (192.168.1.7).
# Run on workhorse: powershell -NoProfile -ExecutionPolicy Bypass -File install-ipadapter-workhorse.ps1

$ErrorActionPreference = "Stop"
$AppRoot = "M:\ComfyUI\app"
$ModelsRoot = "M:\ComfyUI\models"
$CustomNodes = Join-Path $AppRoot "custom_nodes"
$IpAdapterRepo = Join-Path $CustomNodes "ComfyUI_IPAdapter_plus"
$Log = "M:\ComfyUI\_agent\install-ipadapter.log"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  Add-Content -Path $Log -Value $line -Encoding ascii
  Write-Output $line
}

New-Item -ItemType Directory -Force -Path "M:\ComfyUI\_agent" | Out-Null
"" | Set-Content $Log -Encoding ascii
Log "begin"

$git = $null
foreach ($c in @(
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\bin\git.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\git.exe"
)) {
  if (Test-Path $c) { $git = $c; break }
}

New-Item -ItemType Directory -Force -Path $CustomNodes | Out-Null
if (Test-Path $IpAdapterRepo) {
  Log "IPAdapter repo already present"
} elseif ($git) {
  Log "clone ComfyUI_IPAdapter_plus"
  & $git clone --depth 1 https://github.com/cubiq/ComfyUI_IPAdapter_plus.git $IpAdapterRepo
} else {
  Log "git missing; download IPAdapter zip"
  $zip = "C:\Users\chris\AppData\Local\Temp\ComfyUI_IPAdapter_plus.zip"
  Invoke-WebRequest -Uri "https://github.com/cubiq/ComfyUI_IPAdapter_plus/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
  $extract = "C:\Users\chris\AppData\Local\Temp\ComfyUI_IPAdapter_plus-extract"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
  Move-Item $inner.FullName -Destination $IpAdapterRepo -Force
}

$venvPy = Join-Path $AppRoot "venv\Scripts\python.exe"
$pip = Join-Path $AppRoot "venv\Scripts\pip.exe"
if (-not (Test-Path $venvPy)) { throw "Comfy venv missing: $venvPy" }

$req = Join-Path $IpAdapterRepo "requirements.txt"
if (Test-Path $req) {
  Log "pip install IPAdapter requirements"
  & $pip install -r $req
}

function Ensure-ModelFile($url, $dest) {
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  if (Test-Path $dest) {
    $size = (Get-Item $dest).Length
    if ($size -gt 10MB) {
      Log "exists $dest ($([math]::Round($size/1MB,1)) MB)"
      return
    }
    Remove-Item $dest -Force
  }
  Log "download $url"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  Log "saved $dest ($([math]::Round((Get-Item $dest).Length/1MB,1)) MB)"
}

$ipDest = Join-Path $ModelsRoot "ipadapter\ip-adapter-plus_sdxl_vit-h.safetensors"
$clipDest = Join-Path $ModelsRoot "clip_vision\CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"

Ensure-ModelFile `
  "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors" `
  $ipDest

Ensure-ModelFile `
  "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors" `
  $clipDest
$clipSize = (Get-Item $clipDest).Length
if ($clipSize -lt 2000000000) {
  throw "CLIP vision file too small ($([math]::Round($clipSize/1MB,1)) MB). Expected ~2530 MB. Re-run after Comfy is stopped."
}

Log "restart Comfy with custom nodes"
$startScript = "G:\CTM\control-gate\scripts\comfy\workhorse\wmi-start-comfy-custom-nodes.ps1"
if (Test-Path $startScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $startScript
  if ($LASTEXITCODE -ne 0) { throw "Comfy restart failed exit=$LASTEXITCODE" }
} else {
  Log "start script missing; starting inline"
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match "python" -and $_.CommandLine -and ($_.CommandLine -match "main\.py") -and ($_.CommandLine -match "8188")
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
  $cmd = "`"M:\ComfyUI\app\venv\Scripts\python.exe`" -u main.py --listen 0.0.0.0 --port 8188 --disable-pinned-memory"
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = $cmd
    CurrentDirectory = $AppRoot
  }
  if ($r.ReturnValue -ne 0) { throw "WMI start failed $($r.ReturnValue)" }
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    try {
      Invoke-RestMethod http://127.0.0.1:8188/system_stats -TimeoutSec 8 | Out-Null
      break
    } catch {}
  }
}

$obj = Invoke-RestMethod http://127.0.0.1:8188/object_info -TimeoutSec 180
foreach ($node in @("IPAdapterUnifiedLoader", "IPAdapterAdvanced")) {
  if ($obj.PSObject.Properties.Name -contains $node) { Log "NODE OK $node" }
  else { throw "NODE MISSING $node" }
}

$models = Invoke-RestMethod "http://127.0.0.1:8188/models/ipadapter" -TimeoutSec 30
Log ("ipadapter models: " + ($models -join ", "))

Log "install-ipadapter-workhorse done"
