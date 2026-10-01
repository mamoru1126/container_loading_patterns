// リアルタイム（オンライン）積付け
//
// 家電が1台ずつ流れてきて、先の品目はわからない。届いた1台について、
// 今のコンテナの中で置ける場所の候補を列挙し、評価の点数がいちばんよい場所に即座に置く。
// どこにも置けなければ、そのコンテナを締めて次の空コンテナに切り替える。
//
// 置き場所の候補: 端点法（extreme points）。置いた品目の「右隣」「扉側の隣」「真上」の角と、
//   その床への投影、さらに品目の真上に中心をそろえて載せる位置。
// 制約: 静的デモと同じ（正立、積み重ね可否、耐荷重、支持面積、同じ品目の段数、天井、最大積載重量、列のすき間）。
// 評価: 特徴量の重み付き和。重みは遺伝的アルゴリズムで事前に学習した値（online-weights.js）。

import { CATS } from './catalog.js';
import { LEARNED_WEIGHTS } from './online-weights.js';

export const POLICIES = {
  learned: {
    id: 'learned',
    name: '学習済みの判断（GA）',
    desc: '置き場所の評価の重みを、遺伝的アルゴリズムで事前に学習した判断',
  },
  dblf: {
    id: 'dblf',
    name: '単純な奥詰め',
    desc: '奥 → 下 → 左の順に、最初に置ける場所へ置く従来の方法（比較用）',
  },
};

// 特徴量（小さいほどよい向きにそろえてある）
export const FEATURES = [
  ['back', '扉側への出っ張り（奥から詰める）'],
  ['height', '置く高さ（低い所から）'],
  ['side', '左右の位置（左から）'],
  ['contact', '壁や隣の品目と接していない面の割合'],
  ['floor', '床に直接置く（積み重ねずに床面を使う）'],
  ['headroom', '上に残るすき間が中途半端な量（使えない空間）'],
  ['mix', '下や隣が別の品目（同じ品目でまとめる）'],
  ['flat', '隣の品目と上面の高さがそろっていない（後で載せやすい平らな面を作る）'],
  ['dead', '上面に後から何も載せられない（載せられる品目がない、または天井まで余裕がない）'],
];

const EPS = 0.5;

// 家電リサイクル法の4品目。仕分けするときは品目ごとに別のコンテナへ積む
export const GROUPS = [
  { id: 'fridge', name: '冷蔵庫・冷凍庫', cats: ['fridge', 'freezer'] },
  { id: 'washer', name: '洗濯機・衣類乾燥機', cats: ['washer', 'drum', 'dryer'] },
  { id: 'tv', name: 'テレビ', cats: ['lcd', 'crt'] },
  { id: 'ac', name: 'エアコン', cats: ['acin', 'acout'] },
];
export const MIXED = { id: 'mixed', name: '混載', cats: null };

export function groupOf(cat) {
  return GROUPS.find((g) => g.cats.includes(cat));
}

// index: 品目（レーン）ごとの通し番号、no: 全体の通し番号
export function makeBin(container, index, lane = MIXED, no = index) {
  return { index, no, lane, container, placed: [], kg: 0, vol: 0, closed: false };
}

function overlap1(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

export class OnlinePacker {
  constructor(container, options = {}) {
    this.ct = container;
    this.gap = options.gap ?? 20;
    this.topClear = options.topClear ?? 50;
    this.minSupport = options.minSupport ?? 0.8;
    this.policy = options.policy ?? 'learned';
    this.weights = options.weights ?? LEARNED_WEIGHTS;
    this.maxH = container.H - this.topClear;
  }

  candidates(bin, item) {
    const g = this.gap;
    const pts = [[0, 0, 0]];
    const out = [];
    for (const p of bin.placed) {
      pts.push([p.x + p.ex + g, p.y, p.z], [p.x, p.y + p.ey + g, p.z], [p.x + p.ex + g, p.y, 0], [p.x, p.y + p.ey + g, 0], [p.x + p.ex + g, 0, 0], [p.x, p.y, p.z + p.h]);
    }
    const seen = new Set();
    for (const rot of [0, 1]) {
      const ex = rot ? item.d : item.w;
      const ey = rot ? item.w : item.d;
      const push = (x, y, z) => {
        const k = `${rot}|${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ x, y, z, rot, ex, ey });
      };
      for (const [x, y, z] of pts) {
        push(x, y, z);
        // 右側の壁に寄せた位置も試す
        if (z === 0) push(x, this.ct.W - ey, 0);
      }
      // 品目の真上に中心をそろえて載せる
      for (const p of bin.placed) {
        push(p.x + (p.ex - ex) / 2, p.y + (p.ey - ey) / 2, p.z + p.h);
      }
    }
    return out;
  }

  // 候補が置けるかを調べ、置けるなら支持関係などを返す
  feasible(bin, item, c) {
    const { L, W } = this.ct;
    const g = this.gap;
    if (c.x < -EPS || c.y < -EPS || c.x + c.ex > L + EPS || c.y + c.ey > W + EPS) return null;
    if (c.z + item.h > this.maxH + EPS) return null;
    if (bin.kg + item.kg > this.ct.payloadKg) return null;
    for (const p of bin.placed) {
      // 既に置いた品目のはみ出した部分の下に潜り込ませない（支え方が後から変わるため）
      if (Math.abs(p.z - (c.z + item.h)) <= EPS && overlap1(c.x, c.x + c.ex, p.x, p.x + p.ex) > 0 && overlap1(c.y, c.y + c.ey, p.y, p.y + p.ey) > 0) return null;
      const oz = overlap1(c.z, c.z + item.h, p.z, p.z + p.h);
      if (oz <= EPS) continue;
      const ox = overlap1(c.x, c.x + c.ex, p.x, p.x + p.ex);
      const oy = overlap1(c.y, c.y + c.ey, p.y, p.y + p.ey);
      // 横方向は列のすき間ぶん離す
      if (ox > -g + EPS && oy > -g + EPS) return null;
    }
    if (c.z <= EPS) return { supports: [], sameDepth: 1 };
    const cat = CATS[item.cat];
    const supports = [];
    let area = 0;
    let sameDepth = 1;
    for (const p of bin.placed) {
      if (Math.abs(p.z + p.h - c.z) > EPS) continue;
      const ox = overlap1(c.x, c.x + c.ex, p.x, p.x + p.ex);
      const oy = overlap1(c.y, c.y + c.ey, p.y, p.y + p.ey);
      if (ox <= 0 || oy <= 0) continue;
      const pc = CATS[p.item.cat];
      if (!pc.carries.includes(item.cat)) return null;
      if (item.cat !== 'acin' && item.kg > p.item.kg * 1.15) return null;
      if (item.cat === 'crt' && p.item.cat === 'crt' && item.w > p.item.w + 10) return null;
      if (p.item.cat === item.cat) sameDepth = Math.max(sameDepth, p.sameDepth + 1);
      supports.push({ p, a: ox * oy });
      area += ox * oy;
    }
    if (area < this.minSupport * c.ex * c.ey) return null;
    if (sameDepth > cat.maxSame) return null;
    // 耐荷重: 接触面積に応じて重さを配分し、下へ伝える
    const add = new Map();
    const spread = (list, kg) => {
      const tot = list.reduce((s, x) => s + x.a, 0);
      for (const { p, a } of list) {
        const share = (kg * a) / tot;
        add.set(p, (add.get(p) || 0) + share);
        if (p.supports.length) spread(p.supports, share);
      }
    };
    spread(supports, item.kg);
    for (const [p, inc] of add) {
      if (p.load + inc > CATS[p.item.cat].topLoadKg + 1e-6) return null;
    }
    return { supports, sameDepth, add };
  }

  features(bin, item, c, f) {
    const { L, W } = this.ct;
    const H = this.maxH;
    const g = this.gap + 5;
    // 4つの側面のうち、壁か隣の品目に接している面
    let touch = 0;
    const faces = [
      [c.x <= g, 'x0'], [c.x + c.ex >= L - g, 'x1'], [c.y <= g, 'y0'], [c.y + c.ey >= W - g, 'y1'],
    ];
    const hit = { x0: faces[0][0], x1: faces[1][0], y0: faces[2][0], y1: faces[3][0] };
    let mix = 0;
    let mixN = 0;
    for (const p of bin.placed) {
      const oz = overlap1(c.z, c.z + item.h, p.z, p.z + p.h);
      if (oz <= 0) continue;
      const ox = overlap1(c.x, c.x + c.ex, p.x, p.x + p.ex);
      const oy = overlap1(c.y, c.y + c.ey, p.y, p.y + p.ey);
      if (oy > 0 && Math.abs(p.x + p.ex - c.x) <= g) hit.x0 = true;
      if (oy > 0 && Math.abs(c.x + c.ex - p.x) <= g) hit.x1 = true;
      if (ox > 0 && Math.abs(p.y + p.ey - c.y) <= g) hit.y0 = true;
      if (ox > 0 && Math.abs(c.y + c.ey - p.y) <= g) hit.y1 = true;
      if ((oy > 0 && (Math.abs(p.x + p.ex - c.x) <= g || Math.abs(c.x + c.ex - p.x) <= g)) || (ox > 0 && (Math.abs(p.y + p.ey - c.y) <= g || Math.abs(c.y + c.ey - p.y) <= g))) {
        mixN += 1;
        if (p.item.cat !== item.cat) mix += 1;
      }
    }
    // 隣接する品目との上面の高さの差（最も近いもの）
    const top = c.z + item.h;
    let flat = 1;
    for (const p of bin.placed) {
      const near = overlap1(c.x - g, c.x + c.ex + g, p.x, p.x + p.ex) > 0 && overlap1(c.y - g, c.y + c.ey + g, p.y, p.y + p.ey) > 0;
      if (!near || p.z + p.h <= c.z) continue;
      flat = Math.min(flat, Math.abs(p.z + p.h - top) / 500);
    }
    const carries = CATS[item.cat].carries.length > 0;
    const dead = !carries || H - top < 239 ? 1 : 0;
    for (const s of f.supports) {
      mixN += 1;
      if (s.p.item.cat !== item.cat) mix += 1;
    }
    touch = ['x0', 'x1', 'y0', 'y1'].filter((k) => hit[k]).length;
    const left = H - (c.z + item.h);
    // 残り高さが「何も載らない半端な量」なら大きい（239mm = 最小の品目の高さ）
    const headroom = left < 239 ? left / 239 : 0;
    return {
      back: (c.x + c.ex) / L,
      height: c.z / H,
      side: c.y / W,
      contact: 1 - touch / 4,
      floor: c.z <= EPS ? 1 : 0,
      headroom,
      mix: mixN ? mix / mixN : 0,
      flat: Math.min(1, flat),
      dead,
    };
  }

  score(bin, item, c, f) {
    if (this.policy === 'dblf') return c.x * 1e6 + c.z * 1e3 + c.y;
    const ft = this.features(bin, item, c, f);
    let s = 0;
    for (const [k] of FEATURES) s += this.weights[k] * ft[k];
    return s;
  }

  // 置き場所を決める（置けなければ null）
  decide(bin, item) {
    let best = null;
    for (const c of this.candidates(bin, item)) {
      const f = this.feasible(bin, item, c);
      if (!f) continue;
      const s = this.score(bin, item, c, f);
      if (!best || s < best.s) best = { c, f, s };
    }
    return best;
  }

  place(bin, item, best) {
    const { c, f } = best;
    if (f.add) for (const [p, inc] of f.add) p.load += inc;
    const pl = {
      item,
      x: c.x, y: c.y, z: c.z,
      ex: c.ex, ey: c.ey, h: item.h,
      rot: c.rot,
      supports: f.supports,
      sameDepth: f.sameDepth,
      load: 0,
      order: bin.placed.length + 1,
      tier: f.supports.length ? Math.max(...f.supports.map((s) => s.p.tier)) + 1 : 0,
    };
    bin.placed.push(pl);
    bin.kg += item.kg;
    bin.vol += item.w * item.d * item.h;
    return pl;
  }
}

// 流れてくる家電を順に積む。buffer > 0 なら、待機場所に置いた中から置きやすい1台を選べる
// sort が true なら、家電4品目ごとに別のコンテナ（レーン）を同時に開いて仕分けて積む
export class Simulation {
  constructor(container, nextItem, options = {}) {
    this.ct = container;
    this.next = nextItem;
    this.packer = new OnlinePacker(container, options);
    this.bufferSize = options.buffer ?? 0;
    this.sort = !!options.sort;
    const groups = this.sort ? GROUPS : [MIXED];
    this.bins = [];
    this.lanes = groups.map((g, k) => {
      const bin = makeBin(container, 1, g, k + 1);
      this.bins.push(bin);
      return { group: g, k, bin };
    });
    this.queue = [];
    this.lookahead = options.lookahead ?? 6;
    this.processed = 0;
    this.decideMs = 0;
    this.log = [];
    this.fill();
  }

  // 混載のときの積込中のコンテナ
  get bin() {
    return this.lanes[0].bin;
  }

  laneOf(item) {
    if (!this.sort) return this.lanes[0];
    return this.lanes.find((l) => l.group.cats.includes(item.cat));
  }

  fill() {
    while (this.queue.length < this.lookahead + this.bufferSize + 1) this.queue.push(this.next());
  }

  // 1台積む。戻り値: { item, placement, bin, lane, closed: 締めたコンテナ or null }
  step() {
    this.fill();
    const t0 = performance.now();
    const pool = this.queue.slice(0, this.bufferSize + 1);
    let pick = null;
    for (let i = 0; i < pool.length; i++) {
      const lane = this.laneOf(pool[i]);
      const d = this.packer.decide(lane.bin, pool[i]);
      if (d && (!pick || d.s < pick.d.s)) pick = { i, d, lane };
      if (this.packer.policy === 'dblf' && pick) break;
    }
    let closed = null;
    if (!pick) {
      // どれも入らない: 先頭の家電の行き先のコンテナを締めて、同じ品目の次のコンテナへ
      const lane = this.laneOf(pool[0]);
      closed = lane.bin;
      closed.closed = true;
      lane.bin = makeBin(this.ct, closed.index + 1, lane.group, this.bins.length + 1);
      this.bins.push(lane.bin);
      const d = this.packer.decide(lane.bin, pool[0]);
      if (!d) throw new Error(`${pool[0].label} が空のコンテナにも入りません`);
      pick = { i: 0, d, lane };
    }
    const item = this.queue.splice(pick.i, 1)[0];
    const placement = this.packer.place(pick.lane.bin, item, pick.d);
    const ms = performance.now() - t0;
    this.decideMs += ms;
    this.processed += 1;
    this.fill();
    const ev = { item, placement, bin: pick.lane.bin, lane: pick.lane, closed, ms, fromBuffer: pick.i > 0 };
    this.log.push(ev);
    return ev;
  }

  stats() {
    const { L, W, H } = this.ct;
    const vol = L * W * H;
    const closed = this.bins.filter((b) => b.closed);
    const fills = closed.map((b) => b.vol / vol);
    return {
      processed: this.processed,
      containers: this.bins.length,
      closed: closed.length,
      avgFill: fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : null,
      avgCount: closed.length ? closed.reduce((s, b) => s + b.placed.length, 0) / closed.length : null,
      avgMs: this.processed ? this.decideMs / this.processed : 0,
      current: this.bin,
    };
  }
}

export function binMetrics(bin) {
  const { L, W, H } = bin.container;
  const P = bin.placed;
  const kg = bin.kg;
  const cogX = kg ? P.reduce((s, p) => s + p.item.kg * (p.x + p.ex / 2), 0) / kg : L / 2;
  const usedLen = P.length ? Math.max(...P.map((p) => p.x + p.ex)) : 0;
  return {
    count: P.length,
    kg,
    volUtil: bin.vol / (L * W * H),
    usedLen,
    cogOffPct: ((cogX - L / 2) / L) * 100,
    maxTier: P.length ? Math.max(...P.map((p) => p.tier + 1)) : 0,
  };
}
