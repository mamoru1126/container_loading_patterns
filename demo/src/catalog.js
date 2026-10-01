// 品目カタログとコンテナ仕様
// 寸法・質量は各メーカー公表の仕様値（2026年10月時点で確認）を基準にしている。
// 廃家電はメーカー・年式が混在するため、生成時に寸法へ ±4% のばらつきを与える。

export const CONTAINERS = {
  jr12: {
    id: 'jr12',
    name: 'JR 12ft（19D形）',
    short: '12ft',
    L: 3642, W: 2270, H: 2252,
    payloadKg: 5000,
    door: 'side', // 両側面開き
    frame: '#8E3B2E',
    note: '国内の鉄道輸送で一般的な5tコンテナ。両側面に扉がある。',
    src: 'https://www.weblio.jp/content/19d',
  },
  iso20: {
    id: 'iso20',
    name: 'ISO 20ft ドライ',
    short: '20ft',
    L: 5900, W: 2350, H: 2390,
    payloadKg: 28200,
    door: 'end',
    frame: '#3F5B6B',
    note: '海上・陸上で最も一般的なサイズ。妻側（片側の端）に扉がある。',
    src: 'https://gofreight.com/blog/education/shipping-container-dimensions-everything-you-need-to-know.html',
  },
  iso40: {
    id: 'iso40',
    name: 'ISO 40ft ドライ',
    short: '40ft',
    L: 12030, W: 2350, H: 2390,
    payloadKg: 28800,
    door: 'end',
    frame: '#3F5B6B',
    note: '20ftの約2倍の長さ。',
    src: 'https://gofreight.com/blog/education/shipping-container-dimensions-everything-you-need-to-know.html',
  },
  iso40hc: {
    id: 'iso40hc',
    name: 'ISO 40ft ハイキューブ',
    short: '40ft HC',
    L: 12030, W: 2350, H: 2700,
    payloadKg: 28560,
    door: 'end',
    frame: '#3F5B6B',
    note: '40ftより天井が約30cm高い。',
    src: 'https://gofreight.com/blog/education/shipping-container-dimensions-everything-you-need-to-know.html',
  },
};

// 品目の区分と積み重ねルール
// carries: この区分の上に載せてよい区分
// topLoadKg: 上に載せてよい合計重量（1台あたり）
export const CATS = {
  fridge: { name: '冷蔵庫', carries: ['acin'], topLoadKg: 20, maxSame: 1, tint: '#3E7CB1', rule: '正立のみ。上に載せてよいのはエアコン室内機だけ' },
  freezer: { name: '冷凍庫', carries: ['acin', 'acout', 'dryer'], topLoadKg: 30, maxSame: 1, tint: '#6FA8CF', rule: '正立のみ。上は30kgまで' },
  washer: { name: '縦型洗濯機', carries: ['washer', 'dryer', 'acout', 'crt', 'acin'], topLoadKg: 50, maxSame: 2, tint: '#2E9E83', rule: '2段まで積み重ね可。上は50kgまで' },
  drum: { name: 'ドラム式洗濯機', carries: ['washer', 'drum', 'dryer', 'acout', 'crt', 'acin'], topLoadKg: 90, maxSame: 2, tint: '#1F6B5A', rule: '頑丈なので土台向き。上は90kgまで' },
  dryer: { name: '衣類乾燥機', carries: ['dryer', 'acout', 'acin'], topLoadKg: 30, maxSame: 2, tint: '#7DB89B', rule: '上は30kgまで' },
  lcd: { name: '液晶テレビ', carries: [], topLoadKg: 0, maxSame: 1, tint: '#7A5BA6', rule: 'スタンドを付けたまま立てて並べる。上には何も載せない', pack: true },
  crt: { name: 'ブラウン管テレビ', carries: ['crt', 'acin'], topLoadKg: 45, maxSame: 2, tint: '#A3578F', rule: '同じか小さいブラウン管なら2段まで' },
  acin: { name: 'エアコン室内機', carries: ['acin'], topLoadKg: 40, maxSame: 4, tint: '#D9922B', rule: '背面を下にして寝かせる。2台並べて載せられる。4段まで', group: true },
  acout: { name: 'エアコン室外機', carries: ['acout', 'acin'], topLoadKg: 60, maxSame: 3, tint: '#B8642A', rule: '正立のみ（圧縮機があるため）。3段まで', group: true },
};

// 品目タイプ（w: 幅, d: 奥行, h: 高さ, 単位 mm / kg）
// エアコン室内機は輸送時に寝かせるため、h に設置時の奥行、d に設置時の高さを入れている。
export const TYPES = [
  { id: 'fridge_s', cat: 'fridge', label: '冷蔵庫 2ドア 180L', ref: 'Panasonic NR-B18C3', w: 497, d: 595, h: 1350, kg: 41, src: 'https://panasonic.jp/reizo/products/NR-B18C3/spec.html' },
  { id: 'fridge_m', cat: 'fridge', label: '冷蔵庫 3ドア 350L', ref: 'Sharp SJ-W358K', w: 600, d: 665, h: 1690, kg: 68, src: 'https://jp.sharp/reizo/products/sjw358k/spec/' },
  { id: 'fridge_l', cat: 'fridge', label: '冷蔵庫 6ドア 500L', ref: 'Sharp SJ-X500M', w: 685, d: 699, h: 1833, kg: 88, src: 'https://jp.sharp/reizo/products/sjx500m/spec' },
  { id: 'freezer', cat: 'freezer', label: '上開き冷凍庫 100L', ref: 'Haier JF-NC100A', w: 545, d: 490, h: 870, kg: 25.5, src: 'https://www.haier.com/jp/freezers/jf-nc100a.shtml' },
  { id: 'washer', cat: 'washer', label: '縦型洗濯機 8kg', ref: 'Panasonic NA-FA8H1', w: 599, d: 618, h: 1024, kg: 42, src: 'https://rank-king.jp/product/689468' },
  { id: 'drum', cat: 'drum', label: 'ドラム式洗濯乾燥機 11kg', ref: 'Hitachi BD-SX110GL', w: 630, d: 716, h: 1065, kg: 81, src: 'https://rank-king.jp/product/449038/specs' },
  { id: 'dryer', cat: 'dryer', label: '衣類乾燥機 6kg', ref: 'Hitachi DE-N60WV', w: 630, d: 516, h: 670, kg: 26, src: 'https://kadenfan.hitachi.co.jp/wash/lineup/den60wv/' },
  { id: 'lcd32', cat: 'lcd', label: '液晶テレビ 32型', ref: '32型の一般的な寸法（概算）', w: 715, d: 175, h: 470, kg: 5.5, src: '' },
  { id: 'lcd43', cat: 'lcd', label: '液晶テレビ 43型', ref: 'Sharp 4T-C43FN2', w: 957, d: 238, h: 621, kg: 14.5, src: 'https://rank-king.jp/product/722153/specs' },
  { id: 'lcd55', cat: 'lcd', label: '液晶テレビ 55型', ref: 'Sharp 4T-C55FN1', w: 1228, d: 281, h: 775, kg: 23, src: 'https://rank-king.jp/product/721824/specs' },
  { id: 'crt21', cat: 'crt', label: 'ブラウン管テレビ 21型', ref: 'Panasonic TH-21FA8', w: 648, d: 485, h: 473, kg: 24, src: 'https://panasonic.jp/viera/products/TH-21FA8/spec.html' },
  { id: 'crt29', cat: 'crt', label: 'ブラウン管テレビ 29型', ref: 'Panasonic TH-29FB8', w: 786, d: 512, h: 578, kg: 43, src: 'https://panasonic.jp/viera/products/TH-29FB8/spec.html' },
  { id: 'acin_s', cat: 'acin', label: 'エアコン室内機 2.2kW', ref: 'Panasonic CS-222DJR', w: 780, d: 285, h: 239, kg: 8, src: 'https://panasonic.jp/aircon/products/CS-222DJR/spec.html' },
  { id: 'acin_l', cat: 'acin', label: 'エアコン室内機 4.0kW', ref: 'Panasonic CS-402DX2', w: 799, d: 295, h: 385, kg: 15.5, src: 'https://ac.fj-tec.co.jp/24897/' },
  { id: 'acout_s', cat: 'acout', label: 'エアコン室外機 2.2kW', ref: 'Panasonic CS-222DJR', w: 675, d: 285, h: 555, kg: 18, src: 'https://panasonic.jp/aircon/products/CS-222DJR/spec.html' },
  { id: 'acout_l', cat: 'acout', label: 'エアコン室外機 4.0kW', ref: 'Panasonic CS-402DX2', w: 849, d: 319, h: 699, kg: 46, src: 'https://ac.fj-tec.co.jp/24897/' },
];

export const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

// 外観の色（sRGB）。廃家電らしく、メーカーや年式でばらつく。
export const PALETTES = {
  fridge: [['#F1F1ED', 5], ['#C7CBCE', 2], ['#D9CCB4', 2], ['#E7E3DA', 2], ['#3B3431', 1]],
  fridge_l: [['#F1F1ED', 2], ['#C7CBCE', 1], ['#D9CCB4', 2], ['#3B3431', 2], ['#5A4A3F', 1]],
  freezer: [['#F3F3F0', 3], ['#E8E8E3', 1]],
  washer: [['#F3F4F2', 4], ['#E8ECEE', 2], ['#EFEDE6', 1]],
  drum: [['#EEECE6', 3], ['#D4C7AF', 2], ['#A2A7AC', 1], ['#5C5853', 1]],
  dryer: [['#F2F3F1', 3], ['#E6E7E2', 1]],
  lcd: [['#1D1E21', 1]],
  crt: [['#BBBEC2', 3], ['#2A2B2E', 3], ['#62666B', 2]],
  acin: [['#F5F5F2', 4], ['#EEEEE9', 1]],
  acout: [['#E4DECD', 3], ['#EAE6D9', 2], ['#D8D3C3', 1]],
};

// 初期構成（20ftコンテナにほぼ満載で全台が積める程度）
export const DEFAULT_COUNTS = {
  fridge_s: 4, fridge_m: 5, fridge_l: 3, freezer: 1,
  washer: 8, drum: 3, dryer: 2,
  lcd32: 5, lcd43: 3, lcd55: 2,
  crt21: 3, crt29: 2,
  acin_s: 7, acin_l: 2, acout_s: 7, acout_l: 2,
};

// 再現性のある乱数（mulberry32）
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(list, rng) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[list.length - 1][0];
}

const round5 = (v) => Math.round(v / 5) * 5;

// 台数指定から個体を生成する
// 1台分の個体を作る（寸法・重量・色にばらつきを与える）
export function makeItem(t, rng, id, serial) {
  const sw = 1 + (rng() - 0.5) * 0.08;
  const sd = 1 + (rng() - 0.5) * 0.08;
  const sh = 1 + (rng() - 0.5) * 0.06;
  // テレビやエアコンは型ごとの寸法差が小さいので控えめに
  const k = t.cat === 'lcd' || t.cat === 'acin' ? 0.4 : 1;
  const w = round5(t.w * (1 + (sw - 1) * k));
  const d = round5(t.d * (1 + (sd - 1) * k));
  const h = round5(t.h * (1 + (sh - 1) * k));
  const volRatio = (w * d * h) / (t.w * t.d * t.h);
  const kg = Math.round(t.kg * volRatio * (1 + (rng() - 0.5) * 0.08) * 2) / 2;
  const palette = PALETTES[t.id] || PALETTES[t.cat];
  return {
    id,
    serial,
    type: t.id,
    cat: t.cat,
    label: t.label,
    ref: t.ref,
    w, d, h, kg,
    color: pickWeighted(palette, rng),
    wear: 0.93 + rng() * 0.07,
    variant: rng(),
  };
}

// 台数指定から個体を生成する
export function generateItems(counts, seed = 1) {
  const rng = makeRng(seed);
  const items = [];
  let serial = 0;
  for (const t of TYPES) {
    const n = Math.max(0, Math.floor(counts[t.id] || 0));
    for (let i = 0; i < n; i++) {
      serial += 1;
      items.push(makeItem(t, rng, `${t.id}-${String(i + 1).padStart(2, '0')}`, serial));
    }
  }
  return items;
}

// 品目の比率（weights: タイプID → 重み）に従って、ランダムな順で家電が流れてくる列を作る
export function makeStream(seed = 1, weights = DEFAULT_COUNTS) {
  const rng = makeRng(seed * 104729 + 7);
  const list = TYPES.filter((t) => (weights[t.id] || 0) > 0).map((t) => [t, weights[t.id]]);
  let serial = 0;
  return function next() {
    const t = pickWeighted(list, rng);
    serial += 1;
    return makeItem(t, rng, `#${String(serial).padStart(3, '0')}`, serial);
  };
}

// 合計台数を指定して、初期構成の比率で台数を割り振る
export function countsForTotal(total, seed = 1) {
  const rng = makeRng(seed * 7919 + 13);
  const base = DEFAULT_COUNTS;
  const sum = Object.values(base).reduce((s, v) => s + v, 0);
  const out = {};
  const ids = Object.keys(base);
  let assigned = 0;
  for (const id of ids) {
    const v = Math.floor((base[id] / sum) * total);
    out[id] = v;
    assigned += v;
  }
  while (assigned < total) {
    const id = pickWeighted(ids.map((x) => [x, base[x]]), rng);
    out[id] += 1;
    assigned += 1;
  }
  return out;
}
