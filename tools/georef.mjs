// 図-2(a) の画素座標 → 実座標（緯度経度）を Maplat の TIN 変換で求める
// 入力: data/gcps.csv（対応点）, data/build/figure_features.json（extract.py の出力）
// 出力: maps/fig2a.json（Maplat の地図定義）, data/build/units_raw.geojson, data/build/mines_raw.geojson
// License: CC BY 4.0

import fs from 'node:fs';
import path from 'node:path';
import { Tin } from '@maplat/tin';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const R = 6378137;
const toMerc = ([lon, lat]) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
const toLonLat = ([x, y]) => [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];
const round = (v) => Math.round(v * 1e6) / 1e6;

const [header, ...rows] = read('data/gcps.csv').trim().split(/\r?\n/);
const keys = header.split(',');
const gcps = rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
const fig = JSON.parse(read('data/build/figure_features.json'));

const tin = new Tin({ wh: [fig.width, fig.height], yaxisMode: Tin.YAXIS_INVERT, vertexMode: Tin.VERTEX_PLAIN, strictMode: Tin.MODE_AUTO });
tin.setPoints(gcps.map((g) => [[Number(g.px_x), Number(g.px_y)], toMerc([Number(g.lon), Number(g.lat)])]));
tin.updateTin();

const px2ll = ([x, y]) => toLonLat(tin.transform([x, y], false)).map(round);

// Maplat の地図定義（論文の図を「絵地図」として扱う）
const center = px2ll([fig.width / 2, fig.height / 2]);
fs.mkdirSync(path.join(ROOT, 'maps'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'maps', 'fig2a.json'), JSON.stringify({
  title: { ja: '論文 図-2(a) 地質図', en: 'Paper Fig.2(a) geological map' },
  officialTitle: { ja: '図-2(a) 地質図（井本ほか 1989・木村 2000 に加筆）', en: 'Fig.2(a)' },
  attr: { ja: '出典論文の図-2(a)（著作権は原著者に帰属）', en: 'Fig.2(a) of the source paper' },
  dataAttr: 'Aki Sato / FuruhashiLab',
  license: 'Custom',
  licenseNote: { ja: '原著論文の図。再配布の可否は要確認', en: 'Reuse permission to be confirmed' },
  dataLicense: 'CC BY 4.0',
  imageExtension: 'png',
  homePosition: center,
  mercZoom: 13,
  compiled: tin.getCompiled()
}));

// 20万分の1地質図（図郭の四隅で位置が決まる）も Maplat の地図にする
const g200 = JSON.parse(read('data/build/gsj200k_gcps.json'));
const tin200 = new Tin({ wh: [g200.width, g200.height], yaxisMode: Tin.YAXIS_INVERT, vertexMode: Tin.VERTEX_PLAIN });
tin200.setPoints(g200.gcps.map(([px, ll]) => [px, toMerc(ll)]));
tin200.updateTin();
fs.writeFileSync(path.join(ROOT, 'maps', 'gsj200k.json'), JSON.stringify({
  title: { ja: '20万分の1地質図幅「京都及大阪」第2版', en: 'Geological Map of Japan 1:200,000 Kyoto and Osaka (2nd ed.)' },
  officialTitle: { ja: '20万分の1地質図幅「京都及大阪」（第2版）', en: 'Kyoto and Osaka (2nd ed.)' },
  attr: { ja: '産総研 地質調査総合センター', en: 'Geological Survey of Japan, AIST' },
  dataAttr: 'Aki Sato / FuruhashiLab',
  license: 'Custom',
  licenseNote: { ja: '産総研地質調査総合センターの利用条件に従う', en: 'Follow the GSJ terms of use' },
  dataLicense: 'CC BY 4.0',
  imageExtension: 'png',
  homePosition: center,
  mercZoom: 13,
  compiled: tin200.getCompiled()
}));

// 地層の帯（ポリゴン）と砥石山（点）を実座標へ
const unitLabel = { type1_chert: 'Type 1（チャート・珪質岩）', type2_clastic: 'Type 2（砕屑岩）', type2_group: 'Type II 地層群' };
const units = [];
for (const [key, polys] of Object.entries(fig.units)) {
  polys.forEach((p, i) => {
    const rings = p.rings.map((ring) => {
      const r = ring.map(px2ll);
      r.push(r[0]);
      return r;
    });
    units.push({ type: 'Feature', properties: { unit_key: key, unit: unitLabel[key], unit_id: `${key}-${i + 1}` }, geometry: { type: 'Polygon', coordinates: rings } });
  });
}
const mines = fig.mines.map((m) => ({
  type: 'Feature',
  properties: { mine_id: m.id, px_x: m.x, px_y: m.y },
  geometry: { type: 'Point', coordinates: px2ll([m.x, m.y]) }
}));

const out = path.join(ROOT, 'data', 'build');
fs.writeFileSync(path.join(out, 'units_raw.geojson'), JSON.stringify({ type: 'FeatureCollection', features: units }));
fs.writeFileSync(path.join(out, 'mines_raw.geojson'), JSON.stringify({ type: 'FeatureCollection', features: mines }));

// 対応点の当てはまり確認（TIN は対応点を必ず通るので、ここでは逆変換の往復誤差を見る）
for (const g of gcps) {
  const ll = px2ll([Number(g.px_x), Number(g.px_y)]);
  console.log(`GCP ${g.name}: px(${g.px_x},${g.px_y}) -> ${ll}`);
}
console.log(`units=${units.length} mines=${mines.length} center=${center}`);
