(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main = $('#main');
const MAX = 10;
const EPOCH = Date.UTC(2026, 0, 1);
const TONES = ['', 'ˉ', 'ˊ', 'ˇ', 'ˋ'];

/* storage */
const ld = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch { return d; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const SET = ld('sizi.set', { theme: '', tier: 'easy', py: 1 });
const ST = ld('sizi.stats', { played: 0, won: 0, streak: 0, best: 0, last: -1, dist: {}, free: { played: 0, won: 0 }, book: {}, hintsUsed: 0, chainBest: 0, quiz: { n: 0, ok: 0 } });
let DAILY = ld('sizi.daily', {});
let FREE = ld('sizi.free', {});

/* data */
let DICT = null, ANS = null, ANSMAP = null, ABBR = null;
async function load() {
  const [d, a] = await Promise.all([fetch('data/dict.json').then(r => r.json()), fetch('data/answers.json').then(r => r.json())]);
  DICT = d; ANS = a; ANSMAP = new Map(a.map((x, i) => [x.w, i]));
  ABBR = Object.keys(d).map(w => [w, d[w].split(' ').map(p => p.split('|')).map(([i, f]) => (i || f[0])).join(''), d[w].split(' ').map(p => { const [i, f] = p.split('|'); return i + f.replace(/\d/, ''); }).join('')]);
}
const parse = w => DICT[w].split(' ').map((p, i) => { const [ini, ft] = p.split('|'); return { ch: w[i], ini, fin: ft.replace(/\d/, ''), tone: +(ft.match(/\d/) || [0])[0] }; });
function mark(fin, tone) {
  if (!tone) return fin;
  const M = { a: 'āáǎà', o: 'ōóǒò', e: 'ēéěè', i: 'īíǐì', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
  let idx = fin.indexOf('a'); if (idx < 0) idx = fin.indexOf('e'); if (idx < 0) idx = fin.indexOf('o');
  if (idx < 0) { if (fin.includes('iu')) idx = fin.indexOf('u'); else if (fin.includes('ui')) idx = fin.indexOf('i'); else { for (let i = fin.length - 1; i >= 0; i--) if ('iuü'.includes(fin[i])) { idx = i; break; } } }
  if (idx < 0) return fin;
  return fin.slice(0, idx) + M[fin[idx]][tone - 1] + fin.slice(idx + 1);
}
const pinyinOf = w => parse(w).map(p => p.ini + mark(p.fin, p.tone)).join(' ');

/* seeded order */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let DORDER = null;
function dailyIndex(day) {
  if (!DORDER) { const r = mulberry(20260101); DORDER = [...Array(1500).keys()]; for (let i = DORDER.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [DORDER[i], DORDER[j]] = [DORDER[j], DORDER[i]]; } }
  return DORDER[((day % DORDER.length) + DORDER.length) % DORDER.length];
}
const dayNo = () => { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 864e5); };

/* scoring */
function score(guess, ans) {
  const G = parse(guess), A = parse(ans);
  const comp = key => {
    const res = Array(4).fill('no'); const left = {};
    A.forEach((a, i) => { if (G[i][key] === a[key]) res[i] = 'ok'; else left[a[key]] = (left[a[key]] || 0) + 1; });
    G.forEach((g, i) => { if (res[i] !== 'ok' && left[g[key]]) { res[i] = 'mid'; left[g[key]]--; } });
    return res;
  };
  const c = comp('ch'), ini = comp('ini'), fin = comp('fin'), tone = comp('tone');
  return G.map((g, i) => ({ ...g, c: c[i], ci: g.ini ? ini[i] : 'ok', cf: fin[i], ct: tone[i] }));
}

/* ui */
let toastT;
const toast = (m, ms = 1700) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); };
const modal = h => { const m = $('#modal'); Motion.open(m); m.classList.toggle('mo-keep', !m.hidden); $('#mcard').innerHTML = `<button class="x" data-close aria-label="关闭">×</button>${h}`; $('#modal').hidden = false; };
const closeM = () => { Motion.close($('#modal'), () => { $('#modal').hidden = true; }); };
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeM(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeM(); });

function tileHTML(s, cls = '') {
  if (!s) return `<div class="tile empty ${cls}"><div class="py"></div><div class="ch"></div></div>`;
  const py = SET.py ? `<span class="c-${s.ci}">${esc(s.ini)}</span><span class="c-${s.cf}">${esc(s.fin)}</span><span class="tn c-${s.ct}">${TONES[s.tone]}</span>` : '';
  return `<div class="tile ${s.c} ${cls}"><div class="py">${py}</div><div class="ch">${esc(s.ch)}</div></div>`;
}
function rowHTML(g, ans, anim) { return `<div class="row">${score(g, ans).map((s, i) => tileHTML(s, anim ? 'flip" style="animation-delay:' + i * 110 + 'ms' : '')).join('')}</div>`; }

let MODE = 'daily';
let cur = null; // {kind, ans, guesses, done, won, hints:{e,c}}
function getGame() {
  if (MODE === 'daily') {
    const d = dayNo();
    if (DAILY.day !== d) { DAILY = { day: d, guesses: [], done: false, won: false, hints: {} }; sv('sizi.daily', DAILY); }
    DAILY.ans = ANS[dailyIndex(d)].w;
    return DAILY;
  }
  if (!FREE.ans || !ANSMAP.has(FREE.ans)) newFree();
  return FREE;
}
function newFree() {
  const n = SET.tier === 'hard' ? ANS.length : 1500;
  const recent = new Set(FREE.recent || []);
  let i, g = 0; do { i = Math.floor(Math.random() * n); } while (recent.has(ANS[i].w) && g++ < 50);
  const rec = [...(FREE.recent || []), ANS[i].w].slice(-200);
  FREE = { ans: ANS[i].w, guesses: [], done: false, won: false, hints: {}, recent: rec };
  sv('sizi.free', FREE);
}
const saveGame = () => sv(MODE === 'daily' ? 'sizi.daily' : 'sizi.free', MODE === 'daily' ? DAILY : FREE);

function render(anim) {
  if (MODE === 'book') return renderBook();
  if (MODE === 'chain') return renderChain();
  if (MODE === 'quiz') return renderQuiz();
  cur = getGame();
  const A = cur.ans;
  const rows = [];
  cur.guesses.forEach((g, i) => rows.push(rowHTML(g, A, anim && i === cur.guesses.length - 1)));
  const rest = MAX - cur.guesses.length;
  if (!cur.done) {
    rows.push(`<div class="row cur" id="curRow">${[0,1,2,3].map(() => tileHTML(null)).join('')}</div>`);
    if (rest > 1) rows.push(`<div class="pips" title="剩余次数">${Array.from({ length: rest - 1 }, () => '<i></i>').join('')}</div>`);
  }
  const d = dayNo();
  const dt = new Date();
  main.innerHTML = `
    <div class="meta"><span>${MODE === 'daily' ? `第 <b>${d + 1}</b> 期 · ${dt.getMonth() + 1}月${dt.getDate()}日` : `自由练习 · ${SET.tier === 'hard' ? '进阶词库' : '常用词库'}`}</span><span class="pill">第 ${Math.min(cur.guesses.length + (cur.done ? 0 : 1), MAX)} / ${MAX} 次</span></div>
    <div class="board" id="board">${rows.join('')}</div>
    ${cur.done ? '' : `
    <div class="inbox"><div class="sugg" id="sugg" hidden></div>
      <div class="inrow"><input id="inp" placeholder="成语 或 拼音首字母" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"><button class="go" id="go">猜</button></div></div>
    <div class="tools"><button class="tb" id="hE" ${cur.hints.e ? 'disabled' : ''}>看释义</button><button class="tb" id="hC" ${cur.hints.c != null ? 'disabled' : ''}>揭一个字</button>${MODE === 'free' ? '<button class="tb" id="giveup">揭晓答案</button>' : ''}</div>
    ${hintHTML()}
    ${keysHTML()}`}
    ${cur.done ? resultHTML() : ''}`;
  if (anim === 'win') { const bd = $('#board'); setTimeout(() => bd.classList.add('win'), Motion.reduced ? 0 : 900); setTimeout(() => bd.classList.remove('win'), 1900); }
  bind();
}
function hintHTML() {
  const a = ANS[ANSMAP.get(cur.ans)]; const out = [];
  if (cur.hints.c != null) out.push(`第 ${cur.hints.c + 1} 个字是「<b>${esc(cur.ans[cur.hints.c])}</b>」`);
  if (cur.hints.e) out.push(`释义：${esc(a.e.replace(new RegExp('[' + cur.ans + ']', 'g'), '〇'))}`);
  return out.length ? `<div class="hint">${out.join('<br>')}</div>` : '';
}
function keysHTML() {
  if (!cur.guesses.length || !SET.py) return '';
  const st = { ini: {}, fin: {} }; const rank = { no: 0, mid: 1, ok: 2 };
  cur.guesses.forEach(g => score(g, cur.ans).forEach(s => {
    if (s.ini) st.ini[s.ini] = rank[s.ci] > rank[st.ini[s.ini] ?? 'no'] || st.ini[s.ini] == null ? s.ci : st.ini[s.ini];
    st.fin[s.fin] = st.fin[s.fin] == null || rank[s.cf] > rank[st.fin[s.fin]] ? s.cf : st.fin[s.fin];
  }));
  const INI = 'b p m f d t n l g k h j q x zh ch sh r z c s y w'.split(' ');
  const FIN = 'a o e i u ü ai ei ui ao ou iu ie üe er an en in un ün ang eng ing ong ia iao ian iang iong ua uo uai uan uang ue'.split(' ');
  const k = (x, m) => `<span class="k ${m[x] || ''}">${x}</span>`;
  const usedFin = FIN.filter(f => true);
  return `<div class="keys"><h5>声母</h5><div class="kgrid">${INI.map(x => k(x, st.ini)).join('')}</div><h5>韵母</h5><div class="kgrid">${usedFin.map(x => k(x, st.fin)).join('')}</div></div>`;
}
function resultHTML() {
  const a = ANS[ANSMAP.get(cur.ans)];
  const rel = (t, arr) => arr && arr.length ? `<div class="sect"><h6>${t}</h6><div class="rel">${arr.map(x => `<span>${esc(x)}</span>`).join('')}</div></div>` : '';
  const sec = (t, v) => v ? `<div class="sect"><h6>${t}</h6><p>${esc(v)}</p></div>` : '';
  return `<div class="result" id="result"><div class="rh"><span class="verdict ${cur.won ? '' : 'lose'}">${cur.won ? `第 ${cur.guesses.length} 次猜中` : '这次没猜到'}</span>
    <div class="rw">${esc(a.w)}</div><div class="rp">${esc(pinyinOf(a.w))}</div></div>
    ${sec('释义', a.e)}${sec('出处', a.d)}${sec('例句', a.x)}${sec('典故', a.t)}${sec('用法', a.u)}${rel('近义', a.s)}${rel('反义', a.o)}
    <div class="ract"><button class="btn" id="share">复制战绩</button>${MODE === 'free' ? '<button class="btn pri" id="nextq">下一题</button>' : '<button class="btn pri" id="toFree">去自由练习</button>'}</div>
    ${MODE === 'daily' ? `<div class="next">下一题将在 <b id="cd">--:--:--</b> 后揭晓</div>` : ''}</div>`;
}
let cdT;
function bind() {
  clearInterval(cdT);
  if ($('#cd')) { const tick = () => { const n = new Date(); const t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n; const h = Math.floor(t / 36e5), m = Math.floor(t / 6e4) % 60, s = Math.floor(t / 1e3) % 60; $('#cd').textContent = [h, m, s].map(x => String(x).padStart(2, '0')).join(':'); if (t < 1000) setTimeout(() => render(), 1200); }; tick(); cdT = setInterval(tick, 1000); }
  if ($('#share')) $('#share').onclick = share;
  if ($('#nextq')) $('#nextq').onclick = () => { newFree(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  if ($('#toFree')) $('#toFree').onclick = () => setMode('free');
  const inp = $('#inp'); if (!inp) return;
  const sg = $('#sugg'); let sel = -1, items = [];
  const showS = () => {
    const v = inp.value.trim().toLowerCase().replace(/\s+/g, '');
    items = [];
    if (v) {
      if (/^[a-zü]+$/.test(v)) { for (const [w, ab, full] of ABBR) { if (ab.startsWith(v) || (v.length > 4 && full.startsWith(v))) { items.push(w); if (items.length > 40) break; } } }
      else if (/^[\u4e00-\u9fff]{1,3}$/.test(v)) { for (const w in DICT) { if (w.startsWith(v)) { items.push(w); if (items.length > 40) break; } } }
      items.sort((a, b) => (ANSMAP.has(b) ? 1 : 0) - (ANSMAP.has(a) ? 1 : 0));
      items = items.slice(0, 6);
    }
    sel = -1;
    sg.hidden = !items.length;
    sg.innerHTML = items.map((w, i) => `<button data-w="${w}"><b>${w}</b><span>${esc(pinyinOf(w))}</span></button>`).join('');
    $$('button', sg).forEach(b => b.onmousedown = e => { e.preventDefault(); inp.value = b.dataset.w; sg.hidden = true; submit(); });
  };
  const preview = () => { const cs = [...inp.value.replace(/[^\u4e00-\u9fff]/g, '')].slice(0, 4); $$('#curRow .tile').forEach((t, i) => { const ch = t.querySelector('.ch'); if (cs[i] && ch.textContent !== cs[i]) Motion.pulse(t, 'pop'); ch.textContent = cs[i] || ''; t.classList.toggle('typing', !!cs[i]); }); };
  inp.addEventListener('input', () => { showS(); preview(); });
  inp.addEventListener('blur', () => setTimeout(() => sg.hidden = true, 150));
  inp.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; $$('button', sg).forEach((b, i) => b.classList.toggle('on', i === sel)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (sel >= 0 && items[sel]) inp.value = items[sel]; sg.hidden = true; submit(); }
  });
  $('#go').onclick = submit;
  $('#hE').onclick = () => { cur.hints.e = 1; ST.hintsUsed++; sv('sizi.stats', ST); saveGame(); render(); Motion.enter($('.hint')); };
  $('#hC').onclick = () => {
    const known = new Set(); cur.guesses.forEach(g => [...g].forEach((c, i) => { if (cur.ans[i] === c) known.add(i); }));
    const opts = [0, 1, 2, 3].filter(i => !known.has(i)); if (!opts.length) return toast('每个字都已经猜到了');
    cur.hints.c = opts[Math.floor(Math.random() * opts.length)]; ST.hintsUsed++; sv('sizi.stats', ST); saveGame(); render(); Motion.enter($('.hint'));
  };
  if ($('#giveup')) $('#giveup').onclick = () => { if (confirm('确定揭晓答案吗？本题会记为未猜中。')) finish(false); };
  if (matchMedia('(pointer:fine)').matches) inp.focus();
}
function submit() {
  const inp = $('#inp'); const v = inp.value.trim().replace(/\s+/g, '');
  const shake = msg => { toast(msg); const r = $$('#board .row')[cur.guesses.length]; if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } };
  if ([...v].length !== 4 || !/^[\u4e00-\u9fff]{4}$/.test(v)) return shake('请输入四个汉字');
  if (!DICT[v]) return shake('词典里没有这个成语');
  if (cur.guesses.includes(v)) return shake('已经猜过了');
  cur.guesses.push(v);
  const won = v === cur.ans;
  if (won || cur.guesses.length >= MAX) return finish(won, true);
  saveGame(); render(true);
}
function finish(won, anim) {
  cur.done = true; cur.won = won;
  const n = cur.guesses.length;
  if (MODE === 'daily') {
    ST.played++; if (won) { ST.won++; ST.dist[n] = (ST.dist[n] || 0) + 1; ST.streak = ST.last === cur.day - 1 ? ST.streak + 1 : 1; ST.best = Math.max(ST.best, ST.streak); ST.last = cur.day; } else { ST.streak = 0; ST.last = cur.day; }
  } else { ST.free.played++; if (won) ST.free.won++; }
  if (won) ST.book[cur.ans] = ST.book[cur.ans] || Date.now();
  sv('sizi.stats', ST); saveGame();
  render(won ? 'win' : true);
  setTimeout(() => { const r = $('#result'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, won ? 900 : 600);
  if (won) toast(['一击即中！', '神了！', '厉害！', '漂亮！', '不错！', '好！', '稳住了', '有惊无险', '险胜', '最后一搏！'][n - 1] || '猜中了', 2200);
}
function share() {
  const E = { ok: '🟩', mid: '🟨', no: '⬜' };
  const lines = cur.guesses.map(g => score(g, cur.ans).map(s => E[s.c]).join(''));
  const head = MODE === 'daily' ? `四字 第${cur.day + 1}期 ${cur.won ? cur.guesses.length : 'X'}/${MAX}` : `四字 练习 ${cur.won ? cur.guesses.length : 'X'}/${MAX}`;
  const txt = head + '\n' + lines.join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('已复制，可以粘贴给朋友'), () => { prompt('复制下面的内容', txt); });
}


/* chain & quiz */
let CH = null, QZ = null;
function four(w) { return w && w.length === 4 && DICT[w]; }
function startChain(seed) {
  const start = seed || ANS[Math.floor(Math.random() * Math.min(1500, ANS.length))].w;
  CH = { list: [start], input: '', fail: null };
}
function renderChain() {
  if (!CH) startChain();
  const last = CH.list[CH.list.length - 1];
  const need = last[3];
  main.innerHTML = `<div class="meta"><span>成语接龙 · 用「<b>${esc(need)}</b>」起头</span><span class="pill">已接 ${CH.list.length - 1} 个 · 纪录 ${ST.chainBest || 0}</span></div>
    <div class="chain">${CH.list.map((w,i)=>`<span class="cw ${i===CH.list.length-1?'on':''}">${esc(w)}</span>`).join('<i>→</i>')}</div>
    ${CH.fail ? `<div class="hint" style="color:var(--bad,#b23a2e)">${esc(CH.fail)}</div>` : ''}
    <div class="inbox"><div class="sugg" id="sugg" hidden></div>
      <div class="inrow"><input id="inp" placeholder="${need}…  或以拼音首字母检索" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"><button class="go" id="go">接</button></div></div>
    <div class="tools"><button class="tb" id="cHint">提示一个</button><button class="tb" id="cRestart">重新开局</button></div>
    <p class="muted" style="text-align:center;color:var(--ink3);font-size:13px;margin:16px 8px">下一个成语须以「${esc(need)}」开头，且不能重复已用过的词。</p>`;
  const inp = $('#inp'); inp.focus();
  const sg = $('#sugg'); let items = [], sel = -1;
  const showS = () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { sg.hidden = true; items = []; return; }
    const han = /[\u4e00-\u9fff]/.test(q);
    items = [];
    if (han) {
      if (four(q) && q[0]===need) items.push(q);
    } else {
      for (const [w, ab] of ABBR) {
        if (w[0] !== need) continue;
        if (ab.startsWith(q) || w.startsWith(q)) items.push(w);
        if (items.length >= 8) break;
      }
    }
    sg.hidden = !items.length;
    sg.innerHTML = items.map((w,i)=>`<button class="${i===sel?'on':''}" data-w="${w}">${w} <small>${esc(pinyinOf(w))}</small></button>`).join('');
    $$('#sugg button').forEach(b => b.onclick = () => { inp.value = b.dataset.w; sg.hidden = true; submitChain(); });
  };
  inp.oninput = showS;
  inp.onkeydown = e => { if (e.key==='Enter') { e.preventDefault(); if (sel>=0 && items[sel]) inp.value = items[sel]; submitChain(); } };
  $('#go').onclick = submitChain;
  $('#cRestart').onclick = () => { startChain(); renderChain(); };
  $('#cHint').onclick = () => {
    const used = new Set(CH.list);
    const hit = ANS.find(a => a.w[0]===need && !used.has(a.w));
    toast(hit ? `可接「${hit.w}」` : '这一轮里暂时想不到常用接法，换一个试试');
  };
}
function submitChain() {
  const w = ($('#inp')?.value || '').trim();
  const last = CH.list[CH.list.length-1], need = last[3];
  if (!four(w)) { CH.fail = '请输入词典里的四字成语'; renderChain(); return; }
  if (w[0] !== need) { CH.fail = `要以「${need}」开头`; renderChain(); return; }
  if (CH.list.includes(w)) { CH.fail = '这个成语已经用过了'; renderChain(); return; }
  CH.list.push(w); CH.fail = null;
  const n = CH.list.length - 1;
  if (n > (ST.chainBest||0)) { ST.chainBest = n; sv('sizi.stats', ST); toast('刷新了接龙纪录：'+n+' 个'); }
  else toast('接上了 · 已接 '+n+' 个');
  renderChain();
}

function buildQuiz() {
  const pool = ANS.filter(a => (a.s && a.s.length) || (a.o && a.o.length)).slice(0, 2000);
  const a = pool[Math.floor(Math.random()*pool.length)];
  const kind = (a.s && a.s.length && Math.random() < .55) ? 'near' : (a.o && a.o.length ? 'anti' : 'near');
  const rel = (kind==='near' ? a.s : a.o).filter(w => w.length===4);
  const other = rel[0] && DICT[rel[0]] ? rel[0] : null;
  let opts, prompt, ans;
  if (other) {
    prompt = kind==='near' ? `与「${a.w}」意思最接近的是？` : `与「${a.w}」意思相反的是？`;
    const distract = [];
    for (const x of ANS) { if (x.w!==a.w && x.w!==other && x.w.length===4) distract.push(x.w); if (distract.length>80) break; }
    const d1 = distract[Math.floor(Math.random()*distract.length)];
    let d2 = d1; while (d2===d1) d2 = distract[Math.floor(Math.random()*distract.length)];
    opts = [other, d1, d2].sort(()=>Math.random()-0.5);
    ans = other;
  } else {
    const b = ANS[Math.floor(Math.random()*Math.min(1500,ANS.length))];
    prompt = `「${a.w}」的释义是哪一项？`;
    opts = [a.e, b.e].sort(()=>Math.random()-0.5);
    ans = a.e;
    return { prompt, stem: a, opts, ans, kind: 'mean' };
  }
  return { prompt, stem: a, opts, ans, kind };
}
function renderQuiz() {
  if (!QZ) QZ = { i: 0, ok: 0, q: buildQuiz(), locked: false };
  const q = QZ.q, a = q.stem;
  main.innerHTML = `<div class="meta"><span>易错成语辨析 · 第 ${QZ.i+1} 题</span><span class="pill">答对 ${QZ.ok} / ${QZ.i}　累计 ${ST.quiz.ok}/${ST.quiz.n}</span></div>
    <div class="qcard">
      <div class="qh">${esc(a.w)}</div>
      <div class="qp">${esc(pinyinOf(a.w))}</div>
      <p class="qe">${q.kind==='mean' ? '选出正确释义' : esc(a.e)}</p>
      <h3 style="font-size:16px;margin:18px 0 10px">${esc(q.prompt)}</h3>
      <div class="qopts">${q.opts.map((o,i)=>`<button class="qo" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <div id="qexp" class="qexp" hidden></div>
      <div class="ract" style="margin-top:16px"><button class="btn pri" id="qNext" hidden>下一题</button></div>
    </div>`;
  $$('.qo').forEach(b => b.onclick = () => {
    if (QZ.locked) return; QZ.locked = true;
    const ok = b.dataset.v === q.ans;
    QZ.i++; if (ok) QZ.ok++;
    ST.quiz.n++; if (ok) ST.quiz.ok++; sv('sizi.stats', ST);
    $$('.qo').forEach(x => { x.disabled = true; if (x.dataset.v===q.ans) x.classList.add('ok'); else if (x===b) x.classList.add('bad'); });
    const exp = $('#qexp'); exp.hidden = false;
    exp.innerHTML = ok ? '选对了。' : `正确答案是「${esc(q.ans)}」。` + (a.d ? `<div style="margin-top:8px;color:var(--ink3)">出处：${esc(a.d)}</div>` : '');
    $('#qNext').hidden = false;
  });
  $('#qNext').onclick = () => { QZ.q = buildQuiz(); QZ.locked = false; renderQuiz(); };
}

function todayWord() {
  const d = dayNo();
  return ANS[(dailyIndex(d) + 17) % Math.min(1500, ANS.length)];
}

/* book */
function renderBook(q = '') {
  const ws = Object.entries(ST.book).sort((a, b) => b[1] - a[1]).map(([w]) => w).filter(w => ANSMAP.has(w));
  const list = q ? ws.filter(w => w.includes(q) || ANS[ANSMAP.get(w)].e.includes(q)) : ws;
  const tw = todayWord();
  main.innerHTML = `<div class="todayw"><div class="tw-k">今日一词 · 与每日谜题不是同一个</div><b>${esc(tw.w)}</b><div class="tw-p">${esc(pinyinOf(tw.w))}</div><p>${esc(tw.e)}</p>${tw.d?`<div class="tw-d">${esc(tw.d)}</div>`:''}</div>
  <div class="book-h"><div><b style="font-size:18px">成语集</b><div style="font-size:13px;color:var(--ink3)">已收集 ${ws.length} 个 · 猜中即收入</div></div><input id="bq" placeholder="搜索" value="${esc(q)}"></div>
  ${list.length ? `<div class="blist">${list.map(w => { const a = ANS[ANSMAP.get(w)]; return `<button class="bi" data-w="${w}"><b>${w}</b><span>${esc(pinyinOf(w))}</span><p>${esc(a.e)}</p></button>`; }).join('')}</div>` : `<div class="empty"><div class="lg"><i></i><i></i><i></i><i></i></div>${ws.length ? '没有匹配的成语' : '还没有收集到成语<br>猜中的成语会连同释义、出处一起收进这里'}</div>`}`;
  $('#bq').oninput = e => { const p = e.target.selectionStart; renderBook(e.target.value.trim()); const i = $('#bq'); i.focus(); i.setSelectionRange(p, p); };
  $$('.bi').forEach(b => b.onclick = () => { const a = ANS[ANSMAP.get(b.dataset.w)]; const save = cur; cur = { ans: a.w, guesses: [], won: true }; const h = resultHTML().replace(/<div class="ract">[\s\S]*$/, '</div>').replace(/<span class="verdict[^>]*>.*?<\/span>/, ''); cur = save; modal(h.replace('class="result"', 'class="result" style="border:none;box-shadow:none;padding:0;margin:0"')); });
}

/* modals */
function help() {
  const ex = (w, a) => `<div class="row">${score(w, a).map(s => tileHTML(s)).join('')}</div>`;
  modal(`<div class="help"><h3>怎么玩</h3>
  <p>每天一个四字成语，你有 <b>${MAX}</b> 次机会。每次输入一个成语，格子会告诉你哪些字、哪些拼音猜对了。</p>
  ${DICT['画龙点睛'] && DICT['一丝不苟'] ? ex('画龙点睛', '一丝不苟') : ''}
  <p><b class="c-no">灰色</b>：答案里没有这个字或这部分拼音。</p>
  ${DICT['一言为定'] ? ex('一言为定', '一丝不苟') : ''}
  <p><b class="c-ok">绿色格子</b>：字和位置都对了。拼音的<b>声母、韵母、声调</b>也分别标色：绿色是位置正确，<b class="c-mid">橙色</b>是答案里有、但在别的位置。</p>
  ${DICT['不屈不挠'] ? ex('不屈不挠', '一丝不苟') : ''}
  <p><b class="c-mid">橙色字</b>：答案里有这个字，但不在这里。</p>
  <p>输入框支持拼音首字母，比如输入 <b>hlds</b> 会提示“画龙点睛”。卡住了可以看释义或揭一个字。</p>
  <p style="color:var(--ink3);font-size:13px">“每日一题”所有人同一天是同一个成语；“自由练习”不限次数。</p></div>`);
}
function stats() {
  const max = Math.max(1, ...Object.values(ST.dist));
  const pct = ST.played ? Math.round(ST.won / ST.played * 100) : 0;
  modal(`<h3>每日一题统计</h3>
  <div class="sgrid"><div><b>${ST.played}</b><span>参与</span></div><div><b>${pct}</b><span>胜率 %</span></div><div><b>${ST.streak}</b><span>连胜</span></div><div><b>${ST.best}</b><span>最长连胜</span></div></div>
  <h3 style="font-size:15px">猜中所用次数</h3>
  <div class="dist">${Array.from({ length: MAX }, (_, i) => i + 1).map(i => { const v = ST.dist[i] || 0; const cw = MODE === 'daily' && DAILY.won && DAILY.guesses.length === i; return `<div><i>${i}</i><em class="${cw ? 'cur' : ''}" style="width:${Math.max(7, v / max * 100)}%">${v}</em></div>`; }).join('')}</div>
  <p style="font-size:13px;color:var(--ink3);margin-top:18px" class="sfree">自由练习：${ST.free.played} 题，猜中 ${ST.free.won} 题 · 接龙纪录 ${ST.chainBest||0} · 辨析 ${ST.quiz.ok}/${ST.quiz.n} · 成语集 ${Object.keys(ST.book).length} 个</p>`);
  Motion.countUp($('#mcard'), '.sgrid b', 600);
}
function settings() {
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(SET[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  modal(`<h3>设置</h3>
  <div class="setrow"><div>外观</div>${seg('theme', [['', '跟随系统'], ['light', '浅色'], ['dark', '深色']])}</div>
  <div class="setrow"><div>拼音提示<small>关闭后只看汉字，更难</small></div>${seg('py', [[1, '显示'], [0, '隐藏']])}</div>
  <div class="setrow"><div>练习词库<small>常用约 1500 个，进阶约 3600 个</small></div>${seg('tier', [['easy', '常用'], ['hard', '进阶']])}</div>
  <div class="setrow"><div>清除记录<small>删除本机上的统计与成语集</small></div><button class="btn" id="reset" style="padding:7px 14px;font-size:13px">清除</button></div>`);
  $$('.seg button', $('#mcard')).forEach(b => b.onclick = () => {
    const k = b.parentElement.dataset.k; SET[k] = k === 'py' ? +b.dataset.v : b.dataset.v; sv('sizi.set', SET); applyTheme(); settings(); render();
  });
  $('#reset').onclick = () => { if (confirm('确定清除全部记录？')) { ['sizi.stats', 'sizi.daily', 'sizi.free'].forEach(k => localStorage.removeItem(k)); location.reload(); } };
}
function applyTheme() { const t = SET.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#141817' : '#f6f4ee'; }
function setMode(m) { MODE = m; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); history.replaceState(null, '', m === 'daily' ? './' : '#' + m); render(); window.scrollTo(0, 0); Motion.enter(main); if (m === 'book') Motion.stagger(main, '.bi, .todayw', 26, 14); if (m === 'quiz') Motion.stagger(main, '.qo', 40, 8); if (m === 'chain') Motion.stagger(main, '.cw', 24, 10); }
$$('#tabs button').forEach(b => b.onclick = () => setMode(b.dataset.m));
$('#bHelp').onclick = help; $('#bStats').onclick = stats; $('#bSet').onclick = settings;

applyTheme();
main.innerHTML = '<div class="loading">正在翻词典…</div>';
load().then(() => {
  const h = location.hash.slice(1); if (['free', 'book', 'chain', 'quiz'].includes(h)) MODE = h;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === MODE));
  render();
  const f = document.createElement('footer'); f.className = 'foot';
  f.innerHTML = '成语释义整理自开源项目 <a href="https://github.com/mapull/chinese-dictionary" target="_blank" rel="noopener">chinese-dictionary</a>，常用度参考清华大学 THUOCL 词频。<br>记录只保存在本机浏览器中。';
  document.body.appendChild(f);
  if (!localStorage.getItem('sizi.seen')) { localStorage.setItem('sizi.seen', '1'); help(); }
}).catch(() => { main.innerHTML = '<div class="loading">词典没有加载成功，请刷新重试</div>'; });
Motion.pills([{ sel: '#tabs' }, { sel: '#mcard .seg', keep: true }]);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
