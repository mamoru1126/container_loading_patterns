// リアルタイム積付けの検査: 条件を変えて流し、締めた全コンテナが制約を守っているかを確かめる
import { CONTAINERS, makeStream } from '../src/catalog.js';
import { Simulation } from '../src/online.js';
import { validatePlan } from '../src/check.js';

const OPTS = { gap: 20, topClear: 50, minSupport: 0.8 };
let failures = 0;
for (const ct of ['iso20', 'jr12', 'iso40', 'iso40hc']) {
  for (const policy of ['learned', 'dblf']) {
    for (const buffer of [0, 3]) {
      const sim = new Simulation(CONTAINERS[ct], makeStream(7), { ...OPTS, policy, buffer });
      const n = ct.startsWith('iso40') ? 500 : 300;
      for (let i = 0; i < n; i++) sim.step();
      const st = sim.stats();
      let bad = 0;
      for (const b of sim.bins) {
        const res = validatePlan({ placements: b.placed }, CONTAINERS[ct], OPTS).filter((r) => r.state === 'ng' && r.id !== 'cog');
        if (res.length) {
          bad += 1;
          console.log('  NG', ct, policy, buffer, `No.${b.index}`, res.map((r) => `${r.id}:${r.detail.slice(0, 2)}`));
        }
      }
      failures += bad;
      console.log(`${CONTAINERS[ct].name.padEnd(14)} ${policy.padEnd(7)} 待機${buffer}  ${n}台 → ${st.containers}本  平均容積率 ${(st.avgFill * 100).toFixed(1)}%  1本 ${st.avgCount.toFixed(1)}台  判断 ${st.avgMs.toFixed(2)}ms/台${bad ? `  NG ${bad}本` : ''}`);
    }
  }
}
if (failures) {
  console.error(`${failures} 本のコンテナで制約違反`);
  process.exit(1);
}
console.log('\nすべてのコンテナで制約違反なし');
