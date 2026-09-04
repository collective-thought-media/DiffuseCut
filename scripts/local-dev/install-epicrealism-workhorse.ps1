# Install epiCRealism XL (CrystalClear) SDXL checkpoint on workhorse ComfyUI.
# Run on workhorse or any machine with M:\ComfyUI mapped:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-epicrealism-workhorse.ps1

$ErrorActionPreference = "Stop"
$ModelsRoot = "M:\ComfyUI\models"
$CheckpointsDir = Join-Path $ModelsRoot "checkpoints"
$Log = "M:\ComfyUI\_agent\install-epicrealism.log"
$DestName = "epicrealismXL_vxviiCrystalclear.safetensors"
$Dest = Join-Path $CheckpointsDir $DestName

# Public Hugging Face mirror of epiCRealism XL VXVII CrystalClear (fp16, ~6.9 GB).
# Primary publisher: Civitai model 277058 (epiCRealismXL-CrystalClear).
$Url =
  "https://huggingface.co/Alptekinege/checkpoint/resolve/main/epicrealismXL_vxviiCrystalclear.safetensors"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  New-Item -ItemType Directory -Force -Path (Split-Path $Log -Parent) | Out-Null
  Add-Content -Path $Log -Value $line -Encoding ascii
  Write-Output $line
}

Log "begin epicrealism install"

New-Item -ItemType Directory -Force -Path $CheckpointsDir | Out-Null

if (Test-Path $Dest) {
  $size = (Get-Item $Dest).Length
  if ($size -gt 5GB) {
    Log "exists $Dest ($([math]::Round($size / 1GB, 2)) GB)"
  } else {
    Log "incomplete file ($([math]::Round($size / 1MB, 1)) MB), re-downloading"
    Remove-Item $Dest -Force
  }
}

if (-not (Test-Path $Dest)) {
  Log "download $Url"
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & curl.exe -L --fail --retry 3 --retry-delay 5 -o $Dest $Url
    if ($LASTEXITCODE -ne 0) { throw "curl download failed exit=$LASTEXITCODE" }
  } else {
    Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
  }
  $size = (Get-Item $Dest).Length
  if ($size -lt 5GB) {
    Remove-Item $Dest -Force
    throw "Download too small ($([math]::Round($size / 1MB, 1)) MB). Expected ~6.9 GB."
  }
  Log "saved $Dest ($([math]::Round($size / 1GB, 2)) GB)"
}

try {
  $models = Invoke-RestMethod "http://127.0.0.1:8188/models/checkpoints" -TimeoutSec 30
  if ($models -contains $DestName) {
    Log "ComfyUI lists $DestName"
  } else {
    Log "ComfyUI running but checkpoint not listed yet; restart Comfy if needed"
  }
} catch {
  Log "ComfyUI not reachable locally; file is on disk at $Dest"
}

Log "install-epicrealism-workhorse done"
