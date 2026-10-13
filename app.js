// 京都砥石層マップ
// ① Maplat：論文の図をそのまま表示し、実座標の砥石山を図の上へ逆変換して重ねる
// ② MapLibre：Maplat の TIN で実座標へ変換した地層の帯・砥石山を実際の地図に表示する
// License: CC BY 4.0

import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';

const [units, mines, summary, tree] = await Promise.all(
  ['data/build/units.geojson', 'data/build/mines.geojson', 'data/build/summary.json', 'data/hierarchy.json']
    .map((u) => fetch(u).then((r) => r.json()))
);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- ② MapLibre（実際の地図） ----------
const [minLon, minLat, maxLon, maxLat] = units.features.flatMap((f) => f.geometry.coordinates[0])
  .reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [180, 90, -180, -90]);

const map = new maplibregl.Map({
  container: 'real',
  bounds: [[minLon, minLat], [maxLon, maxLat]],
  fitBoundsOptions: { padding: 10 },
  style: {
    version: 8,
    sources: {
      gsi: {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 18,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'
      },
      // 20万分の1地質図の切り出し（tools/make_200k.py。四隅は図郭から計算した経緯度）
      gsj200k: {
        type: 'image',
        url: 'data/figure/gsj200k.png',
        coordinates: [[135.52, 35.17], [135.78, 35.17], [135.78, 34.97], [135.52, 34.97]]
      },
      units: { type: 'geojson', data: units },
      osm: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      mines: { type: 'geojson', data: mines }
    },
    layers: [
      { id: 'gsi', type: 'raster', source: 'gsi' },
      { id: 'gsj200k', type: 'raster', source: 'gsj200k', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } },
      {
        id: 'units', type: 'fill', source: 'units',
        paint: {
          'fill-color': ['match', ['get', 'unit_key'], 'type1_chert', '#f08a24', 'type2_group', '#777', '#2f74c0'],
          'fill-opacity': ['match', ['get', 'unit_key'], 'type1_chert', 0.65, 'type2_group', 0.45, 0.3]
        }
      },
      {
        id: 'units-outline', type: 'line', source: 'units', layout: { visibility: 'none' },
        filter: ['==', ['get', 'unit_key'], 'type1_chert'],
        paint: { 'line-color': '#000', 'line-width': 1.5 }
      },
      {
        id: 'unrecorded-fill', type: 'fill', source: 'units',
        filter: ['==', ['get', 'unrecorded'], true],
        paint: { 'fill-color': '#ffd400', 'fill-opacity': 0.35 }
      },
      {
        id: 'unrecorded', type: 'line', source: 'units',
        filter: ['==', ['get', 'unrecorded'], true],
        paint: { 'line-color': '#c00', 'line-width': 2, 'line-dasharray': [2, 1] }
      },
      {
        id: 'osm', type: 'circle', source: 'osm',
        paint: { 'circle-radius': 5, 'circle-color': '#1a9850', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
      },
      {
        id: 'mines', type: 'circle', source: 'mines',
        paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#7a1fa2', 'circle-stroke-width': 3 }
      }
    ]
  }
});
window.realMap = map; // デバッグ用
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

document.getElementById('showUnrecorded').addEventListener('change', (e) => {
  for (const id of ['unrecorded', 'unrecorded-fill']) map.setLayoutProperty(id, 'visibility', e.target.checked ? 'visible' : 'none');
});

document.getElementById('show200k').addEventListener('change', (e) => {
  map.setLayoutProperty('gsj200k', 'visibility', e.target.checked ? 'visible' : 'none');
  // 20万分の1を見るときは、論文由来の帯を輪郭だけにする
  map.setPaintProperty('units', 'fill-opacity', e.target.checked ? 0 : ['match', ['get', 'unit_key'], 'type1_chert', 0.65, 'type2_group', 0.45, 0.3]);
  map.setLayoutProperty('units-outline', 'visibility', e.target.checked ? 'visible' : 'none');
});

map.on('click', (e) => {
  const f = map.queryRenderedFeatures(e.point, { layers: ['mines', 'osm', 'units'] })[0];
  if (!f) return;
  const p = f.properties;
  if (f.layer.id === 'osm') {
    document.getElementById('detail').innerHTML = `<b>OSM：${esc(p.label)}</b><br>${esc(p.tags)}<br>
      <a href="https://www.openstreetmap.org/${esc(p.osm_type)}/${esc(p.osm_id)}" target="_blank" rel="noopener">OSM で見る</a>`;
    return;
  }
  document.getElementById('detail').innerHTML = f.layer.id === 'mines'
    ? `<b>${esc(p.name)}</b><br>乗っている帯：${esc(p.on_unit)}<br>Type 1 の帯まで：${esc(p.dist_type1_m)} m<br><small>${esc(p.source)}</small>`
    : `<b>${esc(p.unit)}</b>（${esc(p.unit_id)}）<br>面積：${esc(p.area_ha)} ha<br>300m 以内の砥石山：${esc(p.n_mines_near)} か所${p.mine_ids ? `（#${esc(p.mine_ids).replaceAll(',', ', #')}）` : ''}
       ${p.unrecorded === true || p.unrecorded === 'true' ? '<br><b style="color:#c00">未記録区間</b>：Type 1 の帯だが砥石山の記録がない' : ''}`;
});
for (const id of ['mines', 'osm', 'units']) {
  map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
}

// ---------- OSM（Overpass API）との答え合わせ ----------
// 閲覧のたびに最新の OSM を取得する。採掘跡・坑口・露頭・名前に「砥」を含む地物を、図から抽出した砥石山と比べる
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const NEAR_OSM_M = 500;
const [w, so, e, n] = [minLon, minLat, maxLon, maxLat].map((v) => v.toFixed(4));
const bbox = `${so},${w},${n},${e}`;
const OSM_QUERY = `[out:json][timeout:25];
(
  nwr["landuse"="quarry"](${bbox});
  nwr["historic"="mine"](${bbox});
  nwr["man_made"~"^(adit|mineshaft)$"](${bbox});
  nwr["geological"="outcrop"](${bbox});
  nwr["name"~"砥"](${bbox});
);
out center tags;`;

const osmLabel = (t) => t.name || (t.landuse === 'quarry' ? '石切場・採石場'
  : t.historic === 'mine' ? '鉱山跡' : /adit|mineshaft/.test(t.man_made || '') ? '坑口'
  : t.geological === 'outcrop' ? '露頭' : '地物');

const distM = ([x1, y1], [x2, y2]) => Math.hypot((x1 - x2) * 111320 * Math.cos((y1 * Math.PI) / 180), (y1 - y2) * 110950);

async function loadOsm() {
  const out = document.getElementById('osm');
  const edit = `<a href="https://www.openstreetmap.org/edit#map=15/${((minLat + maxLat) / 2).toFixed(4)}/${((minLon + maxLon) / 2).toFixed(4)}" target="_blank" rel="noopener">この範囲を OSM で編集する</a>`;
  let json = null;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: OSM_QUERY }) });
      if (r.ok) { json = await r.json(); break; }
    } catch { /* 次のサーバーを試す */ }
  }
  if (!json) {
    out.innerHTML = `<p class="hint">Overpass API に接続できませんでした。時間をおいて再読み込みしてください。<br>${edit}</p>`;
    return;
  }
  const feats = json.elements
    .map((el) => ({ el, c: el.type === 'node' ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null }))
    .filter((x) => x.c)
    .map(({ el, c }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c },
      properties: {
        label: osmLabel(el.tags || {}),
        tags: Object.entries(el.tags || {}).map(([k, v]) => `${k}=${v}`).join(', '),
        osm_type: el.type,
        osm_id: el.id
      }
    }));
  map.getSource('osm').setData({ type: 'FeatureCollection', features: feats });

  // 図から抽出した砥石山のうち、OSM の地物が近くにあるもの
  const near = mines.features.map((m) => {
    const d = Math.min(Infinity, ...feats.map((f) => distM(m.geometry.coordinates, f.geometry.coordinates)));
    return { id: m.properties.mine_id, d };
  });
  const hit = near.filter((x) => x.d <= NEAR_OSM_M);
  const toishi = feats.filter((f) => /砥/.test(f.properties.label + f.properties.tags));
  out.innerHTML = `<table>
    <tr><td>範囲内の OSM 地物（採掘跡・坑口・露頭・「砥」）</td><td>${feats.length} 件</td></tr>
    <tr><td>うち名前・タグに「砥」を含む</td><td>${toishi.length} 件</td></tr>
    <tr><td>OSM 地物が ${NEAR_OSM_M}m 以内にある砥石山</td><td>${hit.length}／${near.length} か所</td></tr></table>
    <p class="hint">緑の点が OSM の地物。OSM は位置は正確でも、山中の採掘跡は登録されていないことが多い（無い＝存在しない、ではない）。<br>${edit}</p>`;
}
(function waitStyle() { if (map.isStyleLoaded()) loadOsm(); else setTimeout(waitStyle, 200); })();

// ---------- 結果と階層 ----------
const s = summary;
const pct = (v) => `${Math.round(v * 100)}%`;
document.getElementById('summary').innerHTML = `<table>
  <tr><td>図から抽出した砥石山</td><td>${s.mines} か所</td></tr>
  <tr><td>Ⅰ型の範囲／Ⅱ型の範囲（面積 ${pct(s.area_share_type_II)}）にある砥石山</td><td>${s.mines_in_type_I}／${s.mines_in_type_II} か所</td></tr>
  <tr><td>Type 1 の帯の上にある</td><td>${s.mines_on_type1} か所</td></tr>
  <tr><td>Type 1 の帯から 300m 以内</td><td>${s.mines_within_300m_of_type1} か所（${pct(s.mines_within_300m_share)}）</td></tr>
  <tr><td>比較：ランダムな地点が 300m 以内に入る割合</td><td>${pct(s.random_within_300m_of_type1)}</td></tr>
  <tr><td>Type 1 までの距離（中央値）</td><td>${s.median_dist_type1_m} m</td></tr>
  <tr><td>Type 1 の帯（砥石山あり／なし）</td><td>${s.type1_bands_with_mine}／${s.type1_bands_unrecorded}</td></tr>
  <tr><td>未記録区間の面積</td><td>${s.unrecorded_area_ha} ha</td></tr></table>`;

function renderTree(node) {
  const kids = (node.children || []).map(renderTree).join('');
  return `<li>${esc(node.name)}${node.note ? `<span class="note">${esc(node.note)}</span>` : ''}${kids ? `<ul>${kids}</ul>` : ''}</li>`;
}
document.getElementById('tree').innerHTML = `<ul>${renderTree(tree)}</ul>`;

// ---------- ① Maplat（論文の図） ----------
const maplat = await window.MaplatApp.createObject({
  div: 'maplat',
  setting: {
    appName: '京都砥石層マップ',
    sources: ['gsi', { mapID: 'fig2a' }, { mapID: 'gsj200k' }],
    startFrom: 'fig2a',
    // 実座標の砥石山を渡すと、Maplat が TIN で図の上の位置へ逆変換して描く
    pois: mines.features.map((f) => ({
      lnglat: f.geometry.coordinates,
      name: f.properties.name,
      desc: `${f.properties.on_unit}／Type 1 まで ${f.properties.dist_type1_m} m`
    }))
  }
});
window.maplat = maplat; // デバッグ用

for (const b of document.querySelectorAll('.switch button')) {
  b.addEventListener('click', () => {
    maplat.changeMap(b.dataset.map);
    document.querySelectorAll('.switch button').forEach((x) => x.classList.toggle('on', x === b));
  });
}
