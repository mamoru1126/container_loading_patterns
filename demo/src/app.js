import { CONTAINERS, TYPES, CATS, DEFAULT_COUNTS, generateItems, countsForTotal } from './catalog.js';
import { planLoad } from './engine.js';
import { validatePlan } from './check.js';
import { Renderer, OrbitCamera, attachOrbit, M4, lin } from './gl.js';
import { buildItemGeo, buildContainerGeo, buildDunnageGeo, boxEdges } from './models.js';
import { Geo } from './gl.js';

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  containerId: 'iso20',
  counts: { ...DEFAULT_COUNTS },
  seed: 1,
  gap: 20,
  topClear: 50,
  items: [],
  result: null,
  planIdx: 0,
  color: 'real',
  step: 0,
  playing: false,
  hover: null,
  selected: null,
  view: 'iso',
};

// ---------- 入力パネル ----------
function buildInputs() {
  const sel = $('container');
  for (const c of Object.values(CONTAINERS)) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.name}（内寸 ${fmt(c.L)}×${fmt(c.W)}×${fmt(c.H)}）`;
    sel.appendChild(o);
  }
  sel.value = state.containerId;
  sel.addEventListener('change', () => {
    state.containerId = sel.value;
    updateContainerNote();
    run(true);
  });

  const tbl = $('qty');
  for (const t of TYPES) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="nm"><span class="dot" style="background:${CATS[t.cat].tint}"></span>${t.label}<small>${t.ref}${t.ref.includes('概算') ? '' : ' 相当'}</small></td>
      <td><div class="step"><button type="button" aria-label="${t.label}を減らす" data-d="-1">−</button><input id="n-${t.id}" inputmode="numeric" aria-label="${t.label}の台数" value="${state.counts[t.id] || 0}"><button type="button" aria-label="${t.label}を増やす" data-d="1">＋</button></div></td>`;
    const input = tr.querySelector('input');
    tr.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const v = Math.max(0, Math.min(40, (parseInt(input.value, 10) || 0) + Number(b.dataset.d)));
        input.value = v;
        state.counts[t.id] = v;
        updateTotal();
      }),
    );
    input.addEventListener('change', () => {
      const v = Math.max(0, Math.min(40, parseInt(input.value, 10) || 0));
      input.value = v;
      state.counts[t.id] = v;
      updateTotal();
    });
    tbl.appendChild(tr);
  }
  document.querySelectorAll('[data-total]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = Number(b.dataset.total);
      state.counts = n === 59 ? { ...DEFAULT_COUNTS } : countsForTotal(n, state.seed);
      for (const t of TYPES) $(`n-${t.id}`).value = state.counts[t.id] || 0;
      updateTotal();
      run(false);
    }),
  );
  $('gap').addEventListener('change', (e) => {
    state.gap = Number(e.target.value);
  });
  $('topClear').addEventListener('change', (e) => {
    state.topClear = Number(e.target.value);
  });
  $('reroll').addEventListener('click', () => {
    state.seed += 1;
    run(false);
  });
  $('generate').addEventListener('click', () => run(false));
  updateContainerNote();
  updateTotal();

  const src = $('sources');
  const seen = new Set();
  for (const t of TYPES) {
    if (!t.src || seen.has(t.src + t.ref)) continue;
    seen.add(t.src + t.ref);
    const li = document.createElement('li');
    li.innerHTML = `${t.label}: <a href="${t.src}" target="_blank" rel="noopener">${t.ref}</a>`;
    src.appendChild(li);
  }
  const li = document.createElement('li');
  li.innerHTML = `コンテナ内寸: <a href="${CONTAINERS.jr12.src}" target="_blank" rel="noopener">JR 19D形</a>、<a href="${CONTAINERS.iso20.src}" target="_blank" rel="noopener">ISOコンテナ（代表値）</a>`;
  src.appendChild(li);
  const li2 = document.createElement('li');
  li2.textContent = '液晶テレビ32型は一般的な製品の寸法をもとにした概算値です。';
  src.appendChild(li2);
}

function updateContainerNote() {
  const c = CONTAINERS[state.containerId];
  $('containerNote').textContent = `${c.note} 最大積載 ${fmt(c.payloadKg)} kg。`;
  $('doorEnd').textContent = c.door === 'side' ? '端' : '扉';
}

function updateTotal() {
  const n = Object.values(state.counts).reduce((s, v) => s + (v || 0), 0);
  $('totalCount').textContent = `計 ${n} 台`;
}

// ---------- 3D ----------
let renderer;
let cam;
let orbit;
const meshCache = new Map();
let staticObjs = [];
let itemObjs = [];
let lineObjs = [];
let dirty = true;
let lastT = 0;

function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function envFor(ct) {
  const dark = isDark();
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#DEE2DF';
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const ld = [0.42, 1.0, 0.62];
  const l = Math.hypot(...ld);
  return {
    bg: lin(bg).map((v) => Math.pow(v, 1 / 2.2)),
    center: [L / 2, 1.0, W / 2],
    radius: Math.hypot(L, W, 3) / 2 + 0.6,
    lightDir: ld.map((v) => v / l),
    lightCol: dark ? [0.95, 0.92, 0.86] : [1.05, 1.0, 0.93],
    sky: dark ? [0.36, 0.39, 0.43] : [0.6, 0.62, 0.64],
    ground: dark ? [0.16, 0.15, 0.14] : [0.3, 0.28, 0.26],
    exposure: dark ? 1.3 : 1.45,
    floorScale: 1,
  };
}

function itemMesh(it) {
  const key = `${it.id}|${state.color}`;
  if (!meshCache.has(key)) meshCache.set(key, renderer.mesh(buildItemGeo(it, state.color)));
  return meshCache.get(key);
}

function clearItemCache() {
  for (const m of meshCache.values()) renderer.free(m);
  meshCache.clear();
}

function currentPlan() {
  return state.result ? state.result.plans[state.planIdx] : null;
}

function placementModel(p) {
  const x = p.x / 1000;
  const y = p.y / 1000;
  const z = p.z / 1000;
  return p.rot === 0 ? M4.place(x, z, y, 0) : M4.place(x, z, y + p.item.w / 1000, Math.PI / 2);
}

function buildScene(resetCam) {
  const ct = CONTAINERS[state.containerId];
  for (const o of staticObjs) renderer.free(o.mesh);
  for (const o of lineObjs) renderer.free(o.mesh);
  staticObjs = [];
  lineObjs = [];
  const dark = isDark();
  staticObjs.push({ mesh: renderer.mesh(buildContainerGeo(ct, dark)), model: M4.ident(), visible: true });
  const plan = currentPlan();
  if (plan && plan.dunnage.length) {
    staticObjs.push({ mesh: renderer.mesh(buildDunnageGeo(plan.dunnage, ct)), model: M4.ident(), visible: true, noShadow: true });
  }
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const H = ct.H / 1000;
  lineObjs.push({ mesh: renderer.lineMesh(boxEdges(0, 0, 0, L, H, W)), color: dark ? [0.55, 0.62, 0.66] : [0.25, 0.33, 0.38] });
  if (plan) {
    const m = plan.metrics;
    const cx = m.cogX / 1000;
    const cz = m.cogY / 1000;
    const g = new Geo();
    const acc = lin(dark ? '#F0973A' : '#D9780F');
    g.cyl([cx, 0.002, cz], 0.12, 0.004, 1, acc, 4, 32);
    g.cyl([cx, 0.0, cz], 0.012, H, 1, acc, 4, 10);
    staticObjs.push({ mesh: renderer.mesh(g), model: M4.ident(), visible: true, noShadow: true, cog: true });
    const g2 = new Geo();
    const mid = lin(dark ? '#86A9BB' : '#3F5B6B');
    g2.box(L / 2 - 0.006, 0.001, 0, L / 2 + 0.006, 0.0035, W, mid, 4);
    staticObjs.push({ mesh: renderer.mesh(g2), model: M4.ident(), visible: true, noShadow: true });
  }
  itemObjs = plan
    ? plan.placements.map((p) => ({ p, mesh: itemMesh(p.item), model: placementModel(p), base: placementModel(p), visible: true }))
    : [];
  if (resetCam || !cam) setView(state.view, true);
  dirty = true;
}

function setView(v, reset) {
  const ct = CONTAINERS[state.containerId];
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const target = [L / 2, 0.95, W / 2];
  const span = Math.max(L, 4);
  const presets = {
    iso: { theta: L > 8 ? 1.12 : 0.92, phi: 0.98, dist: span * 1.05 + 4.2 },
    door: { theta: 0.04, phi: 1.2, dist: 6.4 },
    top: { theta: Math.PI / 2, phi: 0.13, dist: span * 1.25 + 3 },
    side: { theta: Math.PI / 2, phi: 1.32, dist: span * 1.05 + 4 },
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
    cam.theta = p.theta;
    cam.phi = p.phi;
    cam.dist = p.dist;
  }
  if (v === 'door') cam.target = [L * 0.75, 0.95, W / 2];
  state.view = v;
  markView(v);
  dirty = true;
}

function markView(v) {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
}

// 積込み途中のアニメーション
function updateItemPositions() {
  const ct = CONTAINERS[state.containerId];
  const n = itemObjs.length;
  const s = Math.min(state.step, n);
  const k = Math.floor(s);
  const f = s - k;
  for (const o of itemObjs) {
    const ord = o.p.order;
    o.model = o.base;
    o.visible = ord <= k || (ord === k + 1 && f > 0);
    if (ord === k + 1 && f > 0) {
      const e = reduceMotion ? 1 : f;
      const m = new Float32Array(o.base);
      const lift = 0.28;
      let ox = 0;
      let oy = 0;
      let oz = 0;
      const t1 = Math.min(1, e / 0.7);
      const ease = 1 - Math.pow(1 - t1, 3);
      if (ct.door === 'side') oz = (1 - ease) * ((ct.W - o.p.y) / 1000 + 1.2);
      else ox = (1 - ease) * ((ct.L - o.p.x) / 1000 + 1.2);
      oy = e < 0.7 ? lift : lift * (1 - (e - 0.7) / 0.3);
      m[12] += ox;
      m[13] += oy;
      m[14] += oz;
      o.model = m;
    }
    const isHot = state.hover && state.hover === o.p.item.id;
    const isSel = state.selected && state.selected === o.p.item.id;
    o.tint = lin(isDark() ? '#F0973A' : '#D9780F');
    o.tintK = isSel ? 0.38 : isHot ? 0.22 : 0;
  }
}

function syncCogPin() {
  const done = state.step >= itemObjs.length;
  for (const o of staticObjs) if (o.cog) o.visible = done;
}

function frame(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
  lastT = t;
  const n = itemObjs.length;
  if (state.playing) {
    state.step = Math.min(n, state.step + dt * (n > 80 ? 6 : 4));
    if (state.step >= n) state.playing = false;
    syncStepUi();
    dirty = true;
  }
  if (dirty && renderer && cam) {
    dirty = false;
    updateItemPositions();
    syncCogPin();
    const ct = CONTAINERS[state.containerId];
    const sel = state.selected && itemObjs.find((o) => o.p.item.id === state.selected && o.visible);
    const lines = [...lineObjs];
    if (sel) {
      const p = sel.p;
      lines.push({
        mesh: selLine(p),
        color: lin(isDark() ? '#F0973A' : '#D9780F').map((v) => Math.pow(v, 1 / 2.2)),
      });
    }
    renderer.render({ objects: [...staticObjs, ...itemObjs], lines, env: envFor(ct) }, cam);
    placeTags(ct);
  }
  requestAnimationFrame(frame);
}

let selLineMesh = null;
let selLineKey = '';
function selLine(p) {
  const key = `${p.item.id}|${p.x}|${p.y}|${p.z}`;
  if (key !== selLineKey) {
    renderer.free(selLineMesh);
    const e = 0.006;
    selLineMesh = renderer.lineMesh(boxEdges(p.x / 1000 - e, p.z / 1000 - e, p.y / 1000 - e, (p.x + p.ex) / 1000 + e, (p.z + p.h) / 1000 + e, (p.y + p.ey) / 1000 + e));
    selLineKey = key;
  }
  return selLineMesh;
}

function placeTags(ct) {
  const L = ct.L / 1000;
  const W = ct.W / 1000;
  const H = ct.H / 1000;
  const tags = [
    { text: '奥（前壁）', at: [0, H + 0.25, W / 2] },
    ct.door === 'side' ? { text: '扉（両側面）', at: [L / 2, H + 0.25, W + 0.1] } : { text: '扉', at: [L, H + 0.25, W / 2] },
    { text: `${fmt(ct.L / 1000, 2)} m`, at: [L / 2, -0.2, W + 0.35] },
  ];
  const plan = currentPlan();
  if (plan && state.step >= itemObjs.length && itemObjs.length) {
    tags.push({ text: '重心', at: [plan.metrics.cogX / 1000, H + 0.08, plan.metrics.cogY / 1000] });
  }
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
    if (!p) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = t.text;
    el.style.left = `${p[0]}px`;
    el.style.top = `${p[1]}px`;
  });
}

// 視線とアイテムの交差
function pick(ev) {
  const rect = $('view').getBoundingClientRect();
  const r = cam.ray(ev.clientX - rect.left, ev.clientY - rect.top, rect.width, rect.height);
  let best = null;
  for (const o of itemObjs) {
    if (!o.visible) continue;
    const p = o.p;
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
    if (ok && t0 <= t1 && t1 > 0 && (!best || t0 < best.t)) best = { t: t0, o };
  }
  return best ? best.o.p : null;
}

function posText(p) {
  return `${p.strip + 1}列目の${p.side}・${p.tier + 1}段目`;
}

function showTip(p, ev) {
  const tip = $('tip');
  if (!p) {
    tip.hidden = true;
    return;
  }
  const it = p.item;
  tip.innerHTML = `<b>${it.label}</b><br><span class="mono">${it.ref}${it.ref.includes('概算') ? '' : ' 相当'}</span><br>
    幅${fmt(it.w)} × 奥行${fmt(it.d)} × 高さ${fmt(it.h)} mm ・ ${fmt(it.kg, 1)} kg<br>
    積込み順 <b class="mono">#${p.order}</b> ・ ${posText(p)}`;
  const vp = $('viewport').getBoundingClientRect();
  tip.hidden = false;
  const x = ev.clientX - vp.left + 14;
  const y = ev.clientY - vp.top + 14;
  tip.style.left = `${Math.min(x, vp.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(y, vp.height - tip.offsetHeight - 8)}px`;
}

function initView() {
  const canvas = $('view');
  renderer = new Renderer(canvas);
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.buttons) {
      showTip(null);
      return;
    }
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
  canvas.addEventListener('click', (ev) => {
    if (orbit && orbit.wasDrag()) return;
    const p = pick(ev);
    selectItem(p ? p.item.id : null, true);
  });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-color]').forEach((b) =>
    b.addEventListener('click', () => {
      state.color = b.dataset.color;
      document.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('legend').hidden = state.color !== 'cat';
      clearItemCache();
      buildScene(false);
    }),
  );
  const lg = $('legend');
  lg.innerHTML = Object.values(CATS)
    .map((c) => `<span><span class="dot" style="background:${c.tint}"></span>${c.name}</span>`)
    .join('');
  $('playBtn').addEventListener('click', () => {
    const n = itemObjs.length;
    if (state.playing) {
      state.playing = false;
    } else {
      if (state.step >= n) state.step = 0;
      state.playing = true;
      state.selected = null;
    }
    syncStepUi();
  });
  $('stepRange').addEventListener('input', (e) => {
    state.playing = false;
    state.step = Number(e.target.value);
    syncStepUi();
    dirty = true;
  });
  window.addEventListener('resize', () => {
    dirty = true;
  });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onTheme = () => {
    buildScene(false);
    renderPanels();
  };
  mq.addEventListener?.('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  requestAnimationFrame(frame);
}

// ---------- 結果パネル ----------
function selectItem(id, scroll) {
  state.selected = id;
  dirty = true;
  document.querySelectorAll('#steps li').forEach((li) => {
    const on = li.dataset.id === id;
    li.classList.toggle('on', on);
    if (on && scroll) li.scrollIntoView({ block: 'nearest' });
  });
  const plan = currentPlan();
  const p = plan && plan.placements.find((x) => x.item.id === id);
  setCaption(p);
}

function setCaption(p) {
  const plan = currentPlan();
  if (!plan) return;
  const n = plan.placements.length;
  if (p) {
    $('caption').innerHTML = `<span class="n">#${p.order}/${n}</span>${p.item.label}（${p.item.ref}${p.item.ref.includes('概算') ? '' : ' 相当'}）を ${posText(p)}へ`;
    return;
  }
  const k = Math.floor(state.step);
  if (k >= n) {
    const m = plan.metrics;
    const left = plan.leftovers.length ? `。積み残し ${plan.leftovers.length} 台` : '';
    const dun = plan.dunnage.length ? '縞模様の床は空きスペースで、重心を中央に寄せるために荷を前後にずらしています。ここは固定材で埋めて荷崩れを防ぎます。' : '';
    $('caption').innerHTML = `<span class="n">${n}/${m.total}</span>全${n}台の積込み完了。最も高い所で床から${(m.maxTop / 1000).toFixed(2)} m、${m.strips}列の壁で積んでいます${left}。${dun}`;
  } else if (k > 0) {
    const cur = plan.placements[k - 1];
    $('caption').innerHTML = `<span class="n">#${cur.order}/${n}</span>${cur.item.label}を ${posText(cur)}へ`;
  } else {
    $('caption').textContent = '空のコンテナ。再生すると奥から順に積み込みます。';
  }
}

function syncStepUi() {
  const n = itemObjs.length;
  const r = $('stepRange');
  r.max = String(n);
  r.value = String(Math.floor(state.step));
  $('stepNum').textContent = `${Math.floor(state.step)} / ${n}`;
  $('playBtn').textContent = state.playing ? '一時停止' : state.step >= n ? '積込み順を再生' : '続きを再生';
  const k = Math.floor(state.step);
  document.querySelectorAll('#steps li').forEach((li) => li.classList.toggle('done', Number(li.dataset.order) <= k));
  if (!state.selected) setCaption(null);
}

function renderPlans() {
  const host = $('plans');
  host.innerHTML = '';
  state.result.plans.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'plan';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === state.planIdx));
    const m = p.metrics;
    const best = i === state.result.bestIdx ? '<span class="badge">おすすめ</span>' : '';
    b.innerHTML = `<span class="k"><span>案${'ABC'[i]}</span>${best}</span><span class="t">${p.strategy.name}</span>
      <span class="s">${m.loaded}/${m.total}台 ・ 容積 ${(m.volUtil * 100).toFixed(0)}% ・ 重心 ${m.cogOffPct >= 0 ? '+' : ''}${m.cogOffPct.toFixed(1)}%</span>`;
    b.title = p.strategy.desc;
    b.addEventListener('click', () => {
      state.planIdx = i;
      state.selected = null;
      state.playing = false;
      state.step = p.placements.length;
      host.querySelectorAll('.plan').forEach((x, j) => x.setAttribute('aria-selected', String(j === i)));
      buildScene(false);
      renderPanels();
    });
    host.appendChild(b);
  });
}

function renderPanels() {
  const plan = currentPlan();
  if (!plan) return;
  const ct = CONTAINERS[state.containerId];
  const m = plan.metrics;
  $('planName').textContent = `案${'ABC'[state.planIdx]} ${plan.strategy.name}`;
  const tiles = [
    ['積載台数', `${m.loaded}<small>/ ${m.total} 台</small>`],
    ['容積率', `${(m.volUtil * 100).toFixed(1)}<small>%</small>`],
    ['床面使用率', `${(m.floorUtil * 100).toFixed(1)}<small>%</small>`],
    ['総重量', `${fmt(m.kg)}<small>kg</small>`],
    [`使用長さ（全長 ${(ct.L / 1000).toFixed(2)} m）`, `${(m.usedLen / 1000).toFixed(2)}<small>m</small>`],
    ['最大段数', `${m.maxTier}<small>段</small>`],
  ];
  $('tiles').innerHTML = tiles.map(([l, v]) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');

  // 重心ゲージ（コンテナ全長を幅100%として表示）
  const pct = (m.cogX / ct.L) * 100;
  $('marker').style.left = `${Math.max(0, Math.min(100, pct))}%`;
  const ok = $('bandOk');
  ok.style.left = '45%';
  ok.style.width = '10%';
  ok.style.background = 'var(--band-ok)';
  const wn = $('bandWarn');
  wn.style.left = '40%';
  wn.style.width = '20%';
  wn.style.background = 'var(--band-warn)';
  const off = Math.abs(m.cogOffMm) < 5 ? 'ほぼ中央' : `中央から${m.cogOffMm >= 0 ? '扉側' : '奥側'}へ ${fmt(Math.abs(m.cogOffMm))} mm`;
  const lat = Math.abs(m.cogLatMm) < 5 ? '左右 ほぼ中央' : `${m.cogLatMm >= 0 ? '右' : '左'}へ ${fmt(Math.abs(m.cogLatMm))} mm`;
  $('cogText').textContent = `${off} ・ ${lat}`;

  const checks = validatePlan(plan, ct, state.result.options);
  const word = { ok: 'OK', warn: '注意', ng: 'NG' };
  $('checks').innerHTML = checks
    .map((c) => {
      const note = c.note || (c.detail.length ? c.detail.slice(0, 3).join('、') : '');
      return `<li><span class="pill ${c.state}">${word[c.state]}</span><span>${c.label}</span>${note ? `<span class="note">${note}</span>` : ''}</li>`;
    })
    .join('');

  const lo = $('leftovers');
  if (plan.leftovers.length) {
    const cnt = new Map();
    for (const it of plan.leftovers) cnt.set(it.label, (cnt.get(it.label) || 0) + 1);
    lo.hidden = false;
    lo.innerHTML = `<b>積み残し ${plan.leftovers.length} 台</b>（床面が足りないため次便へ）<br>${[...cnt].map(([k, v]) => `${k} ×${v}`).join('、')}`;
  } else lo.hidden = true;

  const ol = $('steps');
  ol.innerHTML = plan.placements
    .map(
      (p) => `<li data-id="${p.item.id}" data-order="${p.order}"><span class="n">${p.order}</span><span>${p.item.label}</span><span class="w">${posText(p)} ・ ${fmt(p.item.kg, 1)} kg</span></li>`,
    )
    .join('');
  ol.querySelectorAll('li').forEach((li) => {
    li.addEventListener('mouseenter', () => {
      state.hover = li.dataset.id;
      dirty = true;
    });
    li.addEventListener('mouseleave', () => {
      state.hover = null;
      dirty = true;
    });
    li.addEventListener('click', () => {
      state.playing = false;
      state.step = Number(li.dataset.order);
      selectItem(li.dataset.id, false);
      syncStepUi();
    });
  });
  syncStepUi();
}

// ---------- 実行 ----------
function run(resetCam) {
  const btn = $('generate');
  btn.disabled = true;
  btn.textContent = '計算中…';
  setTimeout(() => {
    const ct = CONTAINERS[state.containerId];
    state.items = generateItems(state.counts, state.seed);
    const t0 = performance.now();
    state.result = planLoad(state.items, ct, { seed: state.seed, gap: state.gap, topClear: state.topClear });
    const ms = performance.now() - t0;
    const runs = state.result.options.iterations * state.result.plans.length;
    $('calcInfo').textContent = `${state.items.length}台について ${runs} 通りの詰め方を試し、方針ごとに最良の案を残しました（${fmt(ms)} ms）。`;
    state.planIdx = state.result.bestIdx;
    state.selected = null;
    state.playing = false;
    state.step = state.result.plans[state.planIdx].placements.length;
    clearItemCache();
    buildScene(resetCam);
    renderPlans();
    renderPanels();
    btn.disabled = false;
    btn.textContent = '積付けパターンを作る';
  }, 30);
}

function boot() {
  buildInputs();
  try {
    initView();
  } catch (err) {
    $('viewport').innerHTML = `<p style="padding:16px">3D表示を開始できませんでした（${err.message}）。積付けの結果は右の一覧で確認できます。</p>`;
    renderer = null;
  }
  if (renderer) run(true);
  else {
    const ct = CONTAINERS[state.containerId];
    state.items = generateItems(state.counts, state.seed);
    state.result = planLoad(state.items, ct, { seed: state.seed });
    state.planIdx = state.result.bestIdx;
    renderPlans();
    renderPanels();
  }
}

boot();
