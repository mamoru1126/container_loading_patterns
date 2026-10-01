# container_loading_patterns

廃家電（家電4品目）をリサイクル輸送するときの、コンテナ積込みパターンを自動で作るソフトの開発リポジトリです。

## デモ

**https://mamoru1126.github.io/container_loading_patterns/**

コンテナと品目ごとの台数を選ぶと、積み重ねルール・耐荷重・重心を守った積付けパターンを3案作り、3Dで表示します。
積込みの順番をアニメーションで再生することもできます。詳しくは [`demo/README.md`](demo/README.md) を見てください。

### GitHub Pages の設定

- Settings → Pages → Build and deployment で、Source を「Deploy from a branch」、Branch を `main` / `/(root)` にする
- 公開されるのはリポジトリ直下の `index.html`（`demo/` のビルドで生成）
- `.nojekyll` を置いて、Jekyll による変換を止めている

デモを変更したら、ビルドして `index.html` も一緒にコミットします。

```sh
cd demo
npm test        # 積付けエンジンの制約チェック
npm run build   # index.html と demo/dist/haikaden-planner.html を生成
```

## 使っている技術

| 分類 | 使っているもの | 用途 |
| --- | --- | --- |
| 言語 | JavaScript（ES2020、ES Modules） | 画面・積付けエンジン・3D表示のすべて |
| 実行環境 | ブラウザのみ（サーバー不要） | 1ファイルの静的 HTML として動く |
| 3D表示 | WebGL2（自作の小さなレンダラ、`demo/src/gl.js`） | 家電モデルの描画、影（シャドウマップ）、視点操作 |
| 積付け計算 | 自作のヒューリスティクス（`demo/src/engine.js`） | 段組み・壁積み・重心調整・多始点探索。AI・機械学習はまだ使っていない |
| フォント | Google Fonts（BIZ UDPGothic、IBM Plex Mono） | 画面の文字と数値。読めない環境ではシステムのフォントで表示 |
| ビルド | esbuild | `demo/src/` を1つの HTML にまとめる |
| 検査 | Node.js、Playwright（Chromium） | 制約違反のテスト、画面のスクリーンショット確認 |
| 公開 | GitHub Pages | `main` ブランチ直下の `index.html` を配信 |

外部の JavaScript ライブラリ（three.js など）は実行時に読み込んでいません。

## 構成

```
index.html            GitHub Pages で公開するデモ（ビルドで生成）
demo/
  src/catalog.js      品目カタログ（実製品の寸法）とコンテナ仕様
  src/engine.js       積付けパターン生成エンジン
  src/check.js        生成結果の制約チェック
  src/gl.js           WebGL2 レンダラ
  src/models.js       家電・コンテナの3Dモデル
  src/app.js          画面の動作
  src/page.html       画面のレイアウトとスタイル
  build.mjs           ビルドスクリプト
  test/               エンジンのテストとスクリーンショット
```
