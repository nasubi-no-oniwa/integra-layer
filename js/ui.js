/* インテグラ・レイヤー  画面と操作 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAVE_S = 'il_state_v1', SAVE_O = 'il_opt_v1';
const DEV = false; // 開発用（公開するときは false にする：リセットボタンが消える）
let S = null, pr = null, run = null, opt = { sound: true, name: '', bgm: 0.5, se: 0.7, fx: 'normal', shake: true, tut: {} };
const ui = { scr: null, sel: null, bagSel: null, filt: { sp: 'all', rar: 'all', sort: 'score' }, target: 0, sub: null, synthBase: null, synthMat: null, bags: [], ghosts: [], firsts: {}, pickSel: [] };

/* ---------- 保存（すべての操作は X() を通して記録する） ---------- */
function X(op) { const r = IL.exec(S, op); pr = S.pr; run = S.run; if (S.journal.length >= 400) flushJournal(); return r; }
function packState() { const o = { uid: S.uid, pr: S.pr, journal: S.journal, gclear: S.gclear || {}, jver: S.jver || IL.ENGINE, pend: S.pend || [] }; if (S.run && !S.run.over) { IL.saveMap(S.pr, S.run); o.run = packRun(S.run); } return o; }
function save() { if (!S) return; try { localStorage.setItem(SAVE_S, JSON.stringify(packState())); } catch (e) {} }
function saveOpt() { try { localStorage.setItem(SAVE_O, JSON.stringify(opt)); } catch (e) {} }
function packRun(r) { const o = Object.assign({}, r); o.rngS = r.rng.s; delete o.rng; delete o._bits; delete o._dirty; o.events = []; return o; }
function unpackRun(o) { const r = Object.assign({}, o); r.rng = new IL.RNG(o.rngS); delete r.rngS; return r; }
function loadState(pid) {
  try { opt = Object.assign(opt, JSON.parse(localStorage.getItem(SAVE_O) || '{}')); } catch (e) {}
  let o = null; try { o = JSON.parse(localStorage.getItem(SAVE_S)); } catch (e) {}
  if (o && o.uid === pid && o.pr && o.pr.v === IL.VER) { S = { uid: pid, pr: o.pr, run: o.run ? unpackRun(o.run) : null, journal: o.journal || [], gclear: o.gclear || {}, jver: o.jver || '0', pend: o.pend || [] }; if (S.run) S.run.gclear = S.gclear; }
  else { S = IL.newState(pid, Date.now()); S.gclear = {}; S.pend = []; }
  // ルールの版が変わったら、それまでの記録は前の版として別に送る
  if (S.journal.length && S.jver && S.jver !== IL.ENGINE) { S.pend.push({ v: S.jver, s: IL.packJournal(S.journal) }); S.journal = []; }
  S.jver = IL.ENGINE;
  pr = S.pr; run = S.run;
}
let flushing = false;
async function flushJournal() { // 記録をサーバーへ送る（送れなかったら手元に残す）
  if (!Net.on || flushing || (!S.journal.length && !(S.pend && S.pend.length))) return; flushing = true;
  try {
    while (S.pend && S.pend.length) { const ok = await Net.pushJournal(S.pend[0].s, S.pend[0].v); if (!ok) return; S.pend.shift(); save(); }
    if (S.journal.length) { const part = S.journal.slice(), str = IL.packJournal(part); const ok = await Net.pushJournal(str, IL.ENGINE); if (ok) { S.journal.splice(0, part.length); save(); } }
  } finally { flushing = false; }
}
function bestBoss() { let b = 0; for (const k in pr.cleared) b = Math.max(b, +k || 0); return b; }
function pubInfo() { return { n: opt.name || '名無し', lv: pr.lv, mf: pr.maxFloor, bf: bestBoss() }; }
async function syncProfile() { await flushJournal(); if (Net.on) Net.saveProfile(pubInfo(), JSON.stringify({ pr: S.pr, gclear: S.gclear })); }
/* ---------- 音 ---------- */
const SND = {}; ['step', 'hit', 'hurt', 'skill', 'god', 'boss', 'chest', 'coin', 'pickup', 'click', 'select', 'ok', 'ng', 'levelup', 'fail', 'win', 'place', 'rotate'].forEach(n => { SND[n] = null; });
function sfx(n, vol) { const sv = opt.se == null ? 0.7 : opt.se; if (!opt.sound || sv <= 0) return; try { let a = SND[n]; if (!a) a = SND[n] = new Audio('snd/' + n + '.mp3'); const c = a.cloneNode(); c.volume = Math.min(1, (vol == null ? 0.5 : vol) * sv * 1.4); c.play().catch(() => {}); } catch (e) {} }
/* BGM（音楽：魔王魂） */
const MUS = { cur: null, el: null, want: null, unlocked: false };
function bgmVol() { return opt.sound ? (opt.bgm == null ? 0.5 : opt.bgm) * 0.6 : 0; }
function music(name) {
  MUS.want = name; if (!MUS.unlocked || MUS.cur === name) { if (MUS.el) MUS.el.volume = bgmVol(); return; }
  const old = MUS.el; MUS.cur = name; MUS.el = null;
  if (old) { let v = old.volume; const t = setInterval(() => { v -= 0.05; if (v <= 0) { clearInterval(t); old.pause(); } else old.volume = v; }, 40); }
  if (!name || bgmVol() <= 0) return;
  const a = new Audio('snd/bgm_' + name + '.mp3'); a.loop = true; a.volume = 0; MUS.el = a; a.play().catch(() => {});
  let v = 0; const t = setInterval(() => { v += 0.04; if (v >= bgmVol() || MUS.el !== a) { clearInterval(t); if (MUS.el === a) a.volume = bgmVol(); } else a.volume = v; }, 50);
}
function musicTick() {
  let w = 'title';
  if (ui.scr === 'ending') w = 'calm';
  else if (run && !run.over) w = run.battle && run.battle.kind !== 'normal' ? 'boss' : (run.prompt && run.prompt.kind === 'bosswin' && run.floor >= 100) ? 'calm' : run.floor > 50 ? 'dun2' : 'dun1';
  music(w);
}
setInterval(musicTick, 400);
addEventListener('pointerdown', () => { if (!MUS.unlocked) { MUS.unlocked = true; musicTick(); } }, { capture: true });
addEventListener('keydown', () => { if (!MUS.unlocked) { MUS.unlocked = true; musicTick(); } }, { capture: true });

/* ---------- 絵 ---------- */
const sheet = new Image(); sheet.src = 'img/tiles.png';
const atlas = new Image(); atlas.src = 'img/dt2.png?v=1'; // 0x72「16x16 DungeonTileset II」
const tinted = {}, tintedA = {}, tintBi = new Map();
/* 前の絵の番号 → 新しい絵（ここにない番号は前の絵のまま） */
const IDXART = { 108: 'swampy', 109: 'chort', 110: 'masked_orc', 111: 'necro', 120: 'imp', 121: 'skelet', 122: 'goblin', 123: 'tiny_zombie', 124: 'orc_warrior',
  97: 'knight', 84: 'doc', 85: 'elf', 86: 'wizard', 87: 'dwarf', 88: 'lizard', 89: 'chest_full_open_anim_f0', 90: 'chest_empty_open_anim_f2', 39: 'floor_stairs', 45: 'doors_leaf_closed' };
const BIGART = { 124: 'ogre', 123: 'big_zombie', 109: 'big_demon' }; // ボスのときは大きい絵
function tintAtlas(bi) {
  if (tintedA[bi]) return tintedA[bi]; if (!atlas.complete || !atlas.width) return atlas;
  const c = document.createElement('canvas'); c.width = atlas.width; c.height = atlas.height; const g = c.getContext('2d'); g.drawImage(atlas, 0, 0);
  const t = IL.BIOMES[bi].tint, d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { a[i] = Math.min(255, a[i] * t[0]); a[i + 1] = Math.min(255, a[i + 1] * t[1]); a[i + 2] = Math.min(255, a[i + 2] * t[2]); }
  g.putImageData(d, 0, 0); return tintedA[bi] = c;
}
/* 新しい絵を描く：足もとをマスの下にそろえる（背の高い絵はマスの上にはみ出す） */
function drawArt(g, A, name, x, y, s, o) {
  const fr = ART[name]; if (!fr) return; const n = fr.length, f = fr[n > 1 ? Math.floor(performance.now() / 140 + ((o && o.ph) || 0)) % n : 0], [ax, ay, aw, ah] = f;
  const sc = name.startsWith('doors') ? 0.5 : 1, dw = s * aw / 16 * sc, dh = s * ah / 16 * sc, dx = x + (s - dw) / 2, dy = y + s - dh;
  if (o && o.flip) { g.save(); g.translate(dx + dw, dy); g.scale(-1, 1); g.drawImage(A, ax, ay, aw, ah, 0, 0, dw, dh); g.restore(); }
  else g.drawImage(A, ax, ay, aw, ah, dx, dy, dw, dh);
}
function tintSheet(bi) {
  if (tinted[bi]) return tinted[bi];
  const c = document.createElement('canvas'); c.width = sheet.width; c.height = sheet.height; const g = c.getContext('2d'); g.drawImage(sheet, 0, 0);
  const t = IL.BIOMES[bi].tint, d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { a[i] = Math.min(255, a[i] * t[0]); a[i + 1] = Math.min(255, a[i + 1] * t[1]); a[i + 2] = Math.min(255, a[i + 2] * t[2]); }
  g.putImageData(d, 0, 0); tintBi.set(c, bi); return tinted[bi] = c;
}
const HERB = (() => { // 回復草（16×16の点絵）
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
  const px = (col, pts) => { g.fillStyle = col; for (const [x, y] of pts) g.fillRect(x, y, 1, 1); };
  px('#1d3a1f', [[7,14],[8,14],[6,13],[9,13],[7,13],[8,13]]);
  px('#3f8f3a', [[7,12],[8,12],[7,11],[8,10],[7,9],[4,8],[5,8],[5,9],[6,9],[6,10],[11,7],[10,8],[10,9],[9,9],[9,10],[3,7],[12,6],[8,7],[8,6]]);
  px('#7fd05a', [[4,7],[5,7],[11,6],[10,7],[8,5],[3,6],[12,5],[9,6]]);
  px('#ff8fb0', [[8,4],[7,4],[8,3],[9,4]]); px('#ffe48a', [[8,4]]);
  return c; })();
const BAG = (() => { // 落ちたバッグ（16×16の点絵）
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
  const rows = ['......aa........', '.....abba.......', '......aa........', '....cccccc......', '...cddddddc.....', '..cdddeedddc....', '..cddeffeddc....', '.cdddeffedddc...', '.cddddeedddddc..', '.cdddddddddddc..', '.cddddddddddc...', '..cddddddddc....', '...cccccccc.....'];
  const col = { a: '#5a3b1e', b: '#c9a86a', c: '#3b2414', d: '#8a5a2e', e: '#c9a86a', f: '#f2d14b' };
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (col[r[x]]) { g.fillStyle = col[r[x]]; g.fillRect(x + 1, y + 2, 1, 1); } });
  return c; })();
function drawTile(g, src, idx, x, y, s, o) {
  const nm = IDXART[idx]; if (nm && atlas.complete && atlas.width) { const bi = tintBi.get(src); return drawArt(g, bi == null ? atlas : tintAtlas(bi), nm, x, y, s, o); }
  g.drawImage(src, (idx % 12) * 16, Math.floor(idx / 12) * 16, 16, 16, x, y, s, s);
}
function spriteCanvas(idx, scale, bi, big) {
  const nm = (big && BIGART[idx]) || IDXART[idx];
  if (nm && ART[nm] && atlas.complete && atlas.width) { const [, , aw, ah] = ART[nm][0], k = aw > 16 ? scale * 0.75 : scale, c = document.createElement('canvas'); c.width = Math.round(aw * k); c.height = Math.round(ah * k);
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; const A = bi == null ? atlas : tintAtlas(bi), [ax, ay] = ART[nm][0]; g.drawImage(A, ax, ay, aw, ah, 0, 0, c.width, c.height); c.className = 'art'; return c; }
  const c = document.createElement('canvas'); c.width = c.height = 16 * scale; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; drawTile(g, bi == null ? sheet : tintSheet(bi), idx, 0, 0, 16 * scale); return c; }

/* ---------- 共通の部品 ---------- */
function toast(s) { const d = document.createElement('div'); d.textContent = s; $('#toast').appendChild(d); setTimeout(() => d.remove(), 2700); }
const EMB = { // 種族の紋章（色が見分けにくくても分かるように）
  fire: '<path d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z"/>',
  rock: '<path d="M3 13 5 5l4-3 4 4 1 7z"/>',
  forest: '<path d="M8 1c4 2 6 6 4 10-1 2-3 3-4 3s-3-1-4-3C2 7 4 3 8 1zm0 3v10"/>',
  wind: '<path d="M2 6h8a2 2 0 1 0-2-2h-1.5A3.5 3.5 0 1 1 10 7.5H2zm0 3h10a2.5 2.5 0 1 1-2.5 2.5H11a1 1 0 1 0 1-1H2z"/>',
  star: '<path d="m8 1 2 5h5l-4 3 1.6 5L8 11l-4.6 3L5 9 1 6h5z"/>',
  none: '<circle cx="8" cy="8" r="4.5"/>',
  joker: '<path d="M8 1 15 8 8 15 1 8z"/>',
};
/* 欠片の形（ジグソー）。1マス=100。つながった辺は外へ6のばして、相手と合わせ目で接する（盤面のすき間は12） */
let PART_UID = 0;
function jigPath(p, lk, onBoard) {
  const x0 = lk && lk[3] ? -6 : 0, x1 = lk && lk[1] ? 106 : 100, y0 = lk && lk[0] ? -6 : 0, y1 = lk && lk[2] ? 106 : 100;
  // 各辺：始点・終点・こぶの中心・進む向き(d)・外向き(n)
  const S = [
    { a: [x0, y0], b: [x1, y0], c: [50, y0], d: [1, 0], n: [0, -1] },
    { a: [x1, y0], b: [x1, y1], c: [x1, 50], d: [0, 1], n: [1, 0] },
    { a: [x1, y1], b: [x0, y1], c: [50, y1], d: [-1, 0], n: [0, 1] },
    { a: [x0, y1], b: [x0, y0], c: [x0, 50], d: [0, -1], n: [-1, 0] },
  ];
  const f = v => Math.round(v * 100) / 100, P = (q) => f(q[0]) + ' ' + f(q[1]);
  let path = 'M ' + P(S[0].a);
  for (let s = 0; s < 4; s++) {
    const { b, c, d, n } = S[s], v = IL.edgeAt(p, s);
    if (v === 1 || v === 2) {
      const sg = v === 1 ? 1 : -1, k = v === 2 ? 1 : (lk && lk[s]) ? 1 : onBoard ? 0.55 : 0.75;
      const w = 9 * k, h = 4 * k * sg, r = 12 * k;
      const pt = (t, u) => [c[0] + d[0] * t + n[0] * u, c[1] + d[1] * t + n[1] * u];
      path += ' L ' + P(pt(-w, 0)) + ' L ' + P(pt(-w, h)) + ` A ${f(r)} ${f(r)} 0 1 ${sg > 0 ? 1 : 0} ` + P(pt(w, h)) + ' L ' + P(pt(w, 0));
    }
    path += ' L ' + P(b);
  }
  return path + ' Z';
}
function partHTML(p, cls, lk) { // lk: つながっている辺（0上 1右 2下 3左）。lk があれば盤面の上
  const c = IL.SP_COLOR[p.sp], id = 'jg' + (++PART_UID);
  const rk = p.stats.map(s => s.r).join('');
  const svg = `<svg class="jig" viewBox="-30 -30 160 160" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs><path class="jf" d="${jigPath(p, lk, !!lk)}" fill="${c}"/><path class="jh" d="${jigPath(p, lk, !!lk)}" fill="url(#${id})"/><path class="js" d="${jigPath(p, lk, !!lk)}"/></svg>`;
  return `<div class="part r${p.rar} ${cls || ''}" style="--c:${c}">${svg}<svg class="emb" viewBox="0 0 16 16">${EMB[p.sp] || ''}</svg><span class="rk">${rk}</span>${p.gacha ? '<span class="gc">★</span>' : ''}</div>`;
}
function partText(p) {
  const st = p.stats.map(s => `${IL.STAT_NAME[s.k]}${s.r} +${IL.partStat(p, s)}`).join('　');
  return `<b>${IL.SP_NAME[p.sp]}の欠片</b>（${IL.RAR_NAME[p.rar]}・${p.floor}階${p.gacha ? '・ガチャ' : ''}）<br>${st}`;
}
function show(html, cls) { $('#screen').innerHTML = `<div class="ov ${cls || ''}">${html}</div>`; }
function hideScreen() { $('#screen').innerHTML = ''; ui.scr = null; }
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function gachaReady() { return !pr.gacha || pr.gacha.day !== todayKey() || !pr.gacha.picked; }

/* ---------- タイトル ---------- */
const SHARE = {
  ja: { boss: f => `インテグラ・レイヤー ${f}階のボスを倒した！`, first: f => `インテグラ・レイヤー ${f}階のボスを、世界で最初に倒した！`, god: (f, n) => `インテグラ・レイヤー ${f}階で神技「${n}」が出た！`, tags: 'インテグラレイヤー,ゲーム制作,gamedev' },
  en: { boss: f => `Beat the floor ${f} boss in Integra Layer!`, first: f => `I was the FIRST in the world to beat the floor ${f} boss in Integra Layer!`, god: (f, n) => `Unleashed the divine skill "${n}" on floor ${f} in Integra Layer!`, tags: 'IntegraLayer,gamedev,indiegame' },
  zh: { boss: f => `在整合層擊敗了第${f}層的頭目！`, first: f => `在整合層全世界第一個擊敗了第${f}層的頭目！`, god: (f, n) => `在整合層第${f}層使出了神技「${n}」！`, tags: 'IntegraLayer,gamedev,獨立遊戲' },
  ko: { boss: f => `인테그라 레이어 ${f}층 보스를 쓰러뜨렸다!`, first: f => `인테그라 레이어 ${f}층 보스를 세계 최초로 쓰러뜨렸다!`, god: (f, n) => `인테그라 레이어 ${f}층에서 신기술 「${n}」 발동!`, tags: 'IntegraLayer,gamedev,인디게임' },
};
function shareX(kind, f, name) {
  const L = SHARE[L10N.lang] || SHARE.ja; const text = L[kind](f, L10N.t(name || ''));
  const u = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(location.origin + location.pathname) + '&hashtags=' + encodeURIComponent(L.tags);
  window.open(u, '_blank', 'noopener');
}
function infoHTML() {
  let h = ''; const st = ui.stream;
  if (st && st.on) h += `<a class="stream" href="${/^https?:\/\//.test(st.url || '') ? esc(st.url) : '#'}" target="_blank" rel="noopener">🔴 配信中${st.name ? '　<b class="nt">' + esc(st.name) + '</b>' + (L10N.lang === 'ja' ? 'さん' : '') : ''}${st.txt ? '　<span class="nt">' + esc(st.txt) + '</span>' : ''}</a>`;
  const fs = ui.firsts || {}, top = Math.max(0, ...Object.keys(fs).map(Number).filter(f => fs[f] && !fs[f].ng));
  if (top) { const v = fs[top], co = Object.values(v.co || {}).length; h += `<div class="front">🏆 最前線　<b>${top}階</b>のボスを <span class="nt">${esc(v.n || '無名')}</span>${co ? ' ＋' + co : ''}が初めて倒した <span class="mute small">（${ago(v.t)}）</span></div>`; }
  const nw = ui.news || {}; const ids = Object.keys(nw).sort((a, b) => (nw[b].t || 0) - (nw[a].t || 0)).slice(0, 3);
  if (ids.length) h += '<div class="news"><b>お知らせ</b>' + ids.map(id => `<div><span class="mute">${new Date(nw[id].t || 0).toLocaleDateString()}</span> <span class="nt">${esc(nw[id].s)}</span></div>`).join('') + '</div>';
  return h;
}
function title() {
  const ti = document.getElementById('tname'), keepNm = ti ? [ti.value, document.activeElement === ti] : null; // 入力中に画面が描きなおされても消さない
  if (S.run && S.run.over) S.run = null; run = S.run; ui.scr = 'title'; if (Net.on) Net.presence(0); $('#hud').hidden = true; $('#pad').hidden = true; save(); drawIdle();
  const st = IL.playerStats(pr);
  show(`<div class="win title"><div class="tleft">
    <div class="logo">INTEGRA LAYER<small>インテグラ・レイヤー</small></div>
    ${infoHTML()}
    <p class="story">倒れた誰かの欠片が、きみの盤面でつながる。\n全員で、100階の塔を上れ。</p>
    <div class="statline"><span>Lv ${pr.lv}</span><span>最前線 ${pr.maxFloor}階</span><span class="gold">${pr.gold} G</span><span>回復薬 ${pr.potions.length}</span><span>チケット ${pr.tickets}</span></div>
    ${IL.tailwind(pr, S.gclear) > 1 ? `<div class="tailw">🍃 追い風：経験値 ×2.5（最前線 ${IL.frontOf(S.gclear)}階まで追いつこう）</div>` : ''}
    ${!opt.name || ui.editName ? `<div class="tname ${opt.name ? '' : 'need'}"><span class="small">${opt.name ? '名前を変える' : '名前を決めよう（ボスを最初に倒すと塔に刻まれる）'}</span><div class="row"><input id="tname" maxlength="12" placeholder="名前（12文字まで）" value="${esc(opt.name || '')}"><button class="btn sm pri" data-a="tnameok">決める</button>${opt.name ? '<button class="btn sm" data-a="tnamecancel">やめる</button>' : ''}</div></div>`
      : `<p class="small tonline">${Net.on ? 'オンライン' : 'オフライン（この端末だけ）'}　<b class="nt">${esc(opt.name)}</b> <button class="btn sm" data-a="tnameedit">✎ 名前を変える</button></p>`}</div>
    <div class="menu">
      <button class="btn pri" data-a="floors">塔に入る</button>
      <button class="btn" data-a="board">盤面とかばん</button>
      <button class="btn" data-a="gacha">今日のガチャ${gachaReady() ? '<span class="badge">!</span>' : ''}</button>
      <button class="btn" data-a="synth">合成所</button>
      <button class="btn" data-a="points">能力${pr.freePts ? '<span class="badge">' + pr.freePts + '</span>' : ''}</button>
      <button class="btn" data-a="plaza">広場（掲示板）</button>
      ${Net.on ? '<button class="btn" data-a="maptop">地図屋</button>' : ''}
      <div class="row tsub" style="justify-content:center"><button class="btn sm" data-a="profile">名前と引き継ぎ</button><button class="btn sm" data-a="help">遊び方</button><button class="btn sm" data-a="settings">⚙ 設定</button><button class="btn sm" data-a="lang">🌐 ${L10N.LANGS[L10N.lang]}</button>${ui.firsts && ui.firsts[100] ? '<button class="btn sm" data-a="ending">エンディング</button>' : ''}</div>
      ${DEV ? '<button class="btn sm warn" data-a="devreset">【開発用】データをリセット</button>' : ''}
    </div></div>
    ${IOS && !STANDALONE ? '<p class="small mute iosh">📱 Safariの「共有」→「ホーム画面に追加」から開くと、上の帯なしの全画面で遊べます</p>' : ''}
    <a class="credit" href="https://maou.audio/" target="_blank" rel="noopener">音楽：魔王魂</a>`);
  if (keepNm) { const n = document.getElementById('tname'); if (n) { n.value = keepNm[0]; if (keepNm[1]) n.focus(); } }
  drawTitleBg();
}
function floors() {
  ui.scr = 'floors';
  const bt = !!ui.bossTrip;
  let b = ''; for (let f = 1; f <= 100; f++) { const cl = pr.cleared[f], fr = f === pr.maxFloor, ok = bt ? cl && pr.gold >= IL.bossTripCost(f) : f <= pr.maxFloor;
    b += `<button data-f="${f}" class="${cl ? 'cl' : ''} ${fr ? 'fr' : ''}" ${ok ? '' : 'disabled'}>${f}${bt && cl ? `<small>${IL.bossTripCost(f)}G</small>` : ''}</button>`; }
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>どの階から始める？</h2>
    <button class="guard trip ${bt ? 'on' : ''}" data-a="btrip"><span class="sw"><i></i></span><span>ボス部屋の前から始める<small>ボスを倒したことのある階だけ・階×20G（所持 ${pr.gold} G）</small></span></button>
    <p class="small mute">${bt ? '選んだ階のボス部屋の入口の前から始まる。宝箱の中身はふつうと同じ。' : '緑＝ボスを倒した階　金＝最前線（' + pr.maxFloor + '階）。10階ごとに景色が変わる。'}</p>
    <div class="floors">${b}</div>${Net.on ? '<p class="small mute" style="margin-top:8px">地図を買う：</p><div class="row"><select id="mapf">' + Array.from({ length: pr.maxFloor }, (_, i) => `<option value="${i + 1}">${i + 1}階</option>`).join('') + '</select><button class="btn sm" data-a="mapopen">地図の店へ</button></div>' : ''}</div>`);
}
function help() {
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>遊び方</h2>
  <p class="story">・塔を探索して、敵とぶつかると戦いになる。台座はとなりから「調べる」。
・拾った欠片を5×5の盤面に置く。同じ種族の凸と凹が向き合うとつながる。
・同じ種族どうしの凸と凹だけがつながる（別の種族とはつながらない。万能はどの種族ともつながる）。たくさんつながるほど能力が上がり、2個以上つながると技が使える（25個で「神」）。<br>・2個以上つながると「加護」も付き、その属性の能力が段階に応じて上がる（炎＝攻撃、岩＝守り、森＝体力、風＝素早さ、星＝運。最大+25％）。「無」はつながらないかわりに1つ1つが強い。
・炎＝1体に大ダメージ　風＝全体　岩＝守り　森＝回復　星＝弱点も半減も関係なし。
・ボスを倒すと次の階へ。帰れるのは「安全地帯」と「ボスのあとの帰還ポータル」だけ。
・倒れると、盤面の欠片がバッグになってその場に残る（ガチャの欠片は残る）。ボスにやられると盤面の欠片が全部消える。
・だれかのバッグは、となりで「調べる」と開ける。1つのバッグから5個まで、1回だけ拾える。中身は減らない。
・メニューの「欠片を託す」で、選んだ欠片をバッグに入れて、だれかのために置いていける（倒れるのと同じ）。
・行商人とは戦えるが、とても強い。負けるとかばんの中身が消える。
・操作：矢印キー／WASDで移動、スペース／Zで調べる、Xでメニュー。スマホは十字キー（押したまま指をすべらせると向きが変わる）か、行きたい場所をタップするとそこまで歩く。<br>・「探索」ボタン（キーボードはE）で、まだ行っていない所へ自動で歩く。ふつうの敵は「おまかせ」で自動で戦う（設定で変えられる）。</p></div>`);
}

/* ---------- 設定 ---------- */
function settings(from) {
  ui.scr = 'settings'; ui.setFrom = from || ui.setFrom || 'title';
  const sl = (k, v) => `<input type="range" min="0" max="100" value="${Math.round(v * 100)}" data-set="${k}" class="range">`;
  const langs = Object.keys(L10N.LANGS).map(k => `<option value="${k}" ${L10N.lang === k ? 'selected' : ''}>${L10N.LANGS[k]}</option>`).join('');
  show(`<div class="win" style="max-width:480px"><button class="btn sm close" data-a="setback">とじる</button><h2>設定</h2>
    <div class="setrow"><span>BGM の音量</span>${sl('bgm', opt.bgm == null ? 0.5 : opt.bgm)}</div>
    <div class="setrow"><span>効果音の音量</span>${sl('se', opt.se == null ? 0.7 : opt.se)}</div>
    <div class="setrow"><span>演出</span><span><button class="btn sm ${opt.fx !== 'low' ? 'pri' : ''}" data-a="fxn">標準</button><button class="btn sm ${opt.fx === 'low' ? 'pri' : ''}" data-a="fxl">少なめ</button></span></div>
    <div class="setrow"><span>画面のゆれ</span><span><button class="btn sm ${opt.shake !== false ? 'pri' : ''}" data-a="shk1">あり</button><button class="btn sm ${opt.shake === false ? 'pri' : ''}" data-a="shk0">なし</button></span></div>
    <div class="setrow"><span>ふつうの敵はおまかせで戦う</span><span><button class="btn sm ${opt.auto !== false ? 'pri' : ''}" data-a="auto1">する</button><button class="btn sm ${opt.auto === false ? 'pri' : ''}" data-a="auto0">しない</button></span></div>
    <div class="setrow"><span>戦闘の速さ</span><span><button class="btn sm ${opt.bspd !== 'fast' ? 'pri' : ''}" data-a="bsp0">ふつう</button><button class="btn sm ${opt.bspd === 'fast' ? 'pri' : ''}" data-a="bsp1">速い</button></span></div>
    <div class="setrow"><span>レベルが上がったら自動で振る</span><span class="row" style="gap:4px">${[['off', 'しない'], ['atk', '攻撃'], ['hp', '体力'], ['def', '守り'], ['bal', 'バランス']].map(([k, n]) => `<button class="btn sm ${(opt.autoPt || 'off') === k ? 'pri' : ''}" data-a="apt" data-k="${k}">${n}</button>`).join('')}</span></div>
    <div class="setrow"><span>言葉</span><select data-setlang="1" class="inp">${langs}</select></div>
    <div class="setrow"><span>はじめの案内</span><button class="btn sm" data-a="tutreset">もう一度見る</button></div></div>`);
}
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.set; if (!k) return; opt[k] = (+e.target.value) / 100; opt.sound = true; saveOpt(); if (k === 'bgm' && MUS.el) MUS.el.volume = bgmVol(); if (k === 'bgm' && !MUS.el) { MUS.cur = null; musicTick(); } });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.setlang) { L10N.lang = opt.lang = e.target.value; saveOpt(); location.reload(); } });
function fxLow() { return opt.fx === 'low'; }
function applyOpt() { document.body.classList.toggle('fastbt', opt.bspd === 'fast'); if (window.FX) FX.on = FX.ok && !fxLow() && !FX.auto; document.body.classList.toggle('lowfx', fxLow()); document.body.classList.toggle('noshake', opt.shake === false); }

/* ---------- はじめの案内（行商人がしゃべる。くどくならないように1回ずつ） ---------- */
const TUT = {
  start: '「やあ、新入り。ここは100階まで続く塔さ。まずは歩きまわって“欠片”を集めてきな。台座はとなりで『調べる』と開くよ」',
  got: '「いい欠片だ。右下の ≡ メニュー →『盤面とかばん』で、盤面に置いてみな」',
  link: '「同じ種族の凸と凹が向き合うと欠片がつながる。つながるほど強くなるし、2つつながれば技が使えるよ。別の種族とはつながらないから気をつけな」',
  battle: '「敵だ！『たたかう』で攻撃。技は盤面のつながりで決まる。危なくなったら『にげる』も手さ」',
  bag: '「誰かのバッグが落ちてるね。倒れた冒険者の欠片さ。となりで調べて、好きなものを5個までもらいな」',
  boss: '「ボスだ。負けると盤面の欠片がぜんぶ消える。よく準備してから挑みな」',
};
let tutQ = [];
function tut(k) {
  opt.tut = opt.tut || {}; if (opt.tut.off || opt.tut[k] || !TUT[k]) return; opt.tut[k] = 1; saveOpt();
  tutQ.push(k); if (tutQ.length === 1) tutShow();
}
function tutShow() {
  const k = tutQ[0], el = $('#tut'); if (!k) { el.hidden = true; return; }
  el.innerHTML = `<div class="tbox"><div class="tface"></div><div class="ttext">${TUT[k]}</div><div class="tbtn"><button class="btn sm pri" data-tut="ok">わかった</button><button class="btn sm" data-tut="off">案内をとばす</button></div></div>`;
  el.querySelector('.tface').appendChild(spriteCanvas(84, 4)); el.hidden = false; sfx('open', 0.4);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tut]'); if (!b) return; e.stopPropagation(); if (b.dataset.tut === 'off') { opt.tut = Object.assign(opt.tut || {}, { off: 1 }); saveOpt(); tutQ = []; } else tutQ.shift(); sfx('click', 0.3); tutShow(); }, true);

/* ---------- エンディング（100階を倒したら） ---------- */
function ending(auto) {
  ui.scr = 'ending'; const fs = ui.firsts || {};
  let rows = '';
  for (let f = 1; f <= 100; f++) { const v = fs[f]; if (!v) continue; const names = [v.n || '無名'].concat(Object.values(v.co || {}).map(c => c.n || '無名'));
    rows += `<div class="cr"><span class="crf">${f}階</span><span class="crn nt">${names.map(esc).join('・')}</span></div>`; }
  show(`<div class="ending"><div class="roll ${fxLow() ? 'still' : ''}"><div class="crt">INTEGRA LAYER</div><p class="crs">インテグラ・レイヤーの頂上に、みんなでたどり着いた。</p><h3>各階を最初に越えた人たち</h3>${rows || '<p class="mute">—</p>'}<div class="crt" style="margin-top:40px">ありがとう</div><p class="crs small">音楽：魔王魂　絵と効果音：Kenney</p></div>
    <button class="btn sm skipend" data-a="${auto && run ? 'back' : 'title'}">とじる</button></div>`);
}

/* ---------- 盤面とかばん ---------- */
function boardScreen(from) {
  if (from) { ui.multi = null; ui.mconf = false; ui.pconf = null; }
  ui.scr = 'board'; ui.boardFrom = from || ui.boardFrom || 'title';
  const ba = IL.boardArr(pr), an = IL.analyzeBoard(ba), st = IL.playerStats(pr);
  const gcol = ['#ffd17a', '#8ad3ff', '#ff9ad5', '#b5f78a', '#ffb36b', '#c7a8ff', '#7fffd4', '#ff7f7f'];
  let cells = ''; const lks = Array.from({ length: 25 }, () => [0, 0, 0, 0]);
  for (const [a, b] of an.links) { if (b === a + 1) { lks[a][1] = 1; lks[b][3] = 1; } else { lks[a][2] = 1; lks[b][0] = 1; } }
  for (let i = 0; i < 25; i++) {
    const p = ba[i], gi = an.groupOf[i], big = gi >= 0 && an.groups[gi].cells.length > 1;
 cells += `<div class="cell ${ui.sel === i ? 'sel' : ''} ${big ? 'lk' : ''}" data-cell="${i}">${p ? partHTML(p, '', lks[i]) : ''}${p && big ? `<span class="gm">×${an.mulOf[i]}</span>` : ''}</div>`;
  }
  let sk = ''; for (const sp of IL.SPECIES) { const s = st.skills[sp]; if (s) sk += `<div class="skill" style="--c:${IL.SP_COLOR[sp]}"><i></i>${IL.SKILLS[sp][s.tier]} <span class="mute">${IL.SP_NAME[sp]}×${s.count}・段階${s.tier}${IL.TIER_NAME[s.tier] ? '（' + IL.TIER_NAME[s.tier] + '）' : ''}</span>${st.bless && st.bless[sp] ? `<span class="bless">加護 ${IL.STAT_NAME[st.bless[sp].k]}+${Math.round(st.bless[sp].p * 100)}％</span>` : ''}</div>`; }
  if (!sk) sk = '<div class="mute small">同じ種族を2個以上つなげると技が使える</div>';
  const stats = IL.STATS.map(k => `<div>${IL.STAT_NAME[k]}<b>${st[k]}</b><small class="mute">+${an.add[k]}</small></div>`).join('');
  // かばん
  const onB = new Set(pr.board.filter(x => x != null));
  let list = pr.bag.slice();
  if (ui.filt.sp !== 'all') list = list.filter(p => p.sp === ui.filt.sp);
  if (ui.filt.rar !== 'all') list = list.filter(p => String(p.rar) === ui.filt.rar);
  if (ui.filt.sort === 'score') list.sort((a, b) => IL.partScore(b) - IL.partScore(a)); else if (ui.filt.sort === 'new') list.sort((a, b) => b.id - a.id); else list.sort((a, b) => b.floor - a.floor);
  const mul = ui.multi; ui.lastList = list.filter(p => !onB.has(p.id)).map(p => p.id);
  const items = list.map(p => `<div class="bagitem ${!mul && ui.bagSel === p.id ? 'sel' : ''} ${onB.has(p.id) ? 'eq' : ''} ${mul && mul.has(p.id) ? 'chk' : ''}" data-bag="${p.id}">${partHTML(p)}<small>${IL.RAR_NAME[p.rar]} ${p.floor}階</small></div>`).join('') || '<div class="mute small">かばんは空っぽ</div>';
  const selP = ui.sel != null && ba[ui.sel] ? ba[ui.sel] : ui.bagSel != null ? pr.bag.find(p => p.id === ui.bagSel) : null;
  const spOpt = ['all', ...IL.SPECIES, 'none', 'joker'].map(s => `<option value="${s}" ${ui.filt.sp === s ? 'selected' : ''}>${s === 'all' ? '種族：すべて' : IL.SP_NAME[s]}</option>`).join('');
  const rOpt = ['all', '0', '1', '2', '3'].map(s => `<option value="${s}" ${ui.filt.rar === s ? 'selected' : ''}>${s === 'all' ? 'レアリティ：すべて' : IL.RAR_NAME[s]}</option>`).join('');
  const soOpt = [['score', '強い順'], ['new', '新しい順'], ['floor', '深い階順']].map(([v, n]) => `<option value="${v}" ${ui.filt.sort === v ? 'selected' : ''}>${n}</option>`).join('');
  const keepScroll = [...document.querySelectorAll('.boardwin .bagcol .bag, .boardwin .side, .boardwin')].map(e => e.scrollTop);
  show(`<div class="win boardwin" style="max-width:900px"><button class="btn sm close" data-a="boardback">とじる</button><h2>盤面とかばん</h2>
    <div class="bmain"><div class="boardwrap"><div class="bcol"><div class="board">${cells}</div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="rot" ${selP ? '' : 'disabled'}>回す</button><button class="btn sm" data-a="unequip" ${ui.sel != null && ba[ui.sel] ? '' : 'disabled'}>外す</button><button class="btn sm warn" data-a="discard" ${ui.bagSel != null && !onB.has(ui.bagSel) ? '' : 'disabled'}>捨てる</button></div>
      </div>
      <div class="side"><div class="stats">${stats}</div><div class="skills">${sk}</div>
      <div class="detail">${selP ? partText(selP) : 'マスか欠片を選ぶ。欠片を選んでからマスを押すと置ける。置いた欠片をもう一度押すと回る。'}</div><button class="btn sm pri autob" data-a="autob">🪄 おまかせで組む</button>${presetHTML()}</div></div>
    <div class="bagcol"><div class="spchips">${['all', ...IL.SPECIES, ...['none', 'joker'].filter(x => ui.filt.sp === x || pr.bag.some(q => q.sp === x))].map(sp => `<button class="spc ${ui.filt.sp === sp ? 'on' : ''}" data-a="fsp" data-k="${sp}" style="--c:${sp === 'all' ? '#8a80a8' : IL.SP_COLOR[sp]}" title="${sp === 'all' ? 'すべて' : IL.SP_NAME[sp]}">${sp === 'all' ? '全' : IL.SP_NAME[sp].slice(0, 1)}</button>`).join('')}</div><div class="row bagtools"><select data-f="rar">${rOpt}</select><select data-f="sort">${soOpt}</select><span class="mute small">${pr.bag.length}個</span>
      ${mul ? `<span class="mtools"><button class="btn sm" data-a="mall">表示中をすべて選ぶ</button><button class="btn sm warn" data-a="mdisc" ${mul.size ? '' : 'disabled'}>${ui.mconf ? '本当に捨てる？（' + mul.size + '個）' : mul.size + '個を捨てる'}</button><button class="btn sm" data-a="mend">やめる</button></span>` : '<button class="btn sm" data-a="multi">まとめて捨てる</button>'}</div>
    ${mul ? '<p class="small mute" style="margin:4px 0">捨てる欠片をタップして選ぶ（盤面に置いている欠片は選べない）</p>' : ''}
    <div class="bag">${items}</div></div></div></div>`);
  [...document.querySelectorAll('.boardwin .bagcol .bag, .boardwin .side, .boardwin')].forEach((e, i) => { if (keepScroll[i]) e.scrollTop = keepScroll[i]; });
  { const cur = new Set(an.links.map(([a, b]) => a + '-' + b)), tiers = {}; for (const sp in an.skills || {}) tiers[sp] = an.skills[sp].tier;
    if (ui.prevLinks && !from) { const nw = [...cur].filter(k => !ui.prevLinks.has(k)); const up = Object.keys(tiers).filter(sp => tiers[sp] > ((ui.prevTiers || {})[sp] || 0)); if (nw.length) snapFx(nw, up); }
    ui.prevLinks = cur; ui.prevTiers = tiers; }
  if (an.links.length) tut('link');
}
/* 引っぱって置く：かばん→マスで置く、マス→マスで入れかえ、マス→かばんで外す（押すだけの操作もそのまま） */
const DRAG = { on: false, src: null, id: null, x0: 0, y0: 0, ghost: null, over: null, until: 0, pid: null };
function dragCellAt(x, y) { const el = document.elementFromPoint(x, y); return el ? el.closest('.boardwin .cell') : null; }
document.addEventListener('pointerdown', e => {
  if (ui.scr !== 'board' || ui.multi || e.button > 0) return;
  const bi = e.target.closest('.boardwin [data-bag]'), ce = e.target.closest('.boardwin [data-cell]');
  let id = null, src = null;
  if (bi) { id = +bi.dataset.bag; src = 'bag'; } else if (ce && pr.board[+ce.dataset.cell] != null) { id = pr.board[+ce.dataset.cell]; src = +ce.dataset.cell; }
  if (id == null) return;
  Object.assign(DRAG, { on: false, src, id, x0: e.clientX, y0: e.clientY, pid: e.pointerId, over: null });
});
document.addEventListener('pointermove', e => {
  if (DRAG.id == null || e.pointerId !== DRAG.pid) return;
  if (!DRAG.on) { if (Math.hypot(e.clientX - DRAG.x0, e.clientY - DRAG.y0) < 10) return;
    const p = pr.bag.find(q => q.id === DRAG.id); if (!p) { DRAG.id = null; return; }
    DRAG.on = true; const cell = document.querySelector('.boardwin .cell'), sz = cell ? cell.getBoundingClientRect().width : 48;
    const g = document.createElement('div'); g.className = 'dragghost'; g.style.setProperty('--s', sz + 'px'); g.innerHTML = partHTML(p); document.body.appendChild(g); DRAG.ghost = g; document.body.classList.add('dragging'); }
  e.preventDefault();
  DRAG.ghost.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  const c = dragCellAt(e.clientX, e.clientY); if (c !== DRAG.over) { if (DRAG.over) DRAG.over.classList.remove('dropok'); DRAG.over = c; if (c) c.classList.add('dropok'); }
}, { passive: false });
function dragEnd(e, cancel) {
  if (DRAG.id == null || (e && e.pointerId !== DRAG.pid)) return;
  const was = DRAG.on, src = DRAG.src, id = DRAG.id, over = DRAG.over;
  if (DRAG.ghost) DRAG.ghost.remove(); if (over) over.classList.remove('dropok'); document.body.classList.remove('dragging');
  Object.assign(DRAG, { on: false, id: null, ghost: null, over: null });
  if (!was || cancel) return;
  DRAG.until = performance.now() + 350; // このあとの「押した」は無視
  const before = IL.playerStats(pr);
  if (over) { const to = +over.dataset.cell; if (src === 'bag') { X(['place', to, id]); sfx('place'); } else if (src !== to) { X(['swap', src, to]); sfx('place'); } ui.sel = to; ui.bagSel = null; }
  else if (src !== 'bag' && e && document.elementFromPoint(e.clientX, e.clientY)?.closest('.bagcol, .bag')) { X(['unq', src]); sfx('click', 0.3); ui.sel = null; }
  else return;
  save(); boardScreen(); statDiff(before);
}
document.addEventListener('pointerup', e => dragEnd(e, false));
document.addEventListener('pointercancel', e => dragEnd(e, true));
/* 盤面のプリセット（この端末に保存） */
function presets() { if (!opt.presets || opt.presets.length !== 3) { opt.presets = [null, null, null]; } return opt.presets; }
function presetLabel(ps) { const has = new Set(pr.bag.map(p => p.id)), ba = ps.cells.map(c => c && has.has(c.id) ? pr.bag.find(p => p.id === c.id) : null), an = IL.analyzeBoard(ba);
  const top = Object.entries(an.skills || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 2).map(([sp, v]) => IL.SP_NAME[sp] + '×' + v.count); return top.join('・') || (ba.filter(Boolean).length + '個'); }
function presetHTML() {
  const ps = presets();
  const slots = ps.map((p, k) => `<div class="pslot"><button class="btn sm ${p ? '' : 'ghost'}" data-a="pload" data-k="${k}" ${p ? '' : 'disabled'}>${k + 1}：${p ? esc(presetLabel(p)) : '空き'}</button><button class="btn sm" data-a="psave" data-k="${k}">${ui.pconf === k ? '上書きする？' : '保存'}</button></div>`).join('');
  return `<div class="presets"><div class="small mute">プリセット（今の盤面を保存して、すぐ切り替え）</div>${slots}</div>`;
}
function presetSave(k) { const ps = presets(); if (ps[k] && ui.pconf !== k) { ui.pconf = k; return boardScreen(); }
  ui.pconf = null; ps[k] = { cells: pr.board.map(id => { if (id == null) return null; const p = pr.bag.find(q => q.id === id); return p ? { id, rot: p.rot } : null; }) }; saveOpt(); sfx('ok', 0.4); toast('プリセット' + (k + 1) + 'に保存した'); boardScreen(); }
function applyBoard(want) { // want: 25マス分の {id, rot} か null
  for (let i = 0; i < 25; i++) if (pr.board[i] != null && (!want[i] || want[i].id !== pr.board[i])) X(['place', i, null]);
  for (let i = 0; i < 25; i++) { const c = want[i]; if (!c) continue; if (pr.board[i] !== c.id) X(['place', i, c.id]); const p = pr.bag.find(q => q.id === c.id); for (let n = 0; n < 4 && p && p.rot !== c.rot; n++) X(['rot', c.id]); }
}
/* おまかせで組む：選んだ属性（2つまで）をできるだけつなげて技の段階を上げ、残りを強い欠片で埋める */
const AUTO_SP = ['fire', 'rock', 'forest', 'wind', 'star'];
function autoStats(arr) { const b = IL.baseStats(pr), an = IL.analyzeBoard(arr), o = {}; for (const k of IL.STATS) o[k] = b[k] + an.add[k]; o.skills = an.skills; o.an = an; return o; }
function autoScore(arr, chosen) {
  const st = autoStats(arr); let v = 0;
  for (const sp of chosen) { const k = st.skills[sp]; if (k) v += k.tier * 100000 + k.count * 3000; }
  return v + st.atk * 3 + st.def * 2 + st.hp / 2 + st.spd + st.luck * 0.3;
}
function autoBuild(chosen) {
  const t0 = performance.now(), cs = new Set(chosen);
  const mine = pr.bag.filter(p => cs.has(p.sp) || p.sp === 'joker').sort((a, b) => IL.partScore(b) - IL.partScore(a)).slice(0, 40);
  const other = pr.bag.filter(p => !cs.has(p.sp) && p.sp !== 'joker').sort((a, b) => IL.partScore(b) - IL.partScore(a)).slice(0, 30);
  const pool = mine.concat(other); if (!pool.length) return null;
  const mk = (p, rot) => p ? Object.assign({}, p, { rot }) : null;
  // はじめ：選んだ属性を中央からうず巻きに置き、残りを強い順に。向きは各マスで一番よいものを選ぶ
  const order = [12, 7, 13, 17, 11, 6, 8, 18, 16, 2, 14, 22, 10, 1, 3, 9, 19, 23, 21, 15, 5, 0, 4, 24, 20];
  let board = new Array(25).fill(null); const used = new Set(); let k = 0;
  for (const p of mine.concat(other)) { if (k >= 25) break; const c = order[k++]; let best = null, bs = -Infinity;
    for (let r = 0; r < 4; r++) { board[c] = mk(p, r); const sc = autoScore(board, chosen); if (sc > bs) { bs = sc; best = r; } } board[c] = mk(p, best); used.add(p.id); }
  let cur = autoScore(board, chosen), it = 0;
  // 山登り：入れかえ・回す・別の欠片と取りかえ（スマホでも1秒以内）
  while (performance.now() - t0 < 700 && it < 6000) { it++;
    const nb = board.slice(), r = Math.random(), i = (Math.random() * 25) | 0;
    if (r < 0.4) { const j = (Math.random() * 25) | 0; const tmp = nb[i]; nb[i] = nb[j]; nb[j] = tmp; }
    else if (r < 0.75) { if (!nb[i]) continue; nb[i] = mk(nb[i], (nb[i].rot + 1 + ((Math.random() * 3) | 0)) % 4); }
    else { const u = new Set(nb.filter(Boolean).map(p => p.id)), c = pool.filter(q => !u.has(q.id)); if (!c.length) continue; const q = c[(Math.random() * c.length) | 0]; nb[i] = mk(q, (Math.random() * 4) | 0); }
    const sc = autoScore(nb, chosen); if (sc >= cur) { cur = sc; board = nb; } }
  return board;
}
function autoScreen() {
  ui.scr = 'autob'; ui.autoSel = ui.autoSel || [];
  const chips = AUTO_SP.map(sp => { const n = pr.bag.filter(p => p.sp === sp).length; return `<button class="spc big ${ui.autoSel.includes(sp) ? 'on' : ''}" data-a="autosp" data-k="${sp}" style="--c:${IL.SP_COLOR[sp]}" ${n ? '' : 'disabled'}>${IL.SP_NAME[sp]}<small>${n}個</small></button>`; }).join('');
  show(`<div class="win autowin" style="max-width:520px"><button class="btn sm close" data-a="autoback">もどる</button><h2>おまかせで組む</h2>
    <p class="small mute">中心にする属性を2つまで選ぶ。その属性をできるだけ多くつなげて技を強くし、残りのマスは強い欠片で埋める（万能の欠片も使う）。</p>
    <div class="autochips">${chips}</div>
    <div class="row" style="justify-content:center"><button class="btn pri" data-a="autogo" ${ui.autoSel.length ? '' : 'disabled'}>組む</button></div></div>`);
}
function boardMini(arr, an) {
  const lks = Array.from({ length: 25 }, () => [0, 0, 0, 0]);
  for (const [a, b] of an.links) { if (b === a + 1) { lks[a][1] = 1; lks[b][3] = 1; } else { lks[a][2] = 1; lks[b][0] = 1; } }
  let h = ''; for (let i = 0; i < 25; i++) { const p = arr[i], gi = an.groupOf[i], big = gi >= 0 && an.groups[gi].cells.length > 1; h += `<div class="cell ${big ? 'lk' : ''}">${p ? partHTML(p, '', lks[i]) : ''}</div>`; }
  return `<div class="board mini">${h}</div>`;
}
function autoConfirm() {
  const plan = ui.autoPlan, before = IL.playerStats(pr), after = autoStats(plan);
  const rows = IL.STATS.map(k => { const d = after[k] - before[k]; return `<div><span>${IL.STAT_NAME[k]}</span><b>${before[k]} → ${after[k]}</b><i class="${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '+' + d : d < 0 ? d : '±0'}</i></div>`; }).join('');
  const skl = sts => AUTO_SP.filter(sp => sts.skills[sp]).map(sp => `<span class="sk1" style="--c:${IL.SP_COLOR[sp]}">${IL.SKILLS[sp][sts.skills[sp].tier]}<small>${IL.SP_NAME[sp]}×${sts.skills[sp].count}・段階${sts.skills[sp].tier}</small></span>`).join('') || '<span class="mute">なし</span>';
  ui.scr = 'autoc';
  show(`<div class="win autowin autoc" style="max-width:820px"><h2>この盤面にしますか？</h2>
    <div class="acwrap"><div>${boardMini(plan, after.an)}</div>
    <div class="acside"><div class="acstats">${rows}</div>
      <div class="acsk"><div class="small mute">技（前）</div><div>${skl(before)}</div><div class="small mute">技（後）</div><div>${skl(after)}</div></div>
      <div class="row"><button class="btn pri" data-a="autook">この盤面にする</button><button class="btn" data-a="autoback">やめる</button><button class="btn sm" data-a="autoagain">もう一度考える</button></div></div></div></div>`);
}
function presetLoad(k) {
  const ps = presets()[k]; if (!ps) return; const before = IL.playerStats(pr), has = new Set(pr.bag.map(p => p.id)); let miss = 0;
  const want = ps.cells.map(c => { if (!c) return null; if (!has.has(c.id)) { miss++; return null; } return c; });
  for (let i = 0; i < 25; i++) if (pr.board[i] != null && (!want[i] || want[i].id !== pr.board[i])) X(['place', i, null]);
  for (let i = 0; i < 25; i++) { const c = want[i]; if (!c) continue; if (pr.board[i] !== c.id) X(['place', i, c.id]); const p = pr.bag.find(q => q.id === c.id); for (let n = 0; n < 4 && p.rot !== c.rot; n++) X(['rot', c.id]); }
  ui.sel = null; ui.bagSel = null; ui.pconf = null; save(); sfx('place'); boardScreen(); statDiff(before);
  toast('プリセット' + (k + 1) + 'に切り替えた' + (miss ? '（なくなった欠片 ' + miss + '個は空きのまま）' : ''));
}
/* レアな欠片を拾った瞬間：光の中から欠片が出てくる（押す操作はじゃましない） */
function lootReveal(parts) {
  if (fxLow()) return; const best = parts.slice().sort((a, b) => b.rar - a.rar)[0]; if (!best || best.rar < 1) return;
  const old = document.querySelector('.lootfx'); if (old) old.remove();
  const d = document.createElement('div'); d.className = 'lootfx r' + best.rar;
  d.innerHTML = `<div class="rays"></div><div class="card" style="--s:64px">${partHTML(best)}</div><div class="nm">${IL.SP_NAME[best.sp]}の欠片<b>${IL.RAR_NAME[best.rar]}</b></div>`;
  $('#app').appendChild(d); setTimeout(() => d.remove(), best.rar >= 2 ? 1900 : 1400);
  if (best.rar >= 2) sfx('levelup', 0.45);
}
/* 会心の一撃：画面が一瞬光って、大きな文字 */
function critFx() {
  const d = document.createElement('div'); d.className = 'critfx'; d.innerHTML = '<b>会心の一撃！</b>'; $('#app').appendChild(d); setTimeout(() => d.remove(), opt.bspd === 'fast' ? 700 : 1100);
  sfx('hit', 0.8); setTimeout(() => sfx('god', 0.3), 40); const w = document.querySelector('.battle'); if (w) { w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }
}
/* ボスを倒した瞬間：白く光って、ゆっくり崩れ、「撃破！」 */
function bossKillFx() {
  const w = document.querySelector('.battle'); const fl = document.createElement('div'); fl.className = 'killfx'; fl.innerHTML = '<b>撃破！</b>'; $('#app').appendChild(fl); setTimeout(() => fl.remove(), 1800);
  const sp = document.querySelector('.foe .spr'); if (sp) sp.classList.add('dying'); if (w) w.classList.add('shake');
  sfx('god', 0.6); setTimeout(() => sfx('win', 0.5), 500);
}
/* 欠片がカチッとはまった瞬間：光・火花・小さなゆれ・音。技の段階が上がったら大きく */
function snapFx(keys, upSp) {
  const bd = document.querySelector('.boardwin .board'); if (!bd) return; const br = bd.getBoundingClientRect();
  for (const k of keys) { const [a, b] = k.split('-').map(Number), ca = bd.querySelector(`[data-cell="${a}"]`), cb = bd.querySelector(`[data-cell="${b}"]`); if (!ca || !cb) continue;
    for (const c of [ca, cb]) { c.classList.remove('snapcell'); void c.offsetWidth; c.classList.add('snapcell'); }
    const ra = ca.getBoundingClientRect(), rb = cb.getBoundingClientRect(), x = (ra.left + ra.right + rb.left + rb.right) / 4 - br.left, y = (ra.top + ra.bottom + rb.top + rb.bottom) / 4 - br.top;
    const f = document.createElement('div'); f.className = 'snapfx'; f.style.left = x + 'px'; f.style.top = y + 'px'; f.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><b>カチッ</b>'; bd.appendChild(f); setTimeout(() => f.remove(), 700); }
  bd.classList.remove('snapshake'); void bd.offsetWidth; bd.classList.add('snapshake');
  sfx('place', 0.7); setTimeout(() => sfx('select', 0.5), 60);
  if (upSp && upSp.length) { sfx('god', 0.35); const t = document.createElement('div'); t.className = 'tierup'; t.textContent = upSp.map(sp => IL.SKILLS[sp][(IL.analyzeBoard(IL.boardArr(pr)).skills[sp] || {}).tier] || '').filter(Boolean).join('・') + '　段階UP！'; bd.appendChild(t); setTimeout(() => t.remove(), 1300); }
}
function statDiff(before) { const a = IL.playerStats(pr), out = []; for (const k of IL.STATS) { const d = a[k] - before[k]; if (d) out.push(IL.STAT_NAME[k] + (d > 0 ? ' +' : ' ') + d); } if (out.length) toast(out.join('　')); }
function boardCellTap(i) {
  const id = pr.board[i], before = IL.playerStats(pr);
  if (ui.bagSel != null) { X(['place', i, ui.bagSel]); ui.bagSel = null; ui.sel = i; sfx('place'); }
  else if (ui.sel === i && id != null) { X(['rot', id]); sfx('rotate'); }
  else if (ui.sel != null && ui.sel !== i && pr.board[ui.sel] != null) { X(['swap', ui.sel, i]); ui.sel = i; sfx('place'); }
  else { ui.sel = i; sfx('click', 0.3); }
  save(); boardScreen(); statDiff(before);
}

/* ---------- 能力 ---------- */
function points() {
  ui.scr = 'points'; const b = IL.baseStats(pr), st = IL.playerStats(pr);
  const rows = IL.STATS.map(k => `<div class="row" style="justify-content:space-between;background:var(--panel2);padding:8px;border-radius:8px"><span>${IL.STAT_NAME[k]}　<b>${st[k]}</b> <span class="mute small">（レベル ${b[k] - IL.B.perPt[k] * pr.pts[k]}＋ポイント ${IL.B.perPt[k] * pr.pts[k]}＋盤面 ${st[k] - b[k]}）</span></span><button class="btn sm" data-pt="${k}" ${pr.freePts ? '' : 'disabled'}>＋${IL.B.perPt[k]}</button></div>`).join('');
  const need = pr.lv < 100 ? IL.NEED[pr.lv] : 0;
  show(`<div class="win ptwin"><button class="btn sm close" data-a="title">もどる</button><h2>能力</h2>
    <p>Lv ${pr.lv}　経験値 ${pr.exp} / ${need}　<span class="gold">残りポイント ${pr.freePts}</span></p>
    <div class="row"><button class="btn pri" data-a="ptauto" ${pr.freePts ? '' : 'disabled'}>おまかせで振る（${{ atk: '攻撃', hp: '体力', def: '守り' }[opt.autoPt] || 'バランス'}）</button><span class="small mute">レベルが上がったら自動で振る：</span>${[['off', 'しない'], ['atk', '攻撃'], ['hp', '体力'], ['def', '守り'], ['bal', 'バランス']].map(([k, n]) => `<button class="btn sm ${(opt.autoPt || 'off') === k ? 'pri' : ''}" data-a="apt" data-k="${k}">${n}</button>`).join('')}</div>
    <div class="grid">${rows}</div>
    <p class="small mute">運は会心の一撃・レアの出やすさに効く。素早さは戦いで先に動けるかに効く。</p>
    <button class="btn" data-a="respec" ${pr.respec ? '' : 'disabled'}>振りなおす（振りなおしの札 ${pr.respec}枚）</button></div>`);
}

/* ---------- 合成 ---------- */
function synth() { // 合成所
  ui.scr = 'synth';
  const base = pr.bag.find(p => p.id === ui.synthBase), mat = pr.bag.find(p => p.id === ui.synthMat);
  if (!base) ui.synthBase = null; if (!mat) ui.synthMat = null;
  const onB = new Set(pr.board.filter(x => x != null));
  let list = base ? pr.bag.filter(p => IL.canSynth(base, p) && (ui.synAll || !onB.has(p.id))) : pr.bag.filter(p => p.stats.some(s => s.r !== 'A') && pr.bag.some(q => IL.canSynth(p, q)));
  list.sort((a, b) => IL.partScore(b) - IL.partScore(a));
  const items = list.map(p => `<div class="bagitem ${p.id === ui.synthMat || p.id === ui.synthBase ? 'sel' : ''}" data-syn="${p.id}">${partHTML(p)}<small>${onB.has(p.id) ? '<b class="gold">盤面</b> ' : ''}${IL.RAR_NAME[p.rar]} ${p.floor}階</small></div>`).join('')
    || `<div class="mute small" style="padding:8px">${base ? '同じ種族・同じレアリティの欠片がない' : '合成できる組み合わせがない（同じ種族・同じレアリティの欠片が2つ必要）'}</div>`;
  const tk = ui.synTk = Math.max(0, Math.min(IL.B.synTkMax, ui.synTk | 0)), guard = ui.synGuard = !!ui.synGuard;
  const rate = Math.round(IL.synthRate(pr, tk) * 100), cost = base ? IL.synthCost(base, tk, guard) : 0, short = cost > pr.gold;
  const tkP = base ? IL.B.synTk[base.rar] : null, gdP = base ? IL.B.synGuard[base.rar] : null;
  const up = base ? base.stats.filter(st => st.r !== 'A').map(st => IL.STAT_NAME[st.k] + ' ' + st.r + '→' + (st.r === 'C' ? 'B' : 'A')) : [];
  const res = ui.synRes; ui.synRes = null;
  const say = res ? (res.ok ? 'よし、うまくいった！' : res.kept ? '補強が効いたね。強くする方は無事だ。' : 'すまないね…こればかりは運だ。')
    : !base ? '強くしたい欠片を出してみな。' : !mat ? '同じ種族・同じレアリティの欠片を材料にするんだ。' : rate >= 70 ? 'これならまず大丈夫だ。' : rate >= 45 ? '五分より少し上ってところだね。' : 'うーん、分の悪い賭けだよ。';
  const slot = (p, lab, a) => `<button class="synslot ${p ? 'has' : ''}" data-a="${a}" ${p ? '' : 'disabled'}>${p ? partHTML(p) : '<span class="q">？</span>'}<small>${lab}</small></button>`;
  show(`<div class="win synwin"><button class="btn sm close" data-a="title">もどる</button>
    <div class="synhead"><div class="spr shop" data-tile="87"></div><div class="bubble">${say}</div><h2>合成所</h2></div>
    <div class="synmain">
      <div class="syncol">
        <div class="synpair">${slot(base, '強くする方', 'synclr')}<span class="plus">＋</span>${slot(mat, '材料', 'synclrm')}</div>
        ${res ? `<div class="synres ${res.ok ? 'ok' : 'ng'}">${res.ok ? '成功！ ' + IL.STAT_NAME[res.stat] + 'が ' + res.rank + ' になった' : res.kept ? '失敗… 補強で強くする方は残った' : '失敗… 2つとも消えた'}</div>`
          : `<div class="small synup">${base ? (up.length ? '成功すると、どれか1つが上がる：<b>' + up.join('　') + '</b>' : 'これ以上強くできない') : '下の手順で選ぶ<br>① 強くする欠片　② 材料'}</div>`}
      </div>
      <div class="syncol rate">
        <div class="rbig"><span>成功率</span><b>${rate}<small>％</small></b></div>
        <div class="rbar"><i style="width:${rate}%"></i></div>
        <div class="tkrow"><span class="lab">確率チケット<small>${tkP != null ? '1枚 +5％・' + tkP + 'G' : '1枚 +5％'}</small></span>
          <span class="step"><button class="btn sm" data-a="tkm" ${tk ? '' : 'disabled'}>−</button><b>${tk}</b><button class="btn sm" data-a="tkp" ${tk < IL.B.synTkMax ? '' : 'disabled'}>＋</button></span></div>
        <div class="tkq"><button class="btn sm ${tk === 0 ? 'pri' : ''}" data-a="tks" data-k="0">なし</button><button class="btn sm ${tk === 5 ? 'pri' : ''}" data-a="tks" data-k="5">5枚</button><button class="btn sm ${tk === 10 ? 'pri' : ''}" data-a="tks" data-k="10">最大10枚</button></div>
        <button class="guard ${guard ? 'on' : ''}" data-a="tgd"><span class="sw"><i></i></span><span>補強する<small>失敗しても強くする方は残る${gdP != null ? '・' + gdP + 'G' : ''}</small></span></button>
        <div class="total"><span>合計 <b class="${short ? 'ng' : 'gold'}">${cost} G</b></span><span class="mute">所持 ${pr.gold} G</span></div>
        <button class="btn pri big" data-a="dosynth" ${base && mat && !short ? '' : 'disabled'}>${short ? 'お金が足りない' : '合成する'}</button>
      </div>
      <div class="syncol pick">
        <div class="small mute">${base ? '② 材料を選ぶ' : '① 強くする欠片を選ぶ'}${base ? `　<button class="btn sm" data-a="synall">${ui.synAll ? '☑' : '☐'} 盤面の欠片も出す</button>` : ''}</div>
        <div class="bag">${items}</div>
      </div>
    </div></div>`);
  document.querySelectorAll('.synwin .spr').forEach(d => d.appendChild(spriteCanvas(+d.dataset.tile, innerHeight < 520 ? 2 : 3)));
}

/* ---------- ガチャ ---------- */
function gacha() {
  ui.scr = 'gacha'; const day = todayKey();
  if (!pr.gacha || pr.gacha.day !== day) { X(['groll', day]); save(); }
  const g = pr.gacha;
  const opts = g.opts.map((p, i) => `<div class="bagitem" data-gp="${i}" style="--s:64px;background:var(--panel2);padding:10px">${partHTML(p)}<small>${IL.RAR_NAME[p.rar]}</small><div class="small" style="text-align:left">${partText(p)}</div></div>`).join('');
  const picked = g.pickedId != null ? pr.bag.find(p => p.id === g.pickedId) : null;
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>今日のガチャ</h2>
    <p class="small mute">1日1回、3個から1個えらべる（夜0時に切りかわる）。ガチャの欠片は、ふつうに倒れても落とさない。数字は最前線（${IL.gachaFloor(pr)}階）のもの。</p>
    ${g.picked ? `<p>今日の欠片：</p>${picked ? '<div class="lootlist">' + partHTML(picked) + '</div><div class="detail">' + partText(picked) + '</div>' : ''}
      <p class="small mute">ガチャチケットで引きなおすと、今日の欠片は消えて、新しい3個から選びなおせる。</p>
      <button class="btn" data-a="reroll" ${pr.tickets ? '' : 'disabled'}>引きなおす（チケット ${pr.tickets}枚）</button>`
      : `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${opts}</div>`}</div>`);
}

/* ---------- ダンジョン ---------- */
const cv = $('#view'), g = cv.getContext('2d'), mini = $('#mini'), mg = mini.getContext('2d');
let TS = 48, anim = null, dirty = true;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const sc = Math.max(2, Math.min(4, Math.floor(Math.min(W / (16 * 22), H / (16 * 13)))));
  TS = 16 * sc * dpr; g.imageSmoothingEnabled = false;
  const k = W < 900 || H < 500 ? 0.8 : 1.2; mini.width = 150; mini.height = 100; mini.style.width = Math.round(150 * k) + 'px'; mini.style.height = Math.round(100 * k) + 'px';
  dirty = true;
}
addEventListener('resize', resize);
function enterRun(r) { run = r; Net.anMark('run'); if (r.floor <= 10) Net.anMark('f' + r.floor); Net.anSet('lf', r.floor); Net.presence(r.floor); ui.scr = null; ui.ghosts = []; miniKey = ''; watchLive(true); hideScreen(); $('#hud').hidden = false; $('#pad').hidden = false; dirty = true; hud(); save(); tut('start'); }
function hud() {
  if (!run) return; const st = IL.playerStats(pr);
  $('#h-floor').textContent = run.floor; $('#h-biome').textContent = IL.biomeOf(run.floor).name;
  const hr = Math.max(0, Math.min(1, run.hp / st.hp)), hb = $('#h-hpbar'); $('#h-hp').textContent = run.hp + ' / ' + st.hp; hb.style.width = 100 * hr + '%'; $('#h-hplag').style.width = 100 * hr + '%'; hb.className = hr <= 0.25 ? 'low' : hr <= 0.5 ? 'mid' : '';
  $('#h-lv').textContent = 'Lv ' + pr.lv; $('#h-gold').textContent = pr.gold + ' G';
}
function drawIdle() { g.fillStyle = '#14111c'; g.fillRect(0, 0, cv.width, cv.height); }
const TB = { on: false, shards: [] };
function drawTitleBg() { TB.on = true; if (!TB.shards.length) for (let i = 0; i < 26; i++) TB.shards.push({ x: Math.random(), y: Math.random(), s: 6 + Math.random() * 14, v: 0.00004 + Math.random() * 0.00008, c: Object.values(IL.SP_COLOR)[i % 7], r: Math.random() * 6 }); }
function titleAnim(now) {
  const W = cv.width, H = cv.height; const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b0814'); gr.addColorStop(1, '#1c1430'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 60; i++) { const x = (i * 97.3 % 1) * W, y = ((i * 57.7) % 1) * H * 0.7, tw = 0.5 + 0.5 * Math.sin(now / 700 + i); g.globalAlpha = 0.2 + 0.5 * tw; g.fillRect(x, y, 2, 2); } g.globalAlpha = 1;
  // 塔の影
  const tw = Math.min(W * 0.18, 200), bx = W / 2 - tw / 2; g.fillStyle = '#07050c';
  for (let k = 0; k < 9; k++) { const w = tw * (1 - k * 0.07), h = H * 0.11, y = H - (k + 1) * h * 0.95; g.fillRect(W / 2 - w / 2, y, w, h); g.fillStyle = k % 2 ? '#07050c' : '#0a0712'; if (k % 2 === 0) { g.fillStyle = 'rgba(242,209,75,' + (0.25 + 0.2 * Math.sin(now / 500 + k)) + ')'; g.fillRect(W / 2 - 3, y + h * 0.4, 6, 8); g.fillStyle = '#07050c'; } }
  for (const s of TB.shards) { if (!fxLow()) s.y -= s.v * 16; if (s.y < -0.05) { s.y = 1.05; s.x = Math.random(); } const x = s.x * W, y = s.y * H; g.save(); g.translate(x, y); g.rotate(s.r + now / 3000); g.globalAlpha = 0.35; g.fillStyle = s.c; g.fillRect(-s.s / 2, -s.s / 2, s.s, s.s); g.restore(); } g.globalAlpha = 1;
}
function render(now) {
  requestAnimationFrame(render);
  if (!run) { if (guideTxt) { guideTxt = ''; $('#guide').hidden = true; document.body.classList.remove('guidemenu'); } if (TB.on && ui.scr !== 'ending') { titleAnim(now); if (window.FX) FX.frame(cv, { bloom: 1.1, vig: 0.45, th: 0.55 }); } else if (window.FX) FX.hide(); return; }
  if (!sheet.complete) return;
  let ax = run.x, ay = run.y;
  if (anim) { const t = Math.min(1, (now - anim.t0) / 110); ax = anim.x0 + (run.x - anim.x0) * t; ay = anim.y0 + (run.y - anim.y0) * t; if (t >= 1) anim = null; dirty = true; }
  if (!dirty) return; dirty = !!anim;
  const fl = IL.genFloor(run.floor), bi = Math.min(9, Math.floor((run.floor - 1) / 10)), B = IL.biomeOf(run.floor), src = tintSheet(bi), bits = IL.mapBits(pr, run);
  const W = cv.width, H = cv.height, cx = W / 2 - TS / 2 - ax * TS, cy = H / 2 - TS / 2 - ay * TS;
  g.fillStyle = '#0a0810'; g.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(-cx / TS) - 1), y0 = Math.max(0, Math.floor(-cy / TS) - 1), x1 = Math.min(fl.W - 1, Math.ceil((W - cx) / TS) + 1), y1 = Math.min(fl.H - 1, Math.ceil((H - cy) / TS) + 1);
  const T = IL.T, br = fl.rooms[fl.bossRoom], cleared = pr.cleared[run.floor];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * fl.W + x; if (!bits || !bits[i]) continue;
    const v = fl.t[i], px = Math.round(cx + x * TS), py = Math.round(cy + y * TS);
    const hh = (Math.imul(i ^ (i >>> 5) ^ 0x5bd1e995, 2654435761) ^ (i * 40503)) >>> 0, NA = atlas.complete && atlas.width ? tintAtlas(bi) : null;
    if (v === T.WALL) { let adj = false; for (const o of [1, -1, fl.W, -fl.W, fl.W + 1, fl.W - 1, -fl.W + 1, -fl.W - 1]) if (fl.t[i + o]) adj = true; if (!adj) continue;
      if (!NA) { drawTile(g, src, B.wallTile, px, py, TS); continue; }
      if (fl.t[i + fl.W]) { // 下が床：壁の正面（れんが）
        const nm = hh % 29 === 0 ? ['wall_banner_red', 'wall_banner_blue', 'wall_banner_green', 'wall_banner_yellow'][(hh >>> 5) % 4] : hh % 13 === 0 ? 'wall_hole_1' : hh % 17 === 0 ? 'wall_hole_2' : hh % 23 === 0 ? 'wall_goo' : 'wall_mid';
        drawArt(g, NA, nm, px, py, TS);
      } else { // 壁の上（暗い天面）。下が壁の正面なら、ふちを描く
        g.fillStyle = '#16121c'; g.fillRect(px, py, TS, TS);
        if (!fl.t[i + fl.W] && fl.t[i + 2 * fl.W]) drawArt(g, NA, 'wall_top_mid', px, py, TS);
        const e = Math.max(1, TS / 16) * 2; g.fillStyle = 'rgba(150,130,160,.55)';
        if (fl.t[i - 1]) g.fillRect(px, py, e, TS); if (fl.t[i + 1]) g.fillRect(px + TS - e, py, e, TS); if (fl.t[i - fl.W]) g.fillRect(px, py, TS, e);
      }
      continue; }
    if (NA) drawArt(g, NA, hh % 5 === 0 ? 'floor_' + (2 + (hh >>> 4) % 7) : 'floor_1', px, py, TS);
    else drawTile(g, src, hh % 17 === 0 ? (B.floorTile === 48 ? 49 : B.floorTile === 0 ? 12 : 24) : B.floorTile, px, py, TS);
    if (v === T.BOSS) { g.fillStyle = 'rgba(120,20,40,.25)'; g.fillRect(px, py, TS, TS); }
    else if (v === T.PED) drawTile(g, src, run.opened[i] ? 55 : 54, px, py, TS);
    else if (v === T.SAFE) drawTile(g, src, 32, px, py, TS);
    else if (v === T.GATE) drawTile(g, src, 45, px, py, TS);
    else if (fl.herbAt[i] && !(run.herbs && run.herbs[i])) g.drawImage(HERB, px, py, TS, TS);
  }
  // ボス部屋の中
  if (bits && bits[br.cy * fl.W + br.cx]) {
    const px = cx + br.cx * TS, py = cy + br.cy * TS;
    drawTile(g, src, 39, px, py, TS); // 階段
    if (!run.bossDown) { const bt = IL.ETYPES[IL.bossType(run.floor)], k = 1.7, wob = Math.sin(now / 300) * TS * 0.04;
      g.fillStyle = 'rgba(255,60,80,.18)'; g.beginPath(); g.arc(px + TS / 2, py + TS / 2, TS * 0.95, 0, 7); g.fill();
      if (BIGART[bt.tile] && atlas.complete && atlas.width) drawArt(g, tintAtlas(bi), BIGART[bt.tile], px, py + wob, TS); else drawTile(g, src, bt.tile, px + TS / 2 - TS * k / 2, py + TS / 2 - TS * k * 0.62 + wob, TS * k); }
  }
  if (run.bossChest) { const c = run.bossChest.i; if (bits[c]) drawTile(g, src, run.bossChest.opened ? 90 : 89, cx + (c % fl.W) * TS, cy + ((c / fl.W) | 0) * TS, TS); }
  ui.cam = { cx, cy, TS };
  const vis = (x, y) => Math.abs(x - run.x) <= 9 && Math.abs(y - run.y) <= 7 && bits[y * fl.W + x];
  if (run.merchant && vis(run.merchant.x, run.merchant.y)) drawTile(g, src, 84, cx + run.merchant.x * TS, cy + run.merchant.y * TS, TS);
  for (const e of run.enemies) if (vis(e.x, e.y)) { drawTile(g, src, e.tile, cx + e.x * TS, cy + e.y * TS, TS, { ph: (e.uid || 0) % 4, flip: e.x > run.x }); if (e.cool) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(cx + e.x * TS, cy + e.y * TS, TS, TS); } }
  const opened = pr.bagsOpen || {};
  for (const b of ui.bags) if (bits[b.y * fl.W + b.x] && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) { g.globalAlpha = opened[b.id] ? 0.35 : 1; const bob = opened[b.id] ? 0 : Math.sin(now / 400 + b.x) * TS * 0.04; g.drawImage(BAG, cx + b.x * TS, cy + b.y * TS + bob, TS, TS); g.globalAlpha = 1; }
  if (ui.bags.some(b => !opened[b.id])) dirty = true;
  g.globalAlpha = 0.45; for (const o of ui.ghosts) if (Math.abs(o.x - run.x) <= 12 && Math.abs(o.y - run.y) <= 9) drawTile(g, sheet, 85 + (IL.hashStr(o.u) % 4), cx + o.x * TS, cy + o.y * TS, TS); g.globalAlpha = 1;
  if (walk && walk.target != null) { const tx = walk.target % fl.W, ty = (walk.target / fl.W) | 0, px = cx + tx * TS, py = cy + ty * TS; g.strokeStyle = 'rgba(242,209,75,' + (0.55 + 0.3 * Math.sin(now / 150)) + ')'; g.lineWidth = Math.max(2, TS / 16); g.strokeRect(px + TS * 0.15, py + TS * 0.15, TS * 0.7, TS * 0.7); dirty = true; }
  if (ART.knight && atlas.complete && atlas.width) drawArt(g, atlas, anim ? 'knight_run' : 'knight', Math.round(W / 2 - TS / 2), Math.round(H / 2 - TS / 2), TS, { flip: ui.face === 3 });
  else drawTile(g, sheet, 97, Math.round(W / 2 - TS / 2), Math.round(H / 2 - TS / 2), TS);
  // 見えている範囲の外を少し暗く
  // たいまつの明かり（自分のまわりだけ明るい）
  const fk = fxLow() ? 0 : Math.sin(now / 130) * 0.15 + Math.sin(now / 47) * 0.08, r0 = TS * (3.2 + fk), r1 = TS * (8.5 + fk);
  const grd = g.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1); grd.addColorStop(0, 'rgba(255,170,80,.05)'); grd.addColorStop(0.35, 'rgba(0,0,0,.15)'); grd.addColorStop(1, 'rgba(4,3,8,.82)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (!fxLow()) dirty = true;
  if (!fxLow()) drawParticles(now, cx, cy, fl, bits, bi, x0, y0, x1, y1);
  drawGuide(now, cx, cy, fl);
  drawMini(fl, bits);
  if (window.FX) { const t = B.tint || [1, 1, 1]; FX.frame(cv, { px: TS / 16, bump: 0.45, bloom: 1.0, th: 0.5, vig: 0.42, tint: [1 + (t[0] - 1) * 0.18, 1 + (t[1] - 1) * 0.18, 1 + (t[2] - 1) * 0.18] }); }
}
function tileColor(v, i) { const T = IL.T; return v === T.BOSS ? '#b03048' : v === T.GATE ? '#ff6a4d' : v === T.SAFE ? '#4fd17a' : v === T.PED ? (run.opened[i] ? '#666' : '#f2d14b') : '#9a8fc0'; }
/* 粒の演出（見た目だけ）：地域ごとの空気の粒・歩いたときのほこり・お宝のきらめき */
const PT = { amb: [], fx: [], lastT: 0 };
const AMB = [ // 地域ごと：色・動き（上へ/下へ/ただよう）・大きさ
  { c: [150, 230, 120], v: -0.15, s: 1.2, tw: 1 }, { c: [235, 210, 150], v: 0.02, s: 1.0, tw: 0 }, { c: [150, 210, 255], v: -0.05, s: 1.3, tw: 1 },
  { c: [255, 150, 60], v: -0.55, s: 1.3, tw: 1 }, { c: [230, 240, 255], v: 0.35, s: 1.4, tw: 0 }, { c: [140, 220, 90], v: -0.3, s: 1.5, tw: 0 },
  { c: [255, 220, 120], v: 0.05, s: 0.9, tw: 1 }, { c: [180, 120, 255], v: -0.2, s: 1.6, tw: 0 }, { c: [255, 240, 200], v: -0.05, s: 1.1, tw: 1 }, { c: [235, 235, 255], v: -0.1, s: 1.0, tw: 1 }];
function dust(x, y) { if (fxLow()) return; for (let k = 0; k < 5; k++) PT.fx.push({ x: x + 0.5 + (Math.random() - 0.5) * 0.5, y: y + 0.85, vx: (Math.random() - 0.5) * 0.8, vy: -Math.random() * 0.35, life: 0.45 + Math.random() * 0.25, age: 0, c: [190, 170, 150], s: 1.5 + Math.random(), add: false }); }
function sparkle(x, y, c) { PT.fx.push({ x: x + 0.15 + Math.random() * 0.7, y: y + 0.1 + Math.random() * 0.6, vx: 0, vy: -0.25, life: 0.7, age: 0, c, s: 1.6, add: true, star: true }); }
function drawParticles(now, cx, cy, fl, bits, bi, x0, y0, x1, y1) {
  const dt = Math.min(0.05, (now - (PT.lastT || now)) / 1000); PT.lastT = now; const A = AMB[bi] || AMB[0], u = TS / 16;
  while (PT.amb.length < 26) PT.amb.push({ x: run.x + (Math.random() - 0.5) * 18, y: run.y + (Math.random() - 0.5) * 12, ph: Math.random() * 6.3, sp: 0.6 + Math.random() * 0.8 });
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const p of PT.amb) {
    p.y += A.v * p.sp * dt; p.x += Math.sin(now / 1400 + p.ph) * 0.12 * dt * 4;
    if (Math.abs(p.x - run.x) > 10 || Math.abs(p.y - run.y) > 7) { p.x = run.x + (Math.random() - 0.5) * 18; p.y = run.y + (A.v < 0 ? 6 : A.v > 0 ? -6 : (Math.random() - 0.5) * 12); }
    const a = 0.35 + 0.35 * (A.tw ? Math.max(0, Math.sin(now / 300 + p.ph * 3)) : Math.sin(now / 900 + p.ph) * 0.5 + 0.5), r = u * A.s * (0.7 + p.sp * 0.5);
    g.fillStyle = `rgba(${A.c[0]},${A.c[1]},${A.c[2]},${a.toFixed(2)})`; g.fillRect(cx + p.x * TS - r / 2, cy + p.y * TS - r / 2, r, r);
  }
  // お宝のきらめき（開いていない台座・バッグ・ボスの宝箱）とほのかな光
  const opened = pr.bagsOpen || {}, glow = (x, y, c, k) => { const px = cx + (x + 0.5) * TS, py = cy + (y + 0.5) * TS, gr = g.createRadialGradient(px, py, 0, px, py, TS * k); gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.35)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px - TS * k, py - TS * k, TS * 2 * k, TS * 2 * k); };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * fl.W + x; if (!bits[i]) continue; const v = fl.t[i];
    if (v === IL.T.PED && !run.opened[i]) { glow(x, y, [255, 210, 90], 0.9 + 0.1 * Math.sin(now / 400 + i)); if (Math.random() < dt * 1.6) sparkle(x, y, [255, 230, 140]); }
    else if (v === IL.T.GATE) glow(x, y, [255, 90, 70], 0.8 + 0.15 * Math.sin(now / 500));
    else if (v === IL.T.SAFE) glow(x, y, [90, 255, 140], 0.75); }
  for (const b of ui.bags) if (!opened[b.id] && bits[b.y * fl.W + b.x] && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) { glow(b.x, b.y, [200, 160, 255], 0.9); if (Math.random() < dt * 1.4) sparkle(b.x, b.y, [220, 190, 255]); }
  if (run.bossChest && !run.bossChest.opened) { const c = run.bossChest.i, x = c % fl.W, y = (c / fl.W) | 0; if (bits[c]) { glow(x, y, [255, 220, 120], 1.1); if (Math.random() < dt * 3) sparkle(x, y, [255, 240, 170]); } }
  // ほこり・きらめき
  for (const p of PT.fx) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; const k = 1 - p.age / p.life; if (k <= 0) continue;
    g.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; const r = u * p.s * (p.star ? 1 : 0.6 + k * 0.6), px = cx + p.x * TS, py = cy + p.y * TS;
    g.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${(p.add ? k : k * 0.55).toFixed(2)})`;
    if (p.star) { g.fillRect(px - r * 1.5, py - u * 0.4, r * 3, u * 0.8); g.fillRect(px - u * 0.4, py - r * 1.5, u * 0.8, r * 3); } else g.fillRect(px - r / 2, py - r / 2, r, r); }
  PT.fx = PT.fx.filter(p => p.age < p.life);
  g.restore();
}
let miniKey = '';
/* はじめての1階の案内：光る矢印で次にすることを見せる（1階のボスを倒すまで） */
let guideTxt = '';
function guideGoal(fl) {
  if (!run || run.floor !== 1 || pr.cleared[1] || !fl.guide) return null;
  if (!pr.board.some(x => x != null) && pr.bag.length) return { menu: true, s: '手に入れた欠片を、盤面にはめよう（右下の ≡ →「盤面とかばん」）' };
  let best = null; for (const i of fl.peds) if (!run.opened[i]) { const d = Math.abs(i % fl.W - run.x) + Math.abs(((i / fl.W) | 0) - run.y); if (!best || d < best.d) best = { i, d }; }
  if (best && !pr.bag.length) return { i: best.i, s: '光る台座のとなりで「調べる」を押そう' };
  let g = -1, gd = 1e9; for (let i = 0; i < fl.t.length; i++) if (fl.t[i] === IL.T.GATE) { const d = Math.abs(i % fl.W - run.x) + Math.abs(((i / fl.W) | 0) - run.y); if (d < gd) { gd = d; g = i; } }
  return { i: g, s: '右のボス部屋へ行こう（「探索」ボタンや、行きたい所のタップでも歩ける）' };
}
function drawGuide(now, cx, cy, fl) {
  const gl = ui.scr ? null : guideGoal(fl), el = $('#guide');
  const txt = gl ? gl.s : ''; if (txt !== guideTxt) { guideTxt = txt; if (el) { el.textContent = txt; el.hidden = !txt; } document.body.classList.toggle('guidemenu', !!(gl && gl.menu)); }
  if (!gl || gl.menu || gl.i < 0) return;
  const tx = gl.i % fl.W, ty = (gl.i / fl.W) | 0, W = cv.width, H = cv.height;
  let px = cx + (tx + 0.5) * TS, py = cy + ty * TS - TS * 0.35 + Math.sin(now / 180) * TS * 0.15;
  const m = TS * 0.8, inside = px > m && px < W - m && py > m && py < H - m, ang = inside ? Math.PI / 2 : Math.atan2(py - H / 2, px - W / 2);
  if (!inside) { const k = Math.min((W / 2 - m) / Math.abs(px - W / 2 || 1), (H / 2 - m) / Math.abs(py - H / 2 || 1)); px = W / 2 + (px - W / 2) * k; py = H / 2 + (py - H / 2) * k; }
  g.save(); g.translate(px, py); g.rotate(ang); const s = TS * 0.42;
  g.shadowColor = '#ffd27a'; g.shadowBlur = TS * 0.5; g.fillStyle = '#ffe58a'; g.strokeStyle = '#7a4a0c'; g.lineWidth = Math.max(2, TS / 20);
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.2, -s * 0.7); g.lineTo(-s * 0.2, -s * 0.28); g.lineTo(-s, -s * 0.28); g.lineTo(-s, s * 0.28); g.lineTo(-s * 0.2, s * 0.28); g.lineTo(-s * 0.2, s * 0.7); g.closePath(); g.fill(); g.shadowBlur = 0; g.stroke(); g.restore();
  dirty = true;
}
/* 地図の目印：ボス部屋・行商人（その場所が地図に描けているときだけ） */
function mapMarks(fl, bits) {
  const out = [], T = IL.T; let gate = -1;
  for (let i = 0; i < fl.t.length; i++) if (fl.t[i] === T.GATE && bits[i]) { gate = i; break; }
  const bc = IL.bossCenter(fl); if (!run.bossDown && (bits[bc] || gate >= 0)) out.push({ i: bits[bc] ? bc : gate, c: '255,70,90', kind: 'boss' });
  if (run.merchant) { const mi = run.merchant.y * fl.W + run.merchant.x; if (bits[mi]) out.push({ i: mi, c: '255,210,80', kind: 'shop' }); }
  return out;
}
function drawMini(fl, bits) { // 自分のまわりだけ（タップで全体）
  const k = 3, vw = mini.width / k, vh = mini.height / k, ox = Math.round(run.x - vw / 2), oy = Math.round(run.y - vh / 2);
  const marks = mapMarks(fl, bits), key = run.floor + ':' + run.x + ':' + run.y + ':' + ui.bags.length + (marks.length ? ':' + Math.floor(performance.now() / 90) : ''); if (key === miniKey) return; miniKey = key;
  mg.fillStyle = 'rgba(10,8,16,.75)'; mg.fillRect(0, 0, mini.width, mini.height);
  for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const tx = ox + x, ty = oy + y; if (tx < 0 || ty < 0 || tx >= fl.W || ty >= fl.H) continue; const i = ty * fl.W + tx; if (!bits[i]) continue; const v = fl.t[i]; if (v === IL.T.WALL) continue; mg.fillStyle = tileColor(v, i); mg.fillRect(x * k, y * k, k, k); }
  const op = pr.bagsOpen || {}; mg.fillStyle = '#ffb347'; for (const b of ui.bags) if (!op[b.id] && bits[b.y * fl.W + b.x]) { const x = (b.x - ox) * k, y = (b.y - oy) * k; if (x >= 0 && y >= 0 && x < mini.width && y < mini.height) mg.fillRect(x - 1, y - 1, k + 2, k + 2); }
  const ph = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  for (const m of marks) { let x = (m.i % fl.W - ox) * k + k / 2, y = (((m.i / fl.W) | 0) - oy) * k + k / 2;
    const off = x < 0 || y < 0 || x > mini.width || y > mini.height; x = Math.max(4, Math.min(mini.width - 4, x)); y = Math.max(4, Math.min(mini.height - 4, y)); // 枠の外なら、その方向のふちに出す
    const r = (off ? 4 : 6) + ph * 4, g = mg.createRadialGradient(x, y, 0, x, y, r + 4); g.addColorStop(0, `rgba(${m.c},.95)`); g.addColorStop(0.45, `rgba(${m.c},.5)`); g.addColorStop(1, `rgba(${m.c},0)`);
    mg.fillStyle = g; mg.fillRect(x - r - 4, y - r - 4, (r + 4) * 2, (r + 4) * 2); mg.fillStyle = `rgb(${m.c})`; mg.fillRect(x - 2, y - 2, 4, 4); }
  mg.fillStyle = '#fff'; mg.fillRect((run.x - ox) * k - 1, (run.y - oy) * k - 1, k + 2, k + 2);
}
function fullMap() {
  const fl = IL.genFloor(run.floor), bits = IL.mapBits(pr, run), c = document.createElement('canvas'), k = fl.W > 300 ? 3 : 4; c.width = fl.W * k; c.height = fl.H * k; const m = c.getContext('2d'); m.fillStyle = '#000'; m.fillRect(0, 0, c.width, c.height);
  const T = IL.T; let n = 0, tot = 0;
  for (let i = 0; i < fl.t.length; i++) { const v = fl.t[i]; if (v !== T.WALL && v !== T.BOSS) tot++; if (!bits[i] || v === T.WALL) continue; if (v !== T.BOSS) n++; const x = i % fl.W, y = (i / fl.W) | 0;
    m.fillStyle = tileColor(v, i); m.fillRect(x * k, y * k, k, k); }
  const op = pr.bagsOpen || {}; m.fillStyle = '#ffb347'; for (const b of ui.bags) if (!op[b.id] && bits[b.y * fl.W + b.x]) m.fillRect(b.x * k - 2, b.y * k - 2, k + 4, k + 4);
  m.fillStyle = '#fff'; m.fillRect(run.x * k - 3, run.y * k - 3, k + 6, k + 6);
  ui.scr = 'map';
  const mk = mapMarks(fl, bits).map(m => `<i class="mglow ${m.kind}" style="left:${(100 * ((m.i % fl.W) + 0.5) / fl.W).toFixed(2)}%;top:${(100 * (((m.i / fl.W) | 0) + 0.5) / fl.H).toFixed(2)}%"><b>${m.kind === 'boss' ? 'ボス' : '行商人'}</b></i>`).join('');
  show(`<div class="win"><button class="btn sm close" data-a="back">とじる</button><h2>${run.floor}階の地図（${Math.round(100 * n / tot)}％）</h2><div class="mapwrap"><img class="mapfull" src="${c.toDataURL()}">${mk}</div><p class="small mute">光る赤＝ボス部屋　光る金＝行商人　赤＝ボス部屋の入口（中のボスに触れると戦う）　緑＝安全地帯　黄＝まだ開けていない台座　橙＝落ちているバッグ</p></div>`);
}
function afterAct() {
  // できごと
  for (const ev of run.events) {
    if (ev.t === 'msg') toast(ev.s);
    if (ev.t === 'loot') { if (ev.parts.length) tut('got'); sfx('chest'); const s = ev.parts.map(p => IL.SP_NAME[p.sp] + 'の欠片（' + IL.RAR_NAME[p.rar] + '）').join('、'); toast(ev.from + 'から ' + s + (ev.gold ? '、' + ev.gold + 'G' : '') + (ev.ticket ? '、ガチャチケット' : '') + ' を手に入れた'); if (ev.parts.some(p => p.rar >= 2)) sfx('god', 0.4); }
    if (ev.t === 'loot' && ev.parts.some(p => p.rar >= 1)) lootReveal(ev.parts);
  }
  run.events = [];
  hud(); dirty = true; save();
  if (run.battle) { ui.target = 0; ui.sub = null; battle(); if (run.battle.foes[0].kind) sfx('boss', 0.6); tut('battle'); if (run.battle.kind === 'normal' && opt.auto !== false) autoBattle(); }
  else if (run.prompt) { prompt(); if (run.prompt && run.prompt.kind === 'gate') tut('boss'); }
  else if (ui.bags.length && bagNear(6) && !(pr.bagsOpen || {})[bagNear(6).id]) tut('bag');
}
function act(dir) {
  if (!run || ui.scr || run.battle || run.prompt || run.over) return;
  const ox = run.x, oy = run.y; if (dir === 1 || dir === 3) ui.face = dir; X(['mv', dir]);
  if (run.x !== ox || run.y !== oy) { anim = { x0: ox, y0: oy, t0: performance.now() }; dust(ox, oy); if (run.turn % 2) sfx('step', 0.15); watchLive(); }
  afterAct();
}
function bagNear(maxD) { const op = pr.bagsOpen || {}; let best = null; for (const b of ui.bags) { const d = Math.abs(b.x - run.x) + Math.abs(b.y - run.y); if (d <= (maxD == null ? 1 : maxD) && (!best || d < best.d || (op[best.b.id] && !op[b.id]))) best = { b, d }; } return best && best.b; }
function interact() {
  if (!run || ui.scr || run.battle || run.prompt) return;
  const b = bagNear(); if (b && !(pr.bagsOpen || {})[b.id]) return bagScreen(b);
  X(['it']); afterAct();
  if (!run.prompt && !run.battle && b) toast('このバッグはもう開けた');
}
cv.addEventListener('pointerup', e => { // 画面の回復草・バッグをタップ
  if (!run || ui.scr || run.battle || run.prompt || run.over || !ui.cam) return;
  const r = cv.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) * cv.width / r.width - ui.cam.cx) / ui.cam.TS), y = Math.floor(((e.clientY - r.top) * cv.height / r.height - ui.cam.cy) / ui.cam.TS);
  const fl = IL.genFloor(run.floor), i = y * fl.W + x;
  const bg = ui.bags.find(b => b.x === x && b.y === y);
  if (bg && Math.abs(x - run.x) + Math.abs(y - run.y) <= 1) { if ((pr.bagsOpen || {})[bg.id]) return toast('このバッグはもう開けた'); return bagScreen(bg); }
  if (IL.herbNear(fl, run, i)) { X(['hb', i]); afterAct(); return; }
  if (Math.abs(e.clientX - tapStart.x) > 12 || Math.abs(e.clientY - tapStart.y) > 12) return;
  if (bg || IL.herbAvail(fl, run, i)) return walkTo(x, y, true, bg ? () => { if (!ui.scr && bagNear() === bg && !(pr.bagsOpen || {})[bg.id]) bagScreen(bg); } : () => { if (IL.herbNear(fl, run, i)) { X(['hb', i]); afterAct(); } });
  walkTo(x, y, false);
});
const tapStart = { x: 0, y: 0 }; cv.addEventListener('pointerdown', e => { tapStart.x = e.clientX; tapStart.y = e.clientY; if (walk) stopWalk(); stopExplore(); });
/* タップした所まで歩く（見えている床だけを通る。敵・案内・戦いがあれば止まる） */
let walk = null;
function stopWalk() { if (walk) { clearTimeout(walk.timer); walk = null; dirty = true; } }
function walkTo(tx, ty, adj, done) {
  stopWalk(); const fl = IL.genFloor(run.floor), bits = IL.mapBits(pr, run), W = fl.W, start = run.y * W + run.x;
  if (tx < 0 || ty < 0 || tx >= W || ty >= fl.H || !bits[ty * W + tx]) return;
  const tv = fl.t[ty * W + tx]; if (!adj && !IL.walkable(fl, tx, ty) && tv !== IL.T.PED) return;
  const stopTile = j => { const v = fl.t[j]; return v === IL.T.GATE || v === IL.T.BOSS; }; // ボス部屋の入口は、そこをタップしたときだけ
  const goal = i => { const x = i % W, y = (i / W) | 0; return adj ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : (x === tx && y === ty); };
  if (goal(start)) { if (done) done(); return; }
  const prev = new Int32Array(W * fl.H).fill(-1); prev[start] = start; const q = [start]; let hit = -1;
  for (let h = 0; h < q.length && q.length < 20000; h++) { const i = q[h]; if (goal(i)) { hit = i; break; }
    for (const [o, ok] of [[-W, true], [1, i % W < W - 1], [W, true], [-1, i % W > 0]]) { const j = i + o; if (!ok || j < 0 || j >= W * fl.H || prev[j] >= 0 || !bits[j]) continue; const x = j % W, y = (j / W) | 0; if ((!IL.walkable(fl, x, y) || stopTile(j)) && !(goal(j) && !adj)) continue; prev[j] = i; q.push(j); } }
  if (hit < 0) return toast('そこへは行けない');
  const path = []; for (let c = hit; c !== start; c = prev[c]) path.push(c); path.reverse();
  walk = { path, done, target: path[path.length - 1] }; dirty = true;
  const step = () => { if (!walk || !run) return; if (ui.scr || run.battle || run.prompt || run.over) return stopWalk();
    const n = walk.path.shift(), d = n - (run.y * W + run.x), dir = d === -W ? 0 : d === 1 ? 1 : d === W ? 2 : d === -1 ? 3 : -1;
    if (dir < 0) return stopWalk(); const before = run.y * W + run.x; act(dir);
    if (run.y * W + run.x === before || ui.scr || run.battle || run.prompt) return stopWalk();
    if (!walk.path.length) { const f = walk.done; stopWalk(); if (f) f(); return; }
    walk.timer = setTimeout(step, 125); };
  step();
}

/* おまかせ戦闘（ふつうの敵だけ）：勝つまで「たたかう」。体力が3割を切ったら止めて自分で選ぶ */
const AUTO = { on: false, stop: false };
function autoBattle() {
  if (AUTO.on) return; Net.anCount('u/autobattle'); AUTO.on = true; AUTO.stop = false; battle();
  const tick = () => {
    const bt = run && run.battle; if (!bt) { AUTO.on = false; return; }
    if (bt.over) { AUTO.on = false;
      if (bt.over === 'win') { const r = bt.reward; X(['bx']); hideScreen(); dirty = true; hud(); save();
        toast('勝った！ 経験値 ' + r.exp + (r.tw > 1 ? '（追い風）' : '') + '・' + r.gold + ' G' + (r.parts.length ? '・' + r.parts.map(p => IL.SP_NAME[p.sp] + 'の欠片（' + IL.RAR_NAME[p.rar] + '）').join('、') : ''));
        if (r.ups) toast('レベルが ' + pr.lv + ' に上がった！'); if (r.parts.some(p => p.rar >= 1)) lootReveal(r.parts); autoPts(); if (EXP.on) setTimeout(exploreStep, 250); }
      return; }
    const st = IL.playerStats(pr);
    if (AUTO.stop || run.hp < st.hp * 0.3) { AUTO.on = false; stopExplore(); battle(); if (!AUTO.stop) toast('体力が少ないので、おまかせを止めた'); return; }
    bcmd({ c: 'atk', t: 0 }); setTimeout(tick, opt.bspd === 'fast' ? 220 : 420);
  };
  setTimeout(tick, opt.bspd === 'fast' ? 200 : 380);
}
/* レベルが上がったら自動で能力ポイントを振る */
function autoPts(mode) { const m = mode || opt.autoPt; if (!m || m === 'off' || !pr || !pr.freePts) return; let k = 0;
  while (pr.freePts > 0 && k++ < 300) X(['pt', m === 'bal' ? ['atk', 'hp', 'def'][(pr.lv * 3 + pr.freePts) % 3] : m]); save(); hud(); }
/* 自動探索：まだ見ていない所へ歩きつづける */
const EXP = { on: false, timer: null, seen: null };
function stopExplore() { if (!EXP.on) return; EXP.on = false; clearTimeout(EXP.timer); const b = $('#b-exp'); if (b) b.classList.remove('act'); }
function toggleExplore() { if (EXP.on) { stopExplore(); return; } Net.anCount('u/explore'); if (!run || ui.scr || run.battle || run.prompt) return; stopWalk(); EXP.on = true; EXP.seen = interesting(); const b = $('#b-exp'); if (b) b.classList.add('act'); exploreStep(); }
function interesting() { const fl = IL.genFloor(run.floor), bits = IL.mapBits(pr, run), out = new Set(), op = pr.bagsOpen || {};
  for (let i = 0; i < fl.t.length; i++) if (bits[i] && fl.t[i] === IL.T.PED && !run.opened[i]) out.add('p' + i);
  for (const b of ui.bags) if (!op[b.id] && bits[b.y * fl.W + b.x]) out.add('b' + b.id); return out; }
function exploreTarget(allowSafe) {
  const fl = IL.genFloor(run.floor), bits = IL.mapBits(pr, run), W = fl.W, N = W * fl.H, start = run.y * W + run.x, T = IL.T;
  const mi = run.merchant ? run.merchant.y * W + run.merchant.x : -1;
  const ok = j => { const v = fl.t[j], x = j % W, y = (j / W) | 0; return bits[j] && IL.walkable(fl, x, y) && v !== T.GATE && v !== T.BOSS && (allowSafe || v !== T.SAFE) && j !== mi; };
  const prev = new Int32Array(N).fill(-1); prev[start] = start; const q = [start];
  for (let h = 0; h < q.length; h++) { const i = q[h];
    if (i !== start) for (const o of [-W, 1, W, -1]) { const j = i + o; if (j >= 0 && j < N && !bits[j] && !((o === 1 && j % W === 0) || (o === -1 && i % W === 0))) { let c = i; while (prev[c] !== start) c = prev[c]; return c; } }
    for (const [o, okx] of [[-W, true], [1, i % W < W - 1], [W, true], [-1, i % W > 0]]) { const j = i + o; if (!okx || j < 0 || j >= N || prev[j] >= 0 || !ok(j)) continue; prev[j] = i; q.push(j); } }
  return -1;
}
function exploreStep() {
  clearTimeout(EXP.timer); if (!EXP.on || !run) return stopExplore();
  if (run.battle) return; // おまかせ戦闘が終わると、また呼ばれる
  if (ui.scr || run.prompt || run.over) return stopExplore();
  const st = IL.playerStats(pr); if (run.hp < st.hp * 0.4) { stopExplore(); return toast('体力が少ないので、探索を止めた'); }
  const now = interesting(); for (const k of now) if (!EXP.seen.has(k)) { stopExplore(); return toast(k[0] === 'p' ? '台座を見つけた' : '落ちたバッグを見つけた'); }
  EXP.seen = now;
  let n = exploreTarget(false); if (n < 0) n = exploreTarget(true);
  if (n < 0) { stopExplore(); return toast('この階は歩きつくした'); }
  const W = IL.genFloor(run.floor).W, d = n - (run.y * W + run.x); act(d === -W ? 0 : d === 1 ? 1 : d === W ? 2 : 3);
  if (run.battle && !AUTO.on) return; // ボスなどおまかせしない戦い
  EXP.timer = setTimeout(exploreStep, opt.bspd === 'fast' ? 90 : 120);
}
/* ---------- 落ちたバッグ ---------- */
function ago(t) { const m = Math.max(0, Math.floor((Net.now() - (t || 0)) / 60000)); return m < 1 ? 'たった今' : m < 60 ? m + '分前' : m < 1440 ? Math.floor(m / 60) + '時間前' : Math.floor(m / 1440) + '日前'; }
function bagScreen(b) {
  Net.anCount('u/bag');
  ui.scr = 'bag'; ui.bagOpen = b; const max = IL.B.bagPick, sel = ui.pickSel = ui.pickSel && ui.pickSelFor === b.id ? ui.pickSel : []; ui.pickSelFor = b.id;
  const cards = b.p.map((q, i) => { const p = Object.assign({ id: 0 }, q); return `<div class="pcard ${sel.includes(i) ? 'sel' : ''}" data-pk="${i}">${partHTML(p)}<div class="small">${partText(p)}</div></div>`; }).join('');
  show(`<div class="win" style="max-width:820px"><button class="btn sm close" data-a="back">とじる</button>
    <h2><span class="nt">${esc(b.n || '無名')}</span>さんのバッグ <span class="mute small">（${ago(b.t)}）</span></h2>
    ${b.s ? `<p class="note">「<span class="nt">${esc(b.s)}</span>」</p>` : ''}
    <p class="small mute">好きなものを ${max} 個まで選んで拾える（1つのバッグにつき1回だけ）。バッグの中身は減らないので、ほかの人も同じものを拾える。</p>
    <div class="pgrid">${cards}</div>
    <div class="row" style="margin-top:10px"><button class="btn pri" data-a="bagtake" ${sel.length ? '' : 'disabled'}>選んだものを拾う（${sel.length} / ${max}）</button><button class="btn" data-a="back">とじる</button></div></div>`);
}
function bagTake() {
  const b = ui.bagOpen; if (!b || !ui.pickSel.length) return;
  const parts = ui.pickSel.map(i => b.p[i]); const got = X(['bag', b.id, parts]);
  if (got && got !== true) { sfx('pickup', 0.6); toast((b.n || '無名') + 'さんのバッグから ' + got.length + ' 個拾った'); save(); tut('got'); }
  else toast('拾えませんでした');
  ui.pickSel = []; hideScreen(); dirty = true;
}
function entrustScreen() {
  ui.scr = 'entrust'; ui.trSel = ui.trSel || [];
  const onB = new Set(pr.board.filter(x => x != null)), auto = pr.bag.filter(p => onB.has(p.id) && !p.gacha), extra = pr.bag.filter(p => !(onB.has(p.id) && !p.gacha));
  extra.sort((a, b) => IL.partScore(b) - IL.partScore(a));
  const room = 30 - auto.length;
  show(`<div class="win" style="max-width:820px"><button class="btn sm close" data-a="back">とじる</button><h2>欠片を託す</h2>
    <p>この場所にバッグを置いて、<b style="color:#ff8a8a">倒れます</b>（死亡と同じ。入れた欠片は手元から消える）。拾った人の手元で、また誰かの力になる。</p>
    <p class="small mute">盤面の欠片（ガチャ以外）は、倒れると必ずバッグに入ります。かばんから足すものを選んでください（あと ${Math.max(0, room - ui.trSel.length)} 個）。</p>
    ${auto.length ? `<div class="lootlist">${auto.map(p => partHTML(p)).join('')}</div>` : ''}
    <div class="bag">${extra.map(p => `<div class="bagitem ${ui.trSel.includes(p.id) ? 'sel' : ''}" data-tr2="${p.id}">${partHTML(p)}<small>${IL.RAR_NAME[p.rar]} ${p.floor}階</small></div>`).join('') || '<div class="mute small">かばんは空っぽ</div>'}</div>
    <div class="row" style="margin-top:10px"><input id="trnote" maxlength="20" placeholder="ひとこと（20文字まで）" value="${esc(ui.trNote || '')}" class="inp" style="flex:1;min-width:200px"><button class="btn warn" data-a="entrust2" ${auto.length + ui.trSel.length ? '' : 'disabled'}>託して倒れる</button></div></div>`);
}
async function doEntrust() {
  const note = ($('#trnote') ? $('#trnote').value : '').trim().slice(0, 20); if (note && banned(note)) { toast('使えない言葉が入っています'); return; }
  const where = { floor: run.floor, x: run.x, y: run.y }; const lost = X(['entrust', ui.trSel || []]); ui.trSel = []; ui.trNote = '';
  if (!Array.isArray(lost)) return;
  Net.addBag(where.floor, where.x, where.y, lost, opt.name, note || '託します').then(() => {});
  Net.liveLeave(); syncProfile(); sfx('chest', 0.6);
  const loc = `${where.floor}階（${where.x}, ${where.y}）`;
  show(`<div class="win" style="max-width:520px"><h2>欠片を託した</h2><div class="bagdrop"><img src="${BAG.toDataURL()}" alt=""></div><p>${loc} にバッグを置いた。だれかが見つけてくれるはず。</p>
    <div class="row"><button class="btn" data-a="copyloc" data-loc="${esc(loc + 'にバッグを置きました' + (note ? '「' + note + '」' : ''))}">場所をコピー</button><button class="btn" data-a="locpost" data-loc="${esc(loc + 'にバッグを置きました' + (note ? '「' + note + '」' : ''))}">掲示板に書く</button><button class="btn pri" data-a="dead">タイトルへ</button></div></div>`);
}
/* ボス部屋の前：ボスの情報と見通し（表示だけ。ルールには関係しない） */
function bossCard() {
  const f = run.floor, e = IL.makeEnemy(f, IL.bossType(f), f % 5 === 0 ? 2 : 1, null), st = IL.playerStats(pr);
  const spn = sp => sp ? `<b style="color:${IL.SP_COLOR[sp]}">${IL.SP_NAME[sp]}</b>` : '—';
  let best = null;
  for (const sp of IL.SPECIES) { const sk = st.skills[sp]; if (!sk) continue; let m = IL.B.tierPct[sk.tier] * IL.B.coef[sp], note = '';
    if (sp !== 'star' && e.weak === sp) { m *= 2; note = '弱点'; } else if (sp !== 'star' && e.res === sp) { m *= 0.5; note = '半減'; }
    if (!best || m > best.m) best = { m, nm: IL.SKILLS[sp][sk.tier], note, sp }; }
  const hitN = m => Math.max(1, Math.ceil(e.hp / Math.max(1, IL.dmgCalc(st.atk, m, e.def))));
  const take = Math.max(1, Math.round(IL.dmgCalc(e.atk, 1, st.def))), endure = Math.max(1, Math.ceil(run.hp / take));
  const atkN = hitN(1), skN = best ? hitN(best.m) : null;
  const tough = (skN || atkN) >= endure;
  return `<div class="bossinfo"><div class="spr" data-tile="${e.tile}" data-big="1"></div><div>
    <div class="bn">${esc(e.name)}${e.kind >= 2 ? ' <span class="small gold">大ボス</span>' : ''}</div>
    <div class="bstats"><span>体力 <b>${e.hp}</b></span><span>攻撃 <b>${e.atk}</b></span><span>守り <b>${e.def}</b></span><span>素早さ <b>${e.spd}</b></span></div>
    <div class="bstats"><span>弱点 ${spn(e.weak)}</span><span>半減 ${f <= 3 ? '—' : spn(e.res)}</span></div></div></div>
    ${tough ? '<div class="bplan small ng">⚠ このままだと厳しそう。盤面の付け替えや回復薬を考えよう</div>' : ''}`;
}
/* ---------- 声かけ（ボス部屋・安全地帯・行商人） ---------- */
function prompt() {
  const p = run.prompt; ui.scr = 'prompt';
  if (p.kind === 'gate') {
    const last = run.floor >= 100;
    const askName = !opt.name && !(ui.firsts && ui.firsts[run.floor]) && !pr.cleared[run.floor];
    show(`<div class="win" style="max-width:520px"><h2>ボス</h2>${bossCard()}${askName ? '<div class="askname"><p class="small">このボスはまだだれも倒していない。<b class="gold">最初に倒すと、名前が塔に刻まれる。</b>名前を入れておこう（あとで変えられない）</p><input id="bname" maxlength="12" placeholder="名前（12文字まで）"></div>' : ''}${pr.cleared[run.floor]
      ? `<p>階段が開いています。階段を進みますか？ボスと戦いますか？</p><p class="small mute">ボスからしか出ない欠片や、レアな欠片がある。</p><div class="row">${last ? '' : '<button class="btn pri" data-a="stairs">階段を進む</button>'}<button class="btn warn" data-a="boss">ボスと戦う</button><button class="btn" data-a="cancel">やめる</button></div>`
      : `<p>ボスと戦いますか？　戦いが始まったら逃げられない。</p><p class="small mute">ボスはこの階の敵より格段に強い。負けると盤面の欠片がすべて消える。</p><div class="row"><button class="btn warn" data-a="boss">ボスと戦う</button><button class="btn" data-a="cancel">やめる</button></div>`}</div>`, 'clear');
    document.querySelectorAll('.bossinfo .spr').forEach(d => d.appendChild(spriteCanvas(+d.dataset.tile, innerHeight < 520 ? 3 : 4, Math.min(9, Math.floor((run.floor - 1) / 10)), true)));
  } else if (p.kind === 'safe') {
    show(`<div class="win" style="max-width:460px"><h2>安全地帯</h2><p>ここから帰ることができる。帰れば、拾った欠片はすべて持ち帰れる。</p><div class="row"><button class="btn pri" data-a="return">帰る</button><button class="btn" data-a="cancel">続ける</button></div></div>`, 'clear');
  } else if (p.kind === 'merchant') {
    show(`<div class="win" style="max-width:460px"><h2>行商人</h2><p>「なにか買っていくかい？」</p><div class="row"><button class="btn pri" data-a="shop">買う</button><button class="btn warn" data-a="fightm">戦う</button><button class="btn" data-a="cancel">やめる</button></div></div>`, 'clear');
  } else if (p.kind === 'fightm') {
    show(`<div class="win" style="max-width:460px"><h2>本当に戦いますか？</h2><p>行商人はとても強い（この階＋30階のボスくらい）。勝てば売り物をすべてもらえる。<br><b style="color:#ff8a8a">負けると、かばんの中身がすべて消えます。</b>（盤面は残る）</p><div class="row"><button class="btn warn" data-a="fightm2">戦う</button><button class="btn" data-a="cancel">やめる</button></div></div>`, 'clear');
  } else if (p.kind === 'herb') {
    show(`<div class="win" style="max-width:420px"><h2>回復草</h2><p>回復草をちぎって食べますか？（体力が30％回復）</p>${run.hp >= IL.playerStats(pr).hp ? '<p class="small mute">いまは体力が満タンです。</p>' : ''}<div class="row"><button class="btn pri" data-a="eat">食べる</button><button class="btn" data-a="cancel">やめる</button></div></div>`, 'clear');
  } else if (p.kind === 'bosswin') {
    const last = run.floor >= 100;
    show(`<div class="win" style="max-width:460px"><h2>${last ? '頂上にたどり着いた！' : 'ボスを倒した！'}</h2><p>${last ? 'インテグラ・レイヤーの頂上。' : 'ボスのいた所の階段から、次の階へ行ける。帰還ポータルで帰ることもできる。'}</p><div class="row">${last ? '' : '<button class="btn pri" data-a="next">次の階へ</button>'}<button class="btn" data-a="portal">帰還ポータルで帰る</button><button class="btn" data-a="cancel">やめる</button></div>${run.bossChest && !run.bossChest.opened ? '<p class="small gold">となりの宝箱を開け忘れていない？</p>' : ''}${ui.firstFloor === run.floor ? '<p class="gold">世界で最初に倒した！</p>' : ''}<div class="row" style="margin-top:6px"><button class="btn sm" data-a="sharex">𝕏 でつぶやく</button></div></div>`, 'clear');
  }
}
function shop() {
  ui.scr = 'shop'; const m = run.merchant;
  const rows = m.stock.map((s, i) => {
    let nm = '', icon = '';
    if (s.kind === 'potion') { nm = `${s.floor}階の回復薬（のこり${s.n}）`; icon = '<div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:26px">🧪</div>'; }
    else if (s.kind === 'ticket') { nm = 'ガチャチケット'; icon = '<div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:26px">🎫</div>'; }
    else { nm = partText(s.part); icon = partHTML(s.part); }
    return `<div class="item">${icon}<div class="nm">${nm}</div><button class="btn sm" data-buy="${i}" ${pr.gold >= s.price ? '' : 'disabled'}>${s.price} G</button></div>`;
  }).join('') || '<p class="mute">売り切れ</p>';
  show(`<div class="win shop" style="max-width:560px"><button class="btn sm close" data-a="cancel">とじる</button><h2>行商人の店</h2><p class="gold">所持金 ${pr.gold} G</p><div class="grid">${rows}</div><p class="small mute">売り物はすべてこの階のもの。回復薬は買った階より深いところで使うと効き目が下がる（3階ごとに−10％）。</p></div>`);
}

/* ---------- 戦い ---------- */
function battle() {
  ui.scr = 'battle'; const bt = run.battle, st = IL.playerStats(pr), bi = Math.min(9, Math.floor((run.floor - 1) / 10));
  const alive = bt.foes.filter(f => f.hp > 0); if (ui.target >= alive.length) ui.target = 0;
  const foes = bt.foes.map(f => { const ai = alive.indexOf(f); return `<div class="foe ${f.hp <= 0 ? 'dead' : ''} ${ai === ui.target && !bt.over ? 'sel' : ''}" data-tg="${ai}"><div class="spr" data-tile="${f.tile}" data-big="${f.kind ? 1 : 0}"></div><div class="nm">${esc(f.name)}</div><div class="bar"><i style="width:${100 * f.hp / f.maxhp}%"></i></div><div class="tag">${f.hp} / ${f.maxhp}${f.weak ? '　弱点:' + IL.SP_NAME[f.weak] + '　半減:' + (IL.SP_NAME[f.res] || '—') : ''}${f.charge ? '　<b style="color:#ff6b6b">力をためている</b>' : ''}</div></div>`; }).join('');
  const log = bt.log.slice(-12).map(l => `<div class="${l.hurt ? 'x' : l.warn ? 'w' : l.skill ? 'k' : l.hit ? 'h' : ''}">${esc(l.s)}</div>`).join('');
  let bottom = '';
  if (!bt.over) {
    if (ui.sub === 'skill') {
      const list = IL.SPECIES.filter(sp => st.skills[sp]).map(sp => { const s = st.skills[sp], pct = Math.round(IL.B.tierPct[s.tier] * IL.B.coef[sp] * 100); return `<button class="btn" data-sk="${sp}" style="border-color:${IL.SP_COLOR[sp]}"><span>${IL.SKILLS[sp][s.tier]}</span><span class="small mute">${IL.SP_NAME[sp]}・攻撃の${pct}%${sp === 'wind' ? '・全体' : sp === 'forest' ? '・回復' : sp === 'rock' ? '・守り' : sp === 'fire' ? '・やけど' : '・弱点半減なし'}</span></button>`; }).join('') || '<p class="mute small">使える技がない（同じ種族を2個以上つなげる）</p>';
      bottom = `<div class="sublist">${list}</div><button class="btn sm" data-a="subback" style="margin-top:6px">もどる</button>`;
    } else if (ui.sub === 'item') {
      const grp = {}; pr.potions.forEach((p, i) => { (grp[p.floor] = grp[p.floor] || []).push(i); });
      const keys = Object.keys(grp).sort((a, b) => IL.potionEff(+b, run.floor) - IL.potionEff(+a, run.floor) || b - a);
      const list = keys.map(f => `<button class="btn" data-it="${grp[f][0]}"><span>${f}階の回復薬 ×${grp[f].length}</span><span class="small mute">効き目 ${Math.round(IL.potionEff(+f, run.floor) * 100)}%</span></button>`).join('') || '<p class="mute small">回復薬を持っていない</p>';
      bottom = `<div class="sublist">${list}</div><button class="btn sm" data-a="subback" style="margin-top:6px">もどる</button>`;
    } else if (AUTO.on) bottom = `<div class="cmds"><button class="btn warn" data-a="astop">おまかせを止める</button></div>`; else bottom = `<div class="cmds"><button class="btn pri" data-c="atk">たたかう</button><button class="btn" data-c="skill">技</button><button class="btn" data-c="def">ぼうぎょ</button><button class="btn" data-c="item">どうぐ</button><button class="btn" data-c="flee" ${bt.kind !== 'normal' ? 'disabled' : ''}>にげる</button></div>`;
  } else bottom = battleResult();
  const BBG = ['#22402a', '#4a3a1e', '#1e3a4a', '#4a1e1e', '#2a3f55', '#2f4a1e', '#33363d', '#2a1e44', '#3a1e4a', '#4a4a5a'];
  show(`<div class="win battle" style="--bb:${BBG[bi]}"><div class="bwrap"><div class="bl"><div class="foes">${foes}</div>
    <div class="row" style="gap:10px"><span>体力 ${run.hp} / ${st.hp}</span><div class="bar me ${run.hp / st.hp <= 0.25 ? 'low' : run.hp / st.hp <= 0.5 ? 'mid' : ''}" style="flex:1"><i style="width:${100 * run.hp / st.hp}%"></i></div></div></div>
    <div class="br"><div class="log" id="blog">${log}</div>${bottom}</div></div></div>`);
  const small = innerHeight < 520;
  document.querySelectorAll('.spr').forEach(d => d.appendChild(spriteCanvas(+d.dataset.tile, d.dataset.big === '1' ? (small ? 3 : 5) : (small ? 3 : 4), bi, d.dataset.big === '1')));
  const lg = $('#blog'); if (lg) lg.scrollTop = 1e6;
}
function battleResult() {
  const bt = run.battle;
  if (bt.over === 'win') {
    const r = bt.reward; const parts = r.parts.map(p => partHTML(p)).join('');
    let extra = ''; if (bt.bossReward) { if (bt.bossReward.first) extra += `<p class="gold">初撃破ボーナス！</p><div class="lootlist">${bt.bossReward.first.map(p => partHTML(p)).join('')}</div>`; if (bt.bossReward.respec) extra += '<p>振りなおしの札を手に入れた</p>'; if (bt.bossReward.chest) extra += '<p class="gold">ボスの落とし物は、となりの宝箱に入っている。</p>'; }
    return `<p>勝った！ 経験値 ${r.exp}${r.tw > 1 ? '<span class="tw">（追い風×2.5）</span>' : ''}・${r.gold} G${r.ups ? `<b class="gold">　レベルが ${pr.lv} に上がった！（ポイント+${r.ups * 3}）</b>` : ''}</p>${parts ? '<div class="lootlist">' + parts + '</div>' : ''}${extra}<div class="row"><button class="btn pri" data-a="bclose">続ける</button>${ui.godName ? '<button class="btn sm" data-a="sharegod">𝕏 神技をつぶやく</button>' : ''}${bt.kind === 'boss' ? '<button class="btn sm" data-a="sharex">𝕏 でつぶやく</button>' : ''}</div>`;
  }
  if (bt.over === 'flee') return '<button class="btn pri" data-a="bclose">続ける</button>';
  if (bt.over === 'lose') {
    if (bt.kind === 'merchant') return `<p style="color:#ff8a8a">行商人に負けた…　かばんの中身が ${bt.loseInfo.bagLost} 個なくなった。</p><button class="btn pri" data-a="bclose">続ける</button>`;
    const lost = bt.loseInfo.lost; return `<p style="color:#ff8a8a">${bt.loseInfo.boss ? 'ボスにやられた…　盤面の欠片はすべて消えた。' : '倒れてしまった…　盤面の欠片をこの場所に落とした。'}</p>${lost.length && !bt.loseInfo.boss ? '<div class="bagdrop"><img src="' + BAG.toDataURL() + '" alt=""></div>' : ''}${lost.length ? '<div class="lootlist">' + lost.map(p => partHTML(p)).join('') + '</div>' : ''}<button class="btn pri" data-a="dead">タイトルへ</button>`;
  }
  return '';
}
function bcmd(c) {
  const before = run.battle.log.length, hpB = run.hp, fhp = run.battle.foes.map(f => f.hp);
  X(['bc', c]);
  const bt = run.battle, nl = bt.log.slice(before);
  setTimeout(() => battleFx(fhp, hpB, nl), 0);
  if (nl.some(l => l.skill)) { const sk = nl.find(l => l.skill); sfx(sk.tier >= 5 ? 'god' : 'skill', 0.5); if (sk.tier >= 5) godFx(IL.SKILLS[sk.skill][sk.tier]); } else if (nl.some(l => l.hit)) sfx('hit', 0.5);
  if (run.hp < hpB) setTimeout(() => sfx('hurt', 0.45), 160);
  if (nl.some(l => l.crit)) critFx();
  ui.sub = null; save(); battle(); hud();
  if (run.hp < hpB) { const w = document.querySelector('.battle'); if (w) w.classList.add('shake'); }
  if (bt.over === 'win') { if (bt.kind === 'boss') bossKillFx(); else sfx('win', 0.5); if (bt.reward.ups) setTimeout(() => sfx('levelup', 0.5), 400); if (bt.kind !== 'normal' && bt.reward.parts.some(p => p.rar >= 1)) setTimeout(() => lootReveal(bt.reward.parts), 900); }
  if (bt.over === 'lose') { Net.anCount('d/' + run.floor); Net.anFlush(); sfx('fail', 0.5); const li = bt.loseInfo; if (li && li.lost && li.lost.length && !li.boss) Net.addBag(li.where.floor, li.where.x, li.where.y, li.lost, opt.name, '力尽きた…'); }
}
function battleFx(fhp, hpB, nl) { // ダメージの数字・光・技の演出
  const els = document.querySelectorAll('.foe'), bt = run && run.battle; if (!bt) return;
  const sk = nl.find(l => l.skill), crit = nl.some(l => /会心/.test(l.s));
  bt.foes.forEach((f, i) => { const d = fhp[i] - f.hp, el = els[i]; if (!el || d <= 0) return;
    el.classList.remove('hitfx'); void el.offsetWidth; el.classList.add('hitfx');
    const n = document.createElement('div'); n.className = 'dmg' + (crit ? ' crit' : ''); n.textContent = d; el.appendChild(n); setTimeout(() => n.remove(), 950);
    if (sk && !fxLow()) { const fx = document.createElement('div'); fx.className = 'sfx'; fx.style.setProperty('--c', IL.SP_COLOR[sk.skill]); fx.style.setProperty('--m', 'url(' + new URL('img/fx/' + sk.skill + '.png', location.href).href + ')'); el.appendChild(fx); setTimeout(() => fx.remove(), 650); }
    else if (!fxLow()) { const fx = document.createElement('div'); fx.className = 'sfx'; fx.style.setProperty('--c', '#fff'); fx.style.setProperty('--m', 'url(' + new URL('img/fx/hit.png', location.href).href + ')'); fx.style.width = fx.style.height = '110px'; fx.style.margin = '-55px 0 0 -55px'; el.appendChild(fx); setTimeout(() => fx.remove(), 650); } });
  const meBar = document.querySelector('.bar.me'); if (meBar && run.hp !== hpB) { const n = document.createElement('div'); n.className = 'dmg me' + (run.hp > hpB ? ' heal' : ''); n.textContent = (run.hp > hpB ? '+' : '-') + Math.abs(run.hp - hpB); meBar.parentElement.style.position = 'relative'; meBar.parentElement.appendChild(n); setTimeout(() => n.remove(), 950); }
}
function godFx(name) { ui.godName = name; const d = document.createElement('div'); d.className = 'god'; d.textContent = name; $('#app').appendChild(d); setTimeout(() => d.remove(), opt.bspd === 'fast' ? 850 : 1700); }
function runMenu() {
  ui.scr = 'menu';
  show(`<div class="win" style="max-width:420px"><button class="btn sm close" data-a="back">とじる</button><h2>メニュー</h2><div class="grid">
    <button class="btn" data-a="board2">盤面とかばん</button><button class="btn" data-a="potion">回復薬を使う（${pr.potions.length}）</button><button class="btn" data-a="map">地図</button>${Net.on ? '<button class="btn" data-a="mapshop">この階の地図を売り買い</button>' : ''}
    <button class="btn" data-a="settings2">⚙ 設定</button><button class="btn warn" data-a="giveup">あきらめる（倒れたのと同じ）</button><button class="btn warn" data-a="entrust">欠片を託す（バッグを置いて倒れる）</button></div>
    <p class="small mute">帰れるのは、安全地帯とボスのあとの帰還ポータルだけ。</p></div>`);
}
function potionMenu() {
  ui.scr = 'potion'; const grp = {}; pr.potions.forEach((p, i) => { (grp[p.floor] = grp[p.floor] || []).push(i); });
  const keys = Object.keys(grp).sort((a, b) => IL.potionEff(+b, run.floor) - IL.potionEff(+a, run.floor) || b - a);
  const list = keys.map(f => `<div class="row" style="justify-content:space-between;background:var(--panel2);padding:8px;border-radius:8px"><span>${f}階の回復薬 ×${grp[f].length}　<span class="mute small">効き目 ${Math.round(IL.potionEff(+f, run.floor) * 100)}%</span></span><span><button class="btn sm" data-use="${grp[f][0]}">使う</button> <button class="btn sm warn" data-dpot="${grp[f][0]}">捨てる</button></span></div>`).join('') || '<p class="mute">回復薬を持っていない</p>';
  show(`<div class="win" style="max-width:480px"><button class="btn sm close" data-a="back">とじる</button><h2>回復薬</h2><div class="grid">${list}</div></div>`);
}
function endScreen() {
  Net.liveLeave(); syncProfile();
  const o = run.over; ui.scr = 'end'; $('#hud').hidden = true; $('#pad').hidden = true;
  const txt = o.why === 'return' ? '無事に帰ってきた。拾った欠片はすべて持ち帰った。' : '';
  run = null; S.run = null; save();
  if (txt) { show(`<div class="win" style="max-width:460px"><h2>帰還</h2><p>${txt}</p><button class="btn pri" data-a="title">タイトルへ</button></div>`); }
  else title();
}


/* ---------- みんなとつながる部分 ---------- */
async function fetchDrops() { ui.bags = []; if (!Net.on || !run) return; const f = run.floor; const list = await Net.getBags(f); if (run && run.floor === f) { const fl = IL.genFloor(f); ui.bags = list.filter(b => IL.walkable(fl, b.x, b.y)); dirty = true; } }
function watchLive(force) {
  if (!Net.on || !run) return; Net.liveSend(run.floor, run.x, run.y, opt.name || '', force);
  const key = run.floor + ':' + Net.chunkOf(run.x, run.y); if (force || Net.liveKey !== key) Net.liveWatch(run.floor, run.x, run.y, list => { const now = Net.now(); ui.ghosts = list.filter(o => now - (o.t || 0) < 15000).slice(0, 10); dirty = true; });
}
async function claimFirst(floor, br) {
  Net.anMark('b' + floor); Net.anCount('w/' + floor); Net.anSet('maxB', Math.max(...Object.keys(pr.cleared).map(Number), 0));
  if (!br || !br.maybeFirst) return;
  if (!Net.on) { const got = X(['first', floor]); if (got && got !== true) { save(); showFirst(floor, got); } return; }
  await flushJournal();
  const ok = await Net.claimFirst(floor, { n: opt.name || '', jn: Net.journalCount(), dg: IL.digest(pr), lv: pr.lv });
  if (ok) { const got = X(['first', floor]); save(); syncProfile(); if (got && got !== true) showFirst(floor, got, ok === 'co'); }
}
function showFirst(floor, got, co) { ui.firstFloor = floor; if (run && run.prompt && run.prompt.kind === 'bosswin' && ui.scr === 'prompt') prompt(); sfx('god', 0.5);
  toast((co ? floor + '階のボスを、最初の人とほぼ同時に倒した！ 同じ初撃破ボーナス：' : floor + '階のボスを、だれよりも先に倒した！ 初撃破ボーナス：') + got.map(p => IL.SP_NAME[p.sp] + 'の欠片（' + IL.RAR_NAME[p.rar] + '）').join('、') + (got.toChest ? '（宝箱に入った）' : ''));
  if (floor >= 100) setTimeout(() => ending(true), 1500); }
function onFirsts(fs) {
  const prevTop = ui.firstsTop || 0;
  ui.firsts = fs || {};
  const top = Math.max(0, ...Object.keys(ui.firsts).map(Number).filter(f => ui.firsts[f] && !ui.firsts[f].ng)); ui.firstsTop = top;
  if (prevTop && top > prevTop && ui.firsts[top] && ui.firsts[top].pid !== Net.pid) { const v = ui.firsts[top]; toast('🏆 ' + (v.n || '無名') + 'さんが ' + top + '階のボスを初めて倒した！ 最前線が ' + Math.min(100, top + 1) + '階になった'); sfx('levelup', 0.4); } const floors = Object.keys(ui.firsts).map(Number).filter(n => n > 0 && !(ui.firsts[n] && ui.firsts[n].ng)).sort((a, b) => a - b);
  const cur = Object.keys(S.gclear || {}).map(Number).sort((a, b) => a - b).join(',');
  if (floors.join(',') !== cur) { X(['gclr', floors]); save(); if (ui.scr === 'title') title(); }
}
// 悪口・差別の言葉・連絡先ははじく。軽い下ネタは通す（露骨すぎるものだけはじく）
const BAN = ['死ね', 'しね', '氏ね', '殺す', 'ころす', 'コロス', '消えろ', 'きえろ', 'ガイジ', 'がいじ', '池沼', 'つんぼ', 'シナ人', '支那', 'レイプ', 'れいぷ', '強姦', 'セックス', 'せっくす', 'fuck', 'nigger', 'nigga', 'faggot', 'retard', 'kys', 'killyourself', 'line.me', 'discord.gg', 'http', 'www.', '@'];
function banned(t) { const s = String(t).toLowerCase().replace(/\s/g, ''); return BAN.some(w => s.includes(w)); }
function plaza() {
  ui.scr = 'plaza';
  show(`<div class="win"><button class="btn sm close" data-a="plazaback">とじる</button><h2>広場（全体掲示板）</h2>
    ${Net.on ? `<div class="row"><input id="pmsg" maxlength="140" placeholder="ひとこと（20秒に1回）" style="flex:1;min-width:200px;padding:10px;border-radius:8px;border:2px solid var(--line);background:#0e0c14;color:var(--ink);font:inherit"><button class="btn pri" data-a="post">送る</button></div>` : '<p class="mute">オンラインのときだけ使えます</p>'}
    <div id="plist" class="log" style="height:52vh"></div><p class="small mute">いやな書きこみは「通報」してください。</p></div>`);
  if (ui.prefill && $('#pmsg')) { $('#pmsg').value = ui.prefill; ui.prefill = null; }
  if (ui.unBoard) ui.unBoard();
  ui.unBoard = Net.watchBoard(v => { ui.boardV = v; drawBoard(); });
}
function drawBoard() { const v = ui.boardV || {};
    { const el = $('#plist'); if (!el) return; const ids = Object.keys(v).sort((a, b) => (v[b].t || 0) - (v[a].t || 0));
    el.innerHTML = ids.map(id => { const m = v[id]; if (!m || banned(m.s || '') || (ui.hidden && ui.hidden[id])) return ''; return `<div style="margin-bottom:6px"><b class="nt">${esc(m.n || '名無し')}</b>${m.bf || m.lv ? ` <span class="small gold">（${m.bf ? m.bf + '階・' : ''}Lv${m.lv || 1}）</span>` : ''} <span class="mute small">${new Date(m.t || 0).toLocaleTimeString().slice(0, 5)}</span> <button class="btn sm" data-rep="${esc(id)}" style="min-height:24px;padding:0 6px;font-size:11px">通報</button>${'Translator' in window && m.l && m.l !== L10N.lang ? ` <button class="btn sm" data-tr="${esc(id)}" data-tl="${esc(m.l)}" style="min-height:24px;padding:0 6px;font-size:11px">翻訳</button>` : ''}<br><span class="nt" data-msg="${esc(id)}">${esc(m.s || '')}</span></div>`; }).join('') || '<span class="mute">まだ書きこみがない</span>'; }
}
let lastPost = 0;
async function doPost() {
  const el = $('#pmsg'); if (!el) return; const t = el.value.trim(); if (!t) return;
  if (banned(t)) { toast('使えない言葉が入っています'); sfx('ng'); return; }
  if (Date.now() - lastPost < 20000) { toast('あと ' + Math.ceil((20000 - (Date.now() - lastPost)) / 1000) + ' 秒まってね'); return; }
  Net.postInfo = { bf: bestBoss(), lv: pr.lv }; const r = await Net.post(opt.name || '名無し', t, L10N.lang); if (r === 'ok') { lastPost = Date.now(); el.value = ''; sfx('ok', 0.4); } else toast(r === 'rate' ? '20秒に1回まで' : '送れませんでした');
}
async function translateMsg(id, from) {
  const el = document.querySelector('[data-msg="' + CSS.escape(id) + '"]'); if (!el) return;
  try { const tr = await Translator.create({ sourceLanguage: { zh: 'zh-Hant' }[from] || from || 'en', targetLanguage: { zh: 'zh-Hant' }[L10N.lang] || L10N.lang }); el.textContent = await tr.translate(el.textContent); } catch (e) { toast('この端末では翻訳できません'); }
}
function profileScreen() {
  ui.scr = 'profile';
  show(`<div class="win" style="max-width:520px"><button class="btn sm close" data-a="title">もどる</button><h2>名前と引き継ぎ</h2>
    <p>名前（12文字まで。ほかの人の画面や掲示板に出ます）</p>
    <div class="row"><input id="pname" maxlength="12" value="${esc(opt.name || '')}" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--line);background:#0e0c14;color:var(--ink);font:inherit"><button class="btn pri" data-a="savename">決める</button></div>
    <h2 style="margin-top:18px">別の端末で続ける</h2>
    ${Net.on ? `<p class="small mute">この端末で合言葉を作って、別の端末の「合言葉を入れる」に入れると、そこから続きを遊べます。</p>
    <div class="row"><button class="btn" data-a="mkcode">合言葉を作る</button><span id="code" class="gold" style="font-size:22px;letter-spacing:.1em"></span></div>
    <div class="row" style="margin-top:10px"><input id="incode" maxlength="9" placeholder="合言葉（8文字）" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--line);background:#0e0c14;color:var(--ink);font:inherit;text-transform:uppercase"><button class="btn warn" data-a="usecode">合言葉を入れる</button></div>
    <p class="small mute">合言葉を入れると、この端末のデータはそのデータに置きかわります。</p>` : '<p class="mute">オンラインのときだけ使えます</p>'}</div>`);
}
/* タイトルの地図屋：階を選んで、その階の地図を買う・売りに出す */
function mapTop() {
  ui.scr = 'maptop'; const top = Math.max(1, pr.maxFloor);
  let b = ''; for (let f = 1; f <= top; f++) { const m = pr.maps[IL.mapKey(f)], pct = m ? Math.round(100 * m.n / mapTotal(f)) : 0;
    b += `<button class="mf" data-a="mapf" data-k="${f}"><b>${f}階</b><span class="small ${pct >= 100 ? 'gold' : 'mute'}">${pct}％</span></button>`; }
  show(`<div class="win" style="max-width:640px"><button class="btn sm close" data-a="title">もどる</button><h2>地図屋</h2>
    <p class="small mute">ほかの人が描いた地図を1枚10Gで買える（自分の地図と合わさる）。自分の地図は100Gで売りに出せて、だれかが買うたびに5G入る。行ったことのある階だけ選べる。数字はいま自分の地図が描けている割合。</p>
    <p class="gold">所持金 ${pr.gold} G</p><div class="mfgrid">${b}</div></div>`);
}
function mapTotal(f) { const fl = IL.genFloor(f); let n = 0; for (const v of fl.t) if (v && v !== IL.T.BOSS) n++; return n; }
async function mapShop(floor) {
  ui.scr = 'mapshop'; ui.mapFloor = floor; const back = run ? 'back' : 'maptop';
  show(`<div class="win" style="max-width:560px"><button class="btn sm close" data-a="${back}">とじる</button><h2>${floor}階の地図</h2><p class="mute">読みこみ中…</p></div>`);
  const list = await Net.listMaps(floor); ui.mapList = list;
  const mine = pr.maps[IL.mapKey(floor)];
  const rows = list.map((m, i) => `<div class="item"><div class="nm"><b class="nt">${esc(m.n || '名無し')}</b>の地図　${m.pct}％<br><span class="small mute">${m.boss ? 'ボス部屋あり　' : ''}安全地帯${m.safe || 0}　台座${m.peds || 0}</span></div><button class="btn sm" data-mb="${i}" ${pr.gold >= 10 ? '' : 'disabled'}>10 G</button></div>`).join('') || '<p class="mute">まだ売りに出ている地図がない</p>';
  show(`<div class="win shop" style="max-width:560px"><button class="btn sm close" data-a="${back}">とじる</button><h2>${floor}階の地図</h2><p class="gold">所持金 ${pr.gold} G</p><div class="grid">${rows}</div>
    <h2 style="margin-top:14px">自分の地図を売りに出す</h2><p class="small mute">出すのに100G。だれかが買うたびに5G入る（次にタイトルに戻ったとき受け取る）。いま${mine ? Math.round(100 * mine.n / mapTotal(floor)) : 0}％描けている。</p>
    <button class="btn" data-a="mapsell" ${Net.on && pr.gold >= 100 && mine && mine.n ? '' : 'disabled'}>売りに出す（100 G）</button></div>`);
}
function mapInfo(f) {
  const fl = IL.genFloor(f), m = pr.maps[IL.mapKey(f)], bits = IL.decodeBits(m ? m.bits : '', fl.W * fl.H); let boss = false, safe = 0, peds = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i]) { const v = fl.t[i]; if (v === IL.T.GATE) boss = true; if (v === IL.T.SAFE) safe++; if (v === IL.T.PED) peds++; }
  return { bits: m ? m.bits : '', pct: m ? Math.round(100 * m.n / mapTotal(f)) : 0, boss, safe, peds, n: opt.name || '名無し' };
}
async function buyMap(i) {
  const m = ui.mapList[i]; if (!m || pr.gold < 10) return; const got = await Net.buyMap(ui.mapFloor, m.pid); if (!got) { toast('買えませんでした'); return; }
  X(['mapbuy', ui.mapFloor, m.pid]);
  const f = ui.mapFloor, fl = IL.genFloor(f), a = IL.decodeBits(pr.maps[IL.mapKey(f)] ? pr.maps[IL.mapKey(f)].bits : '', fl.W * fl.H), b = IL.decodeBits(got.bits, fl.W * fl.H);
  if (run && run.floor === f && run._bits) for (let k = 0; k < a.length; k++) if (run._bits[k]) a[k] = 1;
  for (let k = 0; k < a.length; k++) if (b[k]) a[k] = 1; let n = 0; for (const v of a) n += v;
  pr.maps[IL.mapKey(f)] = { bits: IL.encodeBits(a), n }; if (run && run.floor === f) { run._bits = a; run._dirty = false; }
  sfx('coin'); toast('地図を手に入れた'); save(); dirty = true; mapShop(f);
}
async function sellMap() { const f = ui.mapFloor; if (pr.gold < 100) return; if (run && run.floor === f) IL.saveMap(pr, run); const ok = await Net.sellMap(f, mapInfo(f)); if (ok) { X(['mapsell', f]); sfx('coin'); toast('地図を売りに出した'); save(); } else toast('出せませんでした'); mapShop(f); }
async function collectSales() { if (!Net.on) return; const n = await Net.claimSales(); if (n > 0) { X(['mapgain', n]); save(); toast('地図が ' + n + ' 回売れた（+' + 5 * n + ' G）'); if (ui.scr === 'title') title(); } }

/* ---------- クリック ---------- */
document.addEventListener('click', async e => {
  if (performance.now() < DRAG.until && e.target.closest('.boardwin')) return;
  const t = e.target.closest('[data-a],[data-f],[data-cell],[data-bag],[data-pt],[data-syn],[data-gp],[data-buy],[data-c],[data-sk],[data-it],[data-tg],[data-use],[data-dpot],[data-mb],[data-rep],[data-tr],[data-pk],[data-tr2]');
  if (!t) { if (ui.scr === 'board' && (ui.sel != null || ui.bagSel != null) && !e.target.closest('select,input,label')) { ui.sel = null; ui.bagSel = null; sfx('click', 0.2); boardScreen(); } return; }
  const d = t.dataset;
  if (d.f && t.tagName === 'BUTTON') { if (ui.bossTrip) { if (!X(['startb', +d.f])) { toast('お金が足りない'); return; } Net.anCount('u/bosstrip'); sfx('coin', 0.5); } else X(['start', +d.f]); sfx('ok', 0.4); enterRun(run); fetchDrops(); return; }
  if (d.cell != null) return boardCellTap(+d.cell);
  if (d.bag != null && ui.multi) { const id = +d.bag; if (pr.board.includes(id)) return; ui.multi.has(id) ? ui.multi.delete(id) : ui.multi.add(id); ui.mconf = false; sfx('click', 0.2); return boardScreen(); }
  if (d.bag != null) { const before = IL.playerStats(pr); setTimeout(() => statDiff(before), 0); const id = +d.bag; ui.bagSel = ui.bagSel === id ? null : id; if (ui.sel != null && ui.bagSel != null && pr.board[ui.sel] == null) { X(['place', ui.sel, id]); ui.bagSel = null; sfx('place'); save(); } else sfx('click', 0.3); return boardScreen(); }
  if (d.pt) { X(['pt', d.pt]); sfx('select', 0.4); save(); return points(); }
  if (d.syn != null) { const id = +d.syn; if (ui.synthBase == null) ui.synthBase = id; else if (id === ui.synthBase) { ui.synthBase = null; ui.synthMat = null; } else ui.synthMat = ui.synthMat === id ? null : id; sfx('click', 0.3); return synth(); }
  if (d.gp != null) { const p = X(['gpick', +d.gp]);  if (p) { sfx(p.rar >= 2 ? 'god' : 'ok', 0.5); save(); } return gacha(); }
  if (d.buy != null) { const r = X(['buy', +d.buy]); sfx(r === 'ok' ? 'coin' : 'ng', 0.5); save(); hud(); return shop(); }
  if (d.tg != null && +d.tg >= 0) { ui.target = +d.tg; return battle(); }
  if (d.c) { if (d.c === 'skill' || d.c === 'item') { ui.sub = d.c; sfx('click', 0.3); return battle(); } return bcmd({ c: d.c, t: ui.target }); }
  if (d.sk) return bcmd({ c: 'skill', sp: d.sk, t: ui.target });
  if (d.it != null) return bcmd({ c: 'item', i: +d.it });
  if (d.use != null) { X(['pot', +d.use]); afterAct(); return potionMenu(); }
  if (d.mb != null) return buyMap(+d.mb);
  if (d.pk != null) { const i = +d.pk, a = ui.pickSel, k = a.indexOf(i); if (k >= 0) a.splice(k, 1); else if (a.length < IL.B.bagPick) a.push(i); else toast(IL.B.bagPick + '個まで'); sfx('click', 0.3); return bagScreen(ui.bagOpen); }
  if (d.tr2 != null) { const id = +d.tr2, a = ui.trSel, k = a.indexOf(id); ui.trNote = $('#trnote') ? $('#trnote').value : ''; if (k >= 0) a.splice(k, 1); else a.push(id); sfx('click', 0.3); return entrustScreen(); }
  if (d.rep != null) { Net.report(d.rep); toast('通報しました'); return; }
  if (d.tr != null) return translateMsg(d.tr, d.tl);
  if (d.dpot != null) { X(['dpot', +d.dpot]); save(); return potionMenu(); }
  switch (d.a) {
    case 'title': sfx('click', 0.3); return title();
    case 'floors': sfx('click', 0.3); return floors();
    case 'help': return help();
    case 'sound': opt.sound = !opt.sound; saveOpt(); return run ? runMenu() : title();
    case 'settings': return settings('title');
    case 'settings2': return settings('run');
    case 'setback': return ui.setFrom === 'run' && run ? runMenu() : title();
    case 'fxn': opt.fx = 'normal'; saveOpt(); applyOpt(); return settings();
    case 'auto1': opt.auto = true; saveOpt(); return settings();
    case 'auto0': opt.auto = false; saveOpt(); return settings();
    case 'bsp0': opt.bspd = 'normal'; saveOpt(); applyOpt(); return settings();
    case 'bsp1': opt.bspd = 'fast'; saveOpt(); applyOpt(); return settings();
    case 'apt': opt.autoPt = t.dataset.k; saveOpt(); autoPts(); return ui.scr === 'points' ? points() : settings();
    case 'ptauto': autoPts(opt.autoPt && opt.autoPt !== 'off' ? opt.autoPt : 'bal'); sfx('select', 0.4); return points();
    case 'astop': AUTO.stop = true; return;
    case 'bexp': return toggleExplore();
    case 'fxl': opt.fx = 'low'; saveOpt(); applyOpt(); return settings();
    case 'shk1': opt.shake = true; saveOpt(); applyOpt(); return settings();
    case 'shk0': opt.shake = false; saveOpt(); applyOpt(); return settings();
    case 'tutreset': opt.tut = {}; saveOpt(); toast('次から案内が出ます'); return settings();
    case 'ending': return ending(false);
    case 'devreset': if (!DEV) return; ui.scr = 'dev'; return show(`<div class="win" style="max-width:420px"><h2>【開発用】リセット</h2><p>この端末のレベル・欠片・お金・地図・クリアした階をすべて消して、最初からにします。</p><p class="small mute">みんなの初撃破で開いた階は、最前線としてそのまま選べます。</p><div class="row"><button class="btn warn" data-a="devreset2">消して最初から</button><button class="btn" data-a="title">やめる</button></div></div>`);
    case 'devreset2': { if (!DEV) return; const pid = S.uid; S = IL.newState(pid, Date.now()); S.gclear = {}; pr = S.pr; run = null; try { localStorage.removeItem(SAVE_S); localStorage.removeItem('il_salesgot'); } catch (e) {} save(); onFirsts(ui.firsts); if (Net.on) syncProfile(); toast('リセットしました'); return title(); }
    case 'lang': { const ks = Object.keys(L10N.LANGS); L10N.lang = opt.lang = ks[(ks.indexOf(L10N.lang) + 1) % ks.length]; saveOpt(); document.documentElement.lang = L10N.lang; return location.reload(); }
    case 'board': ui.sel = null; ui.bagSel = null; return boardScreen('title');
    case 'board2': ui.sel = null; ui.bagSel = null; return boardScreen('run');
    case 'boardback': hud(); if (ui.boardFrom === 'run' && run) { hideScreen(); dirty = true; return; } return title();
    case 'rot': { const id = ui.sel != null && pr.board[ui.sel] != null ? pr.board[ui.sel] : ui.bagSel; if (id != null) { X(['rot', id]); sfx('rotate'); save(); } return boardScreen(); }
    case 'fsp': ui.filt.sp = t.dataset.k; sfx('click', 0.2); return boardScreen();
    case 'multi': Net.anCount('u/multidisc'); ui.multi = new Set(); ui.mconf = false; ui.bagSel = null; return boardScreen();
    case 'mend': ui.multi = null; ui.mconf = false; return boardScreen();
    case 'mall': if (ui.multi) { const all = ui.lastList.every(id => ui.multi.has(id)); ui.lastList.forEach(id => all ? ui.multi.delete(id) : ui.multi.add(id)); ui.mconf = false; } return boardScreen();
    case 'mdisc': if (ui.multi && ui.multi.size) { if (!ui.mconf) { ui.mconf = true; return boardScreen(); } let n = 0; for (const id of ui.multi) if (!pr.board.includes(id) && pr.bag.some(p => p.id === id)) { X(['disc', id]); n++; } ui.multi = null; ui.mconf = false; save(); sfx('ok', 0.4); toast(n + '個を捨てた'); } return boardScreen();
    case 'autob': ui.autoSel = ui.autoSel || []; return autoScreen();
    case 'autosp': { const sp = t.dataset.k, a = ui.autoSel; const i = a.indexOf(sp); if (i >= 0) a.splice(i, 1); else { a.push(sp); if (a.length > 2) a.shift(); } sfx('click', 0.2); return autoScreen(); }
    case 'autogo': case 'autoagain': { if (!ui.autoSel || !ui.autoSel.length) return; const b = autoBuild(ui.autoSel); if (!b) { toast('かばんに欠片がない'); return autoScreen(); } ui.autoPlan = b; sfx('select', 0.4); return autoConfirm(); }
    case 'autook': Net.anCount('u/autoboard'); /* fallthrough */ case 'autook_': { const before = IL.playerStats(pr); applyBoard(ui.autoPlan.map(p => p ? { id: p.id, rot: p.rot } : null)); ui.sel = null; ui.bagSel = null; save(); sfx('place'); boardScreen(); statDiff(before); toast('おまかせで組んだ'); return; }
    case 'autoback': return boardScreen();
    case 'psave': return presetSave(+t.dataset.k);
    case 'pload': Net.anCount('u/preset'); return presetLoad(+t.dataset.k);
    case 'synall': ui.synAll = !ui.synAll; ui.synthMat = null; return synth();
    case 'unequip': if (ui.sel != null) { X(['unq', ui.sel]); save(); } return boardScreen();
    case 'discard': if (ui.bagSel != null && !pr.board.includes(ui.bagSel)) { X(['disc', ui.bagSel]); ui.bagSel = null; save(); } return boardScreen();
    case 'gacha': Net.anCount('u/gacha'); return gacha();
    case 'reroll': if (pr.tickets > 0) { X(['groll', todayKey(), 1]); save(); } return gacha();
    case 'synth': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'synreset': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'dosynth': { Net.anCount('u/synth'); const r = X(['syn', ui.synthBase, ui.synthMat, ui.synTk | 0, !!ui.synGuard]); if (r && r !== true) { ui.synRes = r; if (r.ok) { sfx('god', 0.5); ui.synthMat = null; } else { sfx('fail', 0.5); ui.synthMat = null; if (!r.kept) ui.synthBase = null; } save(); } return synth(); }
    case 'btrip': ui.bossTrip = !ui.bossTrip; sfx('click', 0.3); return floors();
    case 'tkm': ui.synTk = (ui.synTk | 0) - 1; sfx('click', 0.2); return synth();
    case 'tkp': ui.synTk = (ui.synTk | 0) + 1; sfx('click', 0.2); return synth();
    case 'tks': ui.synTk = +t.dataset.k; sfx('click', 0.2); return synth();
    case 'tgd': ui.synGuard = !ui.synGuard; sfx('click', 0.3); return synth();
    case 'synclr': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'synclrm': ui.synthMat = null; return synth();
    case 'points': return points();
    case 'respec': if (pr.respec > 0) { X(['respec']); sfx('ok'); save(); } return points();
    case 'back': hideScreen(); dirty = true; return;
    case 'map': return fullMap();
    case 'potion': return potionMenu();
    case 'giveup': return endGiveUp();
    case 'entrust': ui.trSel = []; ui.trNote = ''; return entrustScreen();
    case 'entrust2': return doEntrust();
    case 'bagtake': return bagTake();
    case 'copyloc': { try { await navigator.clipboard.writeText(t.dataset.loc); toast('コピーした'); } catch (e) { toast('コピーできませんでした'); } return; }
    case 'locpost': { ui.prefill = t.dataset.loc; Net.liveLeave(); run = null; S.run = null; save(); return plaza(); }
    case 'plaza': return plaza();
    case 'plazaback': if (ui.unBoard) { ui.unBoard(); ui.unBoard = null; } return title();
    case 'post': return doPost();
    case 'profile': return profileScreen();
    case 'tnameedit': ui.editName = true; title(); setTimeout(() => { const i = $('#tname'); if (i) { i.focus(); i.select(); } }, 0); return;
    case 'tnamecancel': ui.editName = false; return title();
    case 'tnameok': { const v = ($('#tname').value || '').trim().slice(0, 12); if (!v) { toast('名前を入れてください'); return; } if (banned(v)) { toast('使えない言葉が入っています'); return; } opt.name = v; saveOpt(); syncProfile(); ui.editName = false; sfx('ok', 0.4); toast('名前を「' + v + '」にした'); return title(); }
    case 'savename': { const v = ($('#pname').value || '').trim().slice(0, 12); if (v && banned(v)) { toast('使えない言葉が入っています'); return; } opt.name = v; saveOpt(); syncProfile(); toast('名前を決めた'); return title(); }
    case 'mkcode': { const c = await Net.makeCode(); await syncProfile(); const el = $('#code'); if (el) el.textContent = c || '作れませんでした'; return; }
    case 'usecode': { const v = $('#incode').value; const sv = await Net.useCode(v); if (!sv) { toast('合言葉がちがうか、使えません'); return; } try { const o = JSON.parse(sv); S = { uid: Net.pid, pr: o.pr, run: null, journal: [], gclear: o.gclear || {} }; pr = S.pr; run = null; save(); toast('引き継ぎました'); } catch (e) { toast('読みこめませんでした'); } return title(); }
    case 'mapopen': return mapShop(+$('#mapf').value);
    case 'mapshop': return mapShop(run.floor);
    case 'maptop': Net.anCount('u/mapshop'); return mapTop();
    case 'mapf': return mapShop(+t.dataset.k);
    case 'mapsell': return sellMap();

    case 'stairs': X(['stairs']); sfx('ok'); enterRun(run); return fetchDrops();
    case 'boss': { const ni = $('#bname'); if (ni) { const v = (ni.value || '').trim().slice(0, 12); if (v && banned(v)) { toast('使えない言葉が入っています'); return; } if (v) { opt.name = v; saveOpt(); syncProfile(); } } X(['boss']); return afterAct(); }
    case 'cancel': X(['cancel']); hideScreen(); dirty = true; save(); return;
    case 'eat': X(['eat']); hideScreen(); sfx('ok', 0.4); return afterAct();
    case 'return': X(['leave']); sfx('win', 0.5); return endScreen();
    case 'shop': return shop();
    case 'fightm': run.prompt = { kind: 'fightm' }; return prompt();
    case 'fightm2': X(['fm']); return afterAct();
    case 'subback': ui.sub = null; return battle();
    case 'sharex': return shareX(ui.firstFloor === run.floor ? 'first' : 'boss', run.floor);
    case 'sharegod': return shareX('god', run.floor, ui.godName);
    case 'bclose': { ui.godName = null; const k = run.battle.kind, ov = run.battle.over, br = run.battle.bossReward; X(['bx']); hideScreen(); dirty = true; hud(); save(); if (k === 'boss' && ov === 'win') { toast('ボスのいた所に階段が、となりに宝箱があらわれた'); claimFirst(run.floor, br); } return; }
    case 'dead': return endScreen();
    case 'next': X(['next']); sfx('ok'); enterRun(run); return fetchDrops();
    case 'portal': X(['leave']); sfx('win', 0.5); return endScreen();
  }
});
function endGiveUp() { // あきらめる：ふつうに倒れたのと同じ
  const where = { floor: run.floor, x: run.x, y: run.y }; const lost = X(['giveup']) || [];
  if (Array.isArray(lost) && lost.length) Net.addBag(where.floor, where.x, where.y, lost, opt.name, '力尽きた…');
  Net.liveLeave(); syncProfile();
  show(`<div class="win" style="max-width:460px"><h2>あきらめた</h2>${lost.length ? '<div class="bagdrop"><img src="' + BAG.toDataURL() + '" alt=""></div>' : ''}<p>盤面の欠片をこの場所に落とした。</p>${lost.length ? '<div class="lootlist">' + lost.map(p => partHTML(p)).join('') + '</div>' : ''}<button class="btn pri" data-a="dead">タイトルへ</button></div>`);
}
document.addEventListener('change', e => { const s = e.target.closest('select[data-f]'); if (!s) return; ui.filt[s.dataset.f] = s.value; boardScreen(); });
$('#mini').addEventListener('pointerup', () => { if (run && !ui.scr) fullMap(); });
/* スマホ：長押しの拡大鏡・メニューを出さない／全画面 */
['#view', '#pad', '#hud'].forEach(q => $(q).addEventListener('touchstart', e => { if (!e.target.closest('input,select,textarea,a')) e.preventDefault(); }, { passive: false }));
addEventListener('contextmenu', e => e.preventDefault());
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
addEventListener('pointerdown', () => { if (IOS || STANDALONE || document.fullscreenElement || !matchMedia('(pointer:coarse)').matches) return; const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el).catch?.(() => {}); }, { capture: true });

/* ---------- キーとパッド ---------- */
const KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
let hold = null, holdTimer = null;
function startHold(dir) { stopHold(); stopWalk(); stopExplore(); hold = dir; act(dir); holdTimer = setTimeout(function rep() { if (hold == null) return; act(hold); holdTimer = setTimeout(rep, 125); }, 230); }
function stopHold() { hold = null; clearTimeout(holdTimer); holdTimer = null; document.querySelectorAll('.dpad button.on').forEach(b => b.classList.remove('on')); }
addEventListener('keydown', e => {
  if (e.repeat && KEYDIR[e.code] != null) { e.preventDefault(); return; }
  if (KEYDIR[e.code] != null && run && !ui.scr) { e.preventDefault(); startHold(KEYDIR[e.code]); return; }
  if ((e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') && run && !ui.scr) { e.preventDefault(); interact(); return; }
  if ((e.code === 'KeyX' || e.code === 'Escape') && run && !run.battle) { e.preventDefault(); if (ui.scr && ui.scr !== 'prompt') { hideScreen(); dirty = true; } else if (!ui.scr) runMenu(); return; }
  if (e.code === 'KeyE' && run && !ui.scr) { e.preventDefault(); toggleExplore(); return; }
  if (e.code === 'KeyB' && run && !ui.scr) { ui.sel = null; ui.bagSel = null; boardScreen('run'); }
});
addEventListener('keyup', e => { if (KEYDIR[e.code] === hold) stopHold(); });
(() => { // 十字キー：パッド全体で指を追う。押したまま指をすべらせると向きが変わる
  const pad = document.querySelector('.dpad'); let pid = null;
  const dirAt = e => { const r = pad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); if (dx * dx + dy * dy < (r.width * 0.12) ** 2) return null; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); };
  const light = d => pad.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.dir === d));
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { pad.setPointerCapture(pid); } catch (_) {} const d = dirAt(e); if (d != null) { light(d); startHold(d); } });
  pad.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; const d = dirAt(e); if (d == null) { if (hold != null) stopHold(); return; } if (d !== hold) { light(d); if (hold == null) startHold(d); else { hold = d; } } });
  const end = e => { if (e.pointerId !== pid) return; pid = null; stopHold(); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => pad.addEventListener(ev, end));
})();
/* スマホでは touchstart を止めているので click が来ない → pointerup で受ける */
function padBtn(b, fn) { b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); }); b.addEventListener('pointerleave', () => b.classList.remove('on')); b.addEventListener('pointerup', e => { e.preventDefault(); const was = b.classList.contains('on'); b.classList.remove('on'); if (was) fn(); }); }
padBtn($('#b-act'), () => { stopWalk(); interact(); });
padBtn($('#b-menu'), () => { stopWalk(); stopExplore(); if (run && !ui.scr) runMenu(); });
padBtn($('#b-exp'), () => { stopWalk(); toggleExplore(); });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
let lastTouch = 0; document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 300) e.preventDefault(); lastTouch = n; }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- はじまり ---------- */
/* 新しい版が出ていたら、自動で読みなおす（古いキャッシュで動かないように） */
async function checkUpdate() {
  try { const v = (await (await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' })).text()).trim();
    if (v && window.IL_BUILD && v !== window.IL_BUILD && sessionStorage.getItem('il_rl') !== v) { sessionStorage.setItem('il_rl', v); save(); location.replace(location.pathname + '?b=' + v); return true; } } catch (e) {}
  return false;
}
setInterval(() => { if (!run || run.over || ui.scr === 'title') checkUpdate(); }, 5 * 60000);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!run || !run.battle)) checkUpdate(); });
async function boot() {
  if (await checkUpdate()) return;
  if (/[?&]reset=1/.test(location.search)) { try { ['il_state_v1', 'il_salesgot', 'il_jn'].forEach(k => localStorage.removeItem(k)); } catch (e) {} history.replaceState(null, '', location.pathname); } // この端末のデータだけ消す
  try { opt = Object.assign(opt, JSON.parse(localStorage.getItem(SAVE_O) || '{}')); } catch (e) {}
  L10N.lang = opt.lang || L10N.pick(); document.documentElement.lang = L10N.lang; L10N.observe(); L10N.apply(); applyOpt();
  if (window.FX) { FX.init(cv); applyOpt(); }
  resize(); requestAnimationFrame(render); drawIdle();
  drawTitleBg(); show('<div class="win title"><div class="logo">INTEGRA LAYER<small>インテグラ・レイヤー</small></div><p class="mute">つないでいます…</p></div>');
  const timeout = new Promise(r => setTimeout(() => r(false), 7000));
  await Promise.race([Net.init(), timeout]);
  if (Net.on) Net.anStart();
  let pid = null; try { pid = localStorage.getItem('il_pid'); } catch (e) {}
  if (!pid) { pid = Net.uid || ('local-' + Math.random().toString(36).slice(2, 12)); try { localStorage.setItem('il_pid', pid); } catch (e) {} }
  Net.pid = pid; loadState(pid);
  if (Net.on) { Net.watchHidden(h => { ui.hidden = h; if (ui.scr === 'plaza') drawBoard(); }); Net.watchInfo((k, v) => { ui[k] = v; if (ui.scr === 'title') title(); }); Net.watchFirsts(onFirsts);
    const beat = () => Net.presence(run && !run.over ? run.floor : 0); beat(); setInterval(beat, 60000);
    collectSales(); setInterval(() => { flushJournal(); }, 60000); }
  const go = () => { dirty = true; if (run && !run.over) { enterRun(run); fetchDrops(); if (run.battle) battle(); else if (run.prompt) prompt(); } else title(); };
  if (sheet.complete && sheet.naturalWidth) go(); else sheet.onload = go;
}
addEventListener('pagehide', () => { save(); });
boot();
window.__IL = { get pr() { return pr; }, get run() { return run; }, get S() { return S; }, get ui() { return ui; }, act, interact, bcmd, title, X };
})();
