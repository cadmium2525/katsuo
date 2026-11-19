// ゲームデータ（武器・パッシブ・進化・敵・ボス・キャラ・購買部・実績・難易度）

export const WEAPONS = {
  tataki: { name: '鰹のたたき', icon: '🐟', max: 8, need: 'sendo', desc: ['やたらリアルな鰹で迫る鯖をぶっ叩く', 'ダメージ +30%', '鰹が大きくなる（範囲 +15%）', '往復ビンタ：振り抜いた後にもう一撃', 'ダメージ +30%・攻撃速度 +15%', '鰹がさらに巨大化（範囲 +20%）', 'ダメージ +30%・ノックバック強化', '大回転たたき：360°ぶん回す'] },
  warayaki: { name: '藁焼きの炎', icon: '🔥', max: 8, need: 'ocha', desc: ['藁の炎をまとい周囲を炙る（鰹も香ばしく）', 'ダメージ +30%', '範囲 +15%', 'ダメージ +30%', '範囲 +15%・燃焼間隔 短縮', 'ダメージ +35%', '範囲 +20%', '業火：ダメージ +50%'] },
  nage: { name: '投げ鰹', icon: '🪃', max: 8, need: 'zori', desc: ['鰹をブーメランのように投げる（貫通）', '投げる数 +1', 'ダメージ +30%', '飛距離・速度 UP', '投げる数 +1', 'ダメージ +30%', '投げる数 +1', 'ダメージ +50%'] },
  bushi: { name: '鰹節ショット', icon: '🍂', max: 8, need: 'hachimaki', desc: ['削りたての鰹節を飛ばして貫通攻撃', '発射数 +1', '発射数 +1・ダメージ +25%', '発射数 +1・貫通 +1', '発射数 +1・ダメージ +25%', '発射数 +1・連射 UP・貫通 +1', '発射数 +1・ダメージ +30%', '発射数 +1・貫通 +1'] },
  ponzu: { name: 'ポン酢の沼', icon: '🍋', max: 8, need: 'dha', desc: ['ポン酢をぶちまけ鯖を減速＆ダメージ', '範囲 +12%', '沼の数 +1', 'ダメージ +30%', '沼の数 +1', '範囲 +12%・ダメージ +30%', '沼の数 +1', 'ダメージ +50%・持続 UP'] },
  yakumi: { name: '薬味オービット', icon: '🧄', max: 8, need: 'ami', desc: ['にんにく・生姜・ネギが周囲を回る', 'ダメージ +30%', '薬味 +1', 'ダメージ +30%・半径 UP', '薬味 +1', 'ダメージ +35%・半径 UP', '薬味 +1', '薬味 +1・回転速度 UP'] },
  deba: { name: '出刃包丁', icon: '🔪', max: 8, need: 'maekake', desc: ['進行方向へ出刃包丁を投げる（貫通）', '本数 +1', 'ダメージ +30%', '貫通 +1', '本数 +1', 'ダメージ +30%・連射 UP', '本数 +1', '貫通 +2・ダメージ +30%'] },
  kamome: { name: 'カモメ', icon: '🕊️', max: 8, need: 'tairyo', desc: ['カモメが鯖めがけて急降下する', 'カモメ +1', 'ダメージ +30%', '急降下の間隔 短縮', 'カモメ +1', 'ダメージ +30%・範囲 UP', 'カモメ +1', 'ダメージ +50%'] },
  ippon: { name: '一本釣り', icon: '🎣', max: 8, need: 'ozara', desc: ['空から釣り針が降り、鯖を釣り上げる', '針 +1', 'ダメージ +30%', '間隔 短縮', '針 +1', 'ダメージ +30%', '針 +1', 'ダメージ +50%・範囲 UP'] },
};

// 進化：武器Lv8 ＋ 対応パッシブ所持 → ボス/でかいサバの宝箱で進化
export const EVOS = {
  tataki: { name: '鰹大旋風', icon: '🌀', desc: '常に大回転し、振るたびに衝撃波が走る' },
  warayaki: { name: '藁焼き大祭', icon: '🏮', desc: '炎が巨大化し、鯖に燃え移る（延焼）' },
  nage: { name: '鰹ミサイル', icon: '🚀', desc: '鰹が鯖を追尾し、着弾で爆発する' },
  bushi: { name: '削り節ストーム', icon: '🌪️', desc: '全方位へ鰹節の嵐を巻き起こす' },
  ponzu: { name: 'ポン酢の海', icon: '🌊', desc: '巨大な沼。上に立つとHPが回復する' },
  yakumi: { name: '薬味曼荼羅', icon: '☸️', desc: '二重の薬味の輪が逆回転する' },
  deba: { name: '妖刀 鰹切り', icon: '⚔️', desc: '八方へ無限に貫通する刃を放つ' },
  kamome: { name: 'カモメ艦隊', icon: '✈️', desc: '大量のカモメが爆撃する' },
  ippon: { name: '大漁一本釣り', icon: '🐋', desc: '針が倍増し、周囲の鯖に連鎖する' },
};

export const PASSIVES = {
  sendo: { name: '鮮度', icon: '✨', max: 5, desc: '全ダメージ +12%' },
  zori: { name: '草履', icon: '👡', max: 5, desc: '移動速度 +8%' },
  dha: { name: 'DHA', icon: '💊', max: 5, desc: '最大HP +20（同量回復）' },
  ocha: { name: '緑茶', icon: '🍵', max: 5, desc: 'HP自然回復 +0.4/秒' },
  ami: { name: '漁網', icon: '🕸️', max: 5, desc: '経験値の回収範囲 +35%' },
  tairyo: { name: '大漁旗', icon: '🎏', max: 5, desc: '獲得経験値 +12%' },
  hachimaki: { name: 'ねじり鉢巻', icon: '🎌', max: 5, desc: 'クールダウン -7%' },
  maekake: { name: '前掛け', icon: '🛡️', max: 5, desc: '被ダメージ -1' },
  ozara: { name: '大皿', icon: '🍽️', max: 5, desc: '攻撃範囲 +10%' },
  maneki: { name: '招き猫', icon: '🐈', max: 5, desc: '運 +10%（選択肢・ドロップ・会心）' },
  dashi: { name: '出汁', icon: '🥣', max: 2, desc: '飛び道具の数 +1' },
};

export const EXTRAS = {
  sendoInf: { name: '鮮度∞', icon: '💪', desc: '全ダメージ +8%（上限なし）' },
  onigiri: { name: 'おにぎり', icon: '🍙', desc: 'HPを50回復' },
  koban: { name: '小判', icon: '🪙', desc: '小判を25枚もらう' },
};

export const TYPES = {
  masaba: { name: '真サバ', hp: 10, spd: 2.3, dmg: 8, xp: 1, sc: 1.0, model: 'masaba' },
  gomasaba: { name: 'ゴマサバ', hp: 7, spd: 3.5, dmg: 6, xp: 1, sc: 0.85, model: 'gomasaba' },
  kinka: { name: '金華サバ', hp: 55, spd: 1.8, dmg: 14, xp: 4, sc: 1.5, model: 'kinka' },
  shime: { name: 'しめ鯖', hp: 40, spd: 2.1, dmg: 10, xp: 3, sc: 1.05, model: 'shime', ranged: true },
  can: { name: 'サバ缶', hp: 130, spd: 1.5, dmg: 18, xp: 8, sc: 1.0, model: 'can' },
  battera: { name: 'バッテラ', hp: 170, spd: 1.6, dmg: 16, xp: 8, sc: 1.0, model: 'battera', split: true },
  yaki: { name: '焼きサバ', hp: 90, spd: 3.1, dmg: 16, xp: 6, sc: 1.15, model: 'yaki' },
  kosaba: { name: '小サバ', hp: 6, spd: 4.4, dmg: 5, xp: 0.5, sc: 0.55, model: 'gomasaba' },
  taru: { name: '樽', hp: 1, spd: 0, dmg: 0, xp: 0, sc: 1.0, model: 'taru', prop: true },
};

export const BOSSES = {
  nushi: { name: 'ヌシサバ', sub: 'この海の主', hp: 420, spd: 2.7, dmg: 15, sc: 4.2, r: 1.7 },
  kan: { name: 'サバ缶大魔神', sub: '缶詰工場の怨念', hp: 1000, spd: 1.7, dmg: 20, sc: 3.4, r: 1.5 },
  miso: { name: 'サバ味噌煮将軍', sub: '煮込み軍団の総大将', hp: 1600, spd: 2.3, dmg: 24, sc: 4.6, r: 1.9 },
  kami: { name: '鯖神', sub: 'すべての鯖の頂点', hp: 20000, spd: 2.0, dmg: 30, sc: 6.5, r: 2.6 },
};
export const BOSS_ORDER = ['nushi', 'kan', 'miso'];

export const CHARS = {
  taro: { name: 'カツオ太郎', title: '土佐の漁師', icon: '🎣', weapon: 'tataki', desc: 'バランス型。鰹のたたき Lv2 で開始', mods: {}, look: {}, unlock: null },
  tetsu: { name: '板前の鉄', title: '包丁一筋三十年', icon: '🔪', weapon: 'deba', desc: '出刃包丁も持って開始。攻撃力 +10%、最大HP -10', mods: { dmg: 0.1, hp: -10 }, look: { happi: 0xf4f4f4, trim: '#1f3a7a', band: 0x1f3a7a, obi: 0x1f3a7a, text: ['板', '前'], back: '包' }, unlock: 't5' },
  nagisa: { name: '海女のなぎさ', title: '素潜り名人', icon: '🤿', weapon: 'kamome', desc: 'カモメを連れて開始。移動速度 +15%、回収範囲 +20%', mods: { speed: 0.15, magnet: 0.2 }, look: { happi: 0xfafafa, trim: '#e05a7a', pants: 0xfafafa, longHair: true, obi: 0xe05a7a, text: ['海', '女'], back: '海' }, unlock: 'k3000' },
  fushi: { name: 'ふし爺', title: '鰹節職人', icon: '👴', weapon: 'bushi', desc: '鰹節ショットも持って開始。攻撃範囲 +15%、移動速度 -8%', mods: { area: 0.15, speed: -0.08 }, look: { happi: 0x7a5a2a, trim: '#f0d8a0', obi: 0x3a2a10, bald: true, beard: true, text: ['節', '屋'], back: '節' }, unlock: 'bossKan' },
  tama: { name: '漁港のタマ', title: '猫', icon: '🐱', weapon: 'ippon', desc: '一本釣りも持って開始。運 +30%、会心率 +5%、最大HP -30', mods: { luck: 0.3, crit: 0.05, hp: -30 }, look: { cat: true, skin: 0xf0a050, happi: 0xc62828, trim: '#ffffff', text: ['に', 'ゃ'], back: '猫' }, unlock: 'coin1000' },
  kogane: { name: '黄金の漁師', title: '伝説', icon: '👑', weapon: 'tataki', desc: '黄金の鰹を振るう。全能力 +10%、小判 +50%', mods: { dmg: 0.1, speed: 0.1, hp: 10, area: 0.1, coin: 0.5 }, look: { gold: true, back: '金' }, unlock: 'bossKami' },
};

export const SHOP = [
  { id: 'power', name: '腕っぷし', icon: '💪', desc: '攻撃力 +5%', max: 10, base: 60 },
  { id: 'hp', name: '頑丈な体', icon: '❤️', desc: '最大HP +10', max: 5, base: 60 },
  { id: 'regen', name: '回復力', icon: '🍵', desc: 'HP自然回復 +0.2/秒', max: 5, base: 80 },
  { id: 'speed', name: '健脚', icon: '👟', desc: '移動速度 +4%', max: 5, base: 70 },
  { id: 'armor', name: 'ゴム長靴', icon: '🥾', desc: '被ダメージ -1', max: 3, base: 150 },
  { id: 'xp', name: '勉強熱心', icon: '📚', desc: '獲得経験値 +6%', max: 5, base: 80 },
  { id: 'magnet', name: '長いタモ網', icon: '🥅', desc: '回収範囲 +15%', max: 5, base: 50 },
  { id: 'cd', name: '段取り上手', icon: '⏱️', desc: 'クールダウン -3%', max: 5, base: 100 },
  { id: 'area', name: '大きな俎板', icon: '🔲', desc: '攻撃範囲 +4%', max: 5, base: 100 },
  { id: 'luck', name: 'お守り', icon: '🧿', desc: '運 +8%', max: 5, base: 80 },
  { id: 'greed', name: '金運', icon: '💰', desc: '獲得小判 +10%', max: 5, base: 60 },
  { id: 'dash', name: '身のこなし', icon: '💨', desc: '回避ステップの間隔 -10%', max: 3, base: 120 },
  { id: 'gauge', name: '闘魂', icon: '🔥', desc: '鰹乱舞ゲージの溜まり +15%', max: 3, base: 150 },
  { id: 'reroll', name: 'くじ運', icon: '🎲', desc: 'リロール +1回', max: 5, base: 120 },
  { id: 'skip', name: '見送り', icon: '⏭️', desc: 'スキップ +1回', max: 3, base: 80 },
  { id: 'banish', name: 'お祓い', icon: '🚫', desc: '封印 +1回', max: 3, base: 120 },
  { id: 'revive', name: '根性', icon: '✊', desc: '倒れても1回だけ復活', max: 1, base: 1500 },
];
export const shopCost = (item, lv) => Math.round(item.base * Math.pow(1.6, lv));

export const DIFFS = {
  normal: { name: 'ふつう', icon: '🐟', hp: 1, dmg: 1, spawn: 1, coin: 1, unlock: null, desc: '標準の難易度' },
  hot: { name: '激辛', icon: '🌶️', hp: 1.7, dmg: 1.35, spawn: 1.2, coin: 1.6, unlock: 't5', desc: '敵HP×1.7・攻撃×1.35・小判×1.6' },
  hell: { name: '地獄', icon: '👹', hp: 2.8, dmg: 1.8, spawn: 1.4, coin: 2.5, unlock: 'hot10', desc: '敵HP×2.8・攻撃×1.8・小判×2.5' },
};

// r: 今回のラン, s: セーブデータ（ラン終了前の値）
export const ACH = [
  { id: 'first', name: '初漁', desc: '初めて出航する', reward: 20, test: r => r.time >= 1 },
  { id: 't5', name: '一人前の漁師', desc: '5分間生き延びる', reward: 50, test: r => r.time >= 300 },
  { id: 't10', name: '荒波の男', desc: '10分間生き延びる', reward: 100, test: r => r.time >= 600 },
  { id: 't15', name: '藁焼き名人', desc: '15分間生き延びる', reward: 200, test: r => r.time >= 900 },
  { id: 't20', name: 'カツオ神', desc: '20分間生き延びる', reward: 400, test: r => r.time >= 1200 },
  { id: 't30', name: '伝説のたたき職人', desc: '30分間生き延びる', reward: 1000, test: r => r.time >= 1800 },
  { id: 'k1000', name: '千本たたき', desc: '1回で1000匹撃破', reward: 50, test: r => r.kills >= 1000 },
  { id: 'k5000', name: '鯖の天敵', desc: '1回で5000匹撃破', reward: 150, test: r => r.kills >= 5000 },
  { id: 'k20000', name: '大量鯖獲', desc: '1回で2万匹撃破', reward: 400, test: r => r.kills >= 20000 },
  { id: 'k3000', name: '鯖を知る者', desc: '累計3000匹撃破', reward: 80, test: (r, s) => s.stats.kills + r.kills >= 3000 },
  { id: 'k100000', name: '鯖の歴史を変えた者', desc: '累計10万匹撃破', reward: 500, test: (r, s) => s.stats.kills + r.kills >= 100000 },
  { id: 'bossNushi', name: '主を〆る', desc: 'ヌシサバを倒す', reward: 60, test: r => r.bosses.nushi },
  { id: 'bossKan', name: '開缶', desc: 'サバ缶大魔神を倒す', reward: 100, test: r => r.bosses.kan },
  { id: 'bossMiso', name: '味噌煮完食', desc: 'サバ味噌煮将軍を倒す', reward: 150, test: r => r.bosses.miso },
  { id: 'bossKami', name: '神殺し', desc: '鯖神を倒す', reward: 1000, test: r => r.bosses.kami },
  { id: 'evo1', name: '進化の兆し', desc: '武器を進化させる', reward: 100, test: r => r.evolved >= 1 },
  { id: 'evo3', name: '三種の神器', desc: '1回で3つの武器を進化', reward: 300, test: r => r.evolved >= 3 },
  { id: 'c100', name: '百連撃', desc: '100連撃を達成', reward: 40, test: r => r.maxCombo >= 100 },
  { id: 'c500', name: '五百連撃', desc: '500連撃を達成', reward: 120, test: r => r.maxCombo >= 500 },
  { id: 'c2000', name: '無限たたき', desc: '2000連撃を達成', reward: 300, test: r => r.maxCombo >= 2000 },
  { id: 'sp1', name: '鰹乱舞', desc: '鰹乱舞を発動する', reward: 30, test: r => r.specials >= 1 },
  { id: 'hit10k', name: '一撃一万', desc: '一撃で1万ダメージ', reward: 80, test: r => r.maxHit >= 1e4 },
  { id: 'hit1m', name: 'インフレの申し子', desc: '一撃で100万ダメージ', reward: 300, test: r => r.maxHit >= 1e6 },
  { id: 'lv50', name: '叩き上げ', desc: '1回でLv50に到達', reward: 100, test: r => r.level >= 50 },
  { id: 'nodmg', name: '無傷の漁', desc: '最初の3分間ノーダメージ', reward: 100, test: r => r.noDmg3 },
  { id: 'coin1000', name: '小金持ち', desc: '小判を累計1000枚集める', reward: 100, test: (r, s) => s.totalCoins + r.coins >= 1000 },
  { id: 'hot10', name: '激辛の漁', desc: '激辛以上で10分生き延びる', reward: 300, test: r => r.diff !== 'normal' && r.time >= 600 },
  { id: 'hell10', name: '地獄の漁', desc: '地獄で10分生き延びる', reward: 800, test: r => r.diff === 'hell' && r.time >= 600 },
  { id: 'allchar', name: '全員集合', desc: '全キャラクターを解放する', reward: 500, test: (r, s) => Object.keys(CHARS).every(k => !CHARS[k].unlock || s.ach[CHARS[k].unlock]) },
];

export const RANKS = [[60, 'サバの餌'], [180, '見習い漁師'], [300, '一本釣り職人'], [600, '土佐の荒波'], [900, '藁焼き名人'], [1200, 'カツオ神'], [1800, '鯖神殺し'], [Infinity, '伝説のたたき職人']];
