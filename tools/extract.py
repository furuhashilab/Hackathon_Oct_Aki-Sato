"""論文の図-2(a) 地質図から、地層の帯（Type 1 チャート / Type 2 砕屑岩）と砥石山の記号を抜き出す。

出力は図の画素座標（左上原点）。実座標への変換は georef.mjs が Maplat TIN で行う。
使い方: python3 tools/extract.py
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "paper_fig1_fig2.webp"
CROP = (128, 372, 462, 668)  # 図-2(a) の範囲（元画像の画素）
SCALE = 3                    # 見やすさのため 3 倍に拡大した画像を基準座標にする
OUT = ROOT / "data" / "build"
OUT.mkdir(parents=True, exist_ok=True)

im = Image.open(SRC).convert("RGB").crop(CROP)
big = im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)
fig_dir = ROOT / "data" / "figure"
fig_dir.mkdir(parents=True, exist_ok=True)
big.save(fig_dir / "fig2a.png")

a = np.asarray(big).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
masks = {
    # 凡例: Type 1 chert（オレンジ）, Type 2 clastic rock（青）
    "type1_chert": (r > 190) & (g > 70) & (g < 175) & (b < 90),
    "type2_clastic": (b > 140) & (r < 100) & (g > 60),
}


def polygons(mask, min_area):
    m = mask.astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, hierarchy = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hierarchy is None:
        return out
    for i, c in enumerate(contours):
        if hierarchy[0][i][3] != -1 or cv2.contourArea(c) < min_area:
            continue  # 穴は親と一緒に扱う
        ring = cv2.approxPolyDP(c, 1.5, True).reshape(-1, 2).tolist()
        holes = []
        child = hierarchy[0][i][2]
        while child != -1:
            hc = contours[child]
            # ⚒ 記号や文字でできた小さな穴（〜記号数個分）は地層の一部として埋める
            if cv2.contourArea(hc) >= max(min_area, 900):
                holes.append(cv2.approxPolyDP(hc, 1.5, True).reshape(-1, 2).tolist())
            child = hierarchy[0][child][0]
        if len(ring) >= 3:
            out.append({"rings": [ring] + [h for h in holes if len(h) >= 3], "area_px": float(cv2.contourArea(c))})
    return out


units = {k: polygons(v, 60 if k == "type1_chert" else 400) for k, v in masks.items()}

# 凡例の灰色「Type II」（Ⅱ型地層群）。背景地図の灰色と区別するため、大きな塊（5000px 以上）だけを使う
grey = ((abs(r - g) < 14) & (abs(g - b) < 14) & (r > 95) & (r < 175)).astype(np.uint8)
grey = cv2.morphologyEx(grey, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(grey, 8)
type2_mask = np.isin(lab, [i for i in range(1, n) if st[i][4] >= 5000])
units["type2_group"] = polygons(type2_mask, 5000)

# 砥石山の記号（⚒）：色の付いた地層の中にある、白っぽい小さな点
# 記号は白だが、縮小・圧縮でにじんで地層の色と混ざった「明るい点」になっている
white = ((r + g + b > 470) & ~((r > 215) & (g > 215) & (b > 215) & False)).astype(np.uint8)
colored = (masks["type1_chert"] | masks["type2_clastic"]).astype(np.uint8)
n, lab, stats, cent = cv2.connectedComponentsWithStats(white, 8)
ring_kernel = np.ones((15, 15), np.uint8)
mines = []
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if not (4 <= area <= 260 and w <= 28 and h <= 28):
        continue
    blob = (lab == i).astype(np.uint8)
    around = cv2.dilate(blob, ring_kernel) - blob
    if colored[around > 0].mean() < 0.5:
        continue  # 背景地図（白地）の一部は除く
    mines.append({"x": float(cent[i][0]), "y": float(cent[i][1]), "area_px": int(area)})

# ⚒ は2本のつるはしが別々の点に分かれやすいので、近い点（20px 以内）をまとめる
merged = []
for m in sorted(mines, key=lambda m: (m["y"], m["x"])):
    for g in merged:
        if (g["x"] - m["x"]) ** 2 + (g["y"] - m["y"]) ** 2 < 20 ** 2:
            k = g["n"]
            g["x"], g["y"], g["n"] = (g["x"] * k + m["x"]) / (k + 1), (g["y"] * k + m["y"]) / (k + 1), k + 1
            break
    else:
        merged.append({**m, "n": 1})
mines = [{"id": i + 1, "x": round(g["x"], 1), "y": round(g["y"], 1)} for i, g in enumerate(merged)]

json.dump({"width": big.width, "height": big.height, "units": units, "mines": mines},
          open(OUT / "figure_features.json", "w"), ensure_ascii=False)
print("size", big.size, {k: len(v) for k, v in units.items()}, "mines", len(mines))

# 確認用の画像
dbg = big.copy()
d = np.asarray(dbg).copy()
for m in mines:
    cv2.circle(d, (int(m["x"]), int(m["y"])), 9, (255, 0, 255), 2)
Image.fromarray(d).save(OUT / "_check_mines.png")
