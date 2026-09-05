# Stop ComfyUI, finish Essentials pip install, restart, verify MaskBlur+.
$ErrorActionPreference = "Stop"
$AppRoot = "M:\ComfyUI\app"

Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match "python" -and $_.CommandLine -and
  ($_.CommandLine -match "main\.py") -and ($_.CommandLine -match "8188")
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

$pip = Join-Path $AppRoot "venv\Scripts\pip.exe"
$req = Join-Path $AppRoot "custom_nodes\ComfyUI_essentials\requirements.txt"
if ((Test-Path $pip) -and (Test-Path $req)) {
  & $pip install -r $req
}

$cmd = "`"M:\ComfyUI\app\venv\Scripts\python.exe`" -u main.py --listen 0.0.0.0 --port 8188 --disable-pinned-memory"
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine      = $cmd
  CurrentDirectory = $AppRoot
}
if ($r.ReturnValue -ne 0) {
  throw "Comfy start failed with code $($r.ReturnValue)"
}

for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  try {
    Invoke-RestMethod http://127.0.0.1:8188/system_stats -TimeoutSec 8 | Out-Null
    Write-Output "ComfyUI is up"
    break
  } catch {
    if ($i -eq 89) { throw "ComfyUI did not respond in time" }
  }
}

$obj = Invoke-RestMethod http://127.0.0.1:8188/object_info/MaskBlur%2B -TimeoutSec 180
if ($obj."MaskBlur+") {
  Write-Output "OK MaskBlur+"
} else {
  Write-Output "MISSING MaskBlur+"
}
