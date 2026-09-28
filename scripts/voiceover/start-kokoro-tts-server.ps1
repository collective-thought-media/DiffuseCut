# Start LAN Kokoro TTS on the workhorse (isolated venv, port 17958).
$ErrorActionPreference = "Stop"
$venvPy = "M:\ComfyUI\kokoro-tts-venv\Scripts\python.exe"
$server = "M:\ComfyUI\kokoro-tts-venv\kokoro_tts_server.py"
$env:KOKORO_MODEL_DIR = "M:\ComfyUI\models\kokoro-onnx"
if (-not (Test-Path $venvPy)) { throw "Missing $venvPy. Create venv and pip install kokoro-onnx fastapi uvicorn soundfile." }
& $PSScriptRoot\install-kokoro-models.ps1
Copy-Item -Force (Join-Path $PSScriptRoot "kokoro_tts_server.py") $server
Start-Process -FilePath $venvPy -ArgumentList @($server, "--host", "0.0.0.0", "--port", "17958") -WindowStyle Hidden
Write-Host "Kokoro TTS listening on http://0.0.0.0:17958 (health: /health)"
