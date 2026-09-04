$path = "M:\ComfyUI\app\extra_model_paths.yaml"
$content = Get-Content $path -Raw
if ($content -match "ipadapter:") {
  Write-Output "ipadapter entry already present"
} else {
  $content = $content.TrimEnd() + "`n  ipadapter: ipadapter`n  clip_vision: clip_vision`n"
  Set-Content -Path $path -Value $content -Encoding utf8
  Write-Output "added ipadapter + clip_vision to extra_model_paths.yaml"
}
Get-Content $path
