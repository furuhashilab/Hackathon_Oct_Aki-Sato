# 京都砥石層マップ（Maplat 版）

**🌐 公開ページ: https://furuhashilab.github.io/Hackathon_Oct_Aki-Sato/**
**📄 研究ノート（IMRAD）: [docs/IMRAD.md](docs/IMRAD.md)**

10月 FOSS4G Hiroshima / SotM Asia OSAKA 振り返りハッカソン（ソロ）の成果物です。

## 一言でいうと
**論文の地質図そのものに、スマホの GPS の現在地を Maplat で表示する「現地ナビ」** です（`index.html`）。
京都の天然砥石の砥石山（論文の図の ⚒）と地層の帯を、論文の図の上で確かめながら現地を歩けます。

- 現在地を論文の図-2(a)（または20万分の1地質図）の上に青い丸で表示
- その地点が論文の図でどの地層（Type 1／Type 2／Type II）にあたるか
- 近い砥石山3つまでの方角と距離
- 現地にいないときは「デモ」で、図をタップした場所にいるものとして表示

既存の地質アプリ（地質図Navi、Rockd、StraboSpot など）は現代の地質図の上に現在地を出します。このナビは **論文の図版そのもの** に現在地を出す点が違います。
位置合わせの方法と集計は、検証ページ（`analysis.html`）と [研究ノート](docs/IMRAD.md) にあります。

## 参考にした発表 → 使った新しい技術
| | |
|---|---|
| 参考発表 | 大塚恒平「Bringing Old Maps & Illustrated Maps to the Web: 10 Years of Maplat」（FOSS4G Hiroshima 2026） |
| 新しい技術 | **Maplat**（`@maplat/tin` で図 ⇄ 実座標の変換、`@maplat/core` で図を歪めずに表示） |
| なぜ使ったか | 論文の図は縮尺・注記が完全には一致しない「絵」。Maplat は対応点を必ず通る非線形変換で、図を一次資料として残したまま実際の地図と行き来できる |

## 流れ
```
論文 図-2(a) → extract.py（色で帯・⚒ を抽出）
→ register200k.py（20万分の1地質図「京都及大阪」のチャートと最もよく重なる位置を探す）
→ georef.mjs（Maplat TIN で実座標へ）→ analyze.py（Ⅰ型/Ⅱ型・帯との距離・未記録区間）
→ index.html（① Maplat：論文の図／20万分の1／地理院 ＋ ② 実際の地図）
```

## 結果（要約）
- 位置合わせ：20万分の1地質図との重なりが最大になる縮尺は **75 px/km・回転 0°** で、論文の図の縮尺バー・方位記号と一致（重なり F=0.47。地名 3 点による当初の位置合わせは F=0.15）
- 砥石山は論文の図-1 の ⚒ 22 か所を読み取り（うち 8 か所は図-2(a) にも記載）。区分を判定できた 17 か所はすべてⅠ型地層群の範囲で、Ⅱ型（面積 12%）には 0 か所（残り 5 か所は図の色の無い範囲）
- Type 1 チャートの帯との距離では、ランダムな地点との差はほとんど無かった（300m 以内：32% 対 36%）
- 砥石山の記録がない Type 1 の帯（未記録区間）：32 本・991.7 ha

## 実際の地図に重ねるレイヤー
- 背景地図：地理院（標準・淡色・写真）、OpenStreetMap を切り替え
- 産総研 20万分の1日本シームレス地質図V2（クリックで岩相・時代を表示）
- 20万分の1地質図幅「京都及大阪（第2版）」
- 論文の図から取り出した地層の帯（ポリゴン）・未記録区間・砥石山
- OpenStreetMap の採掘跡・坑口・露頭・崖（Overpass API で取得した面・線・点）

## 採集メモ
- 「現在地を使う」（GPS）または「地図で指定」で場所を決め、写真・石の名前や層・メモを保存
- 保存した記録は地図に赤い点で表示。タップで写真とメモ
- 保存先はこの端末のブラウザ（IndexedDB）だけで、サーバーには送らない。「書き出し」で写真込みの GeoJSON に保存し、「読み込み」で戻せる
- 位置情報は HTTPS のページ（GitHub Pages）でのみ使える

## OSM との答え合わせ（Overpass API）
ページを開くたびに Overpass API で、図の範囲の OSM 地物（石切場・鉱山跡・坑口・露頭・名前に「砥」を含むもの）を取得し、図から抽出した砥石山の 500m 以内にあるかを数えます（緑の点）。

### 自分で OSM に砥石山を登録するとき
- 位置の根拠は **現地調査（GPS）** か、**OSM で利用が認められている航空写真** にする。論文の図や産総研の地質図からなぞるのは不可（著作権・ODbL の関係）。
- タグの例：`historic=mine`（廃坑）または `landuse=quarry`（採掘場）、`name=〇〇砥石山`、`description=天然砥石（〇〇層）`。坑口は `man_made=adit`。
- 登録すると、このページの答え合わせに自動で反映されます（OSM の反映には数分かかることがあります）。

## 作り直し方
```sh
pip install opencv-python-headless shapely pillow numpy
cd tools && npm install && npm run build
cd .. && python3 -m http.server 8000   # → http://localhost:8000/
```
`register200k.py` が `data/gcps.csv`（図の画素座標 ⇄ 緯度経度）を作ります。手で対応点を足す場合は、`npm run build` の代わりに `node georef.mjs && python3 analyze.py` を実行します。

## ⚠️ 注意
- 位置合わせの精度は、基準にした20万分の1地質図の画像の解像度（1 px ≒ 100 m）までです。
- 砥石山は論文の図-1 の ⚒ を目で読み取ったもので、名称・層・称号は未入力です。
- 論文の図（`source/paper_fig1_fig2.webp`, `data/figure/fig2a.png`, `tiles/fig2a/`）の著作権は原著者に帰属します。**公開前に転載の可否を確認してください。**
- 20万分の1地質図（`source/gsj_200k_kyoto_osaka_2nd.jpg`, `data/figure/gsj200k.png`, `tiles/gsj200k/`）は産総研地質調査総合センターの利用条件に従ってください。

## ライセンス
コード・抽出データ：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) © 2026 Aki Sato / FuruhashiLab
（論文の図・20万分の1地質図は対象外。OSM データ © OpenStreetMap contributors（ODbL）。Maplat: Apache-2.0、MapLibre GL JS: BSD-3-Clause、OpenLayers: BSD-2-Clause、地理院タイル）

---
このリポジトリの作成・更新は Claude Code で行いました。
