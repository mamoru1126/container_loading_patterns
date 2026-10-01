import { CONTAINERS, CATS, makeStream } from './catalog.js';
import { Simulation, POLICIES, FEATURES, binMetrics } from './online.js';
import { LEARNED_WEIGHTS, TRAINING_INFO } from './online-weights.js';
import { validatePlan } from './check.js';
import { Renderer, OrbitCamera, attachOrbit, M4, lin, Geo } from './gl.js';
import { buildItemGeo, buildContainerGeo } from './models.js';

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOOKAHEAD = 5;
const OPTS = { gap: 20, topClear: 50, minSupport: 0.8 };

const state = {
  containerId: 'iso20',
  policy: 'learned',
  buffer: 0,
  total: 300,
  speed: 3,
  seed: 1,
  color: 'real',
  running: false,
  viewBin: null,
  sim: null,
  anim: null,
  pause: 0,
  last: null,
  hover: null,
  checks: new Map(),
};

// ---------- シミュレーション ----------
function newSim() {
  const ct = CONTAINERS[state.containerId];
  state.sim = new Simulation(ct, makeStream(state.seed), { ...OPTS, policy: state.policy, buffer: state.buffer, lookahead: LOOKAHEAD });
  state.anim = null;
  state.pause = 0;
  state.last = null;
  state.viewBin = null;
  state.checks = new Map();
  clearMeshes();
  buildStatic();
  setRunning(false);
  renderPanel();
  renderQueue();
  setCaption();
  dirty = true;
}

function finished() {
  return state.total > 0 && state.sim.processed >= state.total;
}

function setRunning(v) {
  state.running = v && !finished();
  $('startBtn').textContent = state.running ? '一時停止' : finished() ? '流し終わりました' : state.sim && state.sim.processed ? '続きを流す' : '流し始める';
  $('startBtn').disabled = finished();
}

// ---------- 3D ----------
let renderer;
let cam;
let orbit;
let dirty = true;
let lastT = 0;
let staticObjs = [];
const meshCache = new Map();

function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function beltSpan() {
  return 6.5;
}

function envFor(ct) {
  const dark = isDark();
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#DEE2DF';
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const ld = [0.42, 1.0, 0.62];
  const l = Math.hypot(...ld);
  const side = ct.door === 'side';
  const cx = side ? L / 2 : (L + beltSpan()) / 2;
  const cz = side ? (W + beltSpan()) / 2 : W / 2;
  return {
    bg: lin(bg).map((v) => Math.pow(v, 1 / 2.2)),
    center: [cx, 1.0, cz],
    radius: Math.hypot(side ? L : L + beltSpan(), side ? W + beltSpan() : W, 3) / 2 + 0.6,
    lightDir: ld.map((v) => v / l),
    lightCol: dark ? [0.95, 0.92, 0.86] : [1.05, 1.0, 0.93],
    sky: dark ? [0.36, 0.39, 0.43] : [0.6, 0.62, 0.64],
    ground: dark ? [0.16, 0.15, 0.14] : [0.3, 0.28, 0.26],
    exposure: dark ? 1.3 : 1.45,
  };
}

// コンベヤ（扉の外に置く。JR 12ft は側面の扉側）
const BELT_Y = 0.32;
function buildConveyor(ct) {
  const g = new Geo();
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const len = beltSpan();
  const bw = 1.4;
  const frame = lin(isDark() ? '#6F7B82' : '#5E6A70');
  const belt = lin('#2B2D30');
  const roller = lin('#A9AEB2');
  const side = ct.door === 'side';
  // ローカルに長さ方向 u（扉から外へ）と幅方向 v を作り、ワールドに写す
  const P = (u, y, v) => (side ? [L / 2 + v, y, W + 0.35 + u] : [L + 0.35 + u, y, W / 2 + v]);
  const boxUV = (u0, y0, v0, u1, y1, v1, col, mat) => {
    const a = P(u0, y0, v0);
    const b = P(u1, y1, v1);
    g.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), col, mat);
  };
  boxUV(0, BELT_Y - 0.02, -bw / 2, len, BELT_Y, bw / 2, belt, 4);
  boxUV(0, BELT_Y - 0.09, -bw / 2 - 0.06, len, BELT_Y + 0.025, -bw / 2, frame, 5);
  boxUV(0, BELT_Y - 0.09, bw / 2, len, BELT_Y + 0.025, bw / 2 + 0.06, frame, 5);
  for (let u = 0.3; u < len; u += 1.2) {
    for (const v of [-bw / 2 - 0.03, bw / 2 + 0.03]) boxUV(u - 0.03, -0.17, v - 0.03, u + 0.03, BELT_Y - 0.09, v + 0.03, frame, 5);
  }
  for (let u = 0.1; u < len; u += 0.32) {
    const c = P(u, BELT_Y - 0.05, -bw / 2);
    g.cyl(c, 0.028, bw, side ? 0 : 2, roller, 5, 12, true);
  }
  // 判断エリア（ここに来た家電の置き場所を決める）
  const zone = 0.25 + 1.0 * (state.buffer + 1);
  boxUV(0, BELT_Y + 0.001, -bw / 2 - 0.12, zone, BELT_Y + 0.004, -bw / 2 - 0.07, lin('#D9780F'), 4);
  boxUV(0, BELT_Y + 0.001, bw / 2 + 0.07, zone, BELT_Y + 0.004, bw / 2 + 0.12, lin('#D9780F'), 4);
  return g;
}

function buildStatic() {
  if (!renderer) return;
  for (const o of staticObjs) renderer.free(o.mesh);
  const ct = CONTAINERS[state.containerId];
  staticObjs = [
    { mesh: renderer.mesh(buildContainerGeo(ct, isDark())), model: M4.ident(), visible: true },
    { mesh: renderer.mesh(buildConveyor(ct)), model: M4.ident(), visible: true, belt: true },
  ];
  dirty = true;
}

function itemMesh(it) {
  const key = `${it.id}|${state.color}`;
  if (!meshCache.has(key)) meshCache.set(key, renderer.mesh(buildItemGeo(it, state.color)));
  return meshCache.get(key);
}

function clearMeshes(keep) {
  if (!renderer) return;
  for (const [k, m] of meshCache) {
    const id = k.split('|')[0];
    if (keep && keep.has(id)) continue;
    renderer.free(m);
    meshCache.delete(k);
  }
}

// 品目の姿勢（底面の中心 cx, by, cz と Y 軸まわりの角度 th）から行列を作る
function poseModel(it, pose) {
  const w = it.w / 1000;
  const d = it.d / 1000;
  const c = Math.cos(pose.th);
  const s = Math.sin(pose.th);
  const tx = pose.cx + c * (-w / 2) + s * (-d / 2);
  const tz = pose.cz - s * (-w / 2) + c * (-d / 2);
  return M4.place(tx, pose.by, tz, pose.th);
}

function finalPose(p) {
  return { cx: (p.x + p.ex / 2) / 1000, by: p.z / 1000, cz: (p.y + p.ey / 2) / 1000, th: p.rot ? Math.PI / 2 : 0 };
}

function beltPoses() {
  const ct = CONTAINERS[state.containerId];
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const side = ct.door === 'side';
  const out = new Map();
  let u = 0.3;
  for (const it of state.sim.queue) {
    const len = it.w / 1000;
    const center = u + len / 2;
    out.set(it.id, side
      ? { cx: L / 2, by: BELT_Y, cz: W + 0.35 + center, th: Math.PI / 2, u: center }
      : { cx: L + 0.35 + center, by: BELT_Y, cz: W / 2, th: 0, u: center });
    u += len + 0.3;
  }
  return out;
}

function lerpPose(a, b, t, arc) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return {
    cx: a.cx + (b.cx - a.cx) * e,
    by: a.by + (b.by - a.by) * e + arc * Math.sin(Math.PI * t),
    cz: a.cz + (b.cz - a.cz) * e,
    th: a.th + (b.th - a.th) * e,
  };
}

function shownBin() {
  const sim = state.sim;
  if (state.viewBin != null) return sim.bins[state.viewBin];
  return sim.bin;
}

function sceneObjects() {
  const objs = [...staticObjs];
  const bin = shownBin();
  const live = state.viewBin == null;
  const anim = state.anim;
  const acc = lin(isDark() ? '#F0973A' : '#D9780F');
  for (const p of bin.placed) {
    if (anim && anim.item === p.item && live) continue;
    objs.push({ mesh: itemMesh(p.item), model: poseModel(p.item, finalPose(p)), visible: true, tint: acc, tintK: state.hover === p.item.id ? 0.25 : 0 });
  }
  if (live) {
    const belt = beltPoses();
    const span = beltSpan();
    for (const it of state.sim.queue) {
      let pose = belt.get(it.id);
      if (anim && anim.from.has(it.id)) pose = lerpPose(anim.from.get(it.id), pose, anim.t, 0);
      if (pose.u > span - 0.2 && !(anim && anim.from.has(it.id))) continue;
      objs.push({ mesh: itemMesh(it), model: poseModel(it, pose), visible: true, tint: acc, tintK: 0 });
    }
    if (anim) {
      const pose = lerpPose(anim.start, anim.end, anim.t, 0.55);
      objs.push({ mesh: itemMesh(anim.item), model: poseModel(anim.item, pose), visible: true, tint: acc, tintK: 0.12 });
    }
  }
  return objs;
}

function setView(v) {
  const ct = CONTAINERS[state.containerId];
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const side = ct.door === 'side';
  const span = Math.max(side ? L : L + beltSpan() * 0.7, 5);
  const target = side ? [L / 2, 0.8, W / 2 + 1.6] : [L / 2 + beltSpan() * 0.35, 0.8, W / 2];
  const presets = {
    iso: { theta: side ? 0.55 : 1.05, phi: 0.95, dist: span * 0.95 + 4.5 },
    door: { theta: side ? Math.PI / 2 : 0.05, phi: 1.12, dist: 7.5 },
    top: { theta: Math.PI / 2, phi: 0.13, dist: span * 1.2 + 3.5 },
  };
  const p = { ...presets[v] };
  const cv = $('view');
  const aspect = cv.clientWidth && cv.clientHeight ? cv.clientWidth / cv.clientHeight : 1.5;
  if (aspect < 1.45 && v !== 'door') p.dist *= Math.min(2.2, 1.45 / aspect);
  if (!cam) {
    cam = new OrbitCamera(target, p.dist, p.theta, p.phi);
    orbit = attachOrbit($('view'), cam, () => {
      dirty = true;
      markView(null);
    });
  } else {
    cam.target = target;
    Object.assign(cam, { theta: p.theta, phi: p.phi, dist: p.dist });
  }
  if (v === 'door') cam.target = side ? [L / 2, 0.9, W / 2] : [L * 0.6, 0.9, W / 2];
  markView(v);
  dirty = true;
}

function markView(v) {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
}

function placeTags() {
  const ct = CONTAINERS[state.containerId];
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const H = ct.H / 1000;
  const side = ct.door === 'side';
  const bin = shownBin();
  const tags = [
    { text: `No.${bin.index}${bin.closed ? '（満載）' : state.viewBin == null ? '（積込中）' : ''}`, at: [L / 2, H + 0.3, W / 2] },
  ];
  if (state.viewBin == null) tags.push({ text: 'コンベヤ', at: side ? [L / 2 + 0.9, BELT_Y + 0.1, W + 0.35 + beltSpan() - 0.4] : [L + 0.35 + beltSpan() - 0.4, BELT_Y + 0.1, W / 2 + 0.9] });
  const host = $('tags');
  while (host.children.length < tags.length) {
    const d = document.createElement('div');
    d.className = 'tag3d';
    host.appendChild(d);
  }
  for (let i = tags.length; i < host.children.length; i++) host.children[i].hidden = true;
  tags.forEach((t, i) => {
    const el = host.children[i];
    const p = renderer.project(t.at);
    el.hidden = !p;
    if (!p) return;
    el.textContent = t.text;
    el.style.left = `${p[0]}px`;
    el.style.top = `${p[1]}px`;
  });
}

// ---------- 進行 ----------
function beginStep() {
  const sim = state.sim;
  const before = beltPoses();
  const ev = sim.step();
  state.last = ev;
  if (ev.closed) onClosed(ev.closed);
  const after = beltPoses();
  const from = new Map();
  for (const it of sim.queue) if (before.has(it.id)) from.set(it.id, before.get(it.id));
  const start = before.get(ev.item.id);
  const end = finalPose(ev.placement);
  return { ev, start, end, from, after };
}

function onClosed(bin) {
  const keep = new Set(state.sim.queue.map((i) => i.id));
  clearMeshes(keep);
  const m = binMetrics(bin);
  $('banner').hidden = false;
  $('banner').textContent = `No.${bin.index} が満載（${m.count}台・容積${(m.volUtil * 100).toFixed(0)}%）→ No.${bin.index + 1} へ`;
  state.bannerUntil = performance.now() + 2200;
}

function frame(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
  lastT = t;
  const sim = state.sim;
  if (sim && state.viewBin == null) {
    if (state.anim) {
      // 締めたあとの一呼吸、そのあと飛ばす
      if (state.pause > 0) state.pause -= dt * Math.max(1, state.speed);
      else {
        state.anim.t = Math.min(1, state.anim.t + (dt * Math.max(1, state.speed)) / state.anim.dur);
        if (state.anim.t >= 1) state.anim = null;
      }
      dirty = true;
    } else if (state.running && !finished()) {
      if (state.speed === 0 || reduceMotion) {
        const start = performance.now();
        while (performance.now() - start < 14 && !finished()) {
          const ev = sim.step();
          state.last = ev;
          if (ev.closed) onClosed(ev.closed);
          if (state.speed !== 0) break;
        }
      } else {
        const s = beginStep();
        state.anim = { item: s.ev.item, start: s.start, end: s.end, from: s.from, t: 0, dur: 0.85 };
        state.pause = s.ev.closed ? 0.9 : 0;
      }
      afterStep();
      dirty = true;
    }
  }
  if (state.bannerUntil && performance.now() > state.bannerUntil) {
    $('banner').hidden = true;
    state.bannerUntil = 0;
  }
  if (dirty && renderer && cam && sim) {
    dirty = false;
    renderer.render({ objects: sceneObjects(), lines: [], env: envFor(CONTAINERS[state.containerId]) }, cam);
    placeTags();
  }
  requestAnimationFrame(frame);
}

let panelTimer = 0;
function afterStep() {
  setCaption();
  renderQueue();
  if (finished()) setRunning(false);
  const now = performance.now();
  if (now - panelTimer > 120 || finished()) {
    panelTimer = now;
    renderPanel();
  }
}

// ---------- 画面の文字 ----------
function sideName(p, W) {
  const c = p.y + p.ey / 2;
  return c < W / 3 ? '左' : c > (W * 2) / 3 ? '右' : '中央';
}

function setCaption() {
  const ev = state.last;
  const ct = CONTAINERS[state.containerId];
  if (!ev) {
    $('caption').textContent = '「流し始める」を押すと、コンベヤで家電が流れてきます。';
    return;
  }
  const p = ev.placement;
  const where = `奥から ${fmt(p.x / 1000, 2)} m・${sideName(p, ct.W)}・${p.tier + 1}段目`;
  $('caption').innerHTML = `<span class="n">${ev.item.id}</span>${ev.item.label} → No.${ev.bin.index} の ${where}（判断 ${fmt(ev.ms, 2)} ms${ev.fromBuffer ? '・待機場所から選択' : ''}）${finished() ? `。${fmt(state.sim.processed)}台を流し終わりました。` : ''}`;
}

function renderQueue() {
  const sim = state.sim;
  const pool = state.buffer + 1;
  $('queue').innerHTML = sim.queue
    .slice(0, pool + LOOKAHEAD - 1)
    .map((it, i) => `<li class="${i < pool ? 'pool' : ''}"><span class="q">${i < pool ? (state.buffer ? '判断' : '次') : ''}</span><span class="dot" style="background:${CATS[it.cat].tint}"></span>${it.label}</li>`)
    .join('');
}

function checkBin(bin) {
  if (!state.checks.has(bin.index) || !bin.closed) {
    const res = validatePlan({ placements: bin.placed }, CONTAINERS[state.containerId], OPTS);
    const bad = res.filter((r) => r.state === 'ng' && r.id !== 'cog');
    if (bin.closed) state.checks.set(bin.index, bad.length === 0);
    else return bad.length === 0;
  }
  return state.checks.get(bin.index);
}

function renderPanel() {
  const sim = state.sim;
  const st = sim.stats();
  const tiles = [
    ['流した台数', `${fmt(st.processed)}<small>${state.total ? `/ ${fmt(state.total)} 台` : '台'}</small>`],
    ['使ったコンテナ', `${st.containers}<small>本</small>`],
    ['平均容積率', st.avgFill == null ? '—' : `${(st.avgFill * 100).toFixed(1)}<small>%</small>`],
    ['1本あたり', st.avgCount == null ? '—' : `${st.avgCount.toFixed(1)}<small>台</small>`],
    ['判断時間', `${st.avgMs.toFixed(2)}<small>ms/台</small>`],
    ['待機場所から', state.buffer ? `${sim.log.filter((e) => e.fromBuffer).length}<small>回</small>` : '<small>使わない</small>'],
  ];
  $('tiles').innerHTML = tiles.map(([l, v]) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');

  const cur = sim.bin;
  const m = binMetrics(cur);
  $('nowTitle').textContent = `積込中のコンテナ No.${cur.index}`;
  $('nowMeter').style.width = `${Math.min(100, m.volUtil * 100 * 1.6)}%`;
  $('nowText').textContent = `${m.count}台 ・ 容積率 ${(m.volUtil * 100).toFixed(1)}% ・ ${fmt(m.kg)} kg ・ 奥から ${fmt(m.usedLen / 1000, 2)} m まで使用（目盛りは容積率62.5%で満杯）`;

  const ul = $('cards');
  ul.innerHTML = [...sim.bins]
    .reverse()
    .map((b) => {
      const bm = binMetrics(b);
      const ok = checkBin(b);
      const live = !b.closed;
      const pressed = state.viewBin === b.index - 1 || (state.viewBin == null && live);
      return `<li><button type="button" class="card${live ? ' live' : ''}" data-bin="${b.index - 1}" aria-pressed="${pressed}">
        <span class="no">No.${b.index}</span>
        <span class="meta">${bm.count}台 ・ 容積 ${(bm.volUtil * 100).toFixed(1)}% ・ ${fmt(bm.kg)} kg${live ? '' : ` ・ 重心 ${bm.cogOffPct >= 0 ? '+' : ''}${bm.cogOffPct.toFixed(1)}%`}</span>
        <span class="pill ${ok ? 'ok' : 'ng'}">${live ? '積込中' : ok ? '制約OK' : '要確認'}</span>
        <span class="bar2"><i style="width:${Math.min(100, bm.volUtil * 160)}%"></i></span>
      </button></li>`;
    })
    .join('');
  ul.querySelectorAll('.card').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.bin);
      const bin = sim.bins[i];
      if (!bin.closed) {
        backToLive();
        return;
      }
      state.viewBin = i;
      setRunning(false);
      $('backLive').hidden = false;
      clearMeshes(new Set([...bin.placed.map((p) => p.item.id), ...sim.queue.map((x) => x.id)]));
      dirty = true;
      renderPanel();
    }),
  );
}

function backToLive() {
  state.viewBin = null;
  $('backLive').hidden = true;
  dirty = true;
  renderPanel();
}

// 同じ流れを、判断方法と待機場所を変えて一気に積んで比べる
function runCompare() {
  const btn = $('cmpBtn');
  btn.disabled = true;
  btn.textContent = '計算中…';
  setTimeout(() => {
    const ct = CONTAINERS[state.containerId];
    const n = state.total || 300;
    const rows = [];
    for (const policy of ['dblf', 'learned']) {
      for (const buffer of [0, 3]) {
        const sim = new Simulation(ct, makeStream(state.seed), { ...OPTS, policy, buffer, lookahead: LOOKAHEAD });
        for (let i = 0; i < n; i++) sim.step();
        const st = sim.stats();
        rows.push({ policy, buffer, ...st, last: binMetrics(sim.bin) });
      }
    }
    const best = rows.reduce((b, r) => ((r.avgFill ?? 0) > (b.avgFill ?? 0) ? r : b), rows[0]);
    const short = { learned: '学習済み（GA）', dblf: '単純な奥詰め' };
    $('cmp').innerHTML = `<tr><th>判断</th><th>待機</th><th>本数</th><th>容積率</th><th>台/本</th></tr>${rows
      .map(
        (r) => `<tr class="${r === best ? 'win' : ''}"><td>${short[r.policy]}</td><td>${r.buffer ? `${r.buffer}台` : 'なし'}</td><td>${r.containers}</td><td>${r.avgFill == null ? '—' : `${(r.avgFill * 100).toFixed(1)}%`}</td><td>${r.avgCount == null ? '—' : r.avgCount.toFixed(1)}</td></tr>`,
      )
      .join('')}`;
    btn.disabled = false;
    btn.textContent = `同じ流れで比べる（${fmt(n)}台）`;
  }, 30);
}

function renderWeights() {
  $('weights').innerHTML = FEATURES.map(([k, label]) => `<tr><td>${label}</td><td>${LEARNED_WEIGHTS[k].toFixed(2)}</td></tr>`).join('');
  if (TRAINING_INFO) {
    const t = TRAINING_INFO.test;
    $('trainInfo').textContent = `学習: ${TRAINING_INFO.population}個体 × ${TRAINING_INFO.generations}世代。学習に使っていない8通りの流れ（待機場所なし・3台を含む）での平均容積率は、学習済み ${t.learned.fill}%（1本あたり${t.learned.count}台）、単純な奥詰め ${t.dblf.fill}%（${t.dblf.count}台）、手で決めた重み ${t.manual.fill}%。`;
  }
}

// ---------- 入力 ----------
function initInputs() {
  const sel = $('container');
  for (const c of Object.values(CONTAINERS)) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.name}（内寸 ${fmt(c.L)}×${fmt(c.W)}×${fmt(c.H)}）`;
    sel.appendChild(o);
  }
  sel.value = state.containerId;
  const restart = () => {
    newSim();
    setView('iso');
  };
  sel.addEventListener('change', () => {
    state.containerId = sel.value;
    restart();
  });
  const pol = $('policy');
  const polNote = () => {
    $('policyNote').textContent = POLICIES[state.policy].desc;
  };
  pol.addEventListener('change', () => {
    state.policy = pol.value;
    polNote();
    newSim();
  });
  polNote();
  $('buffer').addEventListener('change', (e) => {
    state.buffer = Number(e.target.value);
    newSim();
  });
  $('total').addEventListener('change', (e) => {
    state.total = Number(e.target.value);
    setRunning(state.running);
    renderPanel();
  });
  document.querySelectorAll('[data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (state.speed === 0) state.anim = null;
    }),
  );
  $('startBtn').addEventListener('click', () => {
    if (state.viewBin != null) backToLive();
    setRunning(!state.running);
  });
  $('stepBtn').addEventListener('click', () => {
    if (finished()) return;
    if (state.viewBin != null) backToLive();
    setRunning(false);
    state.anim = null;
    const ev = state.sim.step();
    state.last = ev;
    if (ev.closed) onClosed(ev.closed);
    afterStep();
    renderPanel();
    dirty = true;
  });
  $('resetBtn').addEventListener('click', () => {
    state.seed += 1;
    newSim();
  });
  $('backLive').addEventListener('click', backToLive);
  $('cmpBtn').addEventListener('click', runCompare);
  $('cmpBtn').textContent = '同じ流れで比べる';
}

function initView() {
  const canvas = $('view');
  renderer = new Renderer(canvas);
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-color]').forEach((b) =>
    b.addEventListener('click', () => {
      state.color = b.dataset.color;
      document.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      clearMeshes();
      dirty = true;
    }),
  );
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.buttons) return;
    const p = pick(ev);
    const id = p ? p.item.id : null;
    if (id !== state.hover) {
      state.hover = id;
      dirty = true;
    }
    showTip(p, ev);
  });
  canvas.addEventListener('pointerleave', () => {
    state.hover = null;
    showTip(null);
    dirty = true;
  });
  window.addEventListener('resize', () => {
    dirty = true;
  });
  const onTheme = () => buildStatic();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function pick(ev) {
  if (!cam) return null;
  const rect = $('view').getBoundingClientRect();
  const r = cam.ray(ev.clientX - rect.left, ev.clientY - rect.top, rect.width, rect.height);
  let best = null;
  for (const p of shownBin().placed) {
    const mn = [p.x / 1000, p.z / 1000, p.y / 1000];
    const mx = [(p.x + p.ex) / 1000, (p.z + p.h) / 1000, (p.y + p.ey) / 1000];
    let t0 = -Infinity;
    let t1 = Infinity;
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(r.d[a]) < 1e-9) {
        if (r.o[a] < mn[a] || r.o[a] > mx[a]) ok = false;
      } else {
        let ta = (mn[a] - r.o[a]) / r.d[a];
        let tb = (mx[a] - r.o[a]) / r.d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
    }
    if (ok && t0 <= t1 && t1 > 0 && (!best || t0 < best.t)) best = { t: t0, p };
  }
  return best ? best.p : null;
}

function showTip(p, ev) {
  const tip = $('tip');
  if (!p) {
    tip.hidden = true;
    return;
  }
  const it = p.item;
  const ct = CONTAINERS[state.containerId];
  tip.innerHTML = `<b>${it.label}</b> <span class="mono">${it.id}</span><br><span class="mono">${it.ref}${it.ref.includes('概算') ? '' : ' 相当'}</span><br>
    幅${fmt(it.w)} × 奥行${fmt(it.d)} × 高さ${fmt(it.h)} mm ・ ${fmt(it.kg, 1)} kg<br>
    ${p.order}台目に積載 ・ 奥から ${fmt(p.x / 1000, 2)} m・${sideName(p, ct.W)}・${p.tier + 1}段目`;
  const vp = $('viewport').getBoundingClientRect();
  tip.hidden = false;
  tip.style.left = `${Math.min(ev.clientX - vp.left + 14, vp.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(ev.clientY - vp.top + 14, vp.height - tip.offsetHeight - 8)}px`;
}

function boot() {
  initInputs();
  renderWeights();
  try {
    initView();
  } catch (err) {
    $('viewport').innerHTML = `<p style="padding:16px">3D表示を開始できませんでした（${err.message}）。記録は右側で確認できます。</p>`;
    renderer = null;
  }
  newSim();
  if (renderer) setView('iso');
  requestAnimationFrame(frame);
}

boot();
