// 遺伝的アルゴリズム（BRKGA: biased random-key genetic algorithm）による積付けの改善
//
// 染色体 = 実数 0〜1 の並び（ランダムキー）
//   [0 .. n-1]  品目ごとの優先度。大きいほど先に土台になり、先に壁へ置かれる
//   [n .. n+3]  壁に列を詰めるときの評価の重み（奥行・高さ・幅・台数）
//   [n+4]       方針（品目ごとに整列 / 段積み優先 / 重量バランス）
// 染色体を積付けエンジン（solveOnce）に通して配置に「復号」し、評価の点数を適応度とする。
// 世代ごとに、上位（エリート）はそのまま残し、エリートと非エリートを片寄った一様交叉で掛け合わせ、
// 一部は完全にランダムな個体（突然変異体）に入れ替える。
// コンテナ積付けへの BRKGA の適用は Gonçalves & Resende (2012) などで高い成績が報告されている。

import { STRATEGIES, DEFAULT_OPTIONS, solveOnce } from './engine.js';
import { makeRng } from './catalog.js';

export const GA_STRATEGY = {
  id: 'ga',
  name: '遺伝的アルゴリズム',
  desc: '積む順番・詰め方の重み・方針を遺伝子にして、世代を重ねてよりよい積み方を探す。',
};

const W_RANGE = {
  depth: [0.3, 0.6],
  height: [0.1, 0.7],
  width: [0.05, 0.35],
  count: [0.0, 0.3],
};

export class GeneticPlanner {
  constructor(items, container, options = {}, ga = {}) {
    this.items = items;
    this.container = container;
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.n = items.length;
    this.len = this.n + 5;
    this.P = ga.population ?? 40;
    this.generations = ga.generations ?? 40;
    this.eliteN = Math.max(2, Math.round(this.P * 0.2));
    this.mutantN = Math.max(1, Math.round(this.P * 0.15));
    this.rho = ga.rho ?? 0.7;
    this.rng = makeRng((this.opts.seed || 1) * 7919 + 17);
    this.gen = 0;
    this.evals = 0;
    this.best = null;
    this.history = [];
    this.pop = this.seedPopulation().map((ch) => this.evaluate(ch));
    this.record();
  }

  // 代表的な並べ方（重い順・大きい順・高い順など）を初期個体に入れ、残りはランダム
  seedPopulation() {
    const n = this.n;
    const byRank = (score) => {
      const idx = [...Array(n).keys()].sort((a, b) => score(this.items[b]) - score(this.items[a]));
      const ch = new Float64Array(this.len);
      idx.forEach((i, r) => {
        ch[i] = 1 - r / Math.max(1, n);
      });
      return ch;
    };
    const setTail = (ch, strat) => {
      ch[n] = (0.6 - W_RANGE.depth[0]) / W_RANGE.depth[1];
      ch[n + 1] = (0.5 - W_RANGE.height[0]) / W_RANGE.height[1];
      ch[n + 2] = (0.2 - W_RANGE.width[0]) / W_RANGE.width[1];
      ch[n + 3] = 0.04 / W_RANGE.count[1];
      ch[n + 4] = (strat + 0.5) / 3;
      return ch;
    };
    const seeds = [];
    const rules = [
      (it) => it.kg,
      (it) => it.w * it.d * it.h,
      (it) => it.h,
      (it) => it.w * it.d,
    ];
    for (const rule of rules) {
      for (const strat of [1, 2]) seeds.push(setTail(byRank(rule), strat));
    }
    while (seeds.length < this.P) seeds.push(this.randomChrom());
    return seeds.slice(0, this.P);
  }

  randomChrom() {
    const ch = new Float64Array(this.len);
    for (let i = 0; i < this.len; i++) ch[i] = this.rng();
    return ch;
  }

  decode(ch) {
    const n = this.n;
    const keys = new Map();
    this.items.forEach((it, i) => keys.set(it.id, ch[i]));
    const w = (k, g) => W_RANGE[k][0] + g * W_RANGE[k][1];
    const opts = {
      ...this.opts,
      keys,
      weights: {
        depth: w('depth', ch[n]),
        height: w('height', ch[n + 1]),
        width: w('width', ch[n + 2]),
        count: w('count', ch[n + 3]),
      },
    };
    const strat = STRATEGIES[Math.min(2, Math.floor(ch[n + 4] * 3))];
    const plan = solveOnce(this.items, this.container, opts, strat.id, makeRng(1), 0);
    return { ...plan, strategy: GA_STRATEGY, baseStrategy: strat };
  }

  evaluate(ch) {
    const plan = this.decode(ch);
    this.evals += 1;
    if (!this.best || plan.score > this.best.score) this.best = plan;
    return { ch, fit: plan.score };
  }

  record() {
    this.pop.sort((a, b) => b.fit - a.fit);
    const m = this.best.metrics;
    this.history.push({
      gen: this.gen,
      best: this.best.score,
      mean: this.pop.reduce((s, x) => s + x.fit, 0) / this.pop.length,
      loaded: m.loaded,
      volUtil: m.volUtil,
      usedLen: m.usedLen,
      cogOffPct: m.cogOffPct,
    });
  }

  // 1世代進める。終わったら true
  step() {
    if (this.done) return true;
    const P = this.P;
    const elites = this.pop.slice(0, this.eliteN);
    const others = this.pop.slice(this.eliteN);
    const next = elites.slice();
    for (let i = 0; i < this.mutantN; i++) next.push(this.evaluate(this.randomChrom()));
    while (next.length < P) {
      const a = elites[Math.floor(this.rng() * elites.length)].ch;
      const b = others[Math.floor(this.rng() * others.length)].ch;
      const child = new Float64Array(this.len);
      for (let g = 0; g < this.len; g++) child[g] = this.rng() < this.rho ? a[g] : b[g];
      next.push(this.evaluate(child));
    }
    this.pop = next;
    this.gen += 1;
    this.record();
    return this.done;
  }

  get done() {
    return this.gen >= this.generations;
  }

  run() {
    while (!this.step());
    return this.best;
  }
}
