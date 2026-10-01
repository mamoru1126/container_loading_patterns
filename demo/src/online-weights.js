// オンライン積付けの評価の重み（test/train-online.mjs で遺伝的アルゴリズムにより学習した結果）
export const LEARNED_WEIGHTS = {
  "back": 10,
  "height": 0.1636,
  "side": 0.1104,
  "contact": 1,
  "floor": 1.4306,
  "headroom": 0.6027,
  "mix": 0.1533,
  "flat": 0.103,
  "dead": 0.9377
};

// 学習の記録（history は世代ごとの最良の平均容積率 %、test は学習に使っていない流れでの成績）
export const TRAINING_INFO = {
  "generations": 30,
  "population": 24,
  "trainFill": 46,
  "history": [
    43.91,
    43.91,
    44.71,
    44.95,
    45.03,
    45.3,
    45.4,
    45.53,
    45.72,
    45.72,
    45.72,
    45.72,
    45.72,
    45.72,
    45.72,
    45.72,
    45.72,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    45.74,
    46.03
  ],
  "test": {
    "learned": {
      "fill": 47.1,
      "count": 62.4
    },
    "manual": {
      "fill": 46,
      "count": 61.3
    },
    "dblf": {
      "fill": 46,
      "count": 61.4
    }
  },
  "seconds": 340
};
