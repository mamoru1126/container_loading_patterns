// 遺伝的アルゴリズムの検査: 従来の多始点探索と比べ、制約違反がないことも確かめる
import { CONTAINERS, DEFAULT_COUNTS, generateItems, countsForTotal } from '../src/catalog.js';
import { planLoad } from '../src/engine.js';
import { GeneticPlanner } from '../src/ga.js';
import { validatePlan } from '../src/check.js';

const cases = [
  { c: 'iso20', counts: DEFAULT_COUNTS, seed: 1 },
  { c: 'iso20', counts: countsForTotal(80, 2), seed: 2 },
  { c: 'jr12', counts: countsForTotal(40, 3), seed: 3 },
  { c: 'iso40', counts: countsForTotal(160, 4), seed: 4 },
];

let failures = 0;
for (const tc of cases) {
  const ct = CONTAINERS[tc.c];
  const items = generateItems(tc.counts, tc.seed);
  const base = planLoad(items, ct, { seed: tc.seed });
  const h = base.plans[base.bestIdx];
  const t0 = performance.now();
  const ga = new GeneticPlanner(items, ct, { seed: tc.seed });
  const g = ga.run();
  const ms = performance.now() - t0;
  const bad = validatePlan(g, ct, ga.opts).filter((c) => c.state === 'ng' && c.id !== 'cog');
  failures += bad.length;
  const f = (p) => `${p.metrics.loaded}/${p.metrics.total}台 容積${(p.metrics.volUtil * 100).toFixed(1)}% 長さ${(p.metrics.usedLen / 1000).toFixed(2)}m 重心${p.metrics.cogOffPct.toFixed(1)}% 点数${p.score.toFixed(1)}`;
  console.log(`\n== ${ct.name} ${items.length}台`);
  console.log(`  多始点探索  ${f(h)}`);
  console.log(`  GA         ${f(g)}  （${ga.evals}回評価, ${ms.toFixed(0)}ms, 初期最良 ${ga.history[0].best.toFixed(1)}）${bad.length ? ' NG:' + bad.map((b) => b.id) : ''}`);
}
if (failures) {
  console.error(`${failures} 件の制約違反`);
  process.exit(1);
}
console.log('\nGA の案に制約違反なし');
