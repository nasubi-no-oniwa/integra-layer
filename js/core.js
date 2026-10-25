/* インテグラ・レイヤー  ゲームの中身（画面に関係しない計算だけ）
   毎回同じ結果になるように、乱数はすべて種から作る。ブラウザでもNodeでも動く。 */
(function (root) {
'use strict';
const IL = {};
IL.VER = 1;

/* ---------- 乱数 ---------- */
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function RNG(seed) { this.s = seed >>> 0; }
RNG.prototype.next = function () { let t = (this.s = (this.s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };
RNG.prototype.range = function (a, b) { return a + this.int(b - a + 1); };
RNG.prototype.pick = function (a) { return a[this.int(a.length)]; };
RNG.prototype.chance = function (p) { return this.next() < p; };
IL.RNG = RNG; IL.hashStr = hashStr;

/* ---------- 釣り合いの数字（調整用スプレッドシートのたたき台） ---------- */
const B = IL.B = {
  base: { atk: 10, hp: 100, def: 10, spd: 10, luck: 10 },
  perLv: { atk: 1.2, hp: 5, def: 1.2, spd: 0.4, luck: 0.4 },
  perPt: { atk: 1, hp: 6, def: 1, spd: 1, luck: 1 },
  ptsPerLv: 3, maxLv: 100,
  partBase: 2, partPerFloor: 0.2, hpCoef: 3, spRatio: 2 / 3,
  rarMul: [1, 2.5, 6, 3], rankMul: { A: 1.2, B: 1.0, C: 0.8 },
  eAtk: 0.9, eHp: 1.8, eDef: 0.6,
  bossHp: 8, bossAt: 2.0, bigHp: 11, bigAt: 2.4, depth: 0.3, chargeMul: 2.5,
  expBase: 8, expPer: 3, bossExp: 10, bigExp: 15,
  potion: 0.5, potionPrice: 5, ticketPrice: 60, partPrice: [15, 80, 300, 300],
  synthRate: 0.2,
  tierPct: [0, 1.2, 1.6, 2.2, 3.0, 4.2, 6.0, 9.0],
  coef: { fire: 1.0, wind: 0.6, rock: 0.7, forest: 0.6, star: 1.0 },
  guard: [0, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5],
  burn: 0.1, burnTurns: 3, drain: 0.5, counter: 0.3,
  dropEnemy: 0.12, herbs: 20, herbHeal: 0.3, f1Hp: 1, f1Atk: 1, enemyCount: 30, respawnEvery: 12, regen: 0.005,
  mapW: 120, mapH: 90, boardK: 50, lateGrow: 0.6,
};
const NEED=[0, 40, 139, 289, 485, 725, 1006, 1328, 1689, 2088, 2524, 2996, 3504, 4047, 4625, 5236, 5881, 6559, 7270, 8013, 8788, 9595, 10433, 11302, 12202, 13133, 14093, 15084, 16104, 17154, 18234, 19342, 20480, 21646, 22841, 24065, 25317, 26596, 27904, 29240, 30603, 31994, 33412, 34858, 36331, 37831, 39357, 40911, 42491, 44097, 45731, 47390, 49076, 50787, 52525, 54289, 56079, 57894, 59735, 61602, 63494, 65411, 67354, 69322, 71316, 73334, 75377, 77445, 79538, 81656, 83799, 85966, 88157, 90374, 92614, 94879, 97168, 99482, 101819, 104181, 106567, 108977, 111410, 113868, 116349, 118854, 121383, 123935, 126511, 129111, 131734, 134380, 137050, 139743, 142459, 145199, 147961, 150747, 153556, 156388, 159243];
IL.NEED = NEED;

/* ---------- 種族・技 ---------- */
const SPECIES = IL.SPECIES = ['fire', 'rock', 'forest', 'wind', 'star'];
IL.SP_NAME = { fire: '炎', rock: '岩', forest: '森', wind: '風', star: '星', none: '無', joker: '万能' };
IL.SP_COLOR = { fire: '#e8553f', rock: '#a77b52', forest: '#4fae5a', wind: '#5fc4d8', star: '#c79bf2', none: '#9aa3b2', joker: '#f2d14b' };
IL.SKILLS = {
  fire:   ['', '火の粉', '火炎', '大火炎', '爆炎', '紅蓮', '煉獄', '天照'],
  rock:   ['', '石礫', '岩砕', '岩盾', '剛岩', '金剛', '磐古', '天岩戸'],
  forest: ['', '若葉', '樹液', '森羅', '翠緑', '万緑', '大樹海', '世界樹'],
  wind:   ['', '微風', '疾風', '旋風', '烈風', '暴嵐', '神風', '天津風'],
  star:   ['', '星屑', '流星', '彗星', '星雲', '銀河', '超新星', '宇宙開闢'],
};
IL.TIER_NAME = ['', '', '', '', '', '覚醒', '極', '神'];
IL.RAR_NAME = ['ふつう', 'レア', '伝説', '万能'];
IL.STAT_NAME = { atk: '攻撃', hp: '体力', def: '守り', spd: '素早さ', luck: '運' };
IL.STATS = ['atk', 'hp', 'def', 'spd', 'luck'];
function tierOf(n) { return n >= 25 ? 7 : n >= 18 ? 6 : n >= 13 ? 5 : n >= 9 ? 4 : n >= 6 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0; }
IL.tierOf = tierOf;
function groupMul(n) {
  const P = [[1, 1], [2, 1.1], [3, 1.2], [5, 1.4], [10, 1.8], [15, 2.2], [20, 2.6], [25, 3.0]];
  if (n <= 1) return 1;
  for (let i = 1; i < P.length; i++) if (n <= P[i][0]) { const [a, x] = P[i - 1], [b, y] = P[i]; return Math.round((x + (y - x) * (n - a) / (b - a)) * 1000) / 1000; }
  return 3;
}
IL.groupMul = groupMul;

/* ---------- パーツ ---------- */
function partValue(f) { return B.partBase + B.partPerFloor * (Math.max(1, f) - 1); }
IL.partValue = partValue;
// edges: [上, 右, 下, 左]  0=平ら 1=凸 2=凹 ／ rot: 時計回りに90度ずつ
function makePart(rng, o) {
  const rar = o.rar, sp = o.sp, floor = o.floor;
  const nStats = rar === 3 ? 2 : rar + 1;
  const keys = IL.STATS.slice(); const stats = [];
  for (let i = 0; i < nStats; i++) { const k = keys.splice(rng.int(keys.length), 1)[0]; stats.push({ k, r: rollRank(rng, o.luck || 0) }); }
  let nEdge = rar === 0 ? (rng.chance(0.5) ? 3 : 4) : rar === 1 ? 2 : rar === 2 ? 1 : 4;
  const sides = [0, 1, 2, 3]; const edges = [0, 0, 0, 0];
  for (let i = 0; i < nEdge; i++) { const s = sides.splice(rng.int(sides.length), 1)[0]; edges[s] = rng.chance(0.5) ? 1 : 2; }
  return { id: o.id, sp, rar, floor, stats, edges, rot: 0, src: o.src || 'dungeon', gacha: !!o.gacha };
}
IL.makePart = makePart;
function rollRank(rng, luck) { const lb = luck / (luck + 3000); const r = rng.next(); const pA = 0.15 * (1 + lb * 2), pB = 0.35; return r < pA ? 'A' : r < pA + pB ? 'B' : 'C'; }
function rollRar(rng, table, luck) { // table: [ふつう, レア, 伝説]
  const lb = luck / (luck + 3000); const leg = table[2] * (1 + lb * 2), rare = table[1] * (1 + lb);
  const r = rng.next(); return r < leg ? 2 : r < leg + rare ? 1 : 0;
}
IL.RAR_TABLE = { chest: [0.88, 0.10, 0.02], boss: [0.60, 0.32, 0.08], gacha: [0.50, 0.35, 0.13] };
function rollSpecies(rng) { const r = rng.int(6); return r < 5 ? SPECIES[r] : 'none'; }
function partStat(p, s) {
  const v = partValue(p.floor) * B.rarMul[p.rar] * B.rankMul[s.r] * ((p.sp !== 'none' && p.sp !== 'joker') ? B.spRatio : 1) * (s.k === 'hp' ? B.hpCoef : 1);
  return Math.round(v * 10) / 10;
}
IL.partStat = partStat;
function edgeAt(p, side) { return p.edges[(side - p.rot + 4) % 4]; }
IL.edgeAt = edgeAt;
function partScore(p) { let t = 0; for (const s of p.stats) t += partStat(p, s) / (s.k === 'hp' ? B.hpCoef : 1); return t; }
IL.partScore = partScore;

/* 盤面（25マス）を調べる：群れ・倍率・技・能力 */
function analyzeBoard(board) {
  const N = 5, par = []; for (let i = 0; i < 25; i++) par[i] = i;
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const links = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, a = board[i]; if (!a) continue;
    if (x < N - 1 && board[i + 1]) { const b = board[i + 1]; if (edgeAt(a, 1) + edgeAt(b, 3) === 3) { par[find(i)] = find(i + 1); links.push([i, i + 1]); } }
    if (y < N - 1 && board[i + N]) { const b = board[i + N]; if (edgeAt(a, 2) + edgeAt(b, 0) === 3) { par[find(i)] = find(i + N); links.push([i, i + N]); } }
  }
  const groups = {};
  for (let i = 0; i < 25; i++) if (board[i]) { const r = find(i); (groups[r] = groups[r] || []).push(i); }
  const groupOf = new Array(25).fill(-1), mulOf = new Array(25).fill(1), resolved = new Array(25).fill(null);
  const skills = {}; let gi = 0; const glist = [];
  for (const r in groups) {
    const cells = groups[r], m = groupMul(cells.length);
    const cnt = {}; for (const c of cells) { const sp = board[c].sp; if (SPECIES.includes(sp)) cnt[sp] = (cnt[sp] || 0) + 1; }
    let best = null, bn = 0, tie = false; for (const sp in cnt) { if (cnt[sp] > bn) { best = sp; bn = cnt[sp]; tie = false; } else if (cnt[sp] === bn) tie = true; }
    const jokerAs = (best && !tie) ? best : 'none';
    const cnt2 = Object.assign({}, cnt); for (const c of cells) if (board[c].sp === 'joker' && jokerAs !== 'none') cnt2[jokerAs] = (cnt2[jokerAs] || 0) + 1;
    for (const c of cells) { groupOf[c] = gi; mulOf[c] = m; resolved[c] = board[c].sp === 'joker' ? jokerAs : board[c].sp; }
    for (const sp in cnt2) { const t = tierOf(cnt2[sp]); if (t > 0 && (!skills[sp] || skills[sp].tier < t)) skills[sp] = { tier: t, count: cnt2[sp] }; }
    glist.push({ cells, mul: m }); gi++;
  }
  const add = { atk: 0, hp: 0, def: 0, spd: 0, luck: 0 };
  for (let i = 0; i < 25; i++) { const p = board[i]; if (!p) continue; for (const s of p.stats) add[s.k] += partStat(p, s) * mulOf[i]; }
  for (const k in add) add[k] = Math.round(add[k]);
  return { groups: glist, groupOf, mulOf, resolved, skills, add, links };
}
IL.analyzeBoard = analyzeBoard;

/* ---------- 主人公 ---------- */
function newProfile(now) {
  return { v: IL.VER, created: now || 0, lv: 1, exp: 0, pts: { atk: 0, hp: 0, def: 0, spd: 0, luck: 0 }, freePts: 0,
    gold: 0, nextId: 1, bag: [], board: new Array(25).fill(null), potions: [], tickets: 0, respec: 0,
    cleared: {}, firsts: {}, maxFloor: 1, maps: {}, gacha: null, stats: { kills: 0, deaths: 0, runs: 0 } };
}
IL.newProfile = newProfile;
function baseStats(pr) { const o = {}; for (const k of IL.STATS) o[k] = Math.round(B.base[k] + B.perLv[k] * (pr.lv - 1) + B.perPt[k] * pr.pts[k]); return o; }
function boardArr(pr) { return pr.board.map(id => id == null ? null : pr.bag.find(p => p.id === id) || null); }
IL.boardArr = boardArr;
function playerStats(pr) { const b = baseStats(pr), an = analyzeBoard(boardArr(pr)); const o = {}; for (const k of IL.STATS) o[k] = b[k] + an.add[k]; o.skills = an.skills; return o; }
IL.playerStats = playerStats; IL.baseStats = baseStats;
function gainExp(pr, n) { let ups = 0; pr.exp += n; while (pr.lv < B.maxLv && pr.exp >= IL.NEED[pr.lv]) { pr.exp -= IL.NEED[pr.lv]; pr.lv++; pr.freePts += B.ptsPerLv; ups++; } if (pr.lv >= B.maxLv) pr.exp = 0; return ups; }
IL.gainExp = gainExp;
function newPart(pr, rng, o) { const p = makePart(rng, Object.assign({ id: pr.nextId++ }, o)); return p; }
IL.critRate = luck => Math.min(0.3, luck / (luck + 2000));

/* ---------- 景色と敵 ---------- */
IL.BIOMES = [
  { name: '苔むした回廊', tint: [0.85, 1.05, 0.85], floorTile: 0, wallTile: 40, types: ['slime', 'rat', 'bat', 'beetle'], weak: 'fire', res: 'forest' },
  { name: '砂の書庫', tint: [1.1, 0.98, 0.78], floorTile: 48, wallTile: 57, types: ['rat', 'eye', 'spider', 'hood'], weak: 'wind', res: 'rock' },
  { name: '水晶洞', tint: [0.8, 0.95, 1.15], floorTile: 24, wallTile: 40, types: ['bat', 'ghost', 'beetle', 'slime'], weak: 'rock', res: 'star' },
  { name: '灼熱炉', tint: [1.2, 0.8, 0.7], floorTile: 12, wallTile: 57, types: ['crab', 'eye', 'hood', 'spider'], weak: 'forest', res: 'fire' },
  { name: '氷結層', tint: [0.85, 1.0, 1.2], floorTile: 0, wallTile: 40, types: ['ghost', 'beetle', 'slime', 'bat'], weak: 'fire', res: 'wind' },
  { name: '毒沼', tint: [0.85, 1.1, 0.8], floorTile: 12, wallTile: 57, types: ['spider', 'slime', 'rat', 'crab'], weak: 'star', res: 'forest' },
  { name: '機械層', tint: [0.95, 0.95, 1.05], floorTile: 48, wallTile: 40, types: ['beetle', 'eye', 'crab', 'hood'], weak: 'wind', res: 'rock' },
  { name: '影の街', tint: [0.75, 0.7, 0.95], floorTile: 24, wallTile: 57, types: ['hood', 'ghost', 'bat', 'spider'], weak: 'star', res: 'fire' },
  { name: '星の庭', tint: [1.05, 0.9, 1.2], floorTile: 0, wallTile: 40, types: ['eye', 'ghost', 'crab', 'beetle'], weak: 'rock', res: 'star' },
  { name: '統合核', tint: [1.15, 1.1, 1.15], floorTile: 48, wallTile: 57, types: ['hood', 'crab', 'eye', 'ghost', 'spider', 'beetle'], weak: 'forest', res: 'wind' },
];
IL.biomeOf = f => IL.BIOMES[Math.min(9, Math.floor((f - 1) / 10))];
IL.ETYPES = {
  slime:  { name: 'スライム', tile: 108, hp: 1.1, atk: 0.85, def: 0.8, spd: 0.8 },
  eye:    { name: '一つ目', tile: 109, hp: 0.9, atk: 1.1, def: 1.0, spd: 1.0 },
  crab:   { name: '赤鋏', tile: 110, hp: 1.0, atk: 1.0, def: 1.3, spd: 0.9 },
  hood:   { name: '黒頭巾', tile: 111, hp: 0.9, atk: 1.15, def: 0.9, spd: 1.05 },
  bat:    { name: 'コウモリ', tile: 120, hp: 0.7, atk: 0.9, def: 0.7, spd: 1.3 },
  ghost:  { name: '亡霊', tile: 121, hp: 0.8, atk: 1.0, def: 1.2, spd: 1.0 },
  spider: { name: '大グモ', tile: 122, hp: 0.9, atk: 1.1, def: 0.9, spd: 1.1 },
  rat:    { name: '大ネズミ', tile: 123, hp: 0.8, atk: 0.9, def: 0.8, spd: 1.2 },
  beetle: { name: '鉄甲虫', tile: 124, hp: 1.2, atk: 0.9, def: 1.4, spd: 0.8 },
};
IL.EPREFIX = ['苔', '砂', '晶', '炎', '氷', '毒', '鋼', '影', '星', '核'];
function expLv(f) { return Math.max(1, Math.min(100, Math.round(0.97 * f - 0.5))); }
function fillOf(f) { return Math.min(1, (f - 1) / 9); } // 序盤は盤面がまだ埋まっていない
function expBoard(f) { return IL.B.boardK * partValue(Math.max(1, f - 3)) * fillOf(f); }
function expAtk(f) { const L = expLv(f); return B.base.atk + (B.perLv.atk + B.perPt.atk) * (L - 1) + expBoard(f); }
function expSpd(f) { const L = expLv(f); return B.base.spd + B.perLv.spd * (L - 1) + expBoard(f); }
IL.expLv = expLv;
function makeEnemy(f, type, kind, rng) { // kind: 0 ふつう 1 中ボス 2 大ボス 3 行商人
  const T = IL.ETYPES[type], bi = IL.biomeOf(f), E = expAtk(f) * (1 + B.lateGrow * f / 100), d = kind ? 1 + B.depth * f / 100 : 1;
  const e1 = f === 1 && !kind; // 1階のふつうの敵は、少しだけ固く・強く
  const hm = kind === 1 ? B.bossHp : kind >= 2 ? B.bigHp : e1 ? B.f1Hp : 1, am = kind === 1 ? B.bossAt : kind >= 2 ? B.bigAt : e1 ? B.f1Atk : 1;
  const sp = SPECIES.slice(); const h = hashStr(type + ':' + Math.floor((f - 1) / 10));
  const weak = kind >= 1 ? bi.weak : sp[h % 5], res0 = kind >= 1 ? bi.res : sp[(h >> 3) % 5];
  const res = res0 === weak ? sp[(SPECIES.indexOf(weak) + 2) % 5] : res0;
  const hp = Math.round(B.eHp * E * T.hp * hm * d * (rng ? 0.92 + rng.next() * 0.16 : 1));
  const pre = IL.EPREFIX[Math.min(9, Math.floor((f - 1) / 10))];
  const name = kind === 3 ? '行商人' : kind === 2 ? pre + T.name + '王' : kind === 1 ? pre + T.name + 'の主' : pre + T.name;
  return { type, kind, name, tile: kind === 3 ? 84 : T.tile, hp, maxhp: hp, atk: Math.round(B.eAtk * E * T.atk * am * d), def: Math.round(B.eDef * E * T.def * d),
    spd: Math.round(0.85 * expSpd(f) * T.spd * (kind ? 1.15 : 1)), weak, res, burn: [], charge: 0,
    exp: Math.round((B.expBase + B.expPer * f) * (kind === 1 ? B.bossExp : kind >= 2 ? B.bigExp : 1)), gold: kind ? 20 : 1 + (rng ? rng.int(3) : 1) };
}
IL.makeEnemy = makeEnemy;
IL.bossType = f => { const bi = IL.biomeOf(f); return bi.types[hashStr('boss' + f) % bi.types.length]; };

/* ---------- 塔の階を作る（地形は全員同じ） ---------- */
const T_WALL = 0, T_FLOOR = 1, T_PED = 2, T_SAFE = 3, T_GATE = 4, T_BOSS = 5;
IL.T = { WALL: T_WALL, FLOOR: T_FLOOR, PED: T_PED, SAFE: T_SAFE, GATE: T_GATE, BOSS: T_BOSS };
const floorCache = {};
function genFloor(f) {
  if (floorCache[f]) return floorCache[f];
  const W = B.mapW, H = B.mapH, rng = new RNG(hashStr('integra-layer/floor/' + f));
  const t = new Uint8Array(W * H); const rooms = [];
  for (let a = 0; a < 2000 && rooms.length < 28; a++) {
    const w = rng.range(7, 15), h = rng.range(6, 11), x = rng.range(2, W - w - 3), y = rng.range(2, H - h - 3);
    if (rooms.some(r => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  for (const r of rooms) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) t[yy * W + xx] = T_FLOOR;
  // つなぐ（いちばん近い部屋どうし＋少し多め）
  const inT = [0], edges = [];
  while (inT.length < rooms.length) {
    let bd = 1e9, ba = 0, bb = 0;
    for (const i of inT) for (let j = 0; j < rooms.length; j++) if (!inT.includes(j)) { const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy); if (d < bd) { bd = d; ba = i; bb = j; } }
    inT.push(bb); edges.push([ba, bb]);
  }
  for (let k = 0; k < 6; k++) { const a = rng.int(rooms.length), b = rng.int(rooms.length); if (a !== b) edges.push([a, b]); }
  const carve = (x0, y0, x1, y1) => { let x = x0, y = y0; const hf = rng.chance(0.5); const step = () => { t[y * W + x] = t[y * W + x] || T_FLOOR; };
    if (hf) { while (x !== x1) { step(); x += Math.sign(x1 - x); } while (y !== y1) { step(); y += Math.sign(y1 - y); } } else { while (y !== y1) { step(); y += Math.sign(y1 - y); } while (x !== x1) { step(); x += Math.sign(x1 - x); } } step(); };
  for (const [a, b] of edges) carve(rooms[a].cx, rooms[a].cy, rooms[b].cx, rooms[b].cy);
  // 始まりの部屋と、いちばん遠いボス部屋
  let si = 0; rooms.forEach((r, i) => { if (r.cx + r.cy < rooms[si].cx + rooms[si].cy) si = i; });
  const dist = bfs(t, W, H, rooms[si].cx, rooms[si].cy);
  let bi = 0, bd = -1; rooms.forEach((r, i) => { const d = dist[r.cy * W + r.cx]; if (i !== si && d > bd) { bd = d; bi = i; } });
  const br = rooms[bi];
  for (let yy = br.y; yy < br.y + br.h; yy++) for (let xx = br.x; xx < br.x + br.w; xx++) t[yy * W + xx] = T_BOSS;
  for (let yy = br.y - 1; yy <= br.y + br.h; yy++) for (let xx = br.x - 1; xx <= br.x + br.w; xx++) if (t[yy * W + xx] === T_FLOOR) t[yy * W + xx] = T_GATE;
  // 安全地帯2つ
  const others = rooms.map((r, i) => i).filter(i => i !== si && i !== bi);
  const safe = []; for (let k = 0; k < 2; k++) { const i = others.splice(rng.int(others.length), 1)[0]; safe.push(i); t[rooms[i].cy * W + rooms[i].cx] = T_SAFE; }
  // 台座（まわり8マスが床の場所だけ。道をふさがない）
  const peds = []; let tries = 0;
  while (peds.length < 10 && tries++ < 500) {
    const r = rooms[others[rng.int(others.length)]]; const x = rng.range(r.x + 1, r.x + r.w - 2), y = rng.range(r.y + 1, r.y + r.h - 2);
    let ok = true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t[(y + dy) * W + x + dx] !== T_FLOOR) ok = false;
    if (ok) { t[y * W + x] = T_PED; peds.push(y * W + x); }
  }
  const fl = { f, W, H, t, rooms, start: { x: rooms[si].cx, y: rooms[si].cy }, bossRoom: bi, safe, peds, roomAt: null };
  const ra = new Int16Array(W * H).fill(-1); rooms.forEach((r, i) => { for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) ra[yy * W + xx] = i; });
  // 回復草（自生。ボス部屋とスタート地点にはない）
  const hr = new RNG(hashStr('integra-layer/herb/' + f)), herbs = [], herbAt = {}; tries = 0;
  while (herbs.length < B.herbs && tries++ < 2000) { const r = rooms[hr.int(rooms.length)]; if (r === rooms[bi]) continue; const x = hr.range(r.x, r.x + r.w - 1), y = hr.range(r.y, r.y + r.h - 1), i = y * W + x;
    if (t[i] !== T_FLOOR || herbAt[i] || (x === fl.start.x && y === fl.start.y)) continue; herbs.push(i); herbAt[i] = 1; }
  fl.herbs = herbs; fl.herbAt = herbAt;
  fl.roomAt = ra; floorCache[f] = fl; return fl;
}
function bfs(t, W, H, sx, sy) { const d = new Int32Array(W * H).fill(-1), q = [sy * W + sx]; d[q[0]] = 0; for (let h = 0; h < q.length; h++) { const i = q[h]; for (const o of [1, -1, W, -W]) { const j = i + o; if (t[j] && t[j] !== T_BOSS && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } } } return d; }
IL.genFloor = genFloor;
IL.walkable = (fl, x, y) => { if (x < 0 || y < 0 || x >= fl.W || y >= fl.H) return false; const v = fl.t[y * fl.W + x]; return v === T_FLOOR || v === T_SAFE || v === T_GATE || v === T_BOSS; };
IL.bossCenter = fl => { const r = fl.rooms[fl.bossRoom]; return r.cy * fl.W + r.cx; };
IL.chestPos = fl => IL.bossCenter(fl) + 1;

/* ---------- 冒険（ダンジョンに入ってから帰るまで） ---------- */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
IL.DIRS = DIRS;
function startRun(pr, floor, seed) {
  const fl = genFloor(floor), rng = new RNG(seed);
  const st = playerStats(pr);
  const run = { floor, seed, rng, x: fl.start.x, y: fl.start.y, hp: st.hp, turn: 0, enemies: [], opened: {}, merchant: null, battle: null,
    prompt: null, events: [], over: null, eseq: 0 };
  for (let i = 0; i < B.enemyCount; i++) spawnEnemy(run, fl, 12);
  // 行商人
  const rs = fl.rooms.map((r, i) => i).filter(i => i !== fl.bossRoom); const r = fl.rooms[rs[rng.int(rs.length)]];
  for (let k = 0; k < 50; k++) { const x = rng.range(r.x, r.x + r.w - 1), y = rng.range(r.y, r.y + r.h - 1); if (fl.t[y * fl.W + x] === T_FLOOR && !(x === run.x && y === run.y)) { run.merchant = { x, y, stock: merchantStock(pr, floor, rng), beaten: false }; break; } }
  reveal(pr, run, fl);
  return run;
}
IL.startRun = startRun;
function spawnEnemy(run, fl, minDist) {
  const rng = run.rng;
  for (let k = 0; k < 60; k++) {
    const x = rng.int(fl.W), y = rng.int(fl.H);
    if (fl.t[y * fl.W + x] !== T_FLOOR) continue;
    if (Math.abs(x - run.x) + Math.abs(y - run.y) < minDist) continue;
    if (fl.safe.some(i => fl.roomAt[y * fl.W + x] === i)) continue;
    if (run.enemies.some(e => e.x === x && e.y === y)) continue;
    const bi = IL.biomeOf(run.floor); const type = bi.types[rng.int(bi.types.length)];
    const e = makeEnemy(run.floor, type, 0, rng); e.x = x; e.y = y; e.uid = ++run.eseq; run.enemies.push(e); return;
  }
}
function merchantStock(pr, f, rng) {
  const s = [];
  s.push({ kind: 'potion', floor: f, price: B.potionPrice, n: 5 });
  for (let i = 0; i < 4; i++) { const rar = rollRar(rng, IL.RAR_TABLE.chest, 0); s.push({ kind: 'part', part: makePart(rng, { id: 0, rar, sp: rollSpecies(rng), floor: f, src: 'shop' }), price: B.partPrice[rar] }); }
  if (rng.chance(0.2)) s.push({ kind: 'ticket', price: B.ticketPrice, n: 1 });
  return s;
}
function reveal(pr, run, fl) {
  const key = String(run.floor); let m = pr.maps[key]; if (!m) m = pr.maps[key] = { bits: '', n: 0 };
  const bits = run._bits || (run._bits = decodeBits(m.bits, fl.W * fl.H));
  const mark = i => { if (!bits[i]) { bits[i] = 1; run._dirty = true; } };
  const ri = fl.roomAt[run.y * fl.W + run.x];
  if (ri >= 0) { const r = fl.rooms[ri]; for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) mark(y * fl.W + x); }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = run.x + dx, y = run.y + dy; if (x >= 0 && y >= 0 && x < fl.W && y < fl.H) mark(y * fl.W + x); }
}
function decodeBits(s, n) { const b = new Uint8Array(n); if (!s) return b; let i = 0; for (const ch of s) { const v = parseInt(ch, 32); for (let k = 0; k < 5 && i < n; k++, i++) b[i] = (v >> k) & 1; } return b; }
function encodeBits(b) { let s = ''; for (let i = 0; i < b.length; i += 5) { let v = 0; for (let k = 0; k < 5; k++) if (b[i + k]) v |= 1 << k; s += v.toString(32); } return s; }
IL.saveMap = (pr, run) => { if (run._bits && run._dirty) { let n = 0; for (const v of run._bits) n += v; pr.maps[String(run.floor)] = { bits: encodeBits(run._bits), n }; run._dirty = false; } };
IL.mapBits = (pr, run) => { if (!run._bits) { const fl = genFloor(run.floor), m = pr.maps[String(run.floor)]; run._bits = decodeBits(m ? m.bits : '', fl.W * fl.H); reveal(pr, run, fl); } return run._bits; }; // 読みなおした直後も地図が見えるように
IL.decodeBits = decodeBits;

/* 1歩すすむ／調べる。戻り値は画面に伝えるできごと */
function step(pr, run, dir) {
  if (run.battle || run.prompt || run.over) return;
  const fl = genFloor(run.floor), [dx, dy] = DIRS[dir], nx = run.x + dx, ny = run.y + dy;
  run.face = dir;
  const en = run.enemies.find(e => e.x === nx && e.y === ny);
  if (en) { startBattle(pr, run, en); return; }
  if (run.merchant && run.merchant.x === nx && run.merchant.y === ny) { run.prompt = { kind: 'merchant' }; return; }
  const ni = ny * fl.W + nx, bc = IL.bossCenter(fl);
  if (ni === bc && !run.bossDown) { run.prompt = { kind: 'gate' }; return; } // 階段の上に動かないボス
  if (run.bossChest && run.bossChest.i === ni && !run.bossChest.opened) { openChest(pr, run); return; }
  if (!IL.walkable(fl, nx, ny)) { if (fl.t[ny * fl.W + nx] === T_PED) interactPed(pr, run, ny * fl.W + nx); return; }
  run.x = nx; run.y = ny; run.turn++;
  const st = playerStats(pr); if (run.turn % 5 === 0) run.hp = Math.min(st.hp, run.hp + 1); // 5歩で1回復
  reveal(pr, run, fl);
  const v = fl.t[ny * fl.W + nx];
  if (ni === bc && run.bossDown) { run.prompt = { kind: 'bosswin' }; return; } // ボスのいた所の階段
  if (v === T_SAFE) { run.prompt = { kind: 'safe' }; return; }
  enemiesAct(pr, run, fl);
}
IL.step = step;
function wait(pr, run) { if (run.battle || run.prompt || run.over) return; run.turn++; enemiesAct(pr, run, genFloor(run.floor)); }
IL.wait = wait;
function interact(pr, run) { // 向いている先を調べる
  if (run.battle || run.prompt || run.over) return;
  const fl = genFloor(run.floor);
  for (const d of [run.face || 0, 0, 1, 2, 3]) {
    const x = run.x + DIRS[d][0], y = run.y + DIRS[d][1], i = y * fl.W + x;
    if (fl.t[i] === T_PED && !run.opened[i]) { interactPed(pr, run, i); return; }
    if (run.merchant && run.merchant.x === x && run.merchant.y === y) { run.prompt = { kind: 'merchant' }; return; }
  }
  const here = run.y * fl.W + run.x;
  if (run.bossChest && !run.bossChest.opened) { const c = run.bossChest.i; if (Math.abs(c % fl.W - run.x) + Math.abs(((c / fl.W) | 0) - run.y) <= 1) { openChest(pr, run); return; } }
  for (const i of [here, here - fl.W, here + 1, here + fl.W, here - 1]) if (herbAvail(fl, run, i)) { run.prompt = { kind: 'herb', i }; return; }
  const v = fl.t[here];
  if (v === T_SAFE) run.prompt = { kind: 'safe' };
  else if (here === IL.bossCenter(fl) && run.bossDown) run.prompt = { kind: 'bosswin' };
}
function herbAvail(fl, run, i) { return !!fl.herbAt[i] && !(run.herbs && run.herbs[i]); }
IL.herbAvail = herbAvail;
IL.herbNear = (fl, run, i) => herbAvail(fl, run, i) && Math.abs(i % fl.W - run.x) + Math.abs(((i / fl.W) | 0) - run.y) <= 1;
function eatHerb(pr, run, i) { const st = playerStats(pr); const h = Math.min(st.hp - run.hp, Math.round(st.hp * B.herbHeal)); run.hp += h; run.herbs = run.herbs || {}; run.herbs[i] = 1; run.prompt = null; run.events.push({ t: 'msg', s: '回復草を食べた。体力が ' + h + ' 回復した' }); }
function openChest(pr, run) { const c = run.bossChest; c.opened = true; for (const p of c.parts) pr.bag.push(p); run.events.push({ t: 'loot', parts: c.parts, gold: c.gold || 0, ticket: 0, from: '宝箱' }); pr.gold += c.gold || 0; }
IL.interact = interact;
function interactPed(pr, run, i) {
  if (run.opened[i]) { run.events.push({ t: 'msg', s: 'もう空っぽだ' }); return; }
  run.opened[i] = 1;
  const rng = run.rng, luck = playerStats(pr).luck, got = [];
  const n = rng.chance(0.5) ? 1 : 0; // 欠片は出すぎないように
  for (let k = 0; k < n; k++) { const p = newPart(pr, rng, { rar: rollRar(rng, IL.RAR_TABLE.chest, luck), sp: rollSpecies(rng), floor: run.floor, luck }); pr.bag.push(p); got.push(p); }
  let gold = 0; if (!n || rng.chance(0.3)) { gold = rng.range(5, 10); pr.gold += gold; }
  let ticket = 0; if (rng.chance(0.03)) { ticket = 1; pr.tickets++; }
  run.events.push({ t: 'loot', parts: got, gold, ticket, from: '台座' });
}
function enemiesAct(pr, run, fl) {
  const occ = new Set(run.enemies.map(e => e.y * fl.W + e.x));
  for (const e of run.enemies) {
    if (e.cool) { e.cool--; continue; }
    const d = Math.abs(e.x - run.x) + Math.abs(e.y - run.y);
    let dir = -1;
    if (d <= 7) { let best = d; for (let k = 0; k < 4; k++) { const x = e.x + DIRS[k][0], y = e.y + DIRS[k][1]; const dd = Math.abs(x - run.x) + Math.abs(y - run.y); if (dd < best && (IL.walkable(fl, x, y) && fl.t[y * fl.W + x] !== T_SAFE || (x === run.x && y === run.y))) { best = dd; dir = k; } } }
    else if (run.rng.chance(0.5)) dir = run.rng.int(4);
    if (dir < 0) continue;
    const x = e.x + DIRS[dir][0], y = e.y + DIRS[dir][1];
    if (x === run.x && y === run.y) { startBattle(pr, run, e); return; }
    if (!IL.walkable(fl, x, y) || fl.t[y * fl.W + x] !== T_FLOOR || occ.has(y * fl.W + x) || (run.merchant && run.merchant.x === x && run.merchant.y === y)) continue;
    occ.delete(e.y * fl.W + e.x); e.x = x; e.y = y; occ.add(y * fl.W + x);
  }
  if (run.turn % B.respawnEvery === 0 && run.enemies.length < B.enemyCount) spawnEnemy(run, fl, 14);
}

/* ---------- 戦い ---------- */
function startBattle(pr, run, first, kind) {
  let foes;
  if (kind === 'boss' || kind === 'merchant') foes = [first];
  else { foes = [first]; for (const e of run.enemies) { if (foes.length >= 3) break; if (e !== first && Math.abs(e.x - run.x) + Math.abs(e.y - run.y) <= 2) foes.push(e); } }
  run.battle = { kind: kind || 'normal', foes, turn: 0, log: [{ s: foes.length > 1 ? foes[0].name + 'たちがあらわれた！' : foes[0].name + 'があらわれた！' }], guard: 0, over: null };
}
IL.startBattle = startBattle;
function dmgCalc(a, m, d) { return a * m * a / (a + d); }
IL.dmgCalc = dmgCalc;
function battleCmd(pr, run, cmd) { // cmd: {c:'atk',t:i} {c:'skill',sp,t} {c:'def'} {c:'item',i} {c:'flee'}
  const bt = run.battle; if (!bt || bt.over) return;
  const st = playerStats(pr), rng = run.rng, log = bt.log; bt.turn++; bt.guard = 0; bt.counter = 0;
  const alive = () => bt.foes.filter(f => f.hp > 0);
  const hitFoe = (f, raw, sp, label) => {
    let mul = 1, note = '';
    if (sp && sp !== 'star') { if (f.weak === sp) { mul = 2; note = '（弱点！）'; } else if (f.res === sp) { mul = 0.5; note = '（いまひとつ）'; } }
    const crit = rng.chance(IL.critRate(st.luck)); let v = raw * mul * (0.9 + rng.next() * 0.2) * (crit ? 1.5 : 1);
    v = Math.max(1, Math.floor(v)); f.hp = Math.max(0, f.hp - v);
    log.push({ s: (label || '') + f.name + 'に ' + v + ' のダメージ' + (crit ? '（会心！）' : '') + note, hit: true });
    return v;
  };
  const playerAct = () => {
    if (cmd.c === 'atk') { const f = alive()[cmd.t] || alive()[0]; if (f) hitFoe(f, dmgCalc(st.atk, 1, f.def), null, ''); }
    else if (cmd.c === 'skill') {
      const sk = st.skills[cmd.sp]; if (!sk) return;
      const pct = B.tierPct[sk.tier] * B.coef[cmd.sp], nm = IL.SKILLS[cmd.sp][sk.tier];
      log.push({ s: '「' + nm + '」！', skill: cmd.sp, tier: sk.tier });
      if (cmd.sp === 'wind') { for (const f of alive()) hitFoe(f, dmgCalc(st.atk, pct, f.def), 'wind', ''); }
      else { const f = alive()[cmd.t] || alive()[0]; if (!f) return; const v = hitFoe(f, dmgCalc(st.atk, pct, cmd.sp === 'star' ? f.def : f.def), cmd.sp, '');
        if (cmd.sp === 'fire') { f.burn.push({ v: Math.max(1, Math.floor(v * B.burn)), n: B.burnTurns }); }
        if (cmd.sp === 'forest') { const h = Math.floor(v * B.drain); run.hp = Math.min(st.hp, run.hp + h); log.push({ s: '体力が ' + h + ' 回復した' }); }
        if (cmd.sp === 'rock') { bt.guard = B.guard[sk.tier]; bt.counter = sk.tier >= 4 ? B.counter : 0; log.push({ s: '岩の守り：受けるダメージ ' + Math.round(bt.guard * 100) + '% 減' }); } }
    }
    else if (cmd.c === 'def') { bt.guard = 0.5; log.push({ s: '身を守っている' }); }
    else if (cmd.c === 'item') { usePotion(pr, run, cmd.i); }
    else if (cmd.c === 'flee') {
      if (bt.kind !== 'normal') { log.push({ s: 'ここからは逃げられない！' }); return; }
      const ms = Math.max(...alive().map(f => f.spd)); if (rng.chance(st.spd >= ms ? 0.7 : 0.45)) { log.push({ s: 'うまく逃げきった' }); bt.over = 'flee'; } else log.push({ s: '逃げられなかった！' });
    }
  };
  const foeAct = f => {
    if (f.hp <= 0 || bt.over) return;
    let m = 1;
    if (f.kind) { if (f.charge) { m = B.chargeMul; f.charge = 0; log.push({ s: f.name + 'の大技！' }); } else if (bt.turn % 4 === 3) { f.charge = 1; log.push({ s: f.name + 'は力をためている…', warn: true }); return; } }
    let v = dmgCalc(f.atk, m, st.def) * (0.9 + rng.next() * 0.2);
    const g = bt.guard ? (bt.guard >= 0.5 ? 0.5 : bt.guard) : 0; v = Math.max(1, Math.floor(v * (1 - g)));
    run.hp = Math.max(0, run.hp - v); log.push({ s: f.name + 'の攻撃！ ' + v + ' のダメージを受けた', hurt: true });
    if (bt.counter && v > 0) { const c = Math.max(1, Math.floor(v * bt.counter)); f.hp = Math.max(0, f.hp - c); log.push({ s: '反撃！ ' + f.name + 'に ' + c + ' のダメージ', hit: true }); }
  };
  const fast = alive().filter(f => f.spd > st.spd), slow = alive().filter(f => f.spd <= st.spd);
  for (const f of fast) { foeAct(f); if (run.hp <= 0) break; }
  if (run.hp > 0 && !bt.over) playerAct();
  if (run.hp > 0 && !bt.over) for (const f of slow) { foeAct(f); if (run.hp <= 0) break; }
  // やけど
  for (const f of alive()) { for (const b of f.burn) { if (b.n > 0) { f.hp = Math.max(0, f.hp - b.v); b.n--; log.push({ s: f.name + 'はやけどで ' + b.v + ' のダメージ' }); } } f.burn = f.burn.filter(b => b.n > 0); }
  if (run.hp <= 0) { bt.over = 'lose'; log.push({ s: 'やられてしまった…', hurt: true }); }
  else if (!bt.over && alive().length === 0) bt.over = 'win';
  if (bt.over) endBattle(pr, run);
}
IL.battleCmd = battleCmd;
function endBattle(pr, run) {
  const bt = run.battle, rng = run.rng, fl = genFloor(run.floor);
  if (bt.over === 'win') {
    let exp = 0, gold = 0; const parts = []; const luck = playerStats(pr).luck;
    for (const f of bt.foes) { exp += f.exp; gold += f.gold; }
    if (bt.kind === 'normal') {
      const ids = new Set(bt.foes.map(f => f.uid)); run.enemies = run.enemies.filter(e => !ids.has(e.uid)); pr.stats.kills += bt.foes.length;
      for (const f of bt.foes) if (rng.chance(B.dropEnemy)) { const p = newPart(pr, rng, { rar: rollRar(rng, IL.RAR_TABLE.chest, luck), sp: rollSpecies(rng), floor: run.floor, luck }); pr.bag.push(p); parts.push(p); }
    } else if (bt.kind === 'boss') {
      const n = rng.range(3, 5);
      const chest = []; for (let k = 0; k < n; k++) { const isJ = rng.chance(0.03); const p = newPart(pr, rng, { rar: isJ ? 3 : rollRar(rng, IL.RAR_TABLE.boss, luck), sp: isJ ? 'joker' : rollSpecies(rng), floor: run.floor, luck, src: 'boss' }); chest.push(p); }
      run.bossDown = true; run.bossChest = { i: IL.chestPos(fl), parts: chest, gold, opened: false }; gold = 0; // ボスの落とし物はとなりの宝箱へ
      let respec = 0; if (rng.chance(0.05)) { respec = 1; pr.respec++; }
      const first = !(pr.cleared[run.floor] || (run.gclear && run.gclear[run.floor])); // 初撃破かもしれない（本当に最初かはサーバーで決まる）
      pr.cleared[run.floor] = 1; pr.maxFloor = Math.max(pr.maxFloor, Math.min(100, run.floor + 1));
      bt.bossReward = { respec, maybeFirst: first, chest: true };
    } else if (bt.kind === 'merchant') {
      const m = run.merchant; m.beaten = true;
      for (const s of m.stock) { if (s.kind === 'potion') for (let i = 0; i < s.n; i++) pr.potions.push({ floor: s.floor }); else if (s.kind === 'ticket') pr.tickets += s.n; else if (s.kind === 'part') { const p = Object.assign({}, s.part, { id: pr.nextId++, src: 'shop' }); pr.bag.push(p); parts.push(p); } }
      m.stock = []; run.merchant = null;
    }
    pr.gold += gold; const ups = gainExp(pr, exp);
    bt.reward = { exp, gold, parts, ups };
    if (ups) { const st = playerStats(pr); run.hp = Math.min(st.hp, run.hp + Math.round(st.hp * 0.2)); }
  } else if (bt.over === 'flee') {
    const ids = new Set(bt.foes.map(f => f.uid)); for (const e of run.enemies) if (ids.has(e.uid)) e.cool = 4;
  } else if (bt.over === 'lose') {
    if (bt.kind === 'merchant') { // かばんの中身が全部なくなる。盤面は残る。全回復で戻る
      const keep = new Set(pr.board.filter(id => id != null)); const lost = pr.bag.filter(p => !keep.has(p.id)).length;
      pr.bag = pr.bag.filter(p => keep.has(p.id)); pr.potions = [];
      run.hp = playerStats(pr).hp; bt.loseInfo = { bagLost: lost };
    } else {
      pr.stats.deaths++;
      const onBoard = pr.board.map(id => id == null ? null : pr.bag.find(p => p.id === id)).filter(Boolean);
      const lost = bt.kind === 'boss' ? onBoard : onBoard.filter(p => !p.gacha);
      const ids = new Set(lost.map(p => p.id));
      pr.bag = pr.bag.filter(p => !ids.has(p.id)); pr.board = pr.board.map(id => ids.has(id) ? null : id);
      bt.loseInfo = { lost, where: { floor: run.floor, x: run.x, y: run.y }, boss: bt.kind === 'boss' };
      run.over = { why: bt.kind === 'boss' ? 'boss' : 'dead', lost };
    }
  }
}
function usePotion(pr, run, i) {
  const p = pr.potions[i]; if (!p) return;
  const eff = potionEff(p.floor, run.floor), st = playerStats(pr), h = Math.round(st.hp * B.potion * eff);
  run.hp = Math.min(st.hp, run.hp + h); pr.potions.splice(i, 1);
  const msg = '回復薬で体力が ' + h + ' 回復した'; if (run.battle) run.battle.log.push({ s: msg }); else run.events.push({ t: 'msg', s: msg });
}
IL.usePotion = usePotion;
function potionEff(pf, f) { if (f <= pf) return 1; return Math.max(0.01, 1 - 0.1 * Math.floor((f - pf) / 3)); }
IL.potionEff = potionEff;
IL.closeBattle = (pr, run) => { if (run.battle && run.battle.over) { run.battle = null; } };

/* ボス・行商人・安全地帯 */
IL.fightBoss = (pr, run) => { const t = IL.bossType(run.floor); const e = makeEnemy(run.floor, t, run.floor % 5 === 0 ? 2 : 1, null); run.prompt = null; startBattle(pr, run, e, 'boss'); };
IL.fightMerchant = (pr, run) => { const e = makeEnemy(Math.min(130, run.floor + 30), 'hood', 2, null); e.name = '行商人'; e.tile = 84; e.weak = null; e.res = null; run.prompt = null; startBattle(pr, run, e, 'merchant'); };
IL.buy = (pr, run, idx) => {
  const m = run.merchant; if (!m) return 'none'; const s = m.stock[idx]; if (!s) return 'none';
  if (pr.gold < s.price) return 'gold';
  pr.gold -= s.price;
  if (s.kind === 'potion') { pr.potions.push({ floor: s.floor }); s.n--; if (s.n <= 0) m.stock.splice(idx, 1); }
  else if (s.kind === 'ticket') { pr.tickets++; m.stock.splice(idx, 1); }
  else { const p = Object.assign({}, s.part, { id: pr.nextId++ }); pr.bag.push(p); m.stock.splice(idx, 1); }
  return 'ok';
};
IL.goNextFloor = (pr, run) => { const nf = Math.min(100, run.floor + 1); const hp = run.hp; IL.saveMap(pr, run); const r = startRun(pr, nf, (run.seed * 31 + 7) >>> 0); r.hp = hp; return r; };
IL.leaveRun = (pr, run, why) => { IL.saveMap(pr, run); pr.stats.runs++; run.over = { why: why || 'return' }; };

/* ---------- メニュー（どこでもできること） ---------- */
IL.allocPoint = (pr, k) => { if (pr.freePts <= 0) return false; pr.pts[k]++; pr.freePts--; return true; };
IL.respec = pr => { if (pr.respec <= 0) return false; pr.respec--; let n = 0; for (const k in pr.pts) { n += pr.pts[k]; pr.pts[k] = 0; } pr.freePts += n; return true; };
IL.placePart = (pr, cell, id) => { // id=null で外す
  if (id != null) { const old = pr.board.indexOf(id); if (old >= 0) pr.board[old] = null; }
  pr.board[cell] = id;
};
IL.swapCells = (pr, a, b) => { const t = pr.board[a]; pr.board[a] = pr.board[b]; pr.board[b] = t; };
IL.rotatePart = (pr, id) => { const p = pr.bag.find(q => q.id === id); if (p) p.rot = (p.rot + 1) % 4; };
IL.discard = (pr, id) => { if (pr.board.includes(id)) return false; pr.bag = pr.bag.filter(p => p.id !== id); return true; };
IL.canSynth = (a, b) => a && b && a.id !== b.id && a.sp === b.sp && a.rar === b.rar && a.stats.some(s => s.r !== 'A');
IL.synthRate = pr => Math.min(0.6, B.synthRate + playerStats(pr).luck / (playerStats(pr).luck + 4000) * 0.2);
IL.synth = (pr, rng, baseId, matId) => {
  const a = pr.bag.find(p => p.id === baseId), b = pr.bag.find(p => p.id === matId);
  if (!IL.canSynth(a, b)) return null;
  const ok = rng.chance(IL.synthRate(pr));
  const rm = ok ? [matId] : [baseId, matId];
  pr.bag = pr.bag.filter(p => !rm.includes(p.id)); pr.board = pr.board.map(id => rm.includes(id) ? null : id);
  if (ok) { const up = a.stats.filter(s => s.r !== 'A'); const s = up[rng.int(up.length)]; s.r = s.r === 'C' ? 'B' : 'A'; return { ok: true, stat: s.k, rank: s.r }; }
  return { ok: false };
};
/* ガチャ（1日1回、3個から1個） */
IL.gachaFloor = pr => pr.maxFloor;
IL.rollGacha = (pr, day, rng) => {
  const luck = playerStats(pr).luck, f = IL.gachaFloor(pr), opts = [];
  for (let i = 0; i < 3; i++) { const j = rng.chance(0.02); opts.push(makePart(rng, { id: 0, rar: j ? 3 : rollRar(rng, IL.RAR_TABLE.gacha, luck), sp: j ? 'joker' : rollSpecies(rng), floor: f, luck, src: 'gacha', gacha: true })); }
  const old = pr.gacha && pr.gacha.day === day ? pr.gacha.pickedId : null;
  pr.gacha = { day, opts, picked: false, pickedId: old };
};
IL.pickGacha = (pr, i) => {
  const g = pr.gacha; if (!g || g.picked) return null;
  if (g.pickedId != null) { pr.bag = pr.bag.filter(p => p.id !== g.pickedId); pr.board = pr.board.map(id => id === g.pickedId ? null : id); }
  const p = Object.assign({}, g.opts[i], { id: pr.nextId++, gacha: true }); pr.bag.push(p); g.picked = true; g.pickedId = p.id; return p;
};


/* ---------- あきらめる・拾う・地図 ---------- */
IL.giveUp = (pr, run) => {
  pr.stats.deaths++;
  const onBoard = pr.board.map(id => id == null ? null : pr.bag.find(p => p.id === id)).filter(Boolean).filter(p => !p.gacha);
  const ids = new Set(onBoard.map(p => p.id)); pr.bag = pr.bag.filter(p => !ids.has(p.id)); pr.board = pr.board.map(id => ids.has(id) ? null : id);
  IL.saveMap(pr, run); run.battle = null; run.over = { why: 'dead', lost: onBoard, where: { floor: run.floor, x: run.x, y: run.y } };
  return onBoard;
};
function cleanPart(q) { // 拾った欠片の中身を確かめて、おかしな値ははじく
  if (!q || typeof q !== 'object') return null;
  const sp = ['fire', 'rock', 'forest', 'wind', 'star', 'none', 'joker'].includes(q.sp) ? q.sp : null; if (!sp) return null;
  const rar = [0, 1, 2, 3].includes(q.rar) ? q.rar : null; if (rar == null) return null;
  const floor = Math.max(1, Math.min(100, q.floor | 0));
  if (!Array.isArray(q.stats) || q.stats.length !== (rar === 3 ? 2 : rar + 1)) return null;
  const stats = []; for (const st of q.stats) { if (!IL.STATS.includes(st.k) || !['A', 'B', 'C'].includes(st.r)) return null; stats.push({ k: st.k, r: st.r }); }
  if (!Array.isArray(q.edges) || q.edges.length !== 4) return null;
  const edges = q.edges.map(v => (v === 1 || v === 2) ? v : 0);
  return { sp, rar, floor, stats, edges, rot: (q.rot | 0) & 3, src: 'pick', gacha: false };
}
IL.cleanPart = cleanPart;

IL.grantFirst = (S, f) => {
  const pr = S.pr; if (pr.firsts[f]) return null; const rng = new RNG(hashStr(S.uid + ':first:' + f)), luck = playerStats(pr).luck, got = [];
  for (let k = 0; k < 2; k++) { const p = newPart(pr, rng, { rar: rng.chance(0.5) ? 2 : 1, sp: rollSpecies(rng), floor: Math.min(100, f + 1), luck, src: 'first' }); pr.bag.push(p); got.push(p); }
  pr.firsts[f] = 1; return got;
};
/* ---------- すべての操作はここを通す（記録して、あとから同じ結果を再生できる） ---------- */
// S = { uid, pr, run, journal:[] }
IL.newState = (uid, now) => ({ uid, pr: newProfile(now || 0), run: null, journal: [] });
IL.runSeed = (uid, n) => hashStr(uid + ':run:' + n);
IL.exec = (S, op) => {
  const pr = S.pr; let run = S.run; const k = op[0]; let res = null;
  switch (k) {
    case 'start': { if (run && !run.over) return null; const n = (pr.stats.ri = (pr.stats.ri || 0) + 1); const f = Math.max(1, Math.min(op[1] | 0, pr.maxFloor)); S.run = startRun(pr, f, IL.runSeed(S.uid, n)); S.run.gclear = S.gclear || {}; break; }
    case 'mv': if (!run) return null; step(pr, run, op[1] & 3); break;
    case 'it': if (!run) return null; interact(pr, run); break;
    case 'wt': if (!run) return null; wait(pr, run); break;
    case 'bc': if (!run || !run.battle) return null; battleCmd(pr, run, op[1]); res = run.battle; break;
    case 'bx': if (!run) return null; IL.closeBattle(pr, run); break;
    case 'cancel': if (!run) return null; run.prompt = null; break;
    case 'hb': { if (!run || run.battle || run.prompt || run.over) return null; const fl = genFloor(run.floor); if (!IL.herbNear(fl, run, op[1] | 0)) return null; run.prompt = { kind: 'herb', i: op[1] | 0 }; break; }
    case 'eat': if (!run || !run.prompt || run.prompt.kind !== 'herb') return null; eatHerb(pr, run, run.prompt.i); break;
    case 'boss': if (!run || !run.prompt || run.prompt.kind !== 'gate') return null; IL.fightBoss(pr, run); break;
    case 'fm': if (!run || !run.merchant) return null; IL.fightMerchant(pr, run); break;
    case 'buy': if (!run) return null; res = IL.buy(pr, run, op[1] | 0); break;
    case 'stairs': if (!run || !run.prompt || run.prompt.kind !== 'gate' || !(pr.cleared[run.floor] || (S.gclear && S.gclear[run.floor]))) return null; S.run = IL.goNextFloor(pr, run); S.run.gclear = S.gclear || {}; break;
    case 'next': if (!run || !run.prompt || run.prompt.kind !== 'bosswin') return null; S.run = IL.goNextFloor(pr, run); S.run.gclear = S.gclear || {}; break;
    case 'bosswin': if (!run) return null; run.prompt = { kind: 'bosswin' }; break;
    case 'leave': if (!run || !run.prompt || !['safe', 'bosswin'].includes(run.prompt.kind)) return null; IL.leaveRun(pr, run, 'return'); break;
    case 'giveup': if (!run || run.battle) return null; res = IL.giveUp(pr, run); break;
    case 'pot': if (!run) return null; usePotion(pr, run, op[1] | 0); break;
    case 'dpot': pr.potions.splice(op[1] | 0, 1); break;
    case 'pick': { if (!run) return null; const q = cleanPart(op[2]); if (!q) return null; if (q.floor > pr.maxFloor) return null; q.id = pr.nextId++; pr.bag.push(q); run.picked = run.picked || {}; run.picked[op[1]] = 1; res = q; break; }
    case 'place': IL.placePart(pr, op[1] | 0, op[2] == null ? null : op[2]); break;
    case 'swap': IL.swapCells(pr, op[1] | 0, op[2] | 0); break;
    case 'rot': IL.rotatePart(pr, op[1]); break;
    case 'unq': pr.board[op[1] | 0] = null; break;
    case 'disc': IL.discard(pr, op[1]); break;
    case 'pt': IL.allocPoint(pr, op[1]); break;
    case 'respec': IL.respec(pr); break;
    case 'syn': { const n = (pr.stats.sy = (pr.stats.sy || 0) + 1); res = IL.synth(pr, new RNG(hashStr(S.uid + ':syn:' + n)), op[1], op[2]); break; }
    case 'groll': { const day = String(op[1]); if (op[2]) { if (pr.tickets <= 0) return null; pr.tickets--; } else if (pr.gacha && pr.gacha.day === day) return null; const n = (pr.stats.gr = (pr.stats.gr || 0) + 1); IL.rollGacha(pr, day, new RNG(hashStr(S.uid + ':gacha:' + day + ':' + n))); break; }
    case 'gpick': res = IL.pickGacha(pr, op[1] | 0); break;
    case 'mapsell': if (pr.gold < 100) return null; pr.gold -= 100; break;
    case 'mapbuy': if (pr.gold < 10) return null; pr.gold -= 10; break;
    case 'mapgain': pr.gold += 5 * Math.max(0, op[1] | 0); break;
    case 'first': if (!pr.cleared[op[1] | 0]) return null; res = IL.grantFirst(S, op[1] | 0); if (!res) return null; break;
    case 'gclr': { S.gclear = {}; for (const f of op[1] || []) S.gclear[f] = 1; const mx = Math.max(0, ...(op[1] || [0])); pr.maxFloor = Math.max(pr.maxFloor, Math.min(100, mx + 1)); if (S.run) S.run.gclear = S.gclear; break; }
    default: return null;
  }
  S.journal.push(op);
  return res === null ? true : res;
};
/* 記録から最初からやりなおして、同じ状態になるかを確かめる */
IL.digest = pr => { const o = { lv: pr.lv, exp: pr.exp, gold: pr.gold, pts: pr.pts, free: pr.freePts, bag: pr.bag.map(p => [p.id, p.sp, p.rar, p.floor, p.stats.map(s => s.k + s.r).join(''), p.edges.join(''), p.rot]), board: pr.board, mf: pr.maxFloor, cl: Object.keys(pr.cleared).length };
  return hashStr(JSON.stringify(o)).toString(36); };
IL.replay = (uid, journal) => { const S = IL.newState(uid, 0); for (const op of journal) { const before = S.journal.length; IL.exec(S, op); if (S.journal.length === before) return { ok: false, at: before, S }; } return { ok: true, S }; };
/* 記録を短くする（歩く操作は1文字に） */
IL.packJournal = j => { let out = [], mv = ''; for (const op of j) { if (op[0] === 'mv' && op.length === 2) { mv += 'urdl'[op[1]]; continue; } if (mv) { out.push(mv); mv = ''; } out.push(op); } if (mv) out.push(mv); return JSON.stringify(out); };
IL.unpackJournal = s => { const a = JSON.parse(s), out = []; for (const x of a) { if (typeof x === 'string') { for (const c of x) out.push(['mv', 'urdl'.indexOf(c)]); } else out.push(x); } return out; };

if (typeof module !== 'undefined' && module.exports) module.exports = IL; else root.IL = IL;
})(typeof self !== 'undefined' ? self : this);
