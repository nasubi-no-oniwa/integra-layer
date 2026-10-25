// 試しに遊ぶプログラム：自動で塔を上らせて、止まる・壊れる・理不尽がないかを確かめる
const IL = require('../js/core.js');
const SEED = +process.argv[2] || 1, MAXRUN = +process.argv[3] || 400, LOG = process.argv.includes('-v');
const rng = new IL.RNG(SEED);
const pr = IL.newProfile(0);
let simTime = 0; // 遊んだ時間の目安（秒）
function score(an, pr) {
  const st = IL.baseStats(pr); let best = 0;
  for (const sp in an.skills) best = Math.max(best, IL.B.tierPct[an.skills[sp].tier] * IL.B.coef[sp]);
  const atk = st.atk + an.add.atk;
  return atk * Math.max(1, best) + (st.def + an.add.def) * 0.8 + (st.hp + an.add.hp) / 6 + an.add.spd * 0.3 + an.add.luck * 0.1;
}
function optimizeBoard() {
  const pool = pr.bag.slice().sort((a, b) => IL.partScore(b) - IL.partScore(a)).slice(0, 45);
  let board = pr.board.map(id => id == null ? null : pr.bag.find(p => p.id === id) || null);
  const used = () => new Set(board.filter(Boolean).map(p => p.id));
  for (let i = 0; i < 25; i++) if (!board[i]) { const u = used(); const p = pool.find(q => !u.has(q.id)); if (p) board[i] = p; }
  const sc = b => score(IL.analyzeBoard(b), pr);
  let cur = sc(board);
  for (let it = 0; it < 1500; it++) {
    const nb = board.slice(); const r = rng.int(3); const i = rng.int(25); let rotP = null, oldRot = 0;
    if (r === 0) { const j = rng.int(25); const t = nb[i]; nb[i] = nb[j]; nb[j] = t; }
    else if (r === 1 && nb[i]) { rotP = nb[i]; oldRot = rotP.rot; rotP.rot = (rotP.rot + 1 + rng.int(3)) % 4; }
    else { const u = new Set(nb.filter(Boolean).map(p => p.id)); const c = pool.filter(q => !u.has(q.id)); if (c.length) nb[i] = c[rng.int(c.length)]; }
    const s = sc(nb); if (s >= cur) { cur = s; board = nb; } else if (rotP) rotP.rot = oldRot;
  }
  pr.board = board.map(p => p ? p.id : null);
}
function pathDir(fl, run, goal) { // BFS で goal(i) を満たす場所へ
  const W = fl.W, start = run.y * W + run.x, prev = new Int32Array(fl.t.length).fill(-1); prev[start] = start; const q = [start];
  const blocked = new Set(run.enemies.map(e => e.y * W + e.x));
  for (let h = 0; h < q.length; h++) { const i = q[h]; if (i !== start && goal(i)) { let c = i; while (prev[c] !== start) c = prev[c]; const d = c - start; return d === -W ? 0 : d === 1 ? 1 : d === W ? 2 : 3; }
    for (const o of [-W, 1, W, -1]) { const j = i + o; if (prev[j] >= 0) continue; const x = j % W, y = (j / W) | 0; if (!IL.walkable(fl, x, y)) { if (goal(j)) { prev[j] = i; q.push(j); } continue; } prev[j] = i; q.push(j); } }
  return -1;
}
function fight(run) {
  let guard = 0;
  while (run.battle && !run.battle.over && guard++ < 300) {
    const st = IL.playerStats(pr), bt = run.battle, alive = bt.foes.filter(f => f.hp > 0);
    let cmd = { c: 'atk', t: 0 };
    if (run.hp < st.hp * 0.3 && pr.potions.length) { let bi = 0; pr.potions.forEach((p, i) => { if (IL.potionEff(p.floor, run.floor) > IL.potionEff(pr.potions[bi].floor, run.floor)) bi = i; }); cmd = { c: 'item', i: bi }; }
    else {
      let best = 1, bsp = null;
      for (const sp in st.skills) { let v = IL.B.tierPct[st.skills[sp].tier] * IL.B.coef[sp]; const f = alive[0];
        if (sp === 'wind') v *= alive.length; else if (sp !== 'star' && f) v *= f.weak === sp ? 2 : f.res === sp ? 0.5 : 1;
        if (sp === 'forest' && run.hp < st.hp * 0.6) v *= 1.6; if (sp === 'rock' && alive.some(f => f.charge)) v *= 3;
        if (v > best) { best = v; bsp = sp; } }
      if (alive.some(f => f.charge) && !bsp) cmd = { c: 'def' };
      else if (bsp) cmd = { c: 'skill', sp: bsp, t: 0 };
    }
    IL.battleCmd(pr, run, cmd); simTime += 3;
  }
  const r = run.battle.over, k = run.battle.kind; if (k === 'boss') { const st = IL.playerStats(pr); stats.bossLog.push([run.floor, run.battle.turn, Math.round(100 * run.hp / st.hp), r]); } IL.closeBattle(pr, run); return { r, k };
}
const stats = { bossLog: [], runs: 0, deaths: 0, bossDeaths: 0, bossWins: 0, maxF: 1, timeline: [] };
for (let rn = 0; rn < MAXRUN && pr.maxFloor <= 100; rn++) {
  // ガチャ（1日＝6時間遊ぶと仮定）
  const day = 'd' + Math.floor(simTime / (6 * 3600)); if (!pr.gacha || pr.gacha.day !== day) { IL.rollGacha(pr, day, rng); IL.pickGacha(pr, 0); }
  while (pr.freePts > 0) IL.allocPoint(pr, ['atk', 'hp', 'def'][pr.freePts % 3]);
  optimizeBoard();
  const st0 = IL.playerStats(pr);
  // 最前線に挑めそうか：無理ならひとつ前の階で稼ぐ
  const f = pr.maxFloor; let floor = f;
  const boss = IL.makeEnemy(f, IL.bossType(f), f % 5 === 0 ? 2 : 1, null);
  const myTurns = boss.hp / IL.dmgCalc(st0.atk, 1.5, boss.def), hisTurns = st0.hp / IL.dmgCalc(boss.atk, 1.3, st0.def);
  if (myTurns > hisTurns * 0.8 && f > 1) floor = Math.max(1, f - 1);
  // ふつうの敵が危ない階なら、安全な階まで下がって立て直す
  while (floor > 1) { const e = IL.makeEnemy(floor, 'eye', 0, null); const hitPct = IL.dmgCalc(e.atk, 1, st0.def) / st0.hp, kills = e.hp / IL.dmgCalc(st0.atk, 1, e.def); if (hitPct <= 0.12 && kills <= 5) break; floor--; }
  let run = IL.startRun(pr, floor, rng.int(1e9)); stats.runs++;
  let steps = 0, stuck = 0;
  while (!run.over && steps++ < 6000) {
    const fl = IL.genFloor(run.floor), st = IL.playerStats(pr);
    if (run.battle) { const { r, k } = fight(run); if (r === 'win' && k === 'boss') { stats.bossWins++; if (run.hp > st.hp * 0.5 && run.floor < 100) { run = IL.goNextFloor(pr, run); stats.maxF = Math.max(stats.maxF, run.floor); continue; } IL.leaveRun(pr, run, 'return'); break; } if (r === 'lose') { if (LOG && stats.deaths % 40 === 0) { const st2 = IL.playerStats(pr); const e = IL.makeEnemy(run.floor, 'slime', 0, null); console.log('death f', run.floor, 'lv', pr.lv, 'bag', pr.bag.length, 'board', pr.board.filter(x => x != null).length, 'atk', st2.atk, 'hp', st2.hp, 'def', st2.def, 'eAtk', e.atk, 'eHp', e.hp, 'steps', steps, 'kind', k, 'pot', pr.potions.length); } stats.deaths++; if (k === 'boss') stats.bossDeaths++; break; } optimizeBoard(); continue; }
    if (run.prompt) {
      const k = run.prompt.kind;
      if (k === 'gate') {
        const full = pr.board.filter(x => x != null).length >= 20;
        const b = IL.makeEnemy(run.floor, IL.bossType(run.floor), run.floor % 5 === 0 ? 2 : 1, null);
        const ok = full && b.hp / IL.dmgCalc(st.atk, 2, b.def) < run.hp / IL.dmgCalc(b.atk, 1.4, st.def) * 0.8;
        if (pr.cleared[run.floor]) { if (run.floor < pr.maxFloor - 1 || !ok) { if (run.floor < pr.maxFloor - 1) { run = IL.goNextFloor(pr, run); continue; } IL.leaveRun(pr, run, 'return'); break; } IL.fightBoss(pr, run); }
        else if (ok) IL.fightBoss(pr, run); else { IL.leaveRun(pr, run, 'return'); break; }
        continue; }
      if (k === 'safe') { if (run.hp < st.hp * 0.35 && !pr.potions.length) { IL.leaveRun(pr, run, 'return'); break; } run.prompt = null; IL.wait(pr, run); continue; }
      if (k === 'merchant') { while (pr.gold >= 5 && run.merchant.stock[0] && run.merchant.stock[0].kind === 'potion' && pr.potions.length < 8) IL.buy(pr, run, 0); run.prompt = null; run.merchant = null; continue; }
      run.prompt = null; continue;
    }
    if (run.hp < st.hp * 0.4 && pr.potions.length) { IL.usePotion(pr, run, 0); continue; }
    const bits = IL.mapBits(pr, run);
    let d = -1;
    d = pathDir(fl, run, i => fl.t[i] === IL.T.PED && !run.opened[i]);
    const wantBoss = steps > 600 || run.hp > st.hp * 0.7;
    if (d < 0 || steps > 900) d = wantBoss ? pathDir(fl, run, i => fl.t[i] === IL.T.GATE && bits[i]) : -1;
    if (d < 0) d = pathDir(fl, run, i => !bits[i] && fl.t[i] === IL.T.FLOOR);
    if (d < 0) d = pathDir(fl, run, i => fl.t[i] === IL.T.GATE);
    if (d < 0) { d = rng.int(4); stuck++; }
    const ox = run.x, oy = run.y; IL.step(pr, run, d); simTime += 0.4; run.events.length = 0;
    if (run.x === ox && run.y === oy && !run.battle && !run.prompt) IL.interact(pr, run);
  }
  if (!run.over) IL.leaveRun(pr, run, 'return');
  stats.timeline.push([Math.round(simTime / 3600 * 10) / 10, pr.maxFloor, pr.lv]);
  if (LOG && rn % 10 === 0) console.log('run', rn, 'h', (simTime / 3600).toFixed(1), 'front', pr.maxFloor, 'lv', pr.lv, 'bag', pr.bag.length, 'gold', pr.gold, 'pot', pr.potions.length, 'deaths', stats.deaths);
  if (pr.maxFloor >= 100 && pr.cleared[100]) break;
}
const pick = [5, 10, 20, 30, 50, 70, 100].map(F => { const t = stats.timeline.find(x => x[1] >= F); return F + '階:' + (t ? t[0] + 'h(Lv' + t[2] + ')' : '未'); });
if (LOG) console.log('boss', stats.bossLog.filter((b, i) => b[0] % 10 === 0 || b[3] === 'lose').map(b => b.join('/')).join(' '));
console.log(JSON.stringify({ seed: SEED, runs: stats.runs, deaths: stats.deaths, bossDeaths: stats.bossDeaths, bossWins: stats.bossWins, frontier: pr.maxFloor, lv: pr.lv, hours: (simTime / 3600).toFixed(1), kills: pr.stats.kills }), pick.join(' '));
