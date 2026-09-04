$dest = "M:\ComfyUI\models\clip_vision\CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
$tmp = "M:\ComfyUI\_agent\CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors.download"
Write-Output "stopping Comfy to release file lock..."
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match "python" -and $_.CommandLine -and ($_.CommandLine -match "main\.py") -and ($_.CommandLine -match "8188")
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 4
if (Test-Path $tmp) { Remove-Item $tmp -Force }
Write-Output "downloading CLIP vision to temp..."
Invoke-WebRequest `
  -Uri "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors" `
  -OutFile $tmp `
  -UseBasicParsing
$size = (Get-Item $tmp).Length
Write-Output "download size $size bytes ($([math]::Round($size/1MB,1)) MB)"
if ($size -lt 2000000000) { throw "CLIP vision download looks too small (expected ~2530 MB, got $([math]::Round($size/1MB,1)) MB)" }
if (Test-Path $dest) { Remove-Item $dest -Force }
Move-Item $tmp $dest -Force
Write-Output "installed $dest"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\chris\AppData\Local\Temp\wmi-start-comfy-custom-nodes.ps1"
