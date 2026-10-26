// テスト用のにせ Firebase（compat の使う分だけ）。データは tests/server.py に置く
(function () {
  const S = { TIMESTAMP: { '.sv': 'timestamp' }, increment: n => n }; // 試験用：足し算はせず、その値を入れるだけ
  const resolve = v => { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); const o = Array.isArray(v) ? [] : {}; for (const k in v) o[k] = resolve(v[k]); return o; } return v; };
  const parts = p => String(p || '').split('/').filter(Boolean);
  const getAt = (tree, p) => { let t = tree; for (const k of parts(p)) { if (t == null || typeof t !== 'object') return null; t = t[k]; } return t === undefined ? null : t; };
  let pushN = 0; const pushKey = () => (Date.now().toString(36) + (pushN++).toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6));
  function DB(name) { this.name = name; this.listeners = []; this.cache = null; const self = this; setInterval(() => self.poll(), 600); }
  DB.prototype.api = async function (body) { const r = await fetch('/__db', { method: 'POST', body: JSON.stringify(Object.assign({ db: this.name }, body)) }); return r.json(); };
  DB.prototype.tree = async function () { const r = await this.api({ op: 'get' }); this.cache = r.tree || {}; return this.cache; };
  DB.prototype.poll = async function () { if (!this.listeners.length) return; const t = await this.tree(); for (const l of this.listeners) { const v = l.filter(getAt(t, l.path)); const j = JSON.stringify(v); if (j !== l.last) { l.last = j; l.h(snap(l.path, v)); } } };
  function snap(path, v) { return { val: () => v == null ? null : JSON.parse(JSON.stringify(v)), key: parts(path).pop(), exists: () => v != null }; }
  function Ref(db, path, lim) { this.db = db; this.path = parts(path).join('/'); this.key = parts(path).pop() || null; this.lim = lim; }
  Ref.prototype.child = function (p) { return new Ref(this.db, this.path + '/' + p); };
  Ref.prototype.push = function (v) { const r = this.child(pushKey()); if (v !== undefined) { const pr = r.set(v); r.then = pr.then.bind(pr); } return r; };
  Ref.prototype.set = async function (v) { if (this.path === '.info/serverTimeOffset') return; await this.db.api({ op: 'set', path: this.path, value: resolve(v) }); this.db.poll(); };
  Ref.prototype.update = async function (o) { const u = {}; for (const k in o) u[k] = resolve(o[k]); await this.db.api({ op: 'update', path: this.path, value: u }); this.db.poll(); };
  Ref.prototype.remove = async function () { await this.db.api({ op: 'set', path: this.path, value: null }); this.db.poll(); };
  Ref.prototype.limitToLast = function (n) { return new Ref(this.db, this.path, n); };
  Ref.prototype.filter = function (v) { if (!this.lim || !v || typeof v !== 'object') return v; const ks = Object.keys(v).sort().slice(-this.lim); const o = {}; ks.forEach(k => o[k] = v[k]); return o; };
  Ref.prototype.once = async function () { if (this.path === '.info/serverTimeOffset') return snap(this.path, 0); const t = await this.db.tree(); return snap(this.path, this.filter(getAt(t, this.path))); };
  Ref.prototype.on = function (ev, h) { if (this.path === '.info/serverTimeOffset') { h(snap(this.path, 0)); return h; } const l = { path: this.path, h, filter: v => this.filter(v), last: undefined, ref: this }; this.db.listeners.push(l); this.db.poll(); return h; };
  Ref.prototype.off = function (ev, h) { this.db.listeners = this.db.listeners.filter(l => !(l.path === this.path && (!h || l.h === h))); };
  Ref.prototype.transaction = async function (fn) {
    for (let i = 0; i < 5; i++) { const t = await this.db.tree(); const cur = getAt(t, this.path); const nv = fn(cur == null ? null : JSON.parse(JSON.stringify(cur)));
      if (nv === undefined) return { committed: false, snapshot: snap(this.path, cur) };
      const r = await this.db.api({ op: 'cas', path: this.path, expect: cur, value: resolve(nv) }); if (r.ok) { this.db.poll(); return { committed: true, snapshot: snap(this.path, nv) }; } }
    return { committed: false };
  };
  Ref.prototype.onDisconnect = function () { const self = this; return { remove: () => { addEventListener('pagehide', () => navigator.sendBeacon('/__db', JSON.stringify({ db: self.db.name, op: 'set', path: self.path, value: null }))); return Promise.resolve(); } }; };
  Ref.prototype.toString = function () { return this.db.name + '/' + this.path; };
  const dbs = {};
  window.firebase = {
    initializeApp(cfg, name) { const id = (localStorage.getItem('fake_uid_' + name) || (name + '-' + Math.random().toString(36).slice(2, 10))); localStorage.setItem('fake_uid_' + name, id);
      const user = { uid: id }; const auth = { currentUser: null, signInAnonymously: async () => { auth.currentUser = user; return { user }; },
        onAuthStateChanged: cb => { const v = sessionStorage.getItem('fk_pw'); auth.currentUser = v ? { uid: 'adm', email: 'il-admin@nasubi-no-oniwa.github.io' } : null; setTimeout(() => cb(auth.currentUser)); return () => {}; },
        signInWithEmailAndPassword: async (e, pw) => { const ok = localStorage.getItem('fk_acc'); if (!ok) throw { code: 'auth/invalid-credential' }; if (ok !== pw) throw { code: 'auth/invalid-credential' }; sessionStorage.setItem('fk_pw', 1); },
        createUserWithEmailAndPassword: async (e, pw) => { if (localStorage.getItem('fk_acc')) throw { code: 'auth/email-already-in-use' }; localStorage.setItem('fk_acc', pw); sessionStorage.setItem('fk_pw', 1); },
        signOut: async () => sessionStorage.removeItem('fk_pw') };
      const db = dbs[cfg.projectId] || (dbs[cfg.projectId] = new DB(cfg.projectId)); const dapi = { ref: p => new Ref(db, p) };
      return { auth: () => auth, database: () => dapi }; },
    database: { ServerValue: S },
  };
})();
