// src/ をひとつの HTML ファイルにまとめる（dist/haikaden-planner.html）
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
const out = esbuild.buildSync({
  entryPoints: [join(here, 'src/app.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  write: false,
  charset: 'utf8',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = readFileSync(join(here, 'src/page.html'), 'utf8').replace('/*APP_SCRIPT*/', () => js);
mkdirSync(join(here, 'dist'), { recursive: true });
const dest = join(here, 'dist/haikaden-planner.html');
writeFileSync(dest, page);
console.log(`built ${dest} (${(page.length / 1024).toFixed(0)} KB)`);
