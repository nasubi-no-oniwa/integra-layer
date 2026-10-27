/* インテグラ・レイヤー  Firebase とのやりとり（無料枠で動くように、読み書きを少なめに） */
(function () {
'use strict';
const Net = window.Net = { on: false, uid: null, pid: null, offset: 0, live: null };
const CFG = window.IL_FIREBASE || null; // js/firebase-config.js で入れる
let db = null, ldb = null;
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
Net.now = () => Date.now() + Net.offset;
const T = () => firebase.database.ServerValue.TIMESTAMP;

Net.init = async () => {
  if (!CFG || !CFG.main || typeof firebase === 'undefined') return false;
  try {
    const app = firebase.initializeApp(CFG.main, 'main');
    await app.auth().signInAnonymously(); Net.uid = app.auth().currentUser.uid; db = app.database();
    db.ref('.info/serverTimeOffset').on('value', s => { Net.offset = s.val() || 0; });
    Net.pid = ls('il_pid') || Net.uid; ls('il_pid', Net.pid);
    if (CFG.live) { try { const la = firebase.initializeApp(CFG.live, 'live'); await la.auth().signInAnonymously(); ldb = la.database(); Net.luid = la.auth().currentUser.uid; } catch (e) { ldb = null; } }
    Net.on = true; return true;
  } catch (e) { console.warn('net', e); return false; }
};

/* ---- 最前線と初撃破 ---- */
Net.watchFirsts = cb => { if (!db) return; db.ref('firsts').on('value', s => cb(s.val() || {})); };
Net.claimFirst = async (floor, info) => { // 'first'＝いちばん、'co'＝60秒以内の同時撃破、false＝だめ
  if (!db) return false;
  try { const r = await db.ref('firsts/' + floor).transaction(cur => cur ? undefined : Object.assign({ pid: Net.pid, t: T() }, info)); if (r.committed) return 'first'; } catch (e) {}
  try { const cur = (await db.ref('firsts/' + floor).once('value')).val(); if (!cur || cur.pid === Net.pid) return false;
    if (Net.now() - (cur.t || 0) > 60000) return false;
    await db.ref('firsts/' + floor + '/co/' + Net.pid).set({ n: info.n, lv: info.lv, t: T() }); return 'co'; } catch (e) { return false; }
};

/* ---- 遊んだ人の記録（どこでやめたかを知るため。名前などは送らない） ---- */
const AN = { inc: {}, set: {}, sec: 0, t0: 0, timer: null };
const anRef = () => db && Net.pid ? db.ref('an/' + Net.pid) : null;
Net.anStart = () => { const r = anRef(); if (!r) return;
  try { r.child('f').transaction(v => v || Date.now()).catch(() => {}); } catch (e) {}
  AN.set.dev = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 'sp' : 'pc'; AN.set.lang = (window.L10N && L10N.lang) || 'ja';
  Net.anCount('n'); AN.t0 = document.visibilityState === 'visible' ? Date.now() : 0;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') AN.t0 = Date.now(); else { if (AN.t0) AN.sec += (Date.now() - AN.t0) / 1000; AN.t0 = 0; Net.anFlush(); } });
  addEventListener('pagehide', () => Net.anFlush());
  AN.timer = setInterval(() => Net.anFlush(), 60000); };
Net.anCount = (path, n) => { AN.inc[path] = (AN.inc[path] || 0) + (n || 1); };
Net.anSet = (path, v) => { AN.set[path] = v; };
Net.anMark = key => { const k = 'il_an_' + key; if (ls(k)) return; ls(k, '1'); AN.set['m/' + key] = Date.now(); };
Net.anFlush = () => { const r = anRef(); if (!r) return; if (AN.t0) { AN.sec += (Date.now() - AN.t0) / 1000; AN.t0 = Date.now(); }
  const up = Object.assign({ l: T() }, AN.set); for (const k in AN.inc) up[k] = firebase.database.ServerValue.increment(AN.inc[k]);
  const sec = Math.round(AN.sec); if (sec > 0) { up.s = firebase.database.ServerValue.increment(sec); AN.sec -= sec; }
  AN.inc = {}; AN.set = {}; try { r.update(up).catch(() => {}); } catch (e) {} };

/* ---- 記録とセーブ ---- */
Net.pushJournal = async (str, v) => {
  if (!db) return false; let n = +(ls('il_jn') || 0);
  try { await db.ref('journal/' + Net.pid + '/' + n).set({ d: str, v: String(v || '0'), t: T() }); ls('il_jn', String(n + 1)); return n + 1; } catch (e) { return false; }
};
Net.journalCount = () => +(ls('il_jn') || 0);
Net.saveProfile = async (pub, saveStr) => { if (!db) return; if (await Net.restoreFlag()) { location.reload(); return; } try { await db.ref('players/' + Net.pid).update(Object.assign({ t: T(), save: saveStr, jn: Net.journalCount() }, pub)); } catch (e) {} };
Net.makeCode = async () => {
  if (!db) return null; const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += ch[Math.floor(Math.random() * ch.length)];
  try { await db.ref('xfer/' + c).set({ pid: Net.pid, t: T() }); return c; } catch (e) { return null; }
};
Net.restoreFlag = async () => { if (!db || !Net.pid) return null; try { return (await db.ref('players/' + Net.pid + '/restore').once('value')).val(); } catch (e) { return null; } };
Net.doRestore = async target => { // 管理者が用意したセーブに入れかえる（記録の番号はサーバーの続きから）
  try { const me = Net.pid; const sv = (await db.ref('players/' + target + '/save').once('value')).val(); if (!sv) return null;
    let jn = 0; try { const last = (await db.ref('journal/' + target).orderByKey().limitToLast(1).once('value')).val(); if (last) jn = Math.max(...Object.keys(last).map(k => +k + 1)); } catch (e) {}
    Net.pid = target; ls('il_pid', target); ls('il_jn', String(jn));
    try { await db.ref('players/' + me + '/restore').remove(); } catch (e) {} if (me !== target) { try { await db.ref('players/' + target + '/restore').remove(); } catch (e) {} }
    return sv; } catch (e) { return null; } };
Net.loadPlayerSave = async pid => { if (!db) return null; try { const v = (await db.ref('players/' + pid + '/save').once('value')).val(); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
Net.useCode = async code => {
  if (!db) return null; code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  try {
    const x = (await db.ref('xfer/' + code).once('value')).val(); if (!x || !x.pid) return null;
    await db.ref('owner/' + x.pid).set({ uid: Net.uid, code });
    const p = (await db.ref('players/' + x.pid).once('value')).val(); if (!p || !p.save) return null;
    let jn = p.jn || 0; try { const last = (await db.ref('journal/' + x.pid).orderByKey().limitToLast(1).once('value')).val(); if (last) jn = Math.max(jn, ...Object.keys(last).map(k => +k + 1)); } catch (e) {}
    Net.pid = x.pid; ls('il_pid', x.pid); ls('il_jn', String(jn));
    return p.save;
  } catch (e) { return null; }
};
Net.getJournal = async pid => { const s = (await db.ref('journal/' + pid).once('value')).val() || {}; return Object.keys(s).sort((a, b) => a - b).map(k => s[k].d); };

/* ---- 落ちたバッグ（中身は変わらない。1つの階に20個まで、1人1個まで） ---- */
const strip = p => ({ sp: p.sp, rar: p.rar, floor: p.floor, stats: p.stats.map(s => ({ k: s.k, r: s.r })), edges: p.edges.slice(), rot: p.rot | 0 });
Net.strip = strip;
Net.getBags = async floor => { if (!db) return []; try { const s = (await db.ref('bags/' + floor).once('value')).val() || {}; return Object.keys(s).map(id => Object.assign({ id }, s[id])).filter(b => Array.isArray(b.p) && b.p.length); } catch (e) { return []; } };
Net.addBag = async (floor, x, y, parts, name, note) => {
  if (!db || !parts.length) return null;
  try {
    const ref = db.ref('bags/' + floor).push(), id = ref.key;
    const data = { x, y, p: parts.slice(0, 30).map(strip), pid: Net.pid, n: name || '', s: String(note || '').slice(0, 20), t: T() };
    await db.ref('bagarc/' + id).set(Object.assign({ f: floor }, data)); // 控え（ずるの確かめ用）
    await ref.set(data);
    const all = (await db.ref('bags/' + floor).once('value')).val() || {}; const ids = Object.keys(all);
    for (const k of ids) if (k !== id && all[k].pid === Net.pid) { await db.ref('bags/' + floor + '/' + k).remove(); delete all[k]; } // 1人1個まで
    const rest = Object.keys(all).sort((a, b) => (all[a].t || 0) - (all[b].t || 0));
    while (rest.length > 20) { const k = rest.shift(); await db.ref('bags/' + floor + '/' + k).remove(); } // 古いものから消える
    return id;
  } catch (e) { return null; }
};

/* ---- 地図の売り買い ---- */
Net.listMaps = async floor => { if (!db) return []; try { const s = (await db.ref('maps/' + IL.mapKey(floor)).once('value')).val() || {}; return Object.keys(s).map(pid => Object.assign({ pid }, s[pid])).filter(m => m.pid !== Net.pid).sort((a, b) => b.pct - a.pct); } catch (e) { return []; } };
Net.sellMap = async (floor, m) => { if (!db) return false; try { await db.ref('maps/' + IL.mapKey(floor) + '/' + Net.pid).set(Object.assign({ t: T() }, m)); return true; } catch (e) { return false; } };
Net.buyMap = async (floor, pid) => {
  if (!db) return null;
  try { const m = (await db.ref('maps/' + IL.mapKey(floor) + '/' + pid).once('value')).val(); if (!m) return null; await db.ref('sales/' + pid + '/' + floor).transaction(v => (v || 0) + 1); return m; } catch (e) { return null; }
};
Net.claimSales = async () => { // 売れた分（前に受け取った数との差）
  if (!db) return 0;
  try { const s = (await db.ref('sales/' + Net.pid).once('value')).val() || {}; let tot = 0; for (const f in s) tot += s[f] | 0; const got = +(ls('il_salesgot') || 0); const d = Math.max(0, tot - got); ls('il_salesgot', String(tot)); return d; } catch (e) { return 0; }
};

/* ---- 全体掲示板 ---- */
Net.watchBoard = cb => { if (!db) return () => {}; const r = db.ref('board').limitToLast(60); const h = s => cb(s.val() || {}); r.on('value', h); return () => r.off('value', h); };
Net.post = async (name, text, lang) => {
  if (!db) return 'off';
  try { await db.ref('rate/' + Net.pid).set(T()); } catch (e) { return 'rate'; }
  try { await db.ref('board').push(Object.assign({ pid: Net.pid, n: name, s: text, l: lang || 'ja', t: T() }, Net.postInfo || {})); return 'ok'; } catch (e) { return 'ng'; }
};
Net.watchHidden = cb => { if (!db) return () => {}; let h = {}, r = {}; const go = () => { const o = Object.assign({}, h); for (const id in r) if (Object.keys(r[id] || {}).length >= 3) o[id] = true; cb(o); };
  const a = db.ref('hidden'), b = db.ref('reports'), fa = s => { h = s.val() || {}; go(); }, fb = s => { r = s.val() || {}; go(); }; a.on('value', fa); b.on('value', fb); return () => { a.off('value', fa); b.off('value', fb); }; };
Net.watchInfo = cb => { if (!db) return; db.ref('stream').on('value', s => cb('stream', s.val())); db.ref('news').limitToLast(3).on('value', s => cb('news', s.val())); };
Net.report = async id => { if (!db) return; try { await db.ref('reports/' + id + '/' + Net.pid).set(T()); } catch (e) {} };

/* ---- 半透明の人（別のデータベース） ---- */
const CH = 30; let liveRef = null, liveSubs = [], lastSent = 0;
Net.chunkOf = (x, y) => Math.floor(x / CH) + '_' + Math.floor(y / CH);
Net.liveSend = (floor, x, y, name, force) => {
  if (!ldb) return; const now = Date.now(); if (!force && now - lastSent < 2500) return; lastSent = now;
  const path = 'pos/' + floor + '/' + Net.chunkOf(x, y) + '/' + Net.luid;
  if (!liveRef || liveRef.toString().indexOf(path) < 0) { if (liveRef) liveRef.remove().catch(() => {}); liveRef = ldb.ref(path); liveRef.onDisconnect().remove(); }
  liveRef.set({ x, y, n: name || '', t: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
};
Net.liveWatch = (floor, x, y, cb) => { // 自分のいる区画とまわり8区画だけ見る
  if (!ldb) return; Net.liveStop();
  const cx = Math.floor(x / CH), cy = Math.floor(y / CH), data = {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const key = (cx + dx) + '_' + (cy + dy), r = ldb.ref('pos/' + floor + '/' + key);
    const h = s => { data[key] = s.val() || {}; const all = []; for (const k in data) for (const u in data[k]) if (u !== Net.luid) all.push(Object.assign({ u }, data[k][u])); cb(all); };
    r.on('value', h); liveSubs.push(() => r.off('value', h));
  }
  Net.liveKey = floor + ':' + cx + '_' + cy;
};
/* いま遊んでいる人（3分以内に合図があった人を数える） */
let onRef = null;
let onLast = { f: -1, t: 0 };
Net.presence = floor => { if (!ldb) return; const nw = Date.now(); if ((floor | 0) === onLast.f && nw - onLast.t < 50000) return; onLast = { f: floor | 0, t: nw }; try { if (!onRef) { onRef = ldb.ref('on/' + Net.luid); onRef.onDisconnect().remove(); } onRef.set({ t: firebase.database.ServerValue.TIMESTAMP, f: floor | 0 }).catch(() => {}); } catch (e) {} };
Net.watchOnline = cb => { if (!ldb) return; ldb.ref('on').on('value', s => { const v = s.val() || {}, now = Net.now(); let n = 0, inT = 0; for (const k in v) if (now - (v[k].t || 0) < 180000) { n++; if (v[k].f) inT++; } cb(n, inT); }); };
Net.liveStop = () => { liveSubs.forEach(f => f()); liveSubs = []; Net.liveKey = null; };
Net.liveLeave = () => { Net.liveStop(); if (liveRef) { liveRef.remove().catch(() => {}); liveRef = null; } };
})();
