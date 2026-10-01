// オンライン積付けの評価の重みを遺伝的アルゴリズムで学習し、src/online-weights.js に書き出す
// 使い方: node test/train-online.mjs [世代数]
//
// 適応度 = 学習用の家電の流れ（乱数シード違い）を積んだときの、満載で締めたコンテナの平均容積率
// 学習に使っていない流れ（検証用）でも、単純な奥詰めと比べて効果を確かめる
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINERS, makeStream, makeRng } from '../src/catalog.js';
import { Simulation, FEATURES } from '../src/online.js';

const here = dirname(fileURLToPath(import.meta.url));
const GENS = Number(process.argv[2] || 24);
const POP = 24;
const ITEMS = 200;
// buffer: 待機場所の台数。待機場所なし・ありの両方で良い判断になるように学習する
const TRAIN = [
  { ct: 'iso20', seed: 11, buffer: 0 }, { ct: 'iso20', seed: 12, buffer: 0 }, { ct: 'jr12', seed: 13, buffer: 0 },
  { ct: 'iso20', seed: 14, buffer: 3 }, { ct: 'iso20', seed: 15, buffer: 3 }, { ct: 'jr12', seed: 16, buffer: 3 },
];
const TEST = [
  { ct: 'iso20', seed: 101, buffer: 0 }, { ct: 'iso20', seed: 102, buffer: 0 }, { ct: 'jr12', seed: 103, buffer: 0 }, { ct: 'iso40', seed: 104, buffer: 0 },
  { ct: 'iso20', seed: 105, buffer: 3 }, { ct: 'iso20', seed: 106, buffer: 3 }, { ct: 'jr12', seed: 107, buffer: 3 }, { ct: 'iso40', seed: 108, buffer: 3 },
];

const keys = FEATURES.map(([k]) => k);
const toWeights = (ch) => Object.fromEntries(keys.map((k, i) => [k, +Math.pow(10, ch[i] * 3 - 1.5).toFixed(4)]));

function run(cases, opts, n = ITEMS) {
  let fill = 0;
  let count = 0;
  for (const c of cases) {
    const sim = new Simulation(CONTAINERS[c.ct], makeStream(c.seed), { ...opts, buffer: c.buffer });
    for (let i = 0; i < (c.ct === 'iso40' ? n * 2 : n); i++) sim.step();
    const st = sim.stats();
    fill += st.avgFill ?? 0;
    count += st.avgCount ?? 0;
  }
  return { fill: fill / cases.length, count: count / cases.length };
}

const rng = makeRng(2026);
const randomChrom = () => keys.map(() => rng());
let pop = [];
// 手で決めた初期値も1個体として入れる
const manual = { back: 10, height: 2, side: 0.5, contact: 1, floor: 1.5, headroom: 1, mix: 0.5, flat: 0.5, dead: 0.5 };
pop.push(keys.map((k) => (Math.log10(manual[k]) + 1.5) / 3));
while (pop.length < POP) pop.push(randomChrom());
const evalCh = (ch) => ({ ch, fit: run(TRAIN, { policy: 'learned', weights: toWeights(ch) }).fill });
pop = pop.map(evalCh);
const history = [];
const t0 = Date.now();
for (let g = 0; g <= GENS; g++) {
  pop.sort((a, b) => b.fit - a.fit);
  history.push(+(pop[0].fit * 100).toFixed(2));
  console.log(`世代 ${g}: 最良 ${(pop[0].fit * 100).toFixed(2)}%  ${JSON.stringify(toWeights(pop[0].ch))}`);
  if (g === GENS) break;
  const elite = pop.slice(0, 5);
  const others = pop.slice(5);
  const next = elite.slice();
  for (let i = 0; i < 3; i++) next.push(evalCh(randomChrom()));
  while (next.length < POP) {
    const a = elite[Math.floor(rng() * elite.length)].ch;
    const b = others[Math.floor(rng() * others.length)].ch;
    next.push(evalCh(a.map((v, i) => (rng() < 0.7 ? v : b[i]))));
  }
  pop = next;
}

const best = toWeights(pop[0].ch);
const testLearned = run(TEST, { policy: 'learned', weights: best });
const testManual = run(TEST, { policy: 'learned', weights: manual });
const testDblf = run(TEST, { policy: 'dblf' });
const info = {
  generations: GENS,
  population: POP,
  trainFill: +(pop[0].fit * 100).toFixed(1),
  history,
  test: {
    learned: { fill: +(testLearned.fill * 100).toFixed(1), count: +testLearned.count.toFixed(1) },
    manual: { fill: +(testManual.fill * 100).toFixed(1), count: +testManual.count.toFixed(1) },
    dblf: { fill: +(testDblf.fill * 100).toFixed(1), count: +testDblf.count.toFixed(1) },
  },
  seconds: Math.round((Date.now() - t0) / 1000),
};
console.log('検証用の流れでの平均容積率', info.test);
writeFileSync(
  join(here, '../src/online-weights.js'),
  `// オンライン積付けの評価の重み（test/train-online.mjs で遺伝的アルゴリズムにより学習した結果）
export const LEARNED_WEIGHTS = ${JSON.stringify(best, null, 2)};

// 学習の記録（history は世代ごとの最良の平均容積率 %、test は学習に使っていない流れでの成績）
export const TRAINING_INFO = ${JSON.stringify(info, null, 2)};
`,
);
