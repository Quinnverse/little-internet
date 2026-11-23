"""
Offline asset pipeline (NOT used at runtime, nothing here ships to users' browsers directly).

  reference image  ->  Hunyuan3D-2 (public Hugging Face Space, shape only)  ->  raw white mesh

Steps per prop in props.json:
  1. Make a reference picture with a free text-to-image endpoint (Pollinations). Its watermark
     (bottom-right) is painted over with the background colour before the picture is used.
  2. Send the picture to the Hunyuan3D-2 Space `/shape_generation` (background removal on).
  3. Save the white mesh to assets/raw/<kind>.glb. `npm run assets:optimize` then simplifies it.

Notes from using it for real:
  * The Space's text-to-3D and texture stages are switched off / broken, so only SHAPE comes from
    Hunyuan. Colour is applied in the app (models.ts), not baked.
  * Output is ~20 MB per prop before simplification; the pipeline cuts that to a few KB.
  * The Space is a shared ZeroGPU service: it can be slow or refuse requests. Re-run to retry.

Usage:  python scripts/assets/generate.py [kind ...]
Needs:  pip install gradio_client pillow httpx   (optional: export HF_TOKEN=hf_... for more free quota)
License: Hunyuan3D-2 is under the Tencent Hunyuan 3D 2.0 Community License (not available in the
EU, UK and South Korea). Check it before reusing the generated files.
"""
import json
import os
import sys
import time
import urllib.parse
from pathlib import Path

import httpx
from gradio_client import Client, handle_file
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets" / "raw"
REFS = ROOT / "assets" / "refs"
SPACE = "tencent/Hunyuan3D-2"


TOKEN = os.environ.get("HF_TOKEN")  # a free Hugging Face token raises the ZeroGPU quota a lot
STYLE = ", isometric 3d render, soft lighting, single object, centered, plain white background"


def draw_reference(prompt: str, seed: int, out: Path) -> None:
    """Free text-to-image: Pollinations first, then the FLUX.1-schnell Space."""
    try:
        q = urllib.parse.quote(prompt + STYLE)
        r = httpx.get(f"https://image.pollinations.ai/prompt/{q}?width=768&height=768&nologo=true&seed={seed}", timeout=120, follow_redirects=True)
        r.raise_for_status()
        out.write_bytes(r.content)
        return
    except Exception as e:
        print(f"  pollinations unavailable ({type(e).__name__}); trying FLUX.1-schnell")
    flux = Client("black-forest-labs/FLUX.1-schnell", hf_token=TOKEN, verbose=False)
    img, _ = flux.predict(prompt=prompt + STYLE, seed=seed, randomize_seed=False, width=768, height=768, num_inference_steps=4, api_name="/infer")
    Image.open(img).convert("RGB").save(out, quality=92)


def reference(kind: str, prompt: str, seed: int) -> Path:
    out = REFS / f"{kind}.jpg"
    if out.exists():
        return out
    draw_reference(prompt, seed, out)
    im = Image.open(out).convert("RGB")
    w, h = im.size
    bg = im.getpixel((8, 8))
    # paint over the watermark strip in the bottom-right corner
    for x in range(int(w * 0.55), w):
        for y in range(int(h * 0.93), h):
            im.putpixel((x, y), bg)
    im.save(out, quality=92)
    return out


def shape(client: Client, ref: Path) -> bytes:
    r = client.predict(
        caption=None, image=handle_file(str(ref)),
        mv_image_front=None, mv_image_back=None, mv_image_left=None, mv_image_right=None,
        steps=30, guidance_scale=5.0, seed=1234, octree_resolution=192,
        check_box_rembg=True, num_chunks=8000, randomize_seed=False,
        api_name="/shape_generation",
    )
    path = r[0]["value"] if isinstance(r[0], dict) else r[0]
    resp = httpx.get(f"https://tencent-hunyuan3d-2.hf.space/file={path}", timeout=180, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    REFS.mkdir(parents=True, exist_ok=True)
    props = json.loads((Path(__file__).parent / "props.json").read_text())
    wanted = sys.argv[1:] or list(props)
    client = Client(SPACE, hf_token=TOKEN, verbose=False)
    for kind in wanted:
        spec = props[kind]
        dest = RAW / f"{kind}.glb"
        if dest.exists():
            print(f"{kind}: already generated")
            continue
        t = time.time()
        try:
            ref = reference(kind, spec["prompt"], spec["seed"])
            dest.write_bytes(shape(client, ref))
            print(f"{kind}: ok in {time.time() - t:.0f}s ({dest.stat().st_size // 1024} KB)")
        except Exception as e:  # keep going: one failing prop must not block the rest
            print(f"{kind}: FAILED {type(e).__name__}: {str(e)[:200]}")


if __name__ == "__main__":
    main()
