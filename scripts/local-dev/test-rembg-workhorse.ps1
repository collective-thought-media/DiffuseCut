$ErrorActionPreference = "Stop"
$py = "M:\ComfyUI\app\venv\Scripts\python.exe"
$script = @'
import time
import sys
print("import rembg...", flush=True)
from rembg import new_session, remove
from PIL import Image
import io

print("create session u2net_human_seg CPU...", flush=True)
t0 = time.time()
session = new_session("u2net_human_seg", providers=["CPUExecutionProvider"])
print(f"session ok in {time.time()-t0:.1f}s", flush=True)

img = Image.new("RGB", (512, 768), (192, 192, 192))
buf = io.BytesIO()
img.save(buf, format="PNG")
data = buf.getvalue()

print("remove background...", flush=True)
t1 = time.time()
out = remove(data, session=session)
print(f"remove ok in {time.time()-t1:.1f}s bytes={len(out)}", flush=True)
'@

$path = "M:\ComfyUI\_agent\test-rembg.py"
Set-Content -Path $path -Value $script -Encoding ascii
& $py $path
