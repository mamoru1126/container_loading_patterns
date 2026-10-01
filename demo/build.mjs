// src/ をひとつの HTML ファイルにまとめる
//   計画型:       dist/haikaden-planner.html と ../index.html（GitHub Pages）
//   リアルタイム型: dist/haikaden-online.html と ../online.html（GitHub Pages）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadEsbuild() {
  const candidates = ['esbuild', '/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild'];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      // 次の候補へ
    }
  }
  throw new Error('esbuild が見つかりません。npm install -D esbuild を実行してください。');
}

const esbuild = loadEsbuild();
const style = readFileSync(join(here, 'src/style.css'), 'utf8');

const PAGES = [
  {
    entry: 'src/app.js',
    template: 'src/page.html',
    dist: 'dist/haikaden-planner.html',
    pages: '../index.html',
    desc: '廃家電を積み重ねルールと重心を守ってコンテナに積むパターンを自動生成し、3Dで確認できるデモ',
  },
  {
    entry: 'src/online-app.js',
    template: 'src/online.html',
    dist: 'dist/haikaden-online.html',
    pages: '../online.html',
    desc: 'ランダムに流れてくる廃家電を1台ずつ即座に判断してコンテナに積み、満載になったら次のコンテナへ切り替えるデモ',
  },
];

mkdirSync(join(here, 'dist'), { recursive: true });
for (const pg of PAGES) {
  const out = esbuild.buildSync({
    entryPoints: [join(here, pg.entry)],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    write: false,
    charset: 'utf8',
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const page = readFileSync(join(here, pg.template), 'utf8')
    .replace('/*STYLE*/', () => style)
    .replace('/*APP_SCRIPT*/', () => js);
  writeFileSync(join(here, pg.dist), page);
  // GitHub Pages 用: リポジトリ直下に完全な HTML 文書として置く
  const full = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${pg.desc}">
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${page}
</body>
</html>
`;
  writeFileSync(join(here, pg.pages), full);
  console.log(`built ${pg.dist} (${(page.length / 1024).toFixed(0)} KB) と ${pg.pages}`);
}
