# Download Kokoro ONNX weights into Comfy models folder (run on GPU host).
$ErrorActionPreference = "Stop"
$dest = if ($env:KOKORO_MODEL_DIR) { $env:KOKORO_MODEL_DIR } else { "M:\ComfyUI\models\kokoro-onnx" }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files"
$files = @("kokoro-v0_19.onnx", "voices.bin")
foreach ($f in $files) {
  $out = Join-Path $dest $f
  if (Test-Path $out) { Write-Host "OK $f"; continue }
  Write-Host "Downloading $f ..."
  Invoke-WebRequest -Uri "$base/$f" -OutFile $out -UseBasicParsing
}
Write-Host "Kokoro models ready in $dest"
