"""20万分の1地質図「京都及大阪（第2版）」から愛宕山周辺を切り出し、Maplat 用の画像と対応点を作る。

図郭（東経135°〜136°、北緯34°40′〜35°20′）の画素位置から、切り出し範囲の四隅の経緯度が決まる。
使い方: python3 tools/make_200k.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
L, R, T, B = 308.5, 1181.5, 57.5, 763.5           # 図郭の画素位置（register200k.py と同じ）
W0, E0, S0, N0 = 135.0, 136.0, 34 + 40 / 60, 35 + 20 / 60
BOX = (135.52, 34.97, 135.78, 35.17)               # 切り出す範囲（西, 南, 東, 北）
K = 4                                              # 拡大率（Maplat のタイルが最大ズーム2・21枚に収まる大きさ）

lon2x = lambda lon: L + (lon - W0) / (E0 - W0) * (R - L)
lat2y = lambda lat: T + (N0 - lat) / (N0 - S0) * (B - T)
x0, y0, x1, y1 = lon2x(BOX[0]), lat2y(BOX[3]), lon2x(BOX[2]), lat2y(BOX[1])

im = Image.open(ROOT / "source" / "gsj_200k_kyoto_osaka_2nd.jpg").convert("RGB")
w, h = round((x1 - x0) * K), round((y1 - y0) * K)
crop = im.transform((w, h), Image.EXTENT, (x0, y0, x1, y1), Image.BICUBIC)
crop.save(ROOT / "data" / "figure" / "gsj200k.png")

gcps = [
    [[0, 0], [BOX[0], BOX[3]]], [[w, 0], [BOX[2], BOX[3]]],
    [[0, h], [BOX[0], BOX[1]]], [[w, h], [BOX[2], BOX[1]]],
    [[w / 2, h / 2], [(BOX[0] + BOX[2]) / 2, (BOX[1] + BOX[3]) / 2]],
]
json.dump({"width": w, "height": h, "gcps": gcps}, open(ROOT / "data" / "build" / "gsj200k_gcps.json", "w"))
print("gsj200k", w, h)
