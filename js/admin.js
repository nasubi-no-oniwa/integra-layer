/* インテグラ・レイヤー 管理ページ */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tm = t => t ? new Date(t).toLocaleString() : '—';
const T = () => firebase.database.ServerValue.TIMESTAMP;
let db = null, uid = null, players = {};

async function init() {
  const CFG = window.IL_FIREBASE;
  if (!CFG || typeof firebase === 'undefined') { $('#me').innerHTML = '<p class="ng">Firebase を読みこめませんでした。</p>'; return; }
  const app = firebase.initializeApp(CFG.main, 'main'); // ゲームと同じ名前なので、同じ端末なら同じ人として入れる
  await app.auth().signInAnonymously(); uid = app.auth().currentUser.uid; db = app.database();
  let isAdmin = uid === 'WCPX6tpyozR2hNC2jpGzqhnzxXs1'; try { isAdmin = isAdmin || !!(await db.ref('admins/' + uid).once('value')).val(); } catch (e) {}
  await loadEngines();
  $('#me').innerHTML = isAdmin
    ? `<p class="ok">管理者として入っています。</p><p class="mute">あなたのID：<code>${esc(uid)}</code></p>`
    : `<p class="ng">まだ管理者ではありません。</p><p>あなたのID：<code>${esc(uid)}</code></p>
       <p class="mute">Firebase コンソール →「Realtime Database」→「データ」で、いちばん上の行の「＋」を押し、<br>キーに <b>admins</b> を入れ、その中に キー＝上のID、値＝<b>true</b> を追加してから、このページを読みなおしてください。<br>（ゲームを遊ぶのと同じブラウザでこのページを開くと、ゲームの自分と同じIDになります）</p>`;
  if (!isAdmin) return;
  watchStream(); watchNews(); await loadPlayers(); loadFirsts(); watchBoard(); stat();
}

/* 前のルールの版（engine/list.json に書いた版を読みこむ） */
async function loadEngines() {
  try { const list = await (await fetch('engine/list.json?t=' + Date.now(), { cache: 'no-store' })).json();
    for (const v of list) if (!window.IL_ENGINES[v]) await new Promise(r => { const sc = document.createElement('script'); sc.src = 'engine/core-' + v + '.js'; sc.onload = sc.onerror = r; document.head.appendChild(sc); }); } catch (e) {}
}
async function stat() {
  const [f, b, p] = await Promise.all(['firsts', 'board', 'players'].map(k => db.ref(k).once('value').then(s => s.val() || {})));
  const top = Math.max(0, ...Object.keys(f).map(Number));
  $('#stat').innerHTML = `最前線：<b>${top}階</b>　プレイヤー：<b>${Object.keys(p).length}人</b>　掲示板：<b>${Object.keys(b).length}件</b>`;
}

/* 配信中 */
function watchStream() {
  db.ref('stream').on('value', s => { const v = s.val() || {}; $('#st-on').checked = !!v.on; if (document.activeElement !== $('#st-url')) $('#st-url').value = v.url || ''; if (document.activeElement !== $('#st-txt')) $('#st-txt').value = v.txt || ''; });
  $('#st-save').onclick = async () => { await db.ref('stream').set({ on: $('#st-on').checked, url: $('#st-url').value.trim().slice(0, 300), txt: $('#st-txt').value.trim().slice(0, 60), t: T() }); alertMsg('保存しました'); };
}
/* お知らせ */
function watchNews() {
  db.ref('news').on('value', s => { const v = s.val() || {}; const ids = Object.keys(v).sort((a, b) => (v[b].t || 0) - (v[a].t || 0));
    $('#news').innerHTML = ids.map(id => `<div class="row" style="margin-bottom:4px"><span class="mute">${tm(v[id].t)}</span><span style="flex:1">${esc(v[id].s)}</span><button class="warn" data-nd="${esc(id)}">消す</button></div>`).join('') || '<span class="mute">まだない</span>'; });
  $('#nw-add').onclick = async () => { const s = $('#nw-txt').value.trim(); if (!s) return; await db.ref('news').push({ s, t: T() }); $('#nw-txt').value = ''; };
  $('#news').onclick = e => { const id = e.target.dataset.nd; if (id && confirm('このお知らせを消しますか？')) db.ref('news/' + id).remove(); };
}
/* プレイヤー */
async function loadPlayers() {
  players = (await db.ref('players').once('value')).val() || {};
  const ids = Object.keys(players).sort((a, b) => (players[b].mf || 0) - (players[a].mf || 0));
  $('#players').innerHTML = '<tr><th>名前</th><th>Lv</th><th>最前線</th><th>最後</th><th>ID</th></tr>' + ids.map(id => { const p = players[id]; return `<tr><td>${esc(p.n || '名無し')}</td><td>${p.lv || 1}</td><td>${p.mf || 1}階</td><td class="mute">${tm(p.t)}</td><td class="mute"><code>${esc(id)}</code></td><td><button class="warn" data-wipe="${esc(id)}">全部消す</button></td></tr>`; }).join('');
}
/* 初撃破の確認 */
let firsts = {};
async function loadFirsts() {
  firsts = (await db.ref('firsts').once('value')).val() || {};
  const fs = Object.keys(firsts).map(Number).sort((a, b) => b - a);
  $('#firsts').innerHTML = '<tr><th>階</th><th>倒した人</th><th>とき</th><th>確認</th><th></th></tr>' + fs.map(f => { const v = firsts[f]; const p = players[v.pid] || {}; const co = Object.keys(v.co || {}).map(k => `<br><span class="mute">＋同時：${esc((v.co[k] || {}).n || '無名')} <code>${esc(k)}</code></span>`).join(''); return `<tr><td>${f}階</td><td>${esc(p.n || v.n || '無名')}<br><code class="mute">${esc(v.pid)}</code>${co}</td><td class="mute">${tm(v.t)}</td><td id="fv-${f}" class="mute">—</td><td><button data-fv="${f}">確かめる</button> <button class="warn" data-fx="${f}">取り消す</button></td></tr>`; }).join('');
}
const jcache = {};
async function replayOf(pid) {
  if (jcache[pid]) return jcache[pid];
  const s = (await db.ref('journal/' + pid).once('value')).val() || {};
  // 記録のかたまりごとに、そのときのルールの版で再生する
  const S = IL.newState(pid, 0); let ops = [], n = 0;
  for (const k of Object.keys(s).sort((a, b) => a - b)) {
    let part; try { part = IL.unpackJournal(s[k].d); } catch (e) { return (jcache[pid] = { ok: false, why: '記録が壊れている' }); }
    const v = s[k].v || '0', E = window.IL_ENGINES[v]; if (!E) return (jcache[pid] = { ok: false, why: '版 ' + v + ' のルールが見つからない（engine/ に残っていない）' });
    for (const op of part) { const before = S.journal.length; E.exec(S, op); if (S.journal.length === before) return (jcache[pid] = { ok: false, why: (n + 1) + '番目の操作でおかしい（版 ' + v + '）' }); n++; }
    ops = ops.concat(part);
  }
  const r = { ok: true, S };
  // 外から入ってくる値（みんなの初撃破・地図の売り上げ）が本当にあったかも確かめる
  let gain = 0; for (const op of ops) { if (op[0] === 'gclr') { const bad = (op[1] || []).find(f => !firsts[f]); if (bad) return (jcache[pid] = { ok: false, why: bad + '階は、まだだれも倒していないのに倒したことになっている' }); } if (op[0] === 'mapgain') gain += Math.max(0, op[1] | 0); }
  const sales = (await db.ref('sales/' + pid).once('value')).val() || {}; let sold = 0; for (const k in sales) sold += sales[k] | 0;
  if (gain > sold) return (jcache[pid] = { ok: false, why: `地図の売り上げが多すぎる（記録 ${gain}回／本当は ${sold}回）` });
  // バッグから拾ったものが、本当にそのバッグに入っていたか
  const arc = {}; for (const op of ops) if (op[0] === 'bag') { const id = String(op[1]); if (!(id in arc)) arc[id] = (await db.ref('bagarc/' + id).once('value')).val();
    const b = arc[id]; if (!b) return (jcache[pid] = { ok: false, why: 'ないバッグ（' + id + '）から拾ったことになっている' });
    const key = q => JSON.stringify([q.sp, q.rar, q.floor, (q.stats || []).map(x => x.k + x.r).join(''), (q.edges || []).join('')]); const pool = (b.p || []).map(key);
    for (const q of op[2] || []) { const i = pool.indexOf(key(q)); if (i < 0) return (jcache[pid] = { ok: false, why: 'バッグ（' + id + '）に入っていない欠片を拾ったことになっている' }); pool.splice(i, 1); } }
  return (jcache[pid] = { ok: true, why: '', pr: r.S.pr, n: ops.length });
}
async function verify(f) {
  const v = firsts[f]; const cell = $('#fv-' + f); if (!v || !cell) return; cell.textContent = '確認中…'; cell.className = 'mute';
  for (const cp of Object.keys(v.co || {})) { const rc = await replayOf(cp); if (!rc.ok || !(rc.pr.cleared && rc.pr.cleared[f])) { cell.textContent = '✖ 同時撃破の ' + ((v.co[cp] || {}).n || cp) + '：' + (rc.ok ? '記録にまだ無い' : rc.why); cell.className = 'ng'; return false; } }
  const r = await replayOf(v.pid);
  if (!r.ok) { cell.textContent = '✖ ' + r.why; cell.className = 'ng'; return false; }
  if (r.pr.cleared && r.pr.cleared[f]) { cell.textContent = `✔ 正しい（操作 ${r.n}回）`; cell.className = 'ok'; return true; }
  cell.textContent = '△ 記録にまだ無い（送信待ちかも／不正かも）'; cell.className = 'ng'; return false;
}
$('#firsts').addEventListener('click', async e => {
  const f = e.target.dataset.fv, x = e.target.dataset.fx;
  if (f) verify(+f);
  if (x && confirm(x + '階の初撃破を取り消しますか？（だれかがもう一度倒すと、その人のものになります）')) { await db.ref('firsts/' + x).remove(); loadFirsts(); stat(); }
  const w = e.target.dataset.wipe; if (w) wipePlayer(w);
});
/* ずるをした人の記録を全部消す */
async function wipePlayer(pid) {
  if (!confirm('この人（' + pid + '）の記録を全部消しますか？\n（記録・セーブ・初撃破・同時撃破・バッグ・地図・売り上げ・掲示板の書きこみ）')) return;
  const up = {}; up['journal/' + pid] = null; up['players/' + pid] = null; up['sales/' + pid] = null; up['rate/' + pid] = null; up['owner/' + pid] = null;
  const fs = (await db.ref('firsts').once('value')).val() || {}; for (const f in fs) { if (fs[f].pid === pid) up['firsts/' + f] = null; else if (fs[f].co && fs[f].co[pid]) up['firsts/' + f + '/co/' + pid] = null; }
  const bags = (await db.ref('bags').once('value')).val() || {}; for (const f in bags) for (const id in bags[f]) if (bags[f][id].pid === pid) up['bags/' + f + '/' + id] = null;
  const maps = (await db.ref('maps').once('value')).val() || {}; for (const f in maps) if (maps[f][pid]) up['maps/' + f + '/' + pid] = null;
  const bd = (await db.ref('board').once('value')).val() || {}; for (const id in bd) if (bd[id].pid === pid) up['board/' + id] = null;
  await db.ref().update(up); alertMsg('消しました'); await loadPlayers(); loadFirsts(); stat();
}
$('#players').addEventListener('click', e => { const w = e.target.dataset.wipe; if (w) wipePlayer(w); });
$('#fv-all').onclick = async () => { const fs = Object.keys(firsts).map(Number); let bad = 0; for (const f of fs) if (!(await verify(f))) bad++; $('#fv-msg').textContent = `${fs.length}件中 おかしい／未確認 ${bad}件`; };
/* 掲示板 */
function watchBoard() {
  let board = {}, hidden = {}, reports = {};
  const draw = () => { const ids = Object.keys(board).sort((a, b) => (board[b].t || 0) - (board[a].t || 0));
    $('#board').innerHTML = '<tr><th>とき</th><th>名前</th><th>書きこみ</th><th>通報</th><th></th></tr>' + ids.map(id => { const m = board[id]; const rc = Object.keys(reports[id] || {}).length; const h = !!hidden[id] || rc >= 3;
      return `<tr style="${h ? 'opacity:.5' : ''}"><td class="mute">${tm(m.t)}</td><td>${esc(m.n)}</td><td>${esc(m.s)}</td><td class="${rc >= 3 ? 'ng' : ''}">${rc}</td><td><button data-bh="${esc(id)}">${hidden[id] ? '戻す' : '隠す'}</button> <button class="warn" data-bd="${esc(id)}">消す</button></td></tr>`; }).join(''); };
  db.ref('board').on('value', s => { board = s.val() || {}; draw(); });
  db.ref('hidden').on('value', s => { hidden = s.val() || {}; draw(); });
  db.ref('reports').on('value', s => { reports = s.val() || {}; draw(); });
  $('#board').onclick = async e => { const h = e.target.dataset.bh, d = e.target.dataset.bd;
    if (h) await db.ref('hidden/' + h).set(hidden[h] ? null : true);
    if (d && confirm('この書きこみを消しますか？')) { await db.ref('board/' + d).remove(); await db.ref('reports/' + d).remove(); await db.ref('hidden/' + d).remove(); } };
}
/* お掃除 */
$('#cl-drops').onclick = async () => { // もう出ていないバッグの控えのうち、7日より前のもの
  const arc = (await db.ref('bagarc').once('value')).val() || {}, bags = (await db.ref('bags').once('value')).val() || {}, live = {}; for (const f in bags) for (const id in bags[f]) live[id] = 1;
  const lim = Date.now() - 7 * 86400000, up = {}; let n = 0; for (const id in arc) if (!live[id] && (arc[id].t || 0) < lim) { up['bagarc/' + id] = null; n++; }
  if (n) await db.ref().update(up); $('#cl-msg').textContent = 'バッグの控えを ' + n + '個消しました'; };
$('#cl-all').onclick = async () => {
  if (!confirm('公開前のお掃除：みんなのデータを全部消します（管理者・お知らせ・配信中の設定は残す）。本当に消しますか？')) return;
  if (prompt('確認のため「けす」と入力してください') !== 'けす') return;
  const up = {}; for (const k of ['firsts', 'journal', 'players', 'xfer', 'owner', 'bags', 'bagarc', 'drops', 'maps', 'sales', 'rate', 'board', 'hidden', 'reports']) up[k] = null;
  await db.ref().update(up); alertMsg('全部消しました'); await loadPlayers(); loadFirsts(); stat(); };
$('#cl-board').onclick = async () => { const all = (await db.ref('board').once('value')).val() || {}; const ids = Object.keys(all).sort((a, b) => (all[b].t || 0) - (all[a].t || 0)).slice(60); for (const id of ids) { await db.ref('board/' + id).remove(); await db.ref('reports/' + id).remove(); } $('#cl-msg').textContent = ids.length + '件消しました'; };
function alertMsg(s) { const d = document.createElement('div'); d.textContent = s; d.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#4fae5a;color:#000;padding:6px 14px;border-radius:8px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
init().catch(e => { $('#me').innerHTML = '<p class="ng">エラー：' + esc(e.message) + '</p>'; });
})();
