// セーブデータ（ブラウザの localStorage に保存）
const KEY = 'katsuo_save_v2';

function defaults(isMobile) {
  return {
    coins: 0, totalCoins: 0,
    shop: {},
    ach: {},
    stats: { kills: 0, runs: 0, bestTime: 0, playTime: 0, maxCombo: 0, evolved: {}, bosses: {} },
    ranking: [],
    settings: { bgm: 0.7, se: 0.8, shake: true, dmgNum: true, quality: isMobile ? 'low' : 'high', muted: false },
    char: 'taro', diff: 'normal', tips: 0,
  };
}

function merge(base, data) {
  for (const k in data) {
    if (data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]) && base[k] && typeof base[k] === 'object') merge(base[k], data[k]);
    else base[k] = data[k];
  }
  return base;
}

export function loadSave(isMobile) {
  const s = defaults(isMobile);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) merge(s, JSON.parse(raw));
    else {
      // 旧バージョンからの引き継ぎ
      const old = JSON.parse(localStorage.getItem('katsuo_best') || 'null');
      if (old && old.time) {
        s.stats.bestTime = old.time;
        s.ranking.push({ time: old.time, kills: old.kills || 0, level: old.level || 1, char: 'taro', diff: 'normal', date: Date.now() });
      }
      if (localStorage.getItem('katsuo_muted') === '1') s.settings.muted = true;
    }
  } catch (e) { /* noop */ }
  return s;
}

export function persist(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('katsuo_best'); } catch (e) { /* noop */ }
}
