// 積付けパターン生成エンジン
//
// 手順
//   1. 段組み: 積み重ねルールを守りながら、品目を「列（スタック）」にまとめる
//      液晶テレビはスタンド付きのまま立てて前後に並べた「束」にする
//   2. 壁積み: コンテナの奥から扉に向かって、幅方向いっぱいの「壁（ストリップ）」を順に作る
//   3. 重心調整: 壁の並び順と左右の寄せ方を入れ替え、重心をコンテナ中央に近づける
//   4. 多始点探索: 方針ごとに乱数を変えて繰り返し、評価値の最もよい案を残す
//
// 座標系（mm）: x = 長さ方向（0 = 奥の壁, L = 扉側）, y = 幅方向（0 = 扉から見て左）, z = 高さ

import { CATS, makeRng } from './catalog.js';

export const STRATEGIES = [
  {
    id: 'tidy',
    name: '品目ごとに整列',
    desc: '同じ品目どうしだけを積み重ね、品目ごとに壁をそろえる。現場で指示しやすい。',
  },
  {
    id: 'dense',
    name: '段積み優先',
    desc: 'ルールの範囲で異なる品目も積み重ね、床面を節約して台数を増やす。',
  },
  {
    id: 'balance',
    name: '重量バランス',
    desc: '重い壁を中央に寄せ、前後・左右の重心のずれを最小にする。',
  },
];

export const DEFAULT_OPTIONS = {
  gap: 20, // 列と列のすき間
  topClear: 50, // 天井とのすき間
  groupGap: 10, // 2台並べるときのすき間
  packGap: 15, // テレビを並べるときのすき間（緩衝材）
  packDepth: 700, // テレビの束の最大奥行（壁1枚の奥行に収まる程度）
  minSupport: 0.8, // 上に載せる品目の支持面積率
  maxOverhang: 60, // 片側のはみ出し許容
  maxTiers: 4,
  iterations: 36,
  seed: 1,
};

const CAT_ORDER = ['fridge', 'drum', 'washer', 'freezer', 'dryer', 'crt', 'acout', 'acin', 'lcd'];

// ---------- 1. 段組み ----------

function makeUnit(items, gap) {
  const w = Math.max(...items.map((i) => i.w));
  const d = items.reduce((s, i) => s + i.d, 0) + gap * (items.length - 1);
  const h = Math.max(...items.map((i) => i.h));
  const kg = items.reduce((s, i) => s + i.kg, 0);
  const cat = items[0].cat;
  return {
    items,
    cat,
    type: items[0].type,
    w, d, h, kg,
    gap,
    topLoad: CATS[cat].topLoadKg * items.length,
  };
}

function tierDims(unit, r) {
  return r ? [unit.d, unit.w] : [unit.w, unit.d];
}

function canStack(col, unit, maxH, opts, strat) {
  const topTier = col.tiers[col.tiers.length - 1];
  const top = topTier.unit;
  const catRule = CATS[top.cat];
  if (!catRule.carries.includes(unit.cat)) return null;
  if (col.tiers.length >= opts.maxTiers) return null;
  // 同じ区分を積み重ねる段数の上限
  const sameCount = col.tiers.filter((t) => t.unit.cat === unit.cat).length;
  if (sameCount >= CATS[unit.cat].maxSame) return null;
  if (strat === 'tidy' && unit.cat !== top.cat && unit.cat !== 'acin') return null;
  if (col.H + unit.h > maxH) return null;
  // 重いものを軽いものの上に載せない
  if (unit.cat !== 'acin' && unit.kg > top.kg * 1.15) return null;
  // ブラウン管は同じか小さいものだけ
  if (unit.cat === 'crt' && top.cat === 'crt' && unit.items[0].w > top.items[0].w + 10) return null;
  // 下にある全ての段の耐荷重
  let above = unit.kg;
  for (let t = col.tiers.length - 1; t >= 0; t--) {
    if (above > col.tiers[t].unit.topLoad + 1e-6) return null;
    above += col.tiers[t].unit.kg;
  }
  // 支持面積とはみ出し
  let best = null;
  for (const r of [0, 1]) {
    const [ua, ub] = tierDims(unit, r);
    const ta = topTier.a;
    const tb = topTier.b;
    if (ua > ta + 2 * opts.maxOverhang || ub > tb + 2 * opts.maxOverhang) continue;
    const support = (Math.min(ua, ta) * Math.min(ub, tb)) / (ua * ub);
    if (support < opts.minSupport) continue;
    const grow = Math.max(col.A, ua) * Math.max(col.B, ub) - col.A * col.B;
    const s = support - grow / 1e6;
    if (!best || s > best.s) best = { r, s, support };
  }
  return best;
}

function newColumn(unit, r = 0) {
  const [a, b] = tierDims(unit, r);
  return { tiers: [{ unit, r, a, b, z: 0 }], A: a, B: b, H: unit.h, kg: unit.kg };
}

function pushTier(col, unit, r) {
  const [a, b] = tierDims(unit, r);
  col.tiers.push({ unit, r, a, b, z: col.H });
  col.A = Math.max(col.A, a);
  col.B = Math.max(col.B, b);
  col.H += unit.h;
  col.kg += unit.kg;
}

function buildLcdPacks(lcds, opts) {
  const sorted = [...lcds].sort((p, q) => q.w - p.w || q.h - p.h);
  const packs = [];
  for (const tv of sorted) {
    let target = null;
    for (const p of packs) {
      const pw = p[0].w;
      const depth = p.reduce((s, i) => s + i.d, 0) + opts.packGap * p.length + tv.d;
      if (Math.abs(pw - tv.w) <= pw * 0.12 && depth <= opts.packDepth) {
        target = p;
        break;
      }
    }
    if (target) target.push(tv);
    else packs.push([tv]);
  }
  return packs.map((p) => newColumn(makeUnit(p, opts.packGap)));
}

function buildColumns(items, maxH, opts, strat, rng, noise) {
  const lcds = items.filter((i) => CATS[i.cat].pack);
  const others = items.filter((i) => !CATS[i.cat].pack);
  const avail = new Set(others);
  const jitter = () => 1 + (rng() - 0.5) * noise;
  const keys = opts.keys;
  // 遺伝的アルゴリズムから優先度（キー）が渡されたら、その順に土台を選ぶ
  const bases = keys
    ? [...others].sort((p, q) => keys.get(q.id) - keys.get(p.id))
    : [...others].sort((p, q) => q.kg * jitter() - p.kg * jitter());
  const columns = [];

  for (const base of bases) {
    if (!avail.has(base)) continue;
    avail.delete(base);
    const col = newColumn(makeUnit([base], 0));
    for (;;) {
      // 品目タイプごとに候補を作る（1台、または同じタイプ2台を並べたもの）
      const byType = new Map();
      const pool = keys ? [...avail].sort((p, q) => keys.get(q.id) - keys.get(p.id)) : avail;
      for (const it of pool) {
        if (!byType.has(it.type)) byType.set(it.type, []);
        byType.get(it.type).push(it);
      }
      const cands = [];
      for (const [, list] of byType) {
        const single = makeUnit([list[0]], 0);
        const fit1 = canStack(col, single, maxH, opts, strat);
        if (fit1) cands.push({ unit: single, fit: fit1 });
        // 2台並べるのは高さがそろう個体どうしだけ（段の上面を平らにするため）
        const mate = list.find((m) => m !== list[0] && m.h === list[0].h);
        if (CATS[list[0].cat].group && mate) {
          const pair = makeUnit([list[0], mate], opts.groupGap);
          const fit2 = canStack(col, pair, maxH, opts, strat);
          if (fit2) cands.push({ unit: pair, fit: fit2 });
        }
      }
      if (!cands.length) break;
      const top = col.tiers[col.tiers.length - 1].unit;
      for (const c of cands) {
        const fill = (col.H + c.unit.h) / maxH;
        const same = c.unit.type === top.type ? 0.18 : c.unit.cat === top.cat ? 0.1 : 0;
        const many = 0.04 * (c.unit.items.length - 1);
        c.score = fill + same + many + c.fit.support * 0.1 + (rng() - 0.5) * noise * 0.3;
      }
      cands.sort((p, q) => q.score - p.score);
      const pick = cands[0];
      pushTier(col, pick.unit, pick.fit.r);
      for (const it of pick.unit.items) avail.delete(it);
    }
    columns.push(col);
  }
  return columns.concat(buildLcdPacks(lcds, opts));
}

// ---------- 2. 壁積み ----------

function colDims(col, o) {
  return o ? [col.B, col.A] : [col.A, col.B];
}

function orderColumns(cols, strat, rng, noise, keys) {
  const j = () => 1 + (rng() - 0.5) * noise;
  if (keys) {
    const k = (c) => keys.get(c.tiers[0].unit.items[0].id);
    return [...cols].sort((p, q) => k(q) - k(p));
  }
  if (strat === 'tidy') {
    const rank = (c) => CAT_ORDER.indexOf(c.tiers[0].unit.cat);
    return [...cols].sort((p, q) => rank(p) - rank(q) || q.H * j() - p.H * j());
  }
  if (strat === 'dense') {
    return [...cols].sort((p, q) => q.A * q.B * q.H * j() - p.A * p.B * p.H * j());
  }
  return [...cols].sort((p, q) => q.kg * j() - p.kg * j());
}

function fillStrip(rem, leaderIdx, o, Lleft, W, maxH, opts, strat, rng, noise) {
  const leader = rem[leaderIdx];
  const [D, ey0] = colDims(leader, o);
  if (D > Lleft || ey0 > W) return null;
  const gap = opts.gap;
  const used = new Set([leaderIdx]);
  const pl = [{ idx: leaderIdx, o, dx: 0, y: 0, ex: D, ey: ey0 }];
  const leadCat = leader.tiers[0].unit.cat;
  let y = ey0 + gap;
  let vol = leader.A * leader.B * leader.H;

  const wt = opts.weights || { depth: 0.6, height: 0.5, width: 0.2, count: 0.04 };
  const scoreOf = (c, ex, ey, i) => {
    const n = c.tiers.reduce((k, t) => k + t.unit.items.length, 0);
    let s = (ex / D) * wt.depth + (c.H / maxH) * wt.height + (ey / W) * wt.width + Math.min(n, 4) * wt.count;
    if (strat === 'tidy' && c.tiers[0].unit.cat === leadCat) s += 0.6;
    s -= (i / rem.length) * 0.25;
    return s + (rng() - 0.5) * noise * 0.3;
  };

  for (;;) {
    let best = null;
    for (let i = 0; i < rem.length; i++) {
      if (used.has(i)) continue;
      for (const o2 of [0, 1]) {
        const [ex, ey] = colDims(rem[i], o2);
        if (ex > D || y + ey > W) continue;
        const s = scoreOf(rem[i], ex, ey, i);
        if (!best || s > best.s) best = { i, o2, ex, ey, s };
      }
    }
    if (!best) break;
    used.add(best.i);
    pl.push({ idx: best.i, o: best.o2, dx: 0, y, ex: best.ex, ey: best.ey });
    vol += rem[best.i].A * rem[best.i].B * rem[best.i].H;
    // 同じ幅の中で、奥行に余りがあれば後ろにも詰める
    let dx = best.ex + gap;
    for (;;) {
      let back = null;
      for (let i = 0; i < rem.length; i++) {
        if (used.has(i)) continue;
        for (const o3 of [0, 1]) {
          const [ex, ey] = colDims(rem[i], o3);
          if (ey > best.ey || dx + ex > D) continue;
          const s = ex * ey * rem[i].H;
          if (!back || s > back.s) back = { i, o3, ex, ey, s };
        }
      }
      if (!back) break;
      used.add(back.i);
      pl.push({ idx: back.i, o: back.o3, dx, y, ex: back.ex, ey: back.ey });
      vol += rem[back.i].A * rem[back.i].B * rem[back.i].H;
      dx += back.ex + gap;
    }
    y += best.ey + gap;
  }
  const density = vol / (D * W * maxH);
  let tidyBonus = 0;
  if (strat === 'tidy') {
    const same = pl.filter((p) => rem[p.idx].tiers[0].unit.cat === leadCat).length;
    tidyBonus = (same / pl.length) * 0.15;
  }
  return { D, pl, used, score: density + tidyBonus, widthUsed: y - gap };
}

function wallBuild(cols, L, W, maxH, opts, strat, rng, noise) {
  let rem = orderColumns(cols, strat, rng, noise, opts.keys);
  const strips = [];
  let x = 0;
  while (rem.length) {
    const Lleft = L - x;
    let best = null;
    const tries = Math.min(rem.length, 5);
    for (let li = 0; li < tries; li++) {
      for (const o of [0, 1]) {
        const sim = fillStrip(rem, li, o, Lleft, W, maxH, opts, strat, rng, noise);
        if (!sim) continue;
        const s = sim.score - li * 0.02;
        if (!best || s > best.s) best = { ...sim, s };
      }
    }
    if (!best) {
      // 先頭が入らなければ、入る列を探す
      for (let li = tries; li < rem.length && !best; li++) {
        for (const o of [0, 1]) {
          const sim = fillStrip(rem, li, o, Lleft, W, maxH, opts, strat, rng, noise);
          if (sim && (!best || sim.score > best.s)) best = { ...sim, s: sim.score };
        }
      }
    }
    if (!best) break;
    strips.push({
      D: best.D,
      widthUsed: best.widthUsed,
      cols: best.pl.map((p) => ({ col: rem[p.idx], o: p.o, dx: p.dx, y: p.y, ex: p.ex, ey: p.ey })),
    });
    rem = rem.filter((_, i) => !best.used.has(i));
    x += best.D + opts.gap;
  }
  return { strips, leftovers: rem };
}

// ---------- 3. 重心調整 ----------

function stripMass(strip) {
  let m = 0;
  let mx = 0;
  let my = 0;
  for (const c of strip.cols) {
    m += c.col.kg;
    mx += c.col.kg * (c.dx + c.ex / 2);
    my += c.col.kg * (c.y + c.ey / 2);
  }
  return { m, mx, my };
}

function layoutCost(order, strips, L, gap) {
  let x = 0;
  let M = 0;
  let MX = 0;
  for (const si of order) {
    const s = strips[si];
    const { m, mx } = stripMass(s);
    M += m;
    MX += mx + m * x;
    x += s.D + gap;
  }
  const used = x - gap;
  const cog = M ? MX / M : L / 2;
  // 空きがあれば全体を扉側へずらして中央に寄せられる
  const shift = Math.max(0, Math.min(L - used, L / 2 - cog));
  return { off: Math.abs(cog + shift - L / 2), shift, used };
}

function optimizeOrder(strips, L, gap, always) {
  const n = strips.length;
  let order = [...Array(n).keys()];
  let cur = layoutCost(order, strips, L, gap);
  if (!always && cur.off <= L * 0.05) return { order, ...cur };
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const next = [...order];
        [next[i], next[j]] = [next[j], next[i]];
        const c = layoutCost(next, strips, L, gap);
        if (c.off + 1 < cur.off) {
          order = next;
          cur = c;
          improved = true;
        }
      }
    }
  }
  return { order, ...cur };
}

// ---------- 配置の展開 ----------

function expandColumn(col, colX, colY, o, out, meta) {
  for (let t = 0; t < col.tiers.length; t++) {
    const tier = col.tiers[t];
    const u = tier.unit;
    const ta0 = (col.A - tier.a) / 2;
    const tb0 = (col.B - tier.b) / 2;
    let off = 0;
    for (const it of u.items) {
      const offW = (u.w - it.w) / 2;
      let a;
      let b;
      let ea;
      let eb;
      if (tier.r === 0) {
        a = ta0 + offW;
        b = tb0 + off;
        ea = it.w;
        eb = it.d;
      } else {
        a = ta0 + off;
        b = tb0 + offW;
        ea = it.d;
        eb = it.w;
      }
      off += it.d + u.gap;
      const wAlongA = tier.r === 0;
      const wAlongX = o === 0 ? wAlongA : !wAlongA;
      const p = o === 0
        ? { x: colX + a, y: colY + b, ex: ea, ey: eb }
        : { x: colX + b, y: colY + a, ex: eb, ey: ea };
      out.push({
        item: it,
        x: p.x, y: p.y, z: tier.z,
        ex: p.ex, ey: p.ey, h: it.h,
        rot: wAlongX ? 0 : 1,
        tier: t,
        ...meta,
      });
    }
  }
}

function sideName(yc, W) {
  if (yc < W / 3) return '左';
  if (yc > (W * 2) / 3) return '右';
  return '中央';
}

function finalize(strips, leftoverCols, container, opts, strat) {
  const { L, W, H } = container;
  const gap = opts.gap;
  const { order, shift } = optimizeOrder(strips, L, gap, strat === 'balance');
  const ordered = order.map((i) => strips[i]);

  // 左右の重心: 壁ごとに左寄せ・右寄せを選ぶ
  let M = 0;
  let MY = 0;
  const mirrors = [];
  for (const s of ordered) {
    const { m, my } = stripMass(s);
    const free = W - s.widthUsed;
    const myMirror = m * W - my; // 左右反転したときの y モーメント
    const yLeft = M + m ? (MY + my) / (M + m) : W / 2;
    const yRight = M + m ? (MY + (m * W - my)) / (M + m) : W / 2;
    const mirror = free > 5 && Math.abs(yRight - W / 2) < Math.abs(yLeft - W / 2);
    mirrors.push(mirror);
    M += m;
    MY += mirror ? myMirror : my;
  }

  const placements = [];
  let x = shift;
  ordered.forEach((s, si) => {
    const mirror = mirrors[si];
    for (const c of s.cols) {
      const y = mirror ? W - c.y - c.ey : c.y;
      expandColumn(c.col, x + c.dx, y, c.o, placements, { strip: si, colX: x + c.dx, colY: y });
    }
    x += s.D + gap;
  });
  const usedLen = ordered.length ? x - gap - shift : 0;

  // 積込み順: 奥の壁から、壁の中は左の列から、列の中は下から
  placements.sort((p, q) => p.strip - q.strip || p.colY - q.colY || p.colX - q.colX || p.z - q.z || p.y - q.y || p.x - q.x);
  placements.forEach((p, i) => {
    p.order = i + 1;
    p.side = sideName(p.y + p.ey / 2, W);
  });

  const leftovers = [];
  for (const col of leftoverCols) for (const t of col.tiers) leftovers.push(...t.unit.items);

  const dunnage = [];
  if (strips.length) {
    if (shift > 50) dunnage.push({ x0: 0, x1: shift });
    const end = shift + usedLen;
    if (L - end > 50) dunnage.push({ x0: end, x1: L });
  }

  return { placements, leftovers, strips: ordered.length, usedLen, shift, dunnage };
}

// ---------- 評価 ----------

export function computeMetrics(plan, container, totalItems) {
  const { L, W, H, payloadKg } = container;
  const P = plan.placements;
  let kg = 0;
  let vol = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let maxTop = 0;
  let maxTier = 0;
  const footprint = new Map();
  for (const p of P) {
    kg += p.item.kg;
    vol += p.item.w * p.item.d * p.item.h;
    mx += p.item.kg * (p.x + p.ex / 2);
    my += p.item.kg * (p.y + p.ey / 2);
    mz += p.item.kg * (p.z + p.h * 0.45);
    maxTop = Math.max(maxTop, p.z + p.h);
    maxTier = Math.max(maxTier, p.tier + 1);
    if (p.z === 0) footprint.set(p.item.id, p.ex * p.ey);
  }
  const floor = [...footprint.values()].reduce((s, v) => s + v, 0);
  const cogX = kg ? mx / kg : L / 2;
  const cogY = kg ? my / kg : W / 2;
  const front = P.filter((p) => p.x + p.ex / 2 < L / 2).reduce((s, p) => s + p.item.kg, 0);
  return {
    loaded: P.length,
    total: totalItems,
    kg,
    payloadKg,
    volUtil: vol / (L * W * H),
    floorUtil: floor / (L * W),
    usedLen: plan.usedLen,
    cogX,
    cogY,
    cogZ: kg ? mz / kg : 0,
    cogOffPct: ((cogX - L / 2) / L) * 100,
    cogOffMm: cogX - L / 2,
    cogLatMm: cogY - W / 2,
    split: kg ? front / kg : 0.5,
    maxTop,
    maxTier,
    strips: plan.strips,
  };
}

export function scorePlan(m, L) {
  return m.loaded * 1000 + m.volUtil * 100 - Math.abs(m.cogOffPct) * 1.5 - (m.usedLen / L) * 5;
}

// 1回分の積付け（段組み → 壁積み → 重心調整 → 重量チェック）
export function solveOnce(items, container, opts, stratId, rng, noise) {
  const maxH = container.H - opts.topClear;
  const usable = items.filter((i) => i.h <= maxH);
  const cols = buildColumns(usable, maxH, opts, stratId, rng, noise);
  const { strips, leftovers } = wallBuild(cols, container.L, container.W, maxH, opts, stratId, rng, noise);
  const plan = finalize(strips, leftovers, container, opts, stratId);
  // 最大積載重量を超える分は積み残しにする
  let kg = 0;
  const keep = [];
  for (const p of plan.placements) {
    if (kg + p.item.kg <= container.payloadKg) {
      kg += p.item.kg;
      keep.push(p);
    } else plan.leftovers.push(p.item);
  }
  plan.placements = keep;
  for (const it of items) if (it.h > maxH) plan.leftovers.push(it);
  const metrics = computeMetrics(plan, container, items.length);
  return { ...plan, metrics, score: scorePlan(metrics, container.L) };
}

// ---------- 入口 ----------

export function planLoad(items, container, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const plans = [];
  for (const strat of STRATEGIES) {
    let best = null;
    for (let k = 0; k < opts.iterations; k++) {
      const rng = makeRng(opts.seed * 1000 + k * 7 + strat.id.length * 131);
      const noise = k === 0 ? 0 : 0.35;
      // 反復ごとに評価の重みを変え、「高さ重視」「台数重視」など異なる詰め方を試す
      const runOpts = k === 0 ? opts : {
        ...opts,
        weights: {
          depth: 0.4 + rng() * 0.4,
          height: 0.15 + rng() * 0.5,
          width: 0.1 + rng() * 0.2,
          count: 0.02 + rng() * 0.2,
        },
      };
      const plan = solveOnce(items, container, runOpts, strat.id, rng, noise);
      if (!best || plan.score > best.score) best = { ...plan, strategy: strat, iteration: k };
    }
    plans.push(best);
  }
  const bestIdx = plans.reduce((bi, p, i) => (p.score > plans[bi].score ? i : bi), 0);
  return { plans, bestIdx, options: opts };
}
