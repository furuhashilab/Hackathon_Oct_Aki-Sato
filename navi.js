// 論文図ナビ：論文の地質図そのものに、GPS の現在地を Maplat で表示する
// License: CC BY 4.0

const [units, mines] = await Promise.all(
  ['data/build/units.geojson', 'data/build/mines.geojson'].map((u) => fetch(u).then((r) => r.json()))
);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNIT_COLOR = { type1_chert: '#e07a10', type2_clastic: '#2f74c0', type2_group: '#777' };
const where = document.getElementById('where');
const near = document.getElementById('near');

// 距離（m）と方角
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function distBearing([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(a));
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  const brg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { d, dir: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(brg / 45) % 8] };
}

// 点がポリゴン（穴あり）の中か
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function unitAt(p) {
  const hits = units.features.filter((f) => {
    const [outer, ...holes] = f.geometry.coordinates;
    return inRing(p, outer) && !holes.some((h) => inRing(p, h));
  });
  // Type 1 の小さな帯は大きな帯の穴に入っていることがあるので優先する
  hits.sort((a, b) => (a.properties.unit_key === 'type1_chert' ? -1 : 1) - (b.properties.unit_key === 'type1_chert' ? -1 : 1));
  return hits[0]?.properties ?? null;
}

const fmt = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

// 現在地（またはデモの位置）を図に出し、地層と近い砥石山を表示する
function show(lnglat, acc, label) {
  maplat.setGPSMarker({ lnglat, acc: acc || 30 });
  const u = unitAt(lnglat);
  const list = mines.features
    .map((f) => ({ name: f.properties.name, both: f.properties.both, ...distBearing(lnglat, f.geometry.coordinates) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  where.innerHTML = `<b>${esc(label)}</b>：${lnglat[1].toFixed(5)}, ${lnglat[0].toFixed(5)}${acc ? `（GPS の誤差 約${Math.round(acc)}m）` : ''}<br>
    論文の図でのこの地点：${u ? `<span class="unit" style="background:${UNIT_COLOR[u.unit_key]}">${esc(u.unit)}</span>` : '色の付いた範囲の外（図では未区分）'}`;
  near.innerHTML = list.map((m) => `<li>${esc(m.name)}：${m.dir}へ ${fmt(m.d)} <small>${m.both ? '（図-1・図-2 の両方に記載）' : '（図-1 のみ）'}</small></li>`).join('');
}
function outOfMap(lnglat, acc) {
  maplat.setGPSMarker(null);
  where.innerHTML = `現在地（${lnglat[1].toFixed(4)}, ${lnglat[0].toFixed(4)}${acc ? `、誤差 約${Math.round(acc)}m` : ''}）は、論文の図の範囲の外です。図の範囲は愛宕山〜高雄〜保津峡のあたり（約13 km × 12 km）です。現地にいないときは「デモ」を使ってください。`;
  near.innerHTML = '';
}
const insideFigure = ([lon, lat]) => lon >= 135.5676 && lon <= 135.7134 && lat >= 35.0015 && lat <= 35.1075;

// ---------- Maplat ----------
const maplat = await window.MaplatApp.createObject({
  div: 'maplat',
  setting: {
    appName: '論文図ナビ',
    // gsi・gsi_ortho・osm は Maplat に組み込みの背景地図
    sources: ['gsi', 'gsi_ortho', 'osm', { mapID: 'fig2a' }, { mapID: 'fig1' }, { mapID: 'gsj200k' }],
    startFrom: 'fig2a',
    pois: mines.features.map((f) => ({ lnglat: f.geometry.coordinates, name: f.properties.name, desc: f.properties.source }))
  }
});
window.maplat = maplat; // デバッグ用

for (const b of document.querySelectorAll('.switch button')) {
  b.addEventListener('click', () => {
    maplat.changeMap(b.dataset.map);
    document.querySelectorAll('.switch button').forEach((x) => x.classList.toggle('on', x === b));
  });
}

// ---------- 現在地（GPS） ----------
let watchId = null;
let demo = false;
const btnGps = document.getElementById('btnGps');
const btnDemo = document.getElementById('btnDemo');

btnGps.addEventListener('click', () => {
  demo = false; btnDemo.classList.remove('on');
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId); watchId = null;
    btnGps.textContent = '現在地を図に出す'; maplat.setGPSMarker(null);
    where.textContent = '現在地の表示を止めました。';
    near.innerHTML = '';
    return;
  }
  if (!navigator.geolocation) { where.textContent = 'この端末では現在地を取得できません。「デモ」を使ってください。'; return; }
  where.textContent = '現在地を取得中…（初回は位置情報の許可を求められます）';
  btnGps.textContent = '現在地の表示を止める';
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const ll = [p.coords.longitude, p.coords.latitude];
      if (insideFigure(ll)) show(ll, p.coords.accuracy, '現在地'); else outOfMap(ll, p.coords.accuracy);
    },
    (err) => { where.textContent = `現在地を取得できませんでした（${err.message}）。「デモ」を使ってください。`; },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
});

// ---------- デモ：図をタップした場所にいることにする ----------
btnDemo.addEventListener('click', () => {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; btnGps.textContent = '現在地を図に出す'; }
  demo = !demo;
  btnDemo.classList.toggle('on', demo);
  where.textContent = demo ? '図の上をタップすると、そこにいるものとして表示します。' : 'デモを終了しました。';
  if (!demo) { maplat.setGPSMarker(null); near.innerHTML = ''; }
});
maplat.addEventListener('clickMap', (e) => {
  if (!demo) return;
  const d = e.detail || e;
  const ll = [d.longitude, d.latitude];
  if (insideFigure(ll)) show(ll, null, 'デモの位置'); else outOfMap(ll, null);
});
