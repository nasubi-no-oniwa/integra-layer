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
const tinted = {};
function tintSheet(bi) {
  if (tinted[bi]) return tinted[bi];
  const c = document.createElement('canvas'); c.width = sheet.width; c.height = sheet.height; const g = c.getContext('2d'); g.drawImage(sheet, 0, 0);
  const t = IL.BIOMES[bi].tint, d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { a[i] = Math.min(255, a[i] * t[0]); a[i + 1] = Math.min(255, a[i + 1] * t[1]); a[i + 2] = Math.min(255, a[i + 2] * t[2]); }
  g.putImageData(d, 0, 0); return tinted[bi] = c;
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
function drawTile(g, src, idx, x, y, s) { g.drawImage(src, (idx % 12) * 16, Math.floor(idx / 12) * 16, 16, 16, x, y, s, s); }
function spriteCanvas(idx, scale, bi) { const c = document.createElement('canvas'); c.width = c.height = 16 * scale; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; drawTile(g, bi == null ? sheet : tintSheet(bi), idx, 0, 0, 16 * scale); return c; }

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
function partHTML(p, cls, lk) { // lk: つながっている辺（0上 1右 2下 3左）
  const c = IL.SP_COLOR[p.sp];
  const sides = ['t', 'r', 'b', 'l'];
  let e = ''; for (let s = 0; s < 4; s++) { const v = IL.edgeAt(p, s); if (v) e += `<i class="e ${sides[s]} ${v === 1 ? 'v' : 'c'}${lk && lk[s] ? ' lk' : ''}"></i>`; }
  const rk = p.stats.map(s => s.r).join('');
  return `<div class="part r${p.rar} ${cls || ''}" style="--c:${c}">${e}<svg viewBox="0 0 16 16">${EMB[p.sp] || ''}</svg><span class="rk">${rk}</span>${p.gacha ? '<span class="gc">★</span>' : ''}</div>`;
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
  if (st && st.on) h += `<a class="stream" href="${/^https?:\/\//.test(st.url || '') ? esc(st.url) : '#'}" target="_blank" rel="noopener">🔴 配信中${st.txt ? '　<span class="nt">' + esc(st.txt) + '</span>' : ''}</a>`;
  const fs = ui.firsts || {}, top = Math.max(0, ...Object.keys(fs).map(Number).filter(f => fs[f] && !fs[f].ng));
  if (top) { const v = fs[top], co = Object.values(v.co || {}).length; h += `<div class="front">🏆 最前線　<b>${top}階</b>のボスを <span class="nt">${esc(v.n || '無名')}</span>${co ? ' ＋' + co : ''}が初めて倒した <span class="mute small">（${ago(v.t)}）</span></div>`; }
  const nw = ui.news || {}; const ids = Object.keys(nw).sort((a, b) => (nw[b].t || 0) - (nw[a].t || 0)).slice(0, 3);
  if (ids.length) h += '<div class="news"><b>お知らせ</b>' + ids.map(id => `<div><span class="mute">${new Date(nw[id].t || 0).toLocaleDateString()}</span> <span class="nt">${esc(nw[id].s)}</span></div>`).join('') + '</div>';
  return h;
}
function title() {
  if (S.run && S.run.over) S.run = null; run = S.run; ui.scr = 'title'; if (Net.on) Net.presence(0); $('#hud').hidden = true; $('#pad').hidden = true; save(); drawIdle();
  const st = IL.playerStats(pr);
  show(`<div class="win title">
    <div class="logo">INTEGRA LAYER<small>インテグラ・レイヤー</small></div>
    ${infoHTML()}
    <p class="story">倒れた誰かの欠片が、きみの盤面でつながる。\n全員で、100階の塔を上れ。</p>
    <div class="statline"><span>Lv ${pr.lv}</span><span>最前線 ${pr.maxFloor}階</span><span class="gold">${pr.gold} G</span><span>回復薬 ${pr.potions.length}</span><span>チケット ${pr.tickets}</span></div>
    <div class="menu">
      <button class="btn pri" data-a="floors">塔に入る</button>
      <button class="btn" data-a="board">盤面とかばん</button>
      <button class="btn" data-a="gacha">今日のガチャ${gachaReady() ? '<span class="badge">!</span>' : ''}</button>
      <button class="btn" data-a="synth">合成</button>
      <button class="btn" data-a="points">能力${pr.freePts ? '<span class="badge">' + pr.freePts + '</span>' : ''}</button>
      <button class="btn" data-a="plaza">広場（掲示板）</button>
      <div class="row" style="justify-content:center"><button class="btn sm" data-a="profile">名前と引き継ぎ</button><button class="btn sm" data-a="help">遊び方</button><button class="btn sm" data-a="settings">⚙ 設定</button><button class="btn sm" data-a="lang">🌐 ${L10N.LANGS[L10N.lang]}</button>${ui.firsts && ui.firsts[100] ? '<button class="btn sm" data-a="ending">エンディング</button>' : ''}</div>
      ${DEV ? '<button class="btn sm warn" data-a="devreset">【開発用】データをリセット</button>' : ''}
      <p class="small mute">${Net.on ? 'オンライン　<span class="nt">' + esc(opt.name || '名無し') + '</span>' : 'オフライン（この端末だけ）'}</p>
    </div></div>
    <a class="support" href="https://ofuse.me/001a3b99" target="_blank" rel="noopener">🍆 応援する</a>
    <a class="credit" href="https://maou.audio/" target="_blank" rel="noopener">音楽：魔王魂</a>`);
  drawTitleBg();
}
function floors() {
  ui.scr = 'floors';
  let b = ''; for (let f = 1; f <= 100; f++) { const cl = pr.cleared[f], fr = f === pr.maxFloor; b += `<button data-f="${f}" class="${cl ? 'cl' : ''} ${fr ? 'fr' : ''}" ${f > pr.maxFloor ? 'disabled' : ''}>${f}</button>`; }
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>どの階から始める？</h2>
    <p class="small mute">緑＝ボスを倒した階　金＝最前線（${pr.maxFloor}階）。10階ごとに景色が変わる。</p>
    <div class="floors">${b}</div>${Net.on ? '<p class="small mute" style="margin-top:8px">地図を買う：</p><div class="row"><select id="mapf">' + Array.from({ length: pr.maxFloor }, (_, i) => `<option value="${i + 1}">${i + 1}階</option>`).join('') + '</select><button class="btn sm" data-a="mapopen">地図の店へ</button></div>' : ''}</div>`);
}
function help() {
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>遊び方</h2>
  <p class="story">・塔を探索して、敵とぶつかると戦いになる。台座はとなりから「調べる」。
・拾った欠片を5×5の盤面に置く。凸と凹が向き合うとつながる。
・同じ種族の欠片がたくさんつながるほど、その欠片の能力が上がる（別の種族はつなぎ役になる）。同じ種族が2個以上つながると技が使える（25個で「神」）。
・炎＝1体に大ダメージ　風＝全体　岩＝守り　森＝回復　星＝弱点も半減も関係なし。
・ボスを倒すと次の階へ。帰れるのは「安全地帯」と「ボスのあとの帰還ポータル」だけ。
・倒れると、盤面の欠片がバッグになってその場に残る（ガチャの欠片は残る）。ボスにやられると盤面の欠片が全部消える。
・だれかのバッグは、となりで「調べる」と開ける。1つのバッグから5個まで、1回だけ拾える。中身は減らない。
・メニューの「欠片を託す」で、選んだ欠片をバッグに入れて、だれかのために置いていける（倒れるのと同じ）。
・行商人とは戦えるが、とても強い。負けるとかばんの中身が消える。
・操作：矢印キー／WASDで移動、スペース／Zで調べる、Xでメニュー。スマホは画面のボタン。</p></div>`);
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
    <div class="setrow"><span>言葉</span><select data-setlang="1" class="inp">${langs}</select></div>
    <div class="setrow"><span>はじめの案内</span><button class="btn sm" data-a="tutreset">もう一度見る</button></div></div>`);
}
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.set; if (!k) return; opt[k] = (+e.target.value) / 100; opt.sound = true; saveOpt(); if (k === 'bgm' && MUS.el) MUS.el.volume = bgmVol(); if (k === 'bgm' && !MUS.el) { MUS.cur = null; musicTick(); } });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.setlang) { L10N.lang = opt.lang = e.target.value; saveOpt(); location.reload(); } });
function fxLow() { return opt.fx === 'low'; }
function applyOpt() { document.body.classList.toggle('lowfx', fxLow()); document.body.classList.toggle('noshake', opt.shake === false); }

/* ---------- はじめの案内（行商人がしゃべる。くどくならないように1回ずつ） ---------- */
const TUT = {
  start: '「やあ、新入り。ここは100階まで続く塔さ。まずは歩きまわって“欠片”を集めてきな。台座はとなりで『調べる』と開くよ」',
  got: '「いい欠片だ。右下の ≡ メニュー →『盤面とかばん』で、盤面に置いてみな」',
  link: '「凸と凹が向き合うと欠片がつながる。つながるほど強くなるし、同じ種族が2つつながれば技が使えるよ」',
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
  ui.scr = 'board'; ui.boardFrom = from || ui.boardFrom || 'title';
  const ba = IL.boardArr(pr), an = IL.analyzeBoard(ba), st = IL.playerStats(pr);
  const gcol = ['#ffd17a', '#8ad3ff', '#ff9ad5', '#b5f78a', '#ffb36b', '#c7a8ff', '#7fffd4', '#ff7f7f'];
  let cells = ''; const lks = Array.from({ length: 25 }, () => [0, 0, 0, 0]);
  for (const [a, b] of an.links) { if (b === a + 1) { lks[a][1] = 1; lks[b][3] = 1; } else { lks[a][2] = 1; lks[b][0] = 1; } }
  for (let i = 0; i < 25; i++) {
    const p = ba[i], gi = an.groupOf[i], big = gi >= 0 && an.groups[gi].cells.length > 1;
 cells += `<div class="cell ${ui.sel === i ? 'sel' : ''} ${big ? 'lk' : ''}" data-cell="${i}">${p ? partHTML(p, '', lks[i]) : ''}${p && big ? `<span class="gm">×${an.mulOf[i]}</span>` : ''}</div>`;
  }
  let sk = ''; for (const sp of IL.SPECIES) { const s = st.skills[sp]; if (s) sk += `<div class="skill" style="--c:${IL.SP_COLOR[sp]}"><i></i>${IL.SKILLS[sp][s.tier]} <span class="mute">${IL.SP_NAME[sp]}×${s.count}・段階${s.tier}${IL.TIER_NAME[s.tier] ? '（' + IL.TIER_NAME[s.tier] + '）' : ''}</span></div>`; }
  if (!sk) sk = '<div class="mute small">同じ種族を2個以上つなげると技が使える</div>';
  const stats = IL.STATS.map(k => `<div>${IL.STAT_NAME[k]}<b>${st[k]}</b><small class="mute">+${an.add[k]}</small></div>`).join('');
  // かばん
  const onB = new Set(pr.board.filter(x => x != null));
  let list = pr.bag.slice();
  if (ui.filt.sp !== 'all') list = list.filter(p => p.sp === ui.filt.sp);
  if (ui.filt.rar !== 'all') list = list.filter(p => String(p.rar) === ui.filt.rar);
  if (ui.filt.sort === 'score') list.sort((a, b) => IL.partScore(b) - IL.partScore(a)); else if (ui.filt.sort === 'new') list.sort((a, b) => b.id - a.id); else list.sort((a, b) => b.floor - a.floor);
  const items = list.map(p => `<div class="bagitem ${ui.bagSel === p.id ? 'sel' : ''} ${onB.has(p.id) ? 'eq' : ''}" data-bag="${p.id}">${partHTML(p)}<small>${IL.RAR_NAME[p.rar]} ${p.floor}階</small></div>`).join('') || '<div class="mute small">かばんは空っぽ</div>';
  const selP = ui.sel != null && ba[ui.sel] ? ba[ui.sel] : ui.bagSel != null ? pr.bag.find(p => p.id === ui.bagSel) : null;
  const spOpt = ['all', ...IL.SPECIES, 'none', 'joker'].map(s => `<option value="${s}" ${ui.filt.sp === s ? 'selected' : ''}>${s === 'all' ? '種族：すべて' : IL.SP_NAME[s]}</option>`).join('');
  const rOpt = ['all', '0', '1', '2', '3'].map(s => `<option value="${s}" ${ui.filt.rar === s ? 'selected' : ''}>${s === 'all' ? 'レアリティ：すべて' : IL.RAR_NAME[s]}</option>`).join('');
  const soOpt = [['score', '強い順'], ['new', '新しい順'], ['floor', '深い階順']].map(([v, n]) => `<option value="${v}" ${ui.filt.sort === v ? 'selected' : ''}>${n}</option>`).join('');
  show(`<div class="win" style="max-width:900px"><button class="btn sm close" data-a="boardback">とじる</button><h2>盤面とかばん</h2>
    <div class="boardwrap"><div><div class="board">${cells}</div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="rot" ${selP ? '' : 'disabled'}>回す</button><button class="btn sm" data-a="unequip" ${ui.sel != null && ba[ui.sel] ? '' : 'disabled'}>外す</button><button class="btn sm warn" data-a="discard" ${ui.bagSel != null && !onB.has(ui.bagSel) ? '' : 'disabled'}>捨てる</button></div></div>
      <div class="side"><div class="stats">${stats}</div><div class="skills">${sk}</div>
      <div class="detail">${selP ? partText(selP) : 'マスか欠片を選ぶ。欠片を選んでからマスを押すと置ける。置いた欠片をもう一度押すと回る。'}</div></div></div>
    <div class="row" style="margin-top:10px"><select data-f="sp">${spOpt}</select><select data-f="rar">${rOpt}</select><select data-f="sort">${soOpt}</select><span class="mute small">${pr.bag.length}個</span></div>
    <div class="bag">${items}</div></div>`);
  if (an.links.length) tut('link');
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
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>能力</h2>
    <p>Lv ${pr.lv}　経験値 ${pr.exp} / ${need}　<span class="gold">残りポイント ${pr.freePts}</span></p>
    <div class="grid">${rows}</div>
    <p class="small mute">運は会心・レアの出やすさ・合成の成功率に効く。素早さは戦いで先に動けるかに効く。</p>
    <button class="btn" data-a="respec" ${pr.respec ? '' : 'disabled'}>振りなおす（振りなおしの札 ${pr.respec}枚）</button></div>`);
}

/* ---------- 合成 ---------- */
function synth() {
  ui.scr = 'synth';
  const base = pr.bag.find(p => p.id === ui.synthBase), mat = pr.bag.find(p => p.id === ui.synthMat);
  let list = base ? pr.bag.filter(p => IL.canSynth(base, p)) : pr.bag.filter(p => p.stats.some(s => s.r !== 'A') && pr.bag.some(q => IL.canSynth(p, q)));
  list.sort((a, b) => IL.partScore(b) - IL.partScore(a));
  const items = list.map(p => `<div class="bagitem ${p.id === ui.synthMat ? 'sel' : ''}" data-syn="${p.id}">${partHTML(p)}<small>${IL.RAR_NAME[p.rar]} ${p.floor}階</small></div>`).join('') || '<div class="mute small">合成できる組み合わせがない</div>';
  const rate = Math.round(IL.synthRate(pr) * 100);
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>合成</h2>
    <p class="small mute">同じ種族・同じレアリティの2個で合成。成功すると能力のどれか1つのランクが上がる（材料は消える）。失敗すると<b style="color:#ff8a8a">両方消える</b>。成功率 ${rate}％</p>
    <div class="row"><div>${base ? partHTML(base) : '<div class="cell" style="--s:56px"></div>'}<div class="small mute">強くする方</div></div><div style="font-size:24px">＋</div><div>${mat ? partHTML(mat) : '<div class="cell" style="--s:56px"></div>'}<div class="small mute">材料</div></div>
      <button class="btn pri" data-a="dosynth" ${base && mat ? '' : 'disabled'}>合成する</button>${base ? '<button class="btn sm" data-a="synreset">選びなおす</button>' : ''}</div>
    <div class="detail">${base ? partText(base) : '強くしたい欠片を選ぶ'}${mat ? '<br><br>材料：' + partText(mat) : ''}</div>
    <div class="bag">${items}</div></div>`);
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
  const k = W < 700 ? 1 : 1.4; mini.width = 150; mini.height = 100; mini.style.width = Math.round(150 * k) + 'px'; mini.style.height = Math.round(100 * k) + 'px';
  dirty = true;
}
addEventListener('resize', resize);
function enterRun(r) { run = r; Net.presence(r.floor); ui.scr = null; ui.ghosts = []; miniKey = ''; watchLive(true); hideScreen(); $('#hud').hidden = false; $('#pad').hidden = false; dirty = true; hud(); save(); tut('start'); }
function hud() {
  if (!run) return; const st = IL.playerStats(pr);
  $('#h-floor').textContent = run.floor; $('#h-biome').textContent = IL.biomeOf(run.floor).name;
  $('#h-hp').textContent = run.hp + ' / ' + st.hp; $('#h-hpbar').style.width = Math.max(0, 100 * run.hp / st.hp) + '%';
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
  if (!run) { if (TB.on && ui.scr !== 'ending') titleAnim(now); return; }
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
    if (v === T.WALL) { let adj = false; for (const o of [1, -1, fl.W, -fl.W, fl.W + 1, fl.W - 1, -fl.W + 1, -fl.W - 1]) if (fl.t[i + o]) adj = true; if (adj) drawTile(g, src, B.wallTile, px, py, TS); continue; }
    drawTile(g, src, ((i * 2654435761) >>> 0) % 17 === 0 ? (B.floorTile === 48 ? 49 : B.floorTile === 0 ? 12 : 24) : B.floorTile, px, py, TS);
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
      drawTile(g, src, bt.tile, px + TS / 2 - TS * k / 2, py + TS / 2 - TS * k * 0.62 + wob, TS * k); }
  }
  if (run.bossChest) { const c = run.bossChest.i; if (bits[c]) drawTile(g, src, run.bossChest.opened ? 90 : 89, cx + (c % fl.W) * TS, cy + ((c / fl.W) | 0) * TS, TS); }
  ui.cam = { cx, cy, TS };
  const vis = (x, y) => Math.abs(x - run.x) <= 9 && Math.abs(y - run.y) <= 7 && bits[y * fl.W + x];
  if (run.merchant && vis(run.merchant.x, run.merchant.y)) drawTile(g, src, 84, cx + run.merchant.x * TS, cy + run.merchant.y * TS, TS);
  for (const e of run.enemies) if (vis(e.x, e.y)) { drawTile(g, src, e.tile, cx + e.x * TS, cy + e.y * TS, TS); if (e.cool) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(cx + e.x * TS, cy + e.y * TS, TS, TS); } }
  const opened = pr.bagsOpen || {};
  for (const b of ui.bags) if (bits[b.y * fl.W + b.x] && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) { g.globalAlpha = opened[b.id] ? 0.35 : 1; const bob = opened[b.id] ? 0 : Math.sin(now / 400 + b.x) * TS * 0.04; g.drawImage(BAG, cx + b.x * TS, cy + b.y * TS + bob, TS, TS); g.globalAlpha = 1; }
  if (ui.bags.some(b => !opened[b.id])) dirty = true;
  g.globalAlpha = 0.45; for (const o of ui.ghosts) if (Math.abs(o.x - run.x) <= 12 && Math.abs(o.y - run.y) <= 9) drawTile(g, sheet, 85 + (IL.hashStr(o.u) % 4), cx + o.x * TS, cy + o.y * TS, TS); g.globalAlpha = 1;
  drawTile(g, sheet, 97, Math.round(W / 2 - TS / 2), Math.round(H / 2 - TS / 2), TS);
  // 見えている範囲の外を少し暗く
  // たいまつの明かり（自分のまわりだけ明るい）
  const fk = fxLow() ? 0 : Math.sin(now / 130) * 0.15 + Math.sin(now / 47) * 0.08, r0 = TS * (3.2 + fk), r1 = TS * (8.5 + fk);
  const grd = g.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1); grd.addColorStop(0, 'rgba(255,170,80,.05)'); grd.addColorStop(0.35, 'rgba(0,0,0,.15)'); grd.addColorStop(1, 'rgba(4,3,8,.82)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (!fxLow()) dirty = true;
  drawMini(fl, bits);
}
function tileColor(v, i) { const T = IL.T; return v === T.BOSS ? '#7a2030' : v === T.GATE ? '#e8553f' : v === T.SAFE ? '#4fd17a' : v === T.PED ? (run.opened[i] ? '#555' : '#f2d14b') : '#5c5470'; }
let miniKey = '';
function drawMini(fl, bits) { // 自分のまわりだけ（タップで全体）
  const k = 2, vw = mini.width / k, vh = mini.height / k, ox = Math.round(run.x - vw / 2), oy = Math.round(run.y - vh / 2);
  const key = run.floor + ':' + run.x + ':' + run.y + ':' + ui.bags.length; if (key === miniKey) return; miniKey = key;
  mg.clearRect(0, 0, mini.width, mini.height);
  for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const tx = ox + x, ty = oy + y; if (tx < 0 || ty < 0 || tx >= fl.W || ty >= fl.H) continue; const i = ty * fl.W + tx; if (!bits[i]) continue; const v = fl.t[i]; if (v === IL.T.WALL) continue; mg.fillStyle = tileColor(v, i); mg.fillRect(x * k, y * k, k, k); }
  const op = pr.bagsOpen || {}; mg.fillStyle = '#ffb347'; for (const b of ui.bags) if (!op[b.id] && bits[b.y * fl.W + b.x]) { const x = (b.x - ox) * k, y = (b.y - oy) * k; if (x >= 0 && y >= 0 && x < mini.width && y < mini.height) mg.fillRect(x - 1, y - 1, k + 2, k + 2); }
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
  show(`<div class="win"><button class="btn sm close" data-a="back">とじる</button><h2>${run.floor}階の地図（${Math.round(100 * n / tot)}％）</h2><img class="mapfull" src="${c.toDataURL()}"><p class="small mute">赤＝ボス部屋の入口（中のボスに触れると戦う）　緑＝安全地帯　黄＝まだ開けていない台座　橙＝落ちているバッグ</p></div>`);
}
function afterAct() {
  // できごと
  for (const ev of run.events) {
    if (ev.t === 'msg') toast(ev.s);
    if (ev.t === 'loot') { if (ev.parts.length) tut('got'); sfx('chest'); const s = ev.parts.map(p => IL.SP_NAME[p.sp] + 'の欠片（' + IL.RAR_NAME[p.rar] + '）').join('、'); toast(ev.from + 'から ' + s + (ev.gold ? '、' + ev.gold + 'G' : '') + (ev.ticket ? '、ガチャチケット' : '') + ' を手に入れた'); if (ev.parts.some(p => p.rar >= 2)) sfx('god', 0.4); }
  }
  run.events = [];
  hud(); dirty = true; save();
  if (run.battle) { ui.target = 0; ui.sub = null; battle(); if (run.battle.foes[0].kind) sfx('boss', 0.6); tut('battle'); }
  else if (run.prompt) { prompt(); if (run.prompt && run.prompt.kind === 'gate') tut('boss'); }
  else if (ui.bags.length && bagNear(6) && !(pr.bagsOpen || {})[bagNear(6).id]) tut('bag');
}
function act(dir) {
  if (!run || ui.scr || run.battle || run.prompt || run.over) return;
  const ox = run.x, oy = run.y; X(['mv', dir]);
  if (run.x !== ox || run.y !== oy) { anim = { x0: ox, y0: oy, t0: performance.now() }; if (run.turn % 2) sfx('step', 0.15); watchLive(); }
  afterAct();
}
function bagNear(maxD) { const op = pr.bagsOpen || {}; let best = null; for (const b of ui.bags) { const d = Math.abs(b.x - run.x) + Math.abs(b.y - run.y); if (d <= (maxD == null ? 1 : maxD) && (!best || d < best.d || (op[best.b.id] && !op[b.id]))) best = { b, d }; } return best && best.b; }
function interact() {
  if (!run || ui.scr || run.battle || run.prompt) return;
  const b = bagNear(); if (b && !(pr.bagsOpen || {})[b.id]) return bagScreen(b);
  X(['it']); afterAct();
  if (!run.prompt && !run.battle && b) toast('このバッグはもう開けた');
}
cv.addEventListener('click', e => { // 画面の回復草をタップ
  if (!run || ui.scr || run.battle || run.prompt || run.over || !ui.cam) return;
  const r = cv.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) * cv.width / r.width - ui.cam.cx) / ui.cam.TS), y = Math.floor(((e.clientY - r.top) * cv.height / r.height - ui.cam.cy) / ui.cam.TS);
  const fl = IL.genFloor(run.floor), i = y * fl.W + x;
  const bg = ui.bags.find(b => b.x === x && b.y === y);
  if (bg) { if (Math.abs(x - run.x) + Math.abs(y - run.y) > 1) return toast('もっと近づくと開けられる'); if ((pr.bagsOpen || {})[bg.id]) return toast('このバッグはもう開けた'); return bagScreen(bg); }
  if (IL.herbNear(fl, run, i)) { X(['hb', i]); afterAct(); }
  else if (IL.herbAvail(fl, run, i)) toast('もっと近づくと食べられる');
});

/* ---------- 落ちたバッグ ---------- */
function ago(t) { const m = Math.max(0, Math.floor((Net.now() - (t || 0)) / 60000)); return m < 1 ? 'たった今' : m < 60 ? m + '分前' : m < 1440 ? Math.floor(m / 60) + '時間前' : Math.floor(m / 1440) + '日前'; }
function bagScreen(b) {
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
/* ---------- 声かけ（ボス部屋・安全地帯・行商人） ---------- */
function prompt() {
  const p = run.prompt; ui.scr = 'prompt';
  if (p.kind === 'gate') {
    const last = run.floor >= 100;
    show(`<div class="win" style="max-width:460px"><h2>ボス</h2>${pr.cleared[run.floor]
      ? `<p>階段が開いています。階段を進みますか？ボスと戦いますか？</p><p class="small mute">ボスからしか出ない欠片や、レアな欠片がある。</p><div class="row">${last ? '' : '<button class="btn pri" data-a="stairs">階段を進む</button>'}<button class="btn warn" data-a="boss">ボスと戦う</button><button class="btn" data-a="cancel">やめる</button></div>`
      : `<p>ボスと戦いますか？　戦いが始まったら逃げられない。</p><p class="small mute">ボスはこの階の敵より格段に強い。負けると盤面の欠片がすべて消える。</p><div class="row"><button class="btn warn" data-a="boss">ボスと戦う</button><button class="btn" data-a="cancel">やめる</button></div>`}</div>`, 'clear');
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
    } else bottom = `<div class="cmds"><button class="btn pri" data-c="atk">たたかう</button><button class="btn" data-c="skill">技</button><button class="btn" data-c="def">ぼうぎょ</button><button class="btn" data-c="item">どうぐ</button><button class="btn" data-c="flee" ${bt.kind !== 'normal' ? 'disabled' : ''}>にげる</button></div>`;
  } else bottom = battleResult();
  const BBG = ['#22402a', '#4a3a1e', '#1e3a4a', '#4a1e1e', '#2a3f55', '#2f4a1e', '#33363d', '#2a1e44', '#3a1e4a', '#4a4a5a'];
  show(`<div class="win battle" style="--bb:${BBG[bi]}"><div class="bwrap"><div class="bl"><div class="foes">${foes}</div>
    <div class="row" style="gap:10px"><span>体力 ${run.hp} / ${st.hp}</span><div class="bar me" style="flex:1"><i style="width:${100 * run.hp / st.hp}%"></i></div></div></div>
    <div class="br"><div class="log" id="blog">${log}</div>${bottom}</div></div></div>`);
  const small = innerHeight < 520;
  document.querySelectorAll('.spr').forEach(d => d.appendChild(spriteCanvas(+d.dataset.tile, d.dataset.big === '1' ? (small ? 4 : 6) : (small ? 3 : 4), bi)));
  const lg = $('#blog'); if (lg) lg.scrollTop = 1e6;
}
function battleResult() {
  const bt = run.battle;
  if (bt.over === 'win') {
    const r = bt.reward; const parts = r.parts.map(p => partHTML(p)).join('');
    let extra = ''; if (bt.bossReward) { if (bt.bossReward.first) extra += `<p class="gold">初撃破ボーナス！</p><div class="lootlist">${bt.bossReward.first.map(p => partHTML(p)).join('')}</div>`; if (bt.bossReward.respec) extra += '<p>振りなおしの札を手に入れた</p>'; if (bt.bossReward.chest) extra += '<p class="gold">ボスの落とし物は、となりの宝箱に入っている。</p>'; }
    return `<p>勝った！ 経験値 ${r.exp}・${r.gold} G${r.ups ? `<b class="gold">　レベルが ${pr.lv} に上がった！（ポイント+${r.ups * 3}）</b>` : ''}</p>${parts ? '<div class="lootlist">' + parts + '</div>' : ''}${extra}<div class="row"><button class="btn pri" data-a="bclose">続ける</button>${ui.godName ? '<button class="btn sm" data-a="sharegod">𝕏 神技をつぶやく</button>' : ''}${bt.kind === 'boss' ? '<button class="btn sm" data-a="sharex">𝕏 でつぶやく</button>' : ''}</div>`;
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
  ui.sub = null; save(); battle(); hud();
  if (run.hp < hpB) { const w = document.querySelector('.battle'); if (w) w.classList.add('shake'); }
  if (bt.over === 'win') { sfx('win', 0.5); if (bt.reward.ups) setTimeout(() => sfx('levelup', 0.5), 400); }
  if (bt.over === 'lose') { sfx('fail', 0.5); const li = bt.loseInfo; if (li && li.lost && li.lost.length && !li.boss) Net.addBag(li.where.floor, li.where.x, li.where.y, li.lost, opt.name, '力尽きた…'); }
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
function godFx(name) { ui.godName = name; const d = document.createElement('div'); d.className = 'god'; d.textContent = name; $('#app').appendChild(d); setTimeout(() => d.remove(), 1700); }
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
async function fetchDrops() { ui.bags = []; if (!Net.on || !run) return; const f = run.floor; const list = await Net.getBags(f); if (run && run.floor === f) { ui.bags = list; dirty = true; } }
function watchLive(force) {
  if (!Net.on || !run) return; Net.liveSend(run.floor, run.x, run.y, opt.name || '', force);
  const key = run.floor + ':' + Net.chunkOf(run.x, run.y); if (force || Net.liveKey !== key) Net.liveWatch(run.floor, run.x, run.y, list => { const now = Net.now(); ui.ghosts = list.filter(o => now - (o.t || 0) < 15000).slice(0, 10); dirty = true; });
}
async function claimFirst(floor, br) {
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
function mapTotal(f) { const fl = IL.genFloor(f); let n = 0; for (const v of fl.t) if (v && v !== IL.T.BOSS) n++; return n; }
async function mapShop(floor) {
  ui.scr = 'mapshop'; ui.mapFloor = floor; const back = run ? 'back' : 'floors';
  show(`<div class="win" style="max-width:560px"><button class="btn sm close" data-a="${back}">とじる</button><h2>${floor}階の地図</h2><p class="mute">読みこみ中…</p></div>`);
  const list = await Net.listMaps(floor); ui.mapList = list;
  const mine = pr.maps[String(floor)];
  const rows = list.map((m, i) => `<div class="item"><div class="nm"><b class="nt">${esc(m.n || '名無し')}</b>の地図　${m.pct}％<br><span class="small mute">${m.boss ? 'ボス部屋あり　' : ''}安全地帯${m.safe || 0}　台座${m.peds || 0}</span></div><button class="btn sm" data-mb="${i}" ${pr.gold >= 10 ? '' : 'disabled'}>10 G</button></div>`).join('') || '<p class="mute">まだ売りに出ている地図がない</p>';
  show(`<div class="win shop" style="max-width:560px"><button class="btn sm close" data-a="${back}">とじる</button><h2>${floor}階の地図</h2><p class="gold">所持金 ${pr.gold} G</p><div class="grid">${rows}</div>
    <h2 style="margin-top:14px">自分の地図を売りに出す</h2><p class="small mute">出すのに100G。だれかが買うたびに5G入る（次にタイトルに戻ったとき受け取る）。いま${mine ? Math.round(100 * mine.n / mapTotal(floor)) : 0}％描けている。</p>
    <button class="btn" data-a="mapsell" ${Net.on && pr.gold >= 100 && mine && mine.n ? '' : 'disabled'}>売りに出す（100 G）</button></div>`);
}
function mapInfo(f) {
  const fl = IL.genFloor(f), m = pr.maps[String(f)], bits = IL.decodeBits(m ? m.bits : '', fl.W * fl.H); let boss = false, safe = 0, peds = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i]) { const v = fl.t[i]; if (v === IL.T.GATE) boss = true; if (v === IL.T.SAFE) safe++; if (v === IL.T.PED) peds++; }
  return { bits: m ? m.bits : '', pct: m ? Math.round(100 * m.n / mapTotal(f)) : 0, boss, safe, peds, n: opt.name || '名無し' };
}
async function buyMap(i) {
  const m = ui.mapList[i]; if (!m || pr.gold < 10) return; const got = await Net.buyMap(ui.mapFloor, m.pid); if (!got) { toast('買えませんでした'); return; }
  X(['mapbuy', ui.mapFloor, m.pid]);
  const f = ui.mapFloor, fl = IL.genFloor(f), a = IL.decodeBits(pr.maps[String(f)] ? pr.maps[String(f)].bits : '', fl.W * fl.H), b = IL.decodeBits(got.bits, fl.W * fl.H);
  if (run && run.floor === f && run._bits) for (let k = 0; k < a.length; k++) if (run._bits[k]) a[k] = 1;
  for (let k = 0; k < a.length; k++) if (b[k]) a[k] = 1; let n = 0; for (const v of a) n += v;
  pr.maps[String(f)] = { bits: IL.encodeBits(a), n }; if (run && run.floor === f) { run._bits = a; run._dirty = false; }
  sfx('coin'); toast('地図を手に入れた'); save(); dirty = true; mapShop(f);
}
async function sellMap() { const f = ui.mapFloor; if (pr.gold < 100) return; if (run && run.floor === f) IL.saveMap(pr, run); const ok = await Net.sellMap(f, mapInfo(f)); if (ok) { X(['mapsell', f]); sfx('coin'); toast('地図を売りに出した'); save(); } else toast('出せませんでした'); mapShop(f); }
async function collectSales() { if (!Net.on) return; const n = await Net.claimSales(); if (n > 0) { X(['mapgain', n]); save(); toast('地図が ' + n + ' 回売れた（+' + 5 * n + ' G）'); if (ui.scr === 'title') title(); } }

/* ---------- クリック ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-a],[data-f],[data-cell],[data-bag],[data-pt],[data-syn],[data-gp],[data-buy],[data-c],[data-sk],[data-it],[data-tg],[data-use],[data-dpot],[data-mb],[data-rep],[data-tr],[data-pk],[data-tr2]');
  if (!t) { if (ui.scr === 'board' && (ui.sel != null || ui.bagSel != null) && !e.target.closest('select,input,label')) { ui.sel = null; ui.bagSel = null; sfx('click', 0.2); boardScreen(); } return; }
  const d = t.dataset;
  if (d.f && t.tagName === 'BUTTON') { sfx('ok', 0.4); X(['start', +d.f]); enterRun(run); fetchDrops(); return; }
  if (d.cell != null) return boardCellTap(+d.cell);
  if (d.bag != null) { const before = IL.playerStats(pr); setTimeout(() => statDiff(before), 0); const id = +d.bag; ui.bagSel = ui.bagSel === id ? null : id; if (ui.sel != null && ui.bagSel != null && pr.board[ui.sel] == null) { X(['place', ui.sel, id]); ui.bagSel = null; sfx('place'); save(); } else sfx('click', 0.3); return boardScreen(); }
  if (d.pt) { X(['pt', d.pt]); sfx('select', 0.4); save(); return points(); }
  if (d.syn != null) { const id = +d.syn; if (ui.synthBase == null) ui.synthBase = id; else ui.synthMat = ui.synthMat === id ? null : id; sfx('click', 0.3); return synth(); }
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
    case 'unequip': if (ui.sel != null) { X(['unq', ui.sel]); save(); } return boardScreen();
    case 'discard': if (ui.bagSel != null && !pr.board.includes(ui.bagSel)) { X(['disc', ui.bagSel]); ui.bagSel = null; save(); } return boardScreen();
    case 'gacha': return gacha();
    case 'reroll': if (pr.tickets > 0) { X(['groll', todayKey(), 1]); save(); } return gacha();
    case 'synth': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'synreset': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'dosynth': { const r = X(['syn', ui.synthBase, ui.synthMat]); if (r && r !== true) { if (r.ok) { sfx('god', 0.5); toast('成功！ ' + IL.STAT_NAME[r.stat] + 'が ' + r.rank + ' になった'); ui.synthMat = null; } else { sfx('fail', 0.5); toast('失敗…　2つとも消えてしまった'); ui.synthBase = null; ui.synthMat = null; } save(); } return synth(); }
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
    case 'savename': { const v = ($('#pname').value || '').trim().slice(0, 12); if (v && banned(v)) { toast('使えない言葉が入っています'); return; } opt.name = v; saveOpt(); syncProfile(); toast('名前を決めた'); return title(); }
    case 'mkcode': { const c = await Net.makeCode(); await syncProfile(); const el = $('#code'); if (el) el.textContent = c || '作れませんでした'; return; }
    case 'usecode': { const v = $('#incode').value; const sv = await Net.useCode(v); if (!sv) { toast('合言葉がちがうか、使えません'); return; } try { const o = JSON.parse(sv); S = { uid: Net.pid, pr: o.pr, run: null, journal: [], gclear: o.gclear || {} }; pr = S.pr; run = null; save(); toast('引き継ぎました'); } catch (e) { toast('読みこめませんでした'); } return title(); }
    case 'mapopen': return mapShop(+$('#mapf').value);
    case 'mapshop': return mapShop(run.floor);
    case 'mapsell': return sellMap();

    case 'stairs': X(['stairs']); sfx('ok'); enterRun(run); return fetchDrops();
    case 'boss': X(['boss']); return afterAct();
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
$('#mini').addEventListener('click', () => { if (run && !ui.scr) fullMap(); });

/* ---------- キーとパッド ---------- */
const KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
let hold = null, holdTimer = null;
function startHold(dir) { stopHold(); hold = dir; act(dir); holdTimer = setInterval(() => { if (hold != null) act(hold); }, 135); }
function stopHold() { hold = null; clearInterval(holdTimer); holdTimer = null; document.querySelectorAll('.dpad button.on').forEach(b => b.classList.remove('on')); }
addEventListener('keydown', e => {
  if (e.repeat && KEYDIR[e.code] != null) { e.preventDefault(); return; }
  if (KEYDIR[e.code] != null && run && !ui.scr) { e.preventDefault(); startHold(KEYDIR[e.code]); return; }
  if ((e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') && run && !ui.scr) { e.preventDefault(); interact(); return; }
  if ((e.code === 'KeyX' || e.code === 'Escape') && run && !run.battle) { e.preventDefault(); if (ui.scr && ui.scr !== 'prompt') { hideScreen(); dirty = true; } else if (!ui.scr) runMenu(); return; }
  if (e.code === 'KeyB' && run && !ui.scr) { ui.sel = null; ui.bagSel = null; boardScreen('run'); }
});
addEventListener('keyup', e => { if (KEYDIR[e.code] === hold) stopHold(); });
document.querySelectorAll('.dpad button').forEach(b => {
  const dir = +b.dataset.dir;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); startHold(dir); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, stopHold));
});
$('#b-act').addEventListener('click', interact);
$('#b-menu').addEventListener('click', () => { if (run && !ui.scr) runMenu(); });
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
  resize(); requestAnimationFrame(render); drawIdle();
  drawTitleBg(); show('<div class="win title"><div class="logo">INTEGRA LAYER<small>インテグラ・レイヤー</small></div><p class="mute">つないでいます…</p></div>');
  const timeout = new Promise(r => setTimeout(() => r(false), 7000));
  await Promise.race([Net.init(), timeout]);
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
