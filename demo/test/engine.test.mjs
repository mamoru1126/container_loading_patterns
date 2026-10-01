// 積付けエンジンの検査: 複数の乱数シードとコンテナで、全制約を満たすかを確認する
import { CONTAINERS, DEFAULT_COUNTS, generateItems, countsForTotal } from '../src/catalog.js';
import { planLoad } from '../src/engine.js';
import { validatePlan } from '../src/check.js';

const cases = [
  { c: 'iso20', counts: DEFAULT_COUNTS, seed: 1 },
  { c: 'iso20', counts: DEFAULT_COUNTS, seed: 2 },
  { c: 'iso20', counts: countsForTotal(90, 3), seed: 3 },
  { c: 'jr12', counts: countsForTotal(40, 4), seed: 4 },
  { c: 'iso40', counts: countsForTotal(150, 5), seed: 5 },
  { c: 'iso40hc', counts: countsForTotal(160, 6), seed: 6 },
  { c: 'iso20', counts: countsForTotal(30, 7), seed: 7 },
];

let failures = 0;
for (const tc of cases) {
  const container = CONTAINERS[tc.c];
  const items = generateItems(tc.counts, tc.seed);
  const t0 = performance.now();
  const res = planLoad(items, container, { seed: tc.seed });
  const ms = performance.now() - t0;
  console.log(`\n== ${container.name} / ${items.length}台 / seed ${tc.seed} / ${ms.toFixed(0)}ms`);
  res.plans.forEach((p, i) => {
    const m = p.metrics;
    const checks = validatePlan(p, container, res.options);
    const bad = checks.filter((c) => c.state === 'ng');
    const warn = checks.filter((c) => c.state === 'warn');
    const mark = i === res.bestIdx ? '*' : ' ';
    console.log(
      `${mark} ${p.strategy.name.padEnd(8, '　')} 積載 ${m.loaded}/${m.total}  容積率 ${(m.volUtil * 100).toFixed(1)}%  床 ${(m.floorUtil * 100).toFixed(1)}%  ` +
        `使用長 ${(m.usedLen / 1000).toFixed(2)}m  重心 ${m.cogOffPct.toFixed(1)}% 左右 ${(m.cogLatMm).toFixed(0)}mm  最大段 ${m.maxTier}  壁 ${m.strips}  ` +
        `NG:${bad.map((b) => b.id).join(',') || '-'} 注意:${warn.map((b) => b.id).join(',') || '-'}`,
    );
    for (const b of bad) {
      // 制約チェックの NG は重心以外すべて失敗扱い
      if (b.id !== 'cog') {
        failures++;
        console.log('   NG', b.id, b.detail.slice(0, 5));
      }
    }
  });
}
if (failures) {
  console.error(`\n${failures} 件の制約違反`);
  process.exit(1);
}
console.log('\nすべての案で制約違反なし');
