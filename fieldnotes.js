// 採集メモ：現在地（または地図で指定した場所）に、写真とメモを保存する
// 保存先はこのブラウザの IndexedDB（端末の中だけ）。書き出し・読み込みでバックアップする
// License: CC BY 4.0

const DB_NAME = 'kyoto-toishi-fieldnotes';
const STORE = 'notes';
const MAX_PHOTO_PX = 1600;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}
const getAll = () => tx('readonly', (s) => s.getAll());
const put = (note) => tx('readwrite', (s) => s.put(note));
const del = (id) => tx('readwrite', (s) => s.delete(id));

// 写真は長辺 1600px の JPEG に縮めて保存する（端末の容量を食わないように）
async function shrinkPhoto(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, MAX_PHOTO_PX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

const blobToDataUrl = (blob) => new Promise((resolve) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.readAsDataURL(blob);
});
const dataUrlToBlob = (url) => fetch(url).then((r) => r.blob());

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => new Date(t).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

export function initFieldNotes(map, maplibregl) {
  const el = (id) => document.getElementById(id);
  const status = el('fnStatus');
  let draft = null; // { lat, lon, accuracy, source }
  let picking = false;
  const urls = new Map(); // id → 写真の object URL

  map.addSource('fieldnotes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'fieldnotes', type: 'circle', source: 'fieldnotes',
    paint: { 'circle-radius': 8, 'circle-color': '#d4380d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 }
  });
  map.addSource('fn-draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'fn-draft', type: 'circle', source: 'fn-draft',
    paint: { 'circle-radius': 9, 'circle-color': 'rgba(212,56,13,0.25)', 'circle-stroke-color': '#d4380d', 'circle-stroke-width': 2 }
  });

  function setDraft(lat, lon, accuracy, source) {
    draft = { lat, lon, accuracy, source };
    map.getSource('fn-draft').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }] });
    status.textContent = `場所：${lat.toFixed(5)}, ${lon.toFixed(5)}（${source}${accuracy ? `・誤差 約${Math.round(accuracy)}m` : ''}）`;
    el('fnSave').disabled = false;
  }

  // 現在地
  el('fnLocate').addEventListener('click', () => {
    if (!navigator.geolocation) { status.textContent = 'この端末では現在地を取得できません。「地図で指定」を使ってください。'; return; }
    status.textContent = '現在地を取得中…（初回は位置情報の許可を求められます）';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDraft(p.coords.latitude, p.coords.longitude, p.coords.accuracy, 'GPS');
        map.easeTo({ center: [p.coords.longitude, p.coords.latitude], zoom: Math.max(map.getZoom(), 15) });
      },
      (err) => { status.textContent = `現在地を取得できませんでした（${err.message}）。「地図で指定」を使ってください。`; },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });

  // 地図をタップして指定
  el('fnPick').addEventListener('click', () => {
    picking = !picking;
    el('fnPick').classList.toggle('on', picking);
    map.getCanvas().style.cursor = picking ? 'crosshair' : '';
    if (picking) status.textContent = '右の地図で、採集した場所をタップしてください。';
  });
  map.on('click', (e) => {
    if (!picking) return;
    picking = false;
    el('fnPick').classList.remove('on');
    map.getCanvas().style.cursor = '';
    setDraft(e.lngLat.lat, e.lngLat.lng, null, '地図で指定');
  });

  // 保存
  el('fnSave').addEventListener('click', async () => {
    if (!draft) return;
    const file = el('fnPhoto').files[0];
    el('fnSave').disabled = true;
    status.textContent = '保存中…';
    try {
      const note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: Date.now(),
        ...draft,
        title: el('fnTitle').value.trim(),
        memo: el('fnMemo').value.trim(),
        photo: file ? await shrinkPhoto(file) : null
      };
      await put(note);
      draft = null;
      map.getSource('fn-draft').setData({ type: 'FeatureCollection', features: [] });
      el('fnPhoto').value = ''; el('fnTitle').value = ''; el('fnMemo').value = '';
      status.textContent = '保存しました（この端末のブラウザに保存）。';
      await refresh();
    } catch (err) {
      status.textContent = `保存できませんでした（${err.message}）。`;
      el('fnSave').disabled = false;
    }
  });

  // 一覧と地図を描き直す
  async function refresh() {
    const notes = (await getAll()).sort((a, b) => b.time - a.time);
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    for (const n of notes) if (n.photo) urls.set(n.id, URL.createObjectURL(n.photo));

    map.getSource('fieldnotes').setData({
      type: 'FeatureCollection',
      features: notes.map((n) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [n.lon, n.lat] }, properties: { id: n.id } }))
    });
    el('fnCount').textContent = `${notes.length} 件`;
    el('fnList').innerHTML = notes.length ? notes.map((n) => `
      <li data-id="${esc(n.id)}">
        ${urls.has(n.id) ? `<img src="${urls.get(n.id)}" alt="">` : '<span class="noimg">写真なし</span>'}
        <div><b>${esc(n.title || '（名前なし）')}</b><br>
          <small>${fmtTime(n.time)}／${n.lat.toFixed(5)}, ${n.lon.toFixed(5)}</small><br>
          ${esc(n.memo)}</div>
        <span class="fnBtns"><button type="button" data-act="go">地図</button><button type="button" data-act="del">削除</button></span>
      </li>`).join('') : '<li class="hint">まだ記録はありません。</li>';
    return notes;
  }

  el('fnList').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.closest('li').dataset.id;
    const n = (await getAll()).find((x) => x.id === id); if (!n) return;
    if (b.dataset.act === 'go') { map.easeTo({ center: [n.lon, n.lat], zoom: Math.max(map.getZoom(), 15) }); showPopup(n); }
    if (b.dataset.act === 'del' && b.dataset.confirm === '1') { await del(id); await refresh(); }
    else if (b.dataset.act === 'del') { b.dataset.confirm = '1'; b.textContent = 'もう一度押すと削除'; }
  });

  function showPopup(n) {
    new maplibregl.Popup({ maxWidth: '260px' })
      .setLngLat([n.lon, n.lat])
      .setHTML(`${urls.has(n.id) ? `<img src="${urls.get(n.id)}" alt="" style="width:100%;border-radius:4px">` : ''}
        <b>${esc(n.title || '（名前なし）')}</b><br><small>${fmtTime(n.time)}／${esc(n.source)}</small><br>${esc(n.memo)}`)
      .addTo(map);
  }
  map.on('click', 'fieldnotes', async (e) => {
    if (picking) return;
    const id = e.features[0].properties.id;
    const n = (await getAll()).find((x) => x.id === id);
    if (n) showPopup(n);
  });
  map.on('mouseenter', 'fieldnotes', () => { if (!picking) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'fieldnotes', () => { if (!picking) map.getCanvas().style.cursor = ''; });

  // 書き出し（写真込みの GeoJSON）
  el('fnExport').addEventListener('click', async () => {
    const notes = await getAll();
    const features = await Promise.all(notes.map(async (n) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
      properties: { id: n.id, time: new Date(n.time).toISOString(), title: n.title, memo: n.memo, source: n.source, accuracy_m: n.accuracy, photo: n.photo ? await blobToDataUrl(n.photo) : null }
    })));
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features })], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `toishi-fieldnotes-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // 読み込み
  el('fnImport').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const gj = JSON.parse(await file.text());
      let k = 0;
      for (const f of gj.features || []) {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties || {};
        await put({
          id: p.id || `${Date.now()}-${k}`, time: p.time ? Date.parse(p.time) : Date.now(), lat, lon,
          accuracy: p.accuracy_m ?? null, source: p.source || '読み込み', title: p.title || '', memo: p.memo || '',
          photo: p.photo ? await dataUrlToBlob(p.photo) : null
        });
        k++;
      }
      status.textContent = `${k} 件を読み込みました。`;
      await refresh();
    } catch (err) {
      status.textContent = `読み込めませんでした（${err.message}）。書き出した .geojson ファイルを選んでください。`;
    }
    e.target.value = '';
  });

  refresh().catch((err) => { status.textContent = `このブラウザでは保存機能を使えません（${err.message}）。`; });
}
