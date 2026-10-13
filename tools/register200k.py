"""論文の図-2(a) を、20万分の1地質図幅「京都及大阪（第2版）」に合わせて位置合わせする。

20万分の1地質図は図郭（東経135°〜136°、北緯34°40′〜35°20′）で位置が決まっている。
論文の図のチャート（Type 1）と、20万分の1のチャート（サーモン〜オレンジ色）がいちばん重なる
縮尺・回転・平行移動を総当たりで探し、その変換から対応点（data/gcps.csv）を作り直す。
使い方: python3 tools/register200k.py
"""
import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
B = ROOT / "data" / "build"

# --- 20万分の1地質図（画像の図郭位置は、外枠と内枠の線を画素の明るさから測った値） ---
im = np.asarray(Image.open(ROOT / "source" / "gsj_200k_kyoto_osaka_2nd.jpg").convert("RGB")).astype(int)
L, R, T, Bm = 308.5, 1181.5, 57.5, 763.5
W0, E0, S0, N0 = 135.0, 136.0, 34 + 40 / 60, 35 + 20 / 60
lon2x = lambda lon: L + (lon - W0) / (E0 - W0) * (R - L)
lat2y = lambda lat: T + (N0 - lat) / (N0 - S0) * (Bm - T)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
chert200 = (r > 185) & (g > 105) & (g < 165) & (b > 75) & (b < 140) & (r - g > 55)

# --- 論文の図（extract.py の出力：3倍拡大画像の画素座標） ---
fig = json.load(open(B / "figure_features.json"))
fw, fh = fig["width"], fig["height"]
fimg = np.asarray(Image.open(ROOT / "data" / "figure" / "fig2a.png").convert("RGB")).astype(int)
fr, fg, fb = fimg[..., 0], fimg[..., 1], fimg[..., 2]
fchert = (fr > 190) & (fg > 70) & (fg < 175) & (fb < 90)
fmapped = fchert | ((fb > 140) & (fr < 100) & (fg > 60))  # 色の付いた（調査された）範囲
ys, xs = np.nonzero(fmapped[::8, ::8])
ys, xs = ys * 8, xs * 8
is_chert = fchert[ys, xs]

lat0 = 35.06
mx = 111320 * math.cos(math.radians(lat0))
my = 110950


def score(s, th, lon_c, lat_c):
    """図の中心を (lon_c, lat_c) に置き、s [m/px]・回転 th [度] で重ねたときの重なり（F値）"""
    c, si = math.cos(math.radians(th)), math.sin(math.radians(th))
    dx, dy = (xs - fw / 2) * s, -(ys - fh / 2) * s
    ex, ny = c * dx - si * dy, si * dx + c * dy
    px = np.round(lon2x(lon_c + ex / mx)).astype(int)
    py = np.round(lat2y(lat_c + ny / my)).astype(int)
    ok = (px >= 0) & (px < im.shape[1]) & (py >= 0) & (py < im.shape[0])
    t = chert200[py[ok], px[ok]]
    p = is_chert[ok]
    tp = (t & p).sum()
    return 2 * tp / max(1, t.sum() + p.sum())


best = (0, None)
for s in np.arange(9.0, 16.01, 1.0):
    for th in range(-10, 11, 5):
        for lon_c in np.arange(135.60, 135.72, 0.006):
            for lat_c in np.arange(35.02, 35.12, 0.006):
                f = score(s, th, lon_c, lat_c)
                if f > best[0]:
                    best = (f, (s, th, lon_c, lat_c))
# 細かく詰める
f0, (s0, th0, lo0, la0) = best
for s in np.arange(s0 - 1.0, s0 + 1.01, 0.25):
    for th in np.arange(th0 - 5, th0 + 5.01, 1.0):
        for lon_c in np.arange(lo0 - 0.006, lo0 + 0.0061, 0.0015):
            for lat_c in np.arange(la0 - 0.006, la0 + 0.0061, 0.0015):
                f = score(s, th, lon_c, lat_c)
                if f > best[0]:
                    best = (f, (s, th, lon_c, lat_c))
f, (s, th, lon_c, lat_c) = best
label_fit = score(9.22, -9.2, 135.64112, 35.061805)
print(f"best F={f:.3f}  scale={s:.2f} m/px ({1000 / s:.0f} px/km)  rot={th:.1f}°  center=({lon_c:.4f}, {lat_c:.4f})")
print(f"参考：地名3点による暫定の位置合わせの F={label_fit:.3f}")

# 求めた変換で、図の四隅と中心を対応点にする
c, si = math.cos(math.radians(th)), math.sin(math.radians(th))
def px2ll(x, y):
    dx, dy = (x - fw / 2) * s, -(y - fh / 2) * s
    return lon_c + (c * dx - si * dy) / mx, lat_c + (si * dx + c * dy) / my

rows = [("図の左上", 0, 0), ("図の右上", fw, 0), ("図の左下", 0, fh), ("図の右下", fw, fh), ("図の中心", fw / 2, fh / 2)]
with open(ROOT / "data" / "gcps.csv", "w", newline="") as fp:
    w = csv.writer(fp)
    w.writerow(["name", "px_x", "px_y", "lon", "lat", "basis"])
    for name, x, y in rows:
        lon, lat = px2ll(x, y)
        w.writerow([name, round(x, 1), round(y, 1), round(lon, 6), round(lat, 6),
                    f"20万分の1地質図「京都及大阪（第2版）」のチャートとの重なり最大化（F={f:.3f}）"])
json.dump({"f": round(f, 3), "label_fit_f": round(label_fit, 3), "scale_m_per_px": round(s, 2),
           "rotation_deg": round(th, 1), "center": [round(lon_c, 5), round(lat_c, 5)]},
          open(B / "registration.json", "w"), ensure_ascii=False, indent=1)
