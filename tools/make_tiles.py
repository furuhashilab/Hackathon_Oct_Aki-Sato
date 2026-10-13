"""Maplat で表示するため、図を画像タイル（tiles/<mapID>/{z}/{x}/{y}.png）に切る。

Maplat の絵地図タイルは、最大ズームで元画像の 256px が 1 タイルになるピラミッド。
"""
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
import shutil
shutil.rmtree(ROOT / "tiles", ignore_errors=True)  # 古いズームのタイルを残さない
for map_id in ("fig2a", "gsj200k"):
  img = Image.open(ROOT / "data" / "figure" / f"{map_id}.png").convert("RGBA")
  w, h = img.size
  max_zoom = math.ceil(math.log2(max(w, h) / 256))
  for z in range(max_zoom + 1):
    span = 256 * 2 ** (max_zoom - z)
    for x in range(math.ceil(w / span)):
        for y in range(math.ceil(h / span)):
            tile = Image.new("RGBA", (span, span), (0, 0, 0, 0))
            tile.paste(img.crop((x * span, y * span, min(w, (x + 1) * span), min(h, (y + 1) * span))), (0, 0))
            out = ROOT / "tiles" / map_id / str(z) / str(x)
            out.mkdir(parents=True, exist_ok=True)
            tile.resize((256, 256), Image.LANCZOS).save(out / f"{y}.png")
  print(map_id, "maxZoom", max_zoom, "size", w, h)
