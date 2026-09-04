# Install ComfyUI-Woosh + minimum T2A models on workhorse (192.168.1.7).
# Run on workhorse: powershell -NoProfile -ExecutionPolicy Bypass -File install-woosh-workhorse.ps1
# From desk via SSH:
#   ssh chris@192.168.1.7 "powershell -NoProfile -ExecutionPolicy Bypass -File M:/ComfyUI/_agent/install-woosh-workhorse.ps1"

$ErrorActionPreference = "Stop"
$AppRoot = "M:\ComfyUI\app"
$ModelsRoot = "M:\ComfyUI\models"
$WooshModels = Join-Path $ModelsRoot "woosh"
$CustomNodes = Join-Path $AppRoot "custom_nodes"
$WooshRepo = Join-Path $CustomNodes "ComfyUI-Woosh"
$AgentDir = "M:\ComfyUI\_agent"
$Log = Join-Path $AgentDir "install-woosh.log"
$HfBase = "https://huggingface.co/drbaph/Woosh/resolve/main"

function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  Add-Content -Path $Log -Value $line -Encoding ascii
  Write-Output $line
}

New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
Copy-Item -Force $PSCommandPath (Join-Path $AgentDir "install-woosh-workhorse.ps1") -ErrorAction SilentlyContinue
"" | Set-Content $Log -Encoding ascii
Log "begin woosh install"

$git = $null
foreach ($c in @(
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\bin\git.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\git.exe"
)) {
  if (Test-Path $c) { $git = $c; break }
}

New-Item -ItemType Directory -Force -Path $CustomNodes | Out-Null
if (Test-Path $WooshRepo) {
  Log "Woosh repo already present, pulling latest"
  if ($git) {
    Push-Location $WooshRepo
    & $git pull --ff-only
    Pop-Location
  }
} elseif ($git) {
  Log "clone ComfyUI-Woosh"
  & $git clone --depth 1 https://github.com/Saganaki22/ComfyUI-Woosh.git $WooshRepo
} else {
  Log "git missing; download Woosh zip"
  $zip = Join-Path $env:TEMP "ComfyUI-Woosh.zip"
  Invoke-WebRequest -Uri "https://github.com/Saganaki22/ComfyUI-Woosh/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
  $extract = Join-Path $env:TEMP "ComfyUI-Woosh-extract"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
  Move-Item $inner.FullName -Destination $WooshRepo -Force
}

$pip = Join-Path $AppRoot "venv\Scripts\pip.exe"
if (-not (Test-Path $pip)) { throw "Comfy venv missing: $pip" }

$req = Join-Path $WooshRepo "requirements.txt"
if (Test-Path $req) {
  Log "pip install Woosh requirements"
  & $pip install -r $req
}

function Ensure-WooshFolder($folderName) {
  $destDir = Join-Path $WooshModels $folderName
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  foreach ($file in @("config.yaml", "weights.safetensors")) {
    $dest = Join-Path $destDir $file
    if (Test-Path $dest) {
      $size = (Get-Item $dest).Length
      if ($size -gt 1MB -or $file -eq "config.yaml") {
        Log "exists $dest ($([math]::Round($size/1MB,1)) MB)"
        continue
      }
      Remove-Item $dest -Force
    }
    $url = "$HfBase/$folderName/$file"
    Log "download $url"
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    Log "saved $dest ($([math]::Round((Get-Item $dest).Length/1MB,1)) MB)"
  }
}

New-Item -ItemType Directory -Force -Path $WooshModels | Out-Null
Ensure-WooshFolder "Woosh-AE"
Ensure-WooshFolder "TextConditionerA"
Ensure-WooshFolder "Woosh-DFlow"

$appWoosh = Join-Path $AppRoot "models\woosh"
$modelsWoosh = Join-Path $ModelsRoot "woosh"
if (Test-Path $appWoosh) {
  $item = Get-Item $appWoosh -Force
  if ($item.LinkType -ne "Junction" -and $item.LinkType -ne "SymbolicLink") {
    Log "replace app models\\woosh with junction to $modelsWoosh"
    Remove-Item $appWoosh -Recurse -Force
    cmd /c mklink /J "$appWoosh" "$modelsWoosh" | Out-Null
  }
} else {
  Log "create junction $appWoosh -> $modelsWoosh"
  cmd /c mklink /J "$appWoosh" "$modelsWoosh" | Out-Null
}

$startScript = "M:\ComfyUI\_agent\restart-comfy-workhorse.ps1"
if (-not (Test-Path $startScript)) {
  $startScript = "G:\CTM\control-gate\scripts\comfy\workhorse\wmi-start-comfy-custom-nodes.ps1"
}
if (Test-Path $startScript) {
  Log "restart ComfyUI via $startScript"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $startScript
} else {
  Log "Comfy restart script not found; restart ComfyUI manually"
}

Log "install-woosh-workhorse done"
