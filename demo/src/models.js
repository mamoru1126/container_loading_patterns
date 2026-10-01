// 家電の3Dモデル（ローカル座標: X = 幅, Y = 高さ, Z = 奥行。正面は +Z 側。単位 m）
import { Geo, lin } from './gl.js';
import { CATS } from './catalog.js';

const C = {
  gap: lin('#1E1F21'),
  kick: lin('#4A4B4D'),
  black: lin('#18191B'),
  darkPlastic: lin('#2C2D30'),
  rubber: lin('#26272A'),
  metal: lin('#B5B8BB'),
  darkMetal: lin('#55585C'),
  screen: lin('#11161C'),
  crtScreen: lin('#26302F'),
  smoked: lin('#2D3439'),
  display: lin('#0E1B1C'),
  grille: lin('#3A3B3C'),
};

const mul = (c, k) => c.map((v) => v * k);

function bodyColor(it, mode) {
  if (mode === 'cat') return lin(CATS[it.cat].tint);
  return lin(it.color, it.wear);
}

function isDark(hex) {
  const v = parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  return v < 330;
}

// ---------- 冷蔵庫 ----------
function fridge(g, it, w, d, h, body, mode) {
  const kick = 0.035;
  const glass = mode !== 'cat' && isDark(it.color);
  const doorMat = glass ? 3 : 0;
  const handle = glass ? C.metal : mul(body, 0.62);
  g.box(0.02, 0, 0.03, w - 0.02, kick, d - 0.03, C.kick, 4);
  g.rbox(0, kick, 0, w, h, d - 0.026, 0.012, body);
  g.box(0.004, kick + 0.003, d - 0.03, w - 0.004, h - 0.004, d - 0.024, C.gap, 4);
  const H = h - kick;
  const y = (f) => kick + H * f;
  const doors = [];
  if (it.type === 'fridge_s') {
    doors.push({ x0: 0, x1: w, y0: y(0.42), y1: h, kind: 'door', hx: 'right' });
    doors.push({ x0: 0, x1: w, y0: kick, y1: y(0.42), kind: 'door', hx: 'right', low: true });
  } else if (it.type === 'fridge_m') {
    doors.push({ x0: 0, x1: w, y0: y(0.47), y1: h, kind: 'door', hx: it.variant > 0.5 ? 'right' : 'left' });
    doors.push({ x0: 0, x1: w, y0: y(0.25), y1: y(0.47), kind: 'drawer' });
    doors.push({ x0: 0, x1: w, y0: kick, y1: y(0.25), kind: 'drawer' });
  } else {
    doors.push({ x0: 0, x1: w / 2, y0: y(0.52), y1: h, kind: 'door', hx: 'right' });
    doors.push({ x0: w / 2, x1: w, y0: y(0.52), y1: h, kind: 'door', hx: 'left' });
    doors.push({ x0: 0, x1: w / 2, y0: y(0.4), y1: y(0.52), kind: 'drawer' });
    doors.push({ x0: w / 2, x1: w, y0: y(0.4), y1: y(0.52), kind: 'drawer' });
    doors.push({ x0: 0, x1: w, y0: y(0.2), y1: y(0.4), kind: 'drawer' });
    doors.push({ x0: 0, x1: w, y0: kick, y1: y(0.2), kind: 'drawer' });
  }
  for (const dr of doors) {
    const g0 = 0.004;
    g.rbox(dr.x0 + g0, dr.y0 + g0, d - 0.03, dr.x1 - g0, dr.y1 - g0, d, 0.009, body, doorMat);
    if (dr.kind === 'door') {
      const hx = dr.hx === 'right' ? dr.x1 - 0.03 : dr.x0 + 0.018;
      const hy0 = dr.low ? dr.y1 - 0.22 : dr.y0 + 0.06;
      const hy1 = dr.low ? dr.y1 - 0.05 : Math.min(dr.y1 - 0.08, dr.y0 + 0.36);
      g.box(hx, hy0, d - 0.002, hx + 0.012, hy1, d + 0.006, handle, glass ? 5 : 0);
    } else {
      g.box(dr.x0 + 0.05, dr.y1 - 0.032, d - 0.002, dr.x1 - 0.05, dr.y1 - 0.02, d + 0.007, handle, glass ? 5 : 0);
    }
  }
}

// ---------- 上開き冷凍庫 ----------
function freezer(g, it, w, d, h, body) {
  const dd = d - 0.012;
  g.box(0.02, 0, 0.02, w - 0.02, 0.03, dd - 0.02, C.kick, 4);
  for (const [x, z] of [[0.04, 0.04], [w - 0.04, 0.04], [0.04, dd - 0.04], [w - 0.04, dd - 0.04]]) {
    g.cyl([x - 0.01, 0.016, z], 0.016, 0.02, 0, C.rubber, 4, 12);
  }
  g.rbox(0, 0.03, 0, w, h - 0.075, dd, 0.015, body);
  g.box(0.006, h - 0.077, 0.006, w - 0.006, h - 0.072, dd - 0.006, C.gap, 4);
  g.rbox(0, h - 0.073, 0, w, h, dd + 0.004, 0.012, mul(body, 1.02));
  g.rbox(w / 2 - 0.07, h - 0.055, dd, w / 2 + 0.07, h - 0.03, d, 0.006, mul(body, 0.8));
  g.cyl([w - 0.08, 0.13, dd], 0.02, 0.012, 2, C.darkPlastic, 4, 16);
}

// ---------- 縦型洗濯機 ----------
function washer(g, it, w, d, h, body) {
  g.box(0.025, 0, 0.025, w - 0.025, 0.045, d - 0.025, C.kick, 4);
  g.rbox(0, 0.045, 0, w, h - 0.07, d, 0.02, body);
  const panel = mul(body, 0.93);
  g.rbox(0.006, h - 0.12, 0.006, w - 0.006, h - 0.002, 0.17, 0.016, panel);
  g.box(w * 0.3, h - 0.004, 0.035, w * 0.7, h, 0.12, C.display, 3);
  g.rbox(0.014, h - 0.085, 0.172, w - 0.014, h - 0.052, d - 0.014, 0.012, mul(body, 1.01));
  g.box(0.07, h - 0.053, 0.215, w - 0.07, h - 0.049, d - 0.065, C.smoked, 3);
  g.box(w / 2 - 0.08, h - 0.08, d - 0.016, w / 2 + 0.08, h - 0.058, d - 0.004, mul(body, 0.78));
  g.box(0.03, 0.09, d - 0.0005, w - 0.03, 0.093, d + 0.001, mul(body, 0.85));
}

// ---------- ドラム式洗濯機・衣類乾燥機 ----------
function drumFront(g, w, d, h, body, base, R, cy) {
  const cx = w * 0.47;
  g.cyl([cx, cy, d - 0.014], R, 0.014, 2, C.metal, 5, 40);
  g.cyl([cx, cy, d - 0.0135], R * 0.74, 0.0145, 2, C.smoked, 3, 40);
  g.ring([cx, cy, d + 0.0009], R * 0.74, R * 0.8, 2, 1, mul(C.metal, 0.7), 5, 40);
  g.box(cx + R * 0.82, cy - 0.05, d - 0.002, cx + R * 0.95, cy + 0.05, d + 0.004, C.darkPlastic, 4);
}

function drum(g, it, w, d, h, body) {
  const base = 0.05;
  g.box(0.03, 0, 0.03, w - 0.03, base, d - 0.03, C.kick, 4);
  g.rbox(0, base, 0, w, h, d - 0.012, 0.03, body);
  const R = Math.min(w * 0.33, (h - base) * 0.3);
  drumFront(g, w, d, h, body, base, R, base + (h - base) * 0.45);
  g.box(0.03, h - 0.115, d - 0.014, w - 0.03, h - 0.035, d - 0.008, C.smoked, 3);
  g.box(0.045, h - 0.105, d - 0.009, 0.2, h - 0.045, d - 0.007, mul(body, 0.9));
  g.box(w * 0.6, h - 0.09, d - 0.009, w * 0.85, h - 0.06, d - 0.006, C.display, 3);
}

function dryer(g, it, w, d, h, body) {
  const base = 0.03;
  g.box(0.03, 0, 0.03, w - 0.03, base, d - 0.03, C.kick, 4);
  g.rbox(0, base, 0, w, h, d - 0.012, 0.02, body);
  const R = Math.min(w * 0.28, (h - base) * 0.32);
  drumFront(g, w, d, h, body, base, R, base + (h - base) * 0.44);
  g.box(0.03, h - 0.075, d - 0.014, w - 0.03, h - 0.025, d - 0.008, mul(body, 0.88));
  for (let k = 0; k < 4; k++) {
    g.cyl([w * 0.6 + k * 0.035, h - 0.05, d - 0.009], 0.009, 0.006, 2, C.darkPlastic, 4, 12);
  }
}

// ---------- 液晶テレビ ----------
function lcd(g, it, w, d, h) {
  const t = w > 1.1 ? 0.07 : w > 0.9 ? 0.062 : 0.055;
  const panelH = Math.min(h - 0.05, w * 0.585);
  const sH = h - panelH;
  const zc = d * 0.5;
  g.rbox(0, sH, zc - t * 0.35, w, h, zc + t * 0.5, 0.006, C.black, 0);
  g.rbox(w * 0.18, sH + panelH * 0.12, zc - t * 0.5, w * 0.82, sH + panelH * 0.82, zc - t * 0.3, 0.012, C.darkPlastic, 4);
  g.box(0.011, sH + 0.022, zc + t * 0.5, w - 0.011, h - 0.011, zc + t * 0.5 + 0.0015, C.screen, 3);
  g.box(w / 2 - 0.02, sH + 0.004, zc + t * 0.5, w / 2 + 0.02, sH + 0.012, zc + t * 0.5 + 0.002, mul(C.metal, 0.6), 5);
  if (it.variant < 0.5) {
    g.rbox(w / 2 - w * 0.17, 0, 0.004, w / 2 + w * 0.17, 0.014, d - 0.004, 0.005, C.darkMetal, 5);
    g.box(w / 2 - 0.045, 0.014, zc - t * 0.3 - 0.03, w / 2 + 0.045, sH + 0.04, zc - t * 0.3, C.darkPlastic, 4);
  } else {
    for (const xc of [w * 0.11, w * 0.89]) {
      g.box(xc - 0.016, 0, 0.004, xc + 0.016, 0.012, d - 0.004, C.darkMetal, 5);
      g.box(xc - 0.012, 0.012, zc - 0.015, xc + 0.012, sH + 0.03, zc + 0.005, C.darkMetal, 5);
    }
  }
}

// ---------- ブラウン管テレビ ----------
function crt(g, it, w, d, h, body) {
  const fd = d * 0.3;
  g.rbox(0, 0, d - fd, w, h, d - 0.006, 0.022, body);
  g.rbox(w * 0.07, h * 0.21, d - 0.02, w * 0.93, h * 0.94, d, 0.03, C.crtScreen, 3);
  g.box(w * 0.06, h * 0.05, d - 0.0075, w * 0.38, h * 0.16, d - 0.004, mul(body, 0.55), 4);
  g.box(w * 0.62, h * 0.05, d - 0.0075, w * 0.94, h * 0.16, d - 0.004, mul(body, 0.55), 4);
  for (let k = 0; k < 4; k++) {
    g.box(w * 0.42 + k * 0.03, h * 0.08, d - 0.008, w * 0.42 + k * 0.03 + 0.018, h * 0.12, d - 0.003, C.darkPlastic, 4);
  }
  const zf = d - fd;
  g.hexa([
    [w * 0.05, h * 0.04, zf], [w * 0.95, h * 0.04, zf], [w * 0.95, h * 0.97, zf], [w * 0.05, h * 0.97, zf],
    [w * 0.26, h * 0.16, 0], [w * 0.74, h * 0.16, 0], [w * 0.74, h * 0.7, 0], [w * 0.26, h * 0.7, 0],
  ], mul(body, 0.94), 0);
  g.box(w * 0.3, 0, zf - d * 0.35, w * 0.7, h * 0.04, zf, mul(body, 0.8), 4);
}

// ---------- エアコン室内機（背面を下にして寝かせた状態） ----------
function acin(g, it, w, d, h, body) {
  g.rbox(0, 0, 0, w, h - 0.004, d, 0.035, body);
  g.rbox(0.006, h * 0.4, 0.012, w - 0.006, h, d - 0.05, 0.025, mul(body, 1.015));
  g.box(0.05, h * 0.42, d - 0.002, w - 0.05, h * 0.86, d + 0.001, C.grille, 4);
  g.box(0.05, h * 0.62, d + 0.001, w - 0.05, h * 0.66, d + 0.003, mul(body, 0.9));
  g.box(w * 0.78, h - 0.004, d * 0.62, w * 0.9, h, d * 0.72, C.display, 3);
}

// ---------- エアコン室外機 ----------
function acout(g, it, w, d, h, body) {
  const legH = 0.03;
  const bw = w - 0.035;
  g.box(0.04, 0, 0, 0.11, legH, d, C.kick, 4);
  g.box(bw - 0.13, 0, 0, bw - 0.06, legH, d, C.kick, 4);
  g.rbox(0, legH, 0.004, bw, h, d, 0.008, body);
  g.box(0.03, legH + 0.03, 0, bw - 0.05, h - 0.03, 0.005, mul(body, 0.55), 4);
  g.rbox(bw - 0.006, legH + 0.06, d * 0.18, w, legH + 0.26, d * 0.82, 0.01, mul(body, 0.95));
  const cx = bw * 0.42;
  const cy = legH + (h - legH) * 0.5;
  const R = Math.min(bw * 0.37, (h - legH) * 0.44);
  const gr = mul(body, 0.82);
  g.cyl([cx, cy, d - 0.004], R, 0.0045, 2, C.grille, 4, 40);
  g.cyl([cx, cy, d - 0.004], R * 0.13, 0.008, 2, mul(C.grille, 1.5), 4, 20);
  for (let k = 1; k <= 5; k++) {
    const rr = (R * k) / 5.2;
    g.ring([cx, cy, d + 0.0009], rr - 0.004, rr, 2, 1, gr, 0, 40);
  }
  g.box(cx - R, cy - 0.003, d + 0.0004, cx + R, cy + 0.003, d + 0.0014, gr);
  g.box(cx - 0.003, cy - R, d + 0.0004, cx + 0.003, cy + R, d + 0.0014, gr);
  g.box(bw * 0.83, legH + 0.03, d - 0.0005, bw * 0.83 + 0.003, h - 0.03, d + 0.0008, mul(body, 0.7));
}

const BUILDERS = { fridge, freezer, washer, drum, dryer, lcd, crt, acin, acout };

// 個体ごとの形状を作る
export function buildItemGeo(it, mode = 'real') {
  const g = new Geo();
  const w = it.w / 1000;
  const d = it.d / 1000;
  const h = it.h / 1000;
  BUILDERS[it.cat](g, it, w, d, h, bodyColor(it, mode), mode);
  return g;
}

// ---------- コンテナ ----------
export function buildContainerGeo(ct, dark) {
  const g = new Geo();
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const H = ct.H / 1000;
  const frame = lin(ct.frame);
  const inner = lin(dark ? '#B9BEC2' : '#C9CDD0');
  const t = 0.045;
  g.box(-t, -0.03, -t, L + t, 0, W + t, [0.3, 0.2, 0.1], 1);
  g.box(-0.08, -0.17, -0.08, L + 0.08, -0.03, W + 0.08, mul(frame, 0.8), 0);
  // 奥の壁と左の壁（内側は波板の塗装、外側はコンテナ色）
  g.box(-t, 0, 0, -0.004, H, W, inner, 2);
  g.box(-t - 0.006, 0, -0.004, -t, H, W + 0.004, frame, 2);
  g.box(0, 0, -t, L, H, -0.004, inner, 2);
  g.box(0, 0, -t - 0.006, L, H, -t, frame, 2);
  // 骨組み（屋根と右壁は描かない）
  const post = 0.11;
  g.box(-0.09, -0.03, -0.09, -0.09 + post, H + 0.12, -0.09 + post, frame);
  g.box(-0.09, -0.03, W + 0.09 - post, -0.09 + post, H + 0.12, W + 0.09, frame);
  g.box(L + 0.09 - post, -0.03, -0.09, L + 0.09, H + 0.12, -0.09 + post, frame);
  g.box(L + 0.09 - post, -0.03, W + 0.09 - post, L + 0.09, H + 0.12, W + 0.09, frame);
  g.box(-0.09, H, -0.08, L + 0.09, H + 0.11, -0.01, frame);
  g.box(-0.09, H, W + 0.01, L + 0.09, H + 0.11, W + 0.08, frame);
  g.box(-0.09, H, -0.08, 0.0, H + 0.11, W + 0.08, frame);
  g.box(L, H, -0.08, L + 0.09, H + 0.11, W + 0.08, frame);
  g.box(-0.09, -0.17, W + 0.01, L + 0.09, 0.0, W + 0.09, mul(frame, 0.9));
  // 地面
  g.box(-40, -0.18, -40, 40, -0.17, 40, dark ? [0.05, 0.055, 0.06] : [0.55, 0.56, 0.55], 4);
  return g;
}

export function buildDunnageGeo(zones, ct) {
  const g = new Geo();
  const W = ct.W / 1000;
  for (const z of zones) {
    g.box(z.x0 / 1000 + 0.01, 0.0005, 0.01, z.x1 / 1000 - 0.01, 0.003, W - 0.01, [0.6, 0.4, 0.05], 6);
  }
  return g;
}

export function boxEdges(x0, y0, z0, x1, y1, z1) {
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const out = [];
  for (const [a, b] of e) out.push(...p[a], ...p[b]);
  return out;
}
