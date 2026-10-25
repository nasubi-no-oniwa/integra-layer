// 正直に遊んだ記録を IL.exec だけで作る（管理ページの「確かめる」のテスト用）
// 使い方: node tests/honest.js <pid> <目標の階>  → 標準出力に {pid, journal:[packed...], cleared}
const IL = require('../js/core.js');
const pid = process.argv[2] || 'honest-1', goal = +process.argv[3] || 1;
const S = IL.newState(pid, 0); const X = op => IL.exec(S, op);
function pathDir(fl, run, want) {
  const W = fl.W, start = run.y * W + run.x, prev = new Int32Array(fl.t.length).fill(-1); prev[start] = start; const q = [start];
  for (let h = 0; h < q.length; h++) { const i = q[h]; if (i !== start && want(i)) { let c = i; while (prev[c] !== start) c = prev[c]; const d = c - start; return d === -W ? 0 : d === 1 ? 1 : d === W ? 2 : 3; }
    for (const o of [-W, 1, W, -1]) { const j = i + o; if (j < 0 || prev[j] >= 0) continue; const x = j % W, y = (j / W) | 0; if (!IL.walkable(fl, x, y)) { if (want(j)) { prev[j] = i; q.push(j); } continue; } prev[j] = i; q.push(j); } }
  return -1;
}
function fixBoard() { const pr = S.pr; const best = pr.bag.slice().sort((a, b) => IL.partScore(b) - IL.partScore(a)).slice(0, 25); for (let c = 0; c < 25; c++) { const p = best[c]; if (p && pr.board[c] !== p.id) X(['place', c, p.id]); } while (pr.freePts > 0) X(['pt', ['atk', 'hp', 'def'][pr.freePts % 3]]); }
let guard = 0;
while (!(S.pr.cleared[goal]) && guard++ < 400) {
  fixBoard(); const f = Math.min(goal, S.pr.maxFloor); X(['start', f]);
  let steps = 0;
  while (S.run && !S.run.over && steps++ < 5000) {
    const run = S.run, pr = S.pr, st = IL.playerStats(pr), fl = IL.genFloor(run.floor);
    if (run.battle) {
      if (run.battle.over) { const k = run.battle.kind, ov = run.battle.over; X(['bx']); continue; }
      if (run.hp < st.hp * 0.3 && pr.potions.length) X(['bc', { c: 'item', i: 0 }]);
      else { const sp = Object.keys(st.skills)[0]; X(['bc', sp ? { c: 'skill', sp, t: 0 } : { c: 'atk', t: 0 }]); }
      continue;
    }
    if (run.prompt) { const k = run.prompt.kind;
      if (k === 'bosswin') { X(['leave']); continue; }
      if (k === 'gate') { if (pr.lv >= 6 + 2 * run.floor) X(['boss']); else X(['cancel']); }
      else X(['cancel']); continue; }
    const bits = IL.mapBits(pr, run);
    let d = pathDir(fl, run, i => run.enemies.some(e => e.y * fl.W + e.x === i));
    if (run.hp < st.hp * 0.7) { const h = fl.herbs.find(i => IL.herbNear(fl, run, i)); if (h != null) { X(['hb', h]); X(['eat']); continue; } }
    if (pr.lv >= 6 + 2 * run.floor) d = pathDir(fl, run, i => i === IL.bossCenter(fl));
    if (run.bossDown) d = run.bossChest && !run.bossChest.opened ? pathDir(fl, run, i => i === run.bossChest.i) : pathDir(fl, run, i => i === IL.bossCenter(fl));
    if (d < 0) d = pathDir(fl, run, i => !bits[i] && fl.t[i] === IL.T.FLOOR);
    if (d < 0) d = steps % 4;
    X(['mv', d]); if (S.run) S.run.events.length = 0;
  }
  if (S.run && !S.run.over) X(['giveup']);
}
const r = IL.replay(pid, S.journal);
console.log(JSON.stringify({ pid, cleared: Object.keys(S.pr.cleared), lv: S.pr.lv, ops: S.journal.length, replayOk: r.ok, same: IL.digest(r.S.pr) === IL.digest(S.pr), journal: [IL.packJournal(S.journal)] }));
