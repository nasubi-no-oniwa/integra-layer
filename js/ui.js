/* インテグラ・レイヤー  画面と操作 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAVE_P = 'il_profile_v1', SAVE_R = 'il_run_v1', SAVE_O = 'il_opt_v1';
let pr, run = null, opt = { sound: true };
const ui = { scr: null, sel: null, bagSel: null, filt: { sp: 'all', rar: 'all', sort: 'score' }, target: 0, sub: null, synthBase: null, synthMat: null };

/* ---------- 保存 ---------- */
function load() {
  try { pr = JSON.parse(localStorage.getItem(SAVE_P)); } catch (e) { pr = null; }
  if (!pr || pr.v !== IL.VER) pr = IL.newProfile(Date.now());
  try { opt = Object.assign(opt, JSON.parse(localStorage.getItem(SAVE_O) || '{}')); } catch (e) {}
  try { const r = JSON.parse(localStorage.getItem(SAVE_R)); if (r && !r.over) run = unpackRun(r); } catch (e) { run = null; }
}
function save() { try { if (run && !run.over) { IL.saveMap(pr, run); localStorage.setItem(SAVE_R, JSON.stringify(packRun(run))); } else localStorage.removeItem(SAVE_R); localStorage.setItem(SAVE_P, JSON.stringify(pr)); } catch (e) {} }
function saveOpt() { try { localStorage.setItem(SAVE_O, JSON.stringify(opt)); } catch (e) {} }
function packRun(r) { const o = Object.assign({}, r); o.rngS = r.rng.s; delete o.rng; delete o._bits; delete o._dirty; o.events = []; return o; }
function unpackRun(o) { const r = Object.assign({}, o); r.rng = new IL.RNG(o.rngS); delete r.rngS; return r; }

/* ---------- 音 ---------- */
const SND = {}; ['step', 'hit', 'hurt', 'skill', 'god', 'boss', 'chest', 'coin', 'pickup', 'click', 'select', 'ok', 'ng', 'levelup', 'fail', 'win', 'place', 'rotate'].forEach(n => { SND[n] = null; });
function sfx(n, vol) { if (!opt.sound) return; try { let a = SND[n]; if (!a) a = SND[n] = new Audio('snd/' + n + '.mp3'); const c = a.cloneNode(); c.volume = vol == null ? 0.5 : vol; c.play().catch(() => {}); } catch (e) {} }

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
function drawTile(g, src, idx, x, y, s) { g.drawImage(src, (idx % 12) * 16, Math.floor(idx / 12) * 16, 16, 16, x, y, s, s); }
function spriteCanvas(idx, scale, bi) { const c = document.createElement('canvas'); c.width = c.height = 16 * scale; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; drawTile(g, bi == null ? sheet : tintSheet(bi), idx, 0, 0, 16 * scale); return c; }

/* ---------- 共通の部品 ---------- */
function toast(s) { const d = document.createElement('div'); d.textContent = s; $('#toast').appendChild(d); setTimeout(() => d.remove(), 2700); }
function partHTML(p, cls) {
  const c = IL.SP_COLOR[p.sp];
  const sides = ['t', 'r', 'b', 'l'];
  let e = ''; for (let s = 0; s < 4; s++) { const v = IL.edgeAt(p, s); if (v) e += `<i class="e ${sides[s]} ${v === 1 ? 'v' : 'c'}"></i>`; }
  const rk = p.stats.map(s => s.r).join('');
  return `<div class="part r${p.rar} ${cls || ''}" style="--c:${c}">${e}<span>${IL.SP_NAME[p.sp][0]}</span><span class="rk">${rk}</span>${p.gacha ? '<span class="gc">★</span>' : ''}</div>`;
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
function title() {
  run = null; ui.scr = 'title'; $('#hud').hidden = true; $('#pad').hidden = true; save(); drawIdle();
  const st = IL.playerStats(pr);
  show(`<div class="win title">
    <div class="logo">INTEGRA LAYER<small>インテグラ・レイヤー</small></div>
    <p class="story">倒れた誰かの欠片が、きみの盤面でつながる。\n全員で、100階の塔を上れ。</p>
    <div class="statline"><span>Lv ${pr.lv}</span><span>最前線 ${pr.maxFloor}階</span><span class="gold">${pr.gold} G</span><span>回復薬 ${pr.potions.length}</span><span>チケット ${pr.tickets}</span></div>
    <div class="menu">
      <button class="btn pri" data-a="floors">塔に入る</button>
      <button class="btn" data-a="board">盤面とかばん</button>
      <button class="btn" data-a="gacha">今日のガチャ${gachaReady() ? '<span class="badge">!</span>' : ''}</button>
      <button class="btn" data-a="synth">合成</button>
      <button class="btn" data-a="points">能力${pr.freePts ? '<span class="badge">' + pr.freePts + '</span>' : ''}</button>
      <div class="row" style="justify-content:center"><button class="btn sm" data-a="help">遊び方</button><button class="btn sm" data-a="sound">音 ${opt.sound ? 'あり' : 'なし'}</button></div>
    </div></div>`);
}
function floors() {
  ui.scr = 'floors';
  let b = ''; for (let f = 1; f <= 100; f++) { const cl = pr.cleared[f], fr = f === pr.maxFloor; b += `<button data-f="${f}" class="${cl ? 'cl' : ''} ${fr ? 'fr' : ''}" ${f > pr.maxFloor ? 'disabled' : ''}>${f}</button>`; }
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>どの階から始める？</h2>
    <p class="small mute">緑＝ボスを倒した階　金＝最前線（${pr.maxFloor}階）。10階ごとに景色が変わる。</p>
    <div class="floors">${b}</div></div>`);
}
function help() {
  show(`<div class="win"><button class="btn sm close" data-a="title">もどる</button><h2>遊び方</h2>
  <p class="story">・塔を探索して、敵とぶつかると戦いになる。台座はとなりから「調べる」。
・拾った欠片を5×5の盤面に置く。凸と凹が向き合うとつながる。
・つながった群れが大きいほど能力が上がる。同じ種族が2個以上つながると技が使える（25個で「神」）。
・炎＝1体に大ダメージ　風＝全体　岩＝守り　森＝回復　星＝弱点も半減も関係なし。
・ボスを倒すと次の階へ。帰れるのは「安全地帯」と「ボスのあとの帰還ポータル」だけ。
・倒れると、盤面の欠片を落とす（ガチャの欠片は残る）。ボスにやられると盤面の欠片が全部消える。
・行商人とは戦えるが、とても強い。負けるとかばんの中身が消える。
・操作：矢印キー／WASDで移動、スペース／Zで調べる、Xでメニュー。スマホは画面のボタン。</p></div>`);
}

/* ---------- 盤面とかばん ---------- */
function boardScreen(from) {
  ui.scr = 'board'; ui.boardFrom = from || ui.boardFrom || 'title';
  const ba = IL.boardArr(pr), an = IL.analyzeBoard(ba), st = IL.playerStats(pr);
  const gcol = ['#ffd17a', '#8ad3ff', '#ff9ad5', '#b5f78a', '#ffb36b', '#c7a8ff', '#7fffd4', '#ff7f7f'];
  let cells = '';
  for (let i = 0; i < 25; i++) {
    const p = ba[i], gi = an.groupOf[i], big = gi >= 0 && an.groups[gi].cells.length > 1;
    cells += `<div class="cell ${ui.sel === i ? 'sel' : ''}" data-cell="${i}" style="${big ? 'box-shadow:0 0 0 2px ' + gcol[gi % gcol.length] : ''}">${p ? partHTML(p) : ''}${p && big ? `<span class="gm">×${an.mulOf[i]}</span>` : ''}</div>`;
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
}
function boardCellTap(i) {
  const id = pr.board[i];
  if (ui.bagSel != null) { IL.placePart(pr, i, ui.bagSel); ui.bagSel = null; ui.sel = i; sfx('place'); }
  else if (ui.sel === i && id != null) { IL.rotatePart(pr, id); sfx('rotate'); }
  else if (ui.sel != null && ui.sel !== i && pr.board[ui.sel] != null) { IL.swapCells(pr, ui.sel, i); ui.sel = i; sfx('place'); }
  else { ui.sel = i; sfx('click', 0.3); }
  save(); boardScreen();
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
  if (!pr.gacha || pr.gacha.day !== day) { IL.rollGacha(pr, day, new IL.RNG((Date.now() ^ (pr.nextId * 2654435761)) >>> 0)); save(); }
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
  const k = W < 700 ? 1 : 1.5; mini.width = IL.B.mapW * k; mini.height = IL.B.mapH * k; mini.style.width = mini.width + 'px'; mini.style.height = mini.height + 'px';
  dirty = true;
}
addEventListener('resize', resize);
function enterRun(r) { run = r; ui.scr = null; hideScreen(); $('#hud').hidden = false; $('#pad').hidden = false; dirty = true; hud(); save(); }
function hud() {
  if (!run) return; const st = IL.playerStats(pr);
  $('#h-floor').textContent = run.floor; $('#h-biome').textContent = IL.biomeOf(run.floor).name;
  $('#h-hp').textContent = run.hp + ' / ' + st.hp; $('#h-hpbar').style.width = Math.max(0, 100 * run.hp / st.hp) + '%';
  $('#h-lv').textContent = 'Lv ' + pr.lv; $('#h-gold').textContent = pr.gold + ' G';
}
function drawIdle() { g.fillStyle = '#14111c'; g.fillRect(0, 0, cv.width, cv.height); }
function render(now) {
  requestAnimationFrame(render);
  if (!run || !sheet.complete) return;
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
    if (v === T.BOSS) { g.fillStyle = 'rgba(120,20,40,.45)'; g.fillRect(px, py, TS, TS); }
    else if (v === T.PED) drawTile(g, src, run.opened[i] ? 55 : 54, px, py, TS);
    else if (v === T.SAFE) drawTile(g, src, 32, px, py, TS);
    else if (v === T.GATE) drawTile(g, src, 45, px, py, TS);
  }
  // ボス部屋の中
  if (bits && bits[br.cy * fl.W + br.cx]) {
    const px = cx + br.cx * TS, py = cy + br.cy * TS;
    if (cleared) drawTile(g, src, 39, px, py, TS);
    else { const bt = IL.ETYPES[IL.bossType(run.floor)]; drawTile(g, src, bt.tile, px - TS, py - TS, TS * 3); }
  }
  const vis = (x, y) => Math.abs(x - run.x) <= 9 && Math.abs(y - run.y) <= 7 && bits[y * fl.W + x];
  if (run.merchant && vis(run.merchant.x, run.merchant.y)) drawTile(g, src, 84, cx + run.merchant.x * TS, cy + run.merchant.y * TS, TS);
  for (const e of run.enemies) if (vis(e.x, e.y)) { drawTile(g, src, e.tile, cx + e.x * TS, cy + e.y * TS, TS); if (e.cool) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(cx + e.x * TS, cy + e.y * TS, TS, TS); } }
  drawTile(g, sheet, 97, Math.round(W / 2 - TS / 2), Math.round(H / 2 - TS / 2), TS);
  // 見えている範囲の外を少し暗く
  const grd = g.createRadialGradient(W / 2, H / 2, TS * 4, W / 2, H / 2, TS * 11); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  drawMini(fl, bits);
}
function drawMini(fl, bits) {
  const k = mini.width / fl.W; mg.clearRect(0, 0, mini.width, mini.height);
  const T = IL.T;
  for (let i = 0; i < fl.t.length; i++) { if (!bits[i]) continue; const v = fl.t[i]; if (v === T.WALL) continue; const x = i % fl.W, y = (i / fl.W) | 0;
    mg.fillStyle = v === T.BOSS ? '#7a2030' : v === T.GATE ? '#e8553f' : v === T.SAFE ? '#4fd17a' : v === T.PED ? (run.opened[i] ? '#666' : '#f2d14b') : '#5c5470'; mg.fillRect(x * k, y * k, Math.ceil(k), Math.ceil(k)); }
  mg.fillStyle = '#fff'; mg.fillRect(run.x * k - 1, run.y * k - 1, k + 2, k + 2);
}
function fullMap() {
  const fl = IL.genFloor(run.floor), bits = IL.mapBits(pr, run), c = document.createElement('canvas'), k = 5; c.width = fl.W * k; c.height = fl.H * k; const m = c.getContext('2d'); m.fillStyle = '#000'; m.fillRect(0, 0, c.width, c.height);
  const T = IL.T; let n = 0, tot = 0;
  for (let i = 0; i < fl.t.length; i++) { const v = fl.t[i]; if (v !== T.WALL && v !== T.BOSS) tot++; if (!bits[i] || v === T.WALL) continue; if (v !== T.BOSS) n++; const x = i % fl.W, y = (i / fl.W) | 0;
    m.fillStyle = v === T.BOSS ? '#7a2030' : v === T.GATE ? '#e8553f' : v === T.SAFE ? '#4fd17a' : v === T.PED ? (run.opened[i] ? '#666' : '#f2d14b') : '#5c5470'; m.fillRect(x * k, y * k, k, k); }
  m.fillStyle = '#fff'; m.fillRect(run.x * k - 2, run.y * k - 2, k + 4, k + 4);
  ui.scr = 'map';
  show(`<div class="win"><button class="btn sm close" data-a="back">とじる</button><h2>${run.floor}階の地図（${Math.round(100 * n / tot)}％）</h2><img class="mapfull" src="${c.toDataURL()}"><p class="small mute">赤＝ボス部屋の入口　緑＝安全地帯　黄＝まだ開けていない台座</p></div>`);
}
function afterAct() {
  // できごと
  for (const ev of run.events) {
    if (ev.t === 'msg') toast(ev.s);
    if (ev.t === 'loot') { sfx('chest'); const s = ev.parts.map(p => IL.SP_NAME[p.sp] + 'の欠片（' + IL.RAR_NAME[p.rar] + '）').join('、'); toast(ev.from + 'から ' + s + (ev.gold ? '、' + ev.gold + 'G' : '') + (ev.ticket ? '、ガチャチケット' : '') + ' を手に入れた'); if (ev.parts.some(p => p.rar >= 2)) sfx('god', 0.4); }
  }
  run.events = [];
  hud(); dirty = true; save();
  if (run.battle) { ui.target = 0; ui.sub = null; battle(); if (run.battle.foes[0].kind) sfx('boss', 0.6); }
  else if (run.prompt) prompt();
}
function act(dir) {
  if (!run || ui.scr || run.battle || run.prompt || run.over) return;
  const ox = run.x, oy = run.y; IL.step(pr, run, dir);
  if (run.x !== ox || run.y !== oy) { anim = { x0: ox, y0: oy, t0: performance.now() }; if (run.turn % 2) sfx('step', 0.15); }
  afterAct();
}
function interact() { if (!run || ui.scr || run.battle || run.prompt) return; IL.interact(pr, run); afterAct(); }

/* ---------- 声かけ（ボス部屋・安全地帯・行商人） ---------- */
function prompt() {
  const p = run.prompt; ui.scr = 'prompt';
  if (p.kind === 'gate') {
    const last = run.floor >= 100;
    show(`<div class="win" style="max-width:460px"><h2>ボス部屋</h2>${pr.cleared[run.floor]
      ? `<p>階段が開いています。階段を進みますか？ボスと戦いますか？</p><p class="small mute">ボスからしか出ない欠片や、レアな欠片がある。</p><div class="row">${last ? '' : '<button class="btn pri" data-a="stairs">階段を進む</button>'}<button class="btn warn" data-a="boss">ボスと戦う</button><button class="btn" data-a="cancel">やめる</button></div>`
      : `<p>この先にボスがいる。入ったら出られない。</p><p class="small mute">ボスはこの階の敵より格段に強い。負けると盤面の欠片がすべて消える。</p><div class="row"><button class="btn warn" data-a="boss">ボスと戦う</button><button class="btn" data-a="cancel">やめる</button></div>`}</div>`, 'clear');
  } else if (p.kind === 'safe') {
    show(`<div class="win" style="max-width:460px"><h2>安全地帯</h2><p>ここから帰ることができる。帰れば、拾った欠片はすべて持ち帰れる。</p><div class="row"><button class="btn pri" data-a="return">帰る</button><button class="btn" data-a="cancel">続ける</button></div></div>`, 'clear');
  } else if (p.kind === 'merchant') {
    show(`<div class="win" style="max-width:460px"><h2>行商人</h2><p>「なにか買っていくかい？」</p><div class="row"><button class="btn pri" data-a="shop">買う</button><button class="btn warn" data-a="fightm">戦う</button><button class="btn" data-a="cancel">やめる</button></div></div>`, 'clear');
  } else if (p.kind === 'fightm') {
    show(`<div class="win" style="max-width:460px"><h2>本当に戦いますか？</h2><p>行商人はとても強い（この階＋30階のボスくらい）。勝てば売り物をすべてもらえる。<br><b style="color:#ff8a8a">負けると、かばんの中身がすべて消えます。</b>（盤面は残る）</p><div class="row"><button class="btn warn" data-a="fightm2">戦う</button><button class="btn" data-a="cancel">やめる</button></div></div>`, 'clear');
  } else if (p.kind === 'bosswin') {
    const last = run.floor >= 100;
    show(`<div class="win" style="max-width:460px"><h2>${last ? '頂上にたどり着いた！' : 'ボスを倒した！'}</h2><p>${last ? 'インテグラ・レイヤーの頂上。' : '階段と、帰還ポータルが開いた。'}</p><div class="row">${last ? '' : '<button class="btn pri" data-a="next">次の階へ</button>'}<button class="btn" data-a="portal">帰還ポータルで帰る</button></div></div>`, 'clear');
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
  const foes = bt.foes.map(f => { const ai = alive.indexOf(f); return `<div class="foe ${f.hp <= 0 ? 'dead' : ''} ${ai === ui.target && !bt.over ? 'sel' : ''}" data-tg="${ai}"><div class="spr" data-tile="${f.tile}" data-big="${f.kind ? 1 : 0}"></div><div class="nm">${esc(f.name)}</div><div class="bar"><i style="width:${100 * f.hp / f.maxhp}%"></i></div><div class="tag">${f.hp} / ${f.maxhp}${f.weak ? '　弱点:' + IL.SP_NAME[f.weak] + '　半減:' + IL.SP_NAME[f.res] : ''}${f.charge ? '　<b style="color:#ff6b6b">力をためている</b>' : ''}</div></div>`; }).join('');
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
  show(`<div class="win battle"><div class="bwrap"><div class="bl"><div class="foes">${foes}</div>
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
    let extra = ''; if (bt.bossReward) { if (bt.bossReward.first) extra += `<p class="gold">初撃破ボーナス！</p><div class="lootlist">${bt.bossReward.first.map(p => partHTML(p)).join('')}</div>`; if (bt.bossReward.respec) extra += '<p>振りなおしの札を手に入れた</p>'; }
    return `<p>勝った！ 経験値 ${r.exp}・${r.gold} G${r.ups ? `<b class="gold">　レベルが ${pr.lv} に上がった！（ポイント+${r.ups * 3}）</b>` : ''}</p>${parts ? '<div class="lootlist">' + parts + '</div>' : ''}${extra}<button class="btn pri" data-a="bclose">続ける</button>`;
  }
  if (bt.over === 'flee') return '<button class="btn pri" data-a="bclose">続ける</button>';
  if (bt.over === 'lose') {
    if (bt.kind === 'merchant') return `<p style="color:#ff8a8a">行商人に負けた…　かばんの中身が ${bt.loseInfo.bagLost} 個なくなった。</p><button class="btn pri" data-a="bclose">続ける</button>`;
    const lost = bt.loseInfo.lost; return `<p style="color:#ff8a8a">${bt.loseInfo.boss ? 'ボスにやられた…　盤面の欠片はすべて消えた。' : '倒れてしまった…　盤面の欠片をこの場所に落とした。'}</p>${lost.length ? '<div class="lootlist">' + lost.map(p => partHTML(p)).join('') + '</div>' : ''}<button class="btn pri" data-a="dead">タイトルへ</button>`;
  }
  return '';
}
function bcmd(c) {
  const before = run.battle.log.length, hpB = run.hp;
  IL.battleCmd(pr, run, c);
  const bt = run.battle, nl = bt.log.slice(before);
  if (nl.some(l => l.skill)) { const sk = nl.find(l => l.skill); sfx(sk.tier >= 5 ? 'god' : 'skill', 0.5); if (sk.tier >= 5) godFx(IL.SKILLS[sk.skill][sk.tier]); } else if (nl.some(l => l.hit)) sfx('hit', 0.5);
  if (run.hp < hpB) setTimeout(() => sfx('hurt', 0.45), 160);
  ui.sub = null; save(); battle(); hud();
  if (run.hp < hpB) { const w = document.querySelector('.battle'); if (w) w.classList.add('shake'); }
  if (bt.over === 'win') { sfx('win', 0.5); if (bt.reward.ups) setTimeout(() => sfx('levelup', 0.5), 400); }
  if (bt.over === 'lose') sfx('fail', 0.5);
}
function godFx(name) { const d = document.createElement('div'); d.className = 'god'; d.textContent = name; $('#app').appendChild(d); setTimeout(() => d.remove(), 1700); }
function runMenu() {
  ui.scr = 'menu';
  show(`<div class="win" style="max-width:420px"><button class="btn sm close" data-a="back">とじる</button><h2>メニュー</h2><div class="grid">
    <button class="btn" data-a="board2">盤面とかばん</button><button class="btn" data-a="potion">回復薬を使う（${pr.potions.length}）</button><button class="btn" data-a="map">地図</button>
    <button class="btn" data-a="sound">音 ${opt.sound ? 'あり' : 'なし'}</button><button class="btn warn" data-a="giveup">あきらめる（倒れたのと同じ）</button></div>
    <p class="small mute">帰れるのは、安全地帯とボスのあとの帰還ポータルだけ。</p></div>`);
}
function potionMenu() {
  ui.scr = 'potion'; const grp = {}; pr.potions.forEach((p, i) => { (grp[p.floor] = grp[p.floor] || []).push(i); });
  const keys = Object.keys(grp).sort((a, b) => IL.potionEff(+b, run.floor) - IL.potionEff(+a, run.floor) || b - a);
  const list = keys.map(f => `<div class="row" style="justify-content:space-between;background:var(--panel2);padding:8px;border-radius:8px"><span>${f}階の回復薬 ×${grp[f].length}　<span class="mute small">効き目 ${Math.round(IL.potionEff(+f, run.floor) * 100)}%</span></span><span><button class="btn sm" data-use="${grp[f][0]}">使う</button> <button class="btn sm warn" data-dpot="${grp[f][0]}">捨てる</button></span></div>`).join('') || '<p class="mute">回復薬を持っていない</p>';
  show(`<div class="win" style="max-width:480px"><button class="btn sm close" data-a="back">とじる</button><h2>回復薬</h2><div class="grid">${list}</div></div>`);
}
function endScreen() {
  const o = run.over; ui.scr = 'end'; $('#hud').hidden = true; $('#pad').hidden = true;
  const txt = o.why === 'return' ? '無事に帰ってきた。拾った欠片はすべて持ち帰った。' : '';
  run = null; save();
  if (txt) { show(`<div class="win" style="max-width:460px"><h2>帰還</h2><p>${txt}</p><button class="btn pri" data-a="title">タイトルへ</button></div>`); }
  else title();
}

/* ---------- クリック ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a],[data-f],[data-cell],[data-bag],[data-pt],[data-syn],[data-gp],[data-buy],[data-c],[data-sk],[data-it],[data-tg],[data-use],[data-dpot]'); if (!t) return;
  const d = t.dataset;
  if (d.f && t.tagName === 'BUTTON') { sfx('ok', 0.4); enterRun(IL.startRun(pr, +d.f, (Date.now() ^ (pr.nextId * 2654435761)) >>> 0)); return; }
  if (d.cell != null) return boardCellTap(+d.cell);
  if (d.bag != null) { const id = +d.bag; ui.bagSel = ui.bagSel === id ? null : id; if (ui.sel != null && ui.bagSel != null && pr.board[ui.sel] == null) { IL.placePart(pr, ui.sel, id); ui.bagSel = null; sfx('place'); save(); } else sfx('click', 0.3); return boardScreen(); }
  if (d.pt) { IL.allocPoint(pr, d.pt); sfx('select', 0.4); save(); return points(); }
  if (d.syn != null) { const id = +d.syn; if (ui.synthBase == null) ui.synthBase = id; else ui.synthMat = ui.synthMat === id ? null : id; sfx('click', 0.3); return synth(); }
  if (d.gp != null) { const p = IL.pickGacha(pr, +d.gp); if (p) { sfx(p.rar >= 2 ? 'god' : 'ok', 0.5); save(); } return gacha(); }
  if (d.buy != null) { const r = IL.buy(pr, run, +d.buy); sfx(r === 'ok' ? 'coin' : 'ng', 0.5); save(); hud(); return shop(); }
  if (d.tg != null && +d.tg >= 0) { ui.target = +d.tg; return battle(); }
  if (d.c) { if (d.c === 'skill' || d.c === 'item') { ui.sub = d.c; sfx('click', 0.3); return battle(); } return bcmd({ c: d.c, t: ui.target }); }
  if (d.sk) return bcmd({ c: 'skill', sp: d.sk, t: ui.target });
  if (d.it != null) return bcmd({ c: 'item', i: +d.it });
  if (d.use != null) { IL.usePotion(pr, run, +d.use); afterAct(); return potionMenu(); }
  if (d.dpot != null) { pr.potions.splice(+d.dpot, 1); save(); return potionMenu(); }
  switch (d.a) {
    case 'title': sfx('click', 0.3); return title();
    case 'floors': sfx('click', 0.3); return floors();
    case 'help': return help();
    case 'sound': opt.sound = !opt.sound; saveOpt(); return run ? runMenu() : title();
    case 'board': ui.sel = null; ui.bagSel = null; return boardScreen('title');
    case 'board2': ui.sel = null; ui.bagSel = null; return boardScreen('run');
    case 'boardback': hud(); if (ui.boardFrom === 'run' && run) { hideScreen(); dirty = true; return; } return title();
    case 'rot': { const id = ui.sel != null && pr.board[ui.sel] != null ? pr.board[ui.sel] : ui.bagSel; if (id != null) { IL.rotatePart(pr, id); sfx('rotate'); save(); } return boardScreen(); }
    case 'unequip': if (ui.sel != null) { pr.board[ui.sel] = null; save(); } return boardScreen();
    case 'discard': if (ui.bagSel != null && IL.discard(pr, ui.bagSel)) { ui.bagSel = null; save(); } return boardScreen();
    case 'gacha': return gacha();
    case 'reroll': if (pr.tickets > 0) { pr.tickets--; IL.rollGacha(pr, todayKey(), new IL.RNG((Date.now() ^ (pr.nextId * 40503)) >>> 0)); save(); } return gacha();
    case 'synth': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'synreset': ui.synthBase = null; ui.synthMat = null; return synth();
    case 'dosynth': { const r = IL.synth(pr, new IL.RNG((Date.now() ^ (pr.nextId * 7919)) >>> 0), ui.synthBase, ui.synthMat); if (r) { if (r.ok) { sfx('god', 0.5); toast('成功！ ' + IL.STAT_NAME[r.stat] + 'が ' + r.rank + ' になった'); ui.synthMat = null; } else { sfx('fail', 0.5); toast('失敗…　2つとも消えてしまった'); ui.synthBase = null; ui.synthMat = null; } save(); } return synth(); }
    case 'points': return points();
    case 'respec': if (IL.respec(pr)) { sfx('ok'); save(); } return points();
    case 'back': hideScreen(); dirty = true; return;
    case 'map': return fullMap();
    case 'potion': return potionMenu();
    case 'giveup': return endGiveUp();
    case 'stairs': run = IL.goNextFloor(pr, run); sfx('ok'); return enterRun(run);
    case 'boss': IL.fightBoss(pr, run); return afterAct();
    case 'cancel': run.prompt = null; hideScreen(); dirty = true; save(); return;
    case 'return': IL.leaveRun(pr, run, 'return'); sfx('win', 0.5); return endScreen();
    case 'shop': return shop();
    case 'fightm': run.prompt = { kind: 'fightm' }; return prompt();
    case 'fightm2': IL.fightMerchant(pr, run); return afterAct();
    case 'subback': ui.sub = null; return battle();
    case 'bclose': { const k = run.battle.kind, ov = run.battle.over; IL.closeBattle(pr, run); hideScreen(); dirty = true; hud(); save(); if (k === 'boss' && ov === 'win') { run.prompt = { kind: 'bosswin' }; prompt(); } return; }
    case 'dead': return endScreen();
    case 'next': run = IL.goNextFloor(pr, run); sfx('ok'); return enterRun(run);
    case 'portal': IL.leaveRun(pr, run, 'return'); sfx('win', 0.5); return endScreen();
  }
});
function endGiveUp() { // あきらめる：ふつうに倒れたのと同じ
  pr.stats.deaths++;
  const onBoard = pr.board.map(id => id == null ? null : pr.bag.find(p => p.id === id)).filter(Boolean).filter(p => !p.gacha);
  const ids = new Set(onBoard.map(p => p.id)); pr.bag = pr.bag.filter(p => !ids.has(p.id)); pr.board = pr.board.map(id => ids.has(id) ? null : id);
  IL.saveMap(pr, run); run.over = { why: 'dead', lost: onBoard }; run.battle = null;
  show(`<div class="win" style="max-width:460px"><h2>あきらめた</h2><p>盤面の欠片をこの場所に落とした。</p>${onBoard.length ? '<div class="lootlist">' + onBoard.map(p => partHTML(p)).join('') + '</div>' : ''}<button class="btn pri" data-a="dead">タイトルへ</button></div>`);
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
load(); resize(); requestAnimationFrame(render);
sheet.onload = () => { dirty = true; if (run) { enterRun(run); if (run.battle) battle(); else if (run.prompt) prompt(); } else title(); };
if (sheet.complete && sheet.naturalWidth) sheet.onload();
window.__IL = { get pr() { return pr; }, get run() { return run; }, act, interact, bcmd, title };
})();
