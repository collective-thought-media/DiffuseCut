from kokoro_onnx import Kokoro

k = Kokoro(
    r"M:\ComfyUI\models\kokoro-onnx\kokoro-v0_19.onnx",
    r"M:\ComfyUI\models\kokoro-onnx\voices.bin",
)
candidates = [
    "am_michael", "am_adam", "am_echo", "am_fenrir", "am_onyx", "am_santa",
    "bm_george", "bm_lewis", "bf_emma", "af_bella", "af_nicole", "af_sarah",
]
for v in candidates:
    try:
        s, _ = k.create("Test.", voice=v)
        print(v, "ok")
    except Exception as e:
        print(v, "FAIL", str(e)[:60])
