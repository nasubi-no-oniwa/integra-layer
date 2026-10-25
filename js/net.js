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
Net.claimFirst = async (floor, info) => {
  if (!db) return false;
  try { const r = await db.ref('firsts/' + floor).transaction(cur => cur ? undefined : Object.assign({ pid: Net.pid, t: T() }, info)); return r.committed; } catch (e) { return false; }
};

/* ---- 記録とセーブ ---- */
Net.pushJournal = async str => {
  if (!db) return false; let n = +(ls('il_jn') || 0);
  try { await db.ref('journal/' + Net.pid + '/' + n).set({ d: str, t: T() }); ls('il_jn', String(n + 1)); return n + 1; } catch (e) { return false; }
};
Net.journalCount = () => +(ls('il_jn') || 0);
Net.saveProfile = async (pub, saveStr) => { if (!db) return; try { await db.ref('players/' + Net.pid).update(Object.assign({ t: T(), save: saveStr, jn: Net.journalCount() }, pub)); } catch (e) {} };
Net.makeCode = async () => {
  if (!db) return null; const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += ch[Math.floor(Math.random() * ch.length)];
  try { await db.ref('xfer/' + c).set({ pid: Net.pid, t: T() }); return c; } catch (e) { return null; }
};
Net.useCode = async code => {
  if (!db) return null; code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  try {
    const x = (await db.ref('xfer/' + code).once('value')).val(); if (!x || !x.pid) return null;
    await db.ref('owner/' + x.pid).set({ uid: Net.uid, code });
    const p = (await db.ref('players/' + x.pid).once('value')).val(); if (!p || !p.save) return null;
    Net.pid = x.pid; ls('il_pid', x.pid); ls('il_jn', String(p.jn || 0));
    return p.save;
  } catch (e) { return null; }
};
Net.getJournal = async pid => { const s = (await db.ref('journal/' + pid).once('value')).val() || {}; return Object.keys(s).sort((a, b) => a - b).map(k => s[k].d); };

/* ---- 落ちた欠片 ---- */
Net.getDrops = async floor => { if (!db) return []; try { const s = (await db.ref('drops/' + floor).limitToLast(300).once('value')).val() || {}; return Object.keys(s).map(id => Object.assign({ id }, s[id])); } catch (e) { return []; } };
Net.addDrops = async (floor, x, y, parts, name) => {
  if (!db || !parts.length) return; const strip = p => ({ sp: p.sp, rar: p.rar, floor: p.floor, stats: p.stats, edges: p.edges, rot: p.rot });
  try { const up = {}; parts.forEach((p, i) => { const k = db.ref('drops/' + floor).push().key; up[k] = { x, y: y, p: strip(p), pid: Net.pid, n: name || '', t: T() }; }); await db.ref('drops/' + floor).update(up); } catch (e) {}
};
Net.takeDrop = async (floor, id) => { if (!db) return; try { await db.ref('drops/' + floor + '/' + id).remove(); } catch (e) {} };

/* ---- 地図の売り買い ---- */
Net.listMaps = async floor => { if (!db) return []; try { const s = (await db.ref('maps/' + floor).once('value')).val() || {}; return Object.keys(s).map(pid => Object.assign({ pid }, s[pid])).filter(m => m.pid !== Net.pid).sort((a, b) => b.pct - a.pct); } catch (e) { return []; } };
Net.sellMap = async (floor, m) => { if (!db) return false; try { await db.ref('maps/' + floor + '/' + Net.pid).set(Object.assign({ t: T() }, m)); return true; } catch (e) { return false; } };
Net.buyMap = async (floor, pid) => {
  if (!db) return null;
  try { const m = (await db.ref('maps/' + floor + '/' + pid).once('value')).val(); if (!m) return null; await db.ref('sales/' + pid + '/' + floor).transaction(v => (v || 0) + 1); return m; } catch (e) { return null; }
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
  try { await db.ref('board').push({ pid: Net.pid, n: name, s: text, l: lang || 'ja', t: T() }); return 'ok'; } catch (e) { return 'ng'; }
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
Net.liveStop = () => { liveSubs.forEach(f => f()); liveSubs = []; Net.liveKey = null; };
Net.liveLeave = () => { Net.liveStop(); if (liveRef) { liveRef.remove().catch(() => {}); liveRef = null; } };
})();
