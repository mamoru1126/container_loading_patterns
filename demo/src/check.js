// 生成した積付けパターンが制約を守っているかを、配置結果だけから独立に検査する
import { CATS } from './catalog.js';

const EPS = 1;

function overlapLen(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function validatePlan(plan, container, opts) {
  const { L, W, H, payloadKg } = container;
  const P = plan.placements;
  const issues = {
    bounds: [], overlap: [], support: [], rule: [], load: [], upright: [], ceiling: [],
  };

  for (const p of P) {
    if (p.x < -EPS || p.y < -EPS || p.z < -EPS || p.x + p.ex > L + EPS || p.y + p.ey > W + EPS) {
      issues.bounds.push(p.item.id);
    }
    if (p.z + p.h > H - opts.topClear + EPS) issues.ceiling.push(p.item.id);
    // 正立: 高さ方向が元の高さのまま、床面の寸法が幅・奥行の組み合わせ
    const fp = [p.ex, p.ey].sort((a, b) => a - b).join(',');
    const orig = [p.item.w, p.item.d].sort((a, b) => a - b).join(',');
    if (p.h !== p.item.h || fp !== orig) issues.upright.push(p.item.id);
  }

  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    for (let j = i + 1; j < P.length; j++) {
      const b = P[j];
      const ox = overlapLen(a.x, a.x + a.ex, b.x, b.x + b.ex);
      const oy = overlapLen(a.y, a.y + a.ey, b.y, b.y + b.ey);
      const oz = overlapLen(a.z, a.z + a.h, b.z, b.z + b.h);
      if (ox > EPS && oy > EPS && oz > EPS) issues.overlap.push(`${a.item.id} × ${b.item.id}`);
    }
  }

  // 支持関係（直下で接している品目）
  const supporters = new Map();
  for (const p of P) {
    if (p.z <= EPS) continue;
    const below = [];
    let area = 0;
    for (const q of P) {
      if (q === p) continue;
      if (Math.abs(q.z + q.h - p.z) > EPS) continue;
      const ox = overlapLen(p.x, p.x + p.ex, q.x, q.x + q.ex);
      const oy = overlapLen(p.y, p.y + p.ey, q.y, q.y + q.ey);
      if (ox > 0 && oy > 0) {
        below.push({ q, a: ox * oy });
        area += ox * oy;
      }
    }
    supporters.set(p, below);
    const ratio = area / (p.ex * p.ey);
    if (ratio < opts.minSupport - 0.02) issues.support.push(`${p.item.id}（${Math.round(ratio * 100)}%）`);
    for (const { q } of below) {
      if (!CATS[q.item.cat].carries.includes(p.item.cat)) issues.rule.push(`${p.item.label} を ${q.item.label} の上`);
    }
  }

  // 耐荷重: 上から順に、載っている重さを接触面積で配分して下へ伝える
  const load = new Map(P.map((p) => [p, 0]));
  const byTop = [...P].sort((a, b) => b.z - a.z);
  for (const p of byTop) {
    const below = supporters.get(p);
    if (!below || !below.length) continue;
    const total = below.reduce((s, b) => s + b.a, 0);
    const w = p.item.kg + load.get(p);
    for (const { q, a } of below) load.set(q, load.get(q) + (w * a) / total);
  }
  let maxRatio = 0;
  for (const p of P) {
    const cap = CATS[p.item.cat].topLoadKg;
    const l = load.get(p);
    if (l > 0) maxRatio = Math.max(maxRatio, cap ? l / cap : Infinity);
    if (l > cap + 0.5) issues.load.push(`${p.item.label}（${l.toFixed(0)}kg / 上限${cap}kg）`);
  }

  const kg = P.reduce((s, p) => s + p.item.kg, 0);
  const cogX = kg ? P.reduce((s, p) => s + p.item.kg * (p.x + p.ex / 2), 0) / kg : L / 2;
  const off = Math.abs(cogX - L / 2) / L;
  const front = P.filter((p) => p.x + p.ex / 2 < L / 2).reduce((s, p) => s + p.item.kg, 0);
  const split = kg ? Math.max(front, kg - front) / kg : 0.5;

  const cogState = off <= 0.05 ? 'ok' : off <= 0.1 ? 'warn' : split <= 0.6 ? 'warn' : 'ng';

  return [
    { id: 'upright', label: '正立（冷蔵庫・室外機などを横倒しにしない）', state: issues.upright.length ? 'ng' : 'ok', detail: issues.upright },
    { id: 'rule', label: '積み重ねてよい品目の組み合わせ', state: issues.rule.length ? 'ng' : 'ok', detail: issues.rule },
    { id: 'load', label: '下の品目の耐荷重', state: issues.load.length ? 'ng' : 'ok', detail: issues.load, note: maxRatio ? `最も厳しい箇所で上限の${Math.round(maxRatio * 100)}%` : '積み重ねなし' },
    { id: 'support', label: `支持面積 ${Math.round(opts.minSupport * 100)}%以上`, state: issues.support.length ? 'ng' : 'ok', detail: issues.support },
    { id: 'overlap', label: '品目どうしの干渉なし', state: issues.overlap.length || issues.bounds.length ? 'ng' : 'ok', detail: [...issues.overlap, ...issues.bounds] },
    { id: 'ceiling', label: `天井とのすき間 ${opts.topClear}mm以上`, state: issues.ceiling.length ? 'ng' : 'ok', detail: issues.ceiling },
    { id: 'payload', label: '最大積載重量', state: kg <= payloadKg ? 'ok' : 'ng', detail: [], note: `${Math.round(kg).toLocaleString()} / ${payloadKg.toLocaleString()} kg` },
    { id: 'cog', label: '前後の重心（中央±5%）', state: cogState, detail: [], note: Math.abs(cogX - L / 2) < 5 ? 'ほぼ中央（0.0%）' : `中央から${cogX > L / 2 ? '扉側' : '奥側'}へ ${(Math.abs(cogX - L / 2) / 1000).toFixed(2)} m（${(off * 100).toFixed(1)}%）` },
  ];
}
