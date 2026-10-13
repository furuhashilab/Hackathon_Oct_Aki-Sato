"""砥石山と地層の帯の空間的な関係を集計し、階層つきの GeoJSON を出力する。

- 各砥石山が Type 1 / Type 2 のどちらの帯の上にあるか、Type 1 の帯までの距離
- 砥石山の記録がない Type 1 の帯（＝未記録区間）
使い方: python3 tools/analyze.py （georef.mjs の後）
"""
import json
import math
from pathlib import Path

from shapely.geometry import Point, shape
import random
import warnings

from shapely.ops import transform, unary_union

warnings.filterwarnings("ignore", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parent.parent
B = ROOT / "data" / "build"
units = json.load(open(B / "units_raw.geojson"))["features"]
mines = json.load(open(B / "mines_raw.geojson"))["features"]
NEAR_M = 300  # この距離以内に砥石山がある帯を「記録あり」とする

lat0 = 35.06
def to_m(x, y, z=None):
    return (x * 111320 * math.cos(math.radians(lat0)), y * 110950)

ugeo = [(u, transform(to_m, shape(u["geometry"]).buffer(0))) for u in units]
type1 = unary_union([g for u, g in ugeo if u["properties"]["unit_key"] == "type1_chert"])

for m in mines:
    p = transform(to_m, Point(m["geometry"]["coordinates"]))
    on = [u for u, g in ugeo if g.contains(p)]
    # 両方に入る場合は Type 1 を優先（小さな帯が大きな帯の穴に入るため）
    on.sort(key=lambda u: u["properties"]["unit_key"] != "type1_chert")
    if not on:
        # 記号や断層線で色が途切れた隙間に落ちた点は、80m 以内の最寄りの帯に割り当てる
        near_u = sorted((g.distance(p), i) for i, (u, g) in enumerate(ugeo) if g.distance(p) <= 80)
        on = [ugeo[near_u[0][1]][0]] if near_u else []
    m["properties"].update({
        "name": f"砥石山 #{m['properties']['mine_id']}",
        "on_unit": on[0]["properties"]["unit"] if on else "（図の範囲外・判定不可）",
        "on_unit_id": on[0]["properties"]["unit_id"] if on else None,
        "dist_type1_m": round(p.distance(type1)),
        "source": "図-2(a) の ⚒ 記号を自動抽出（要確認）",
    })

for u, g in ugeo:
    near = [m for m in mines if transform(to_m, Point(m["geometry"]["coordinates"])).distance(g) <= NEAR_M]
    u["properties"].update({
        "area_ha": round(g.area / 10000, 1),
        "n_mines_near": len(near),
        "mine_ids": ",".join(str(m["properties"]["mine_id"]) for m in near),
        # Type 1 の帯なのに、近くに砥石山の記録がない → 未記録区間
        "unrecorded": u["properties"]["unit_key"] == "type1_chert" and not near,
    })

json.dump({"type": "FeatureCollection", "features": units}, open(B / "units.geojson", "w"), ensure_ascii=False)
json.dump({"type": "FeatureCollection", "features": mines}, open(B / "mines.geojson", "w"), ensure_ascii=False)

t1 = [u for u in units if u["properties"]["unit_key"] == "type1_chert"]
on_t1 = [m for m in mines if m["properties"]["on_unit"].startswith("Type 1")]
d = sorted(m["properties"]["dist_type1_m"] for m in mines)
area_t1 = sum(u["properties"]["area_ha"] for u in t1)
area_all = sum(u["properties"]["area_ha"] for u in units)
summary = {
    "mines": len(mines),
    "mines_on_type1": len(on_t1),
    "mines_within_300m_of_type1": sum(1 for x in d if x <= NEAR_M),
    "median_dist_type1_m": d[len(d) // 2],
    "type1_area_share": round(area_t1 / area_all, 3),
    "type1_bands": len(t1),
    "type1_bands_with_mine": sum(1 for u in t1 if not u["properties"]["unrecorded"]),
    "type1_bands_unrecorded": sum(1 for u in t1 if u["properties"]["unrecorded"]),
    "unrecorded_area_ha": round(sum(u["properties"]["area_ha"] for u in t1 if u["properties"]["unrecorded"]), 1),
}
# 比較: 地質図の範囲内にランダムに置いた点が、Type 1 の帯から 300m 以内に入る割合
mapped = unary_union([g for _, g in ugeo])
random.seed(0)
minx, miny, maxx, maxy = mapped.bounds
hits = total = 0
while total < 5000:
    q = Point(random.uniform(minx, maxx), random.uniform(miny, maxy))
    if not mapped.contains(q):
        continue
    total += 1
    hits += q.distance(type1) <= NEAR_M
summary["random_within_300m_of_type1"] = round(hits / total, 3)

# Ⅰ型（Type 1 チャート＋Type 2 砕屑岩）と Ⅱ型（Type II）の範囲での砥石山の数
area = lambda keys: sum(g.area for u, g in ugeo if u["properties"]["unit_key"] in keys)
a1, a2 = area({"type1_chert", "type2_clastic"}), area({"type2_group"})
summary["area_share_type_II"] = round(a2 / (a1 + a2), 3)
summary["mines_in_type_I"] = sum(1 for m in mines if m["properties"]["on_unit"].startswith(("Type 1", "Type 2")))
summary["mines_in_type_II"] = sum(1 for m in mines if m["properties"]["on_unit"].startswith("Type II"))
summary["mines_within_300m_share"] = round(summary["mines_within_300m_of_type1"] / len(mines), 3)

json.dump(summary, open(B / "summary.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
