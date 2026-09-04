# Copy legacy Hugging Face IP-Adapter filename to the name ComfyUI_IPAdapter_plus
# expects for preset "PLUS (high strength)" on SDXL: plus.sdxl.vit.h.safetensors
#
# Run on the ComfyUI host (or via SSH to that host):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-dev/fix-ipadapter-plus-filename.ps1
#
# Optional env:
#   COMFY_MODELS_ROOT  default M:\ComfyUI\models

param(
  [string]$ModelsRoot = $env:COMFY_MODELS_ROOT
)

$ErrorActionPreference = "Stop"

if (-not $ModelsRoot) {
  $ModelsRoot = "M:\ComfyUI\models"
}

$ipDir = Join-Path $ModelsRoot "ipadapter"
$legacy = Join-Path $ipDir "ip-adapter-plus_sdxl_vit-h.safetensors"
$preset = Join-Path $ipDir "plus.sdxl.vit.h.safetensors"

if (-not (Test-Path $legacy)) {
  throw "Legacy IP-Adapter file not found: $legacy"
}

Copy-Item -Path $legacy -Destination $preset -Force
Write-Output "Created $preset from legacy download name."
Write-Output "Restart ComfyUI if it was already running, then retry generation."

Get-ChildItem $ipDir | ForEach-Object { Write-Output $_.Name }
