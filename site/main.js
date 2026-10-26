'use strict';
/* ═══════════════════════════════════════════════════════════════════
   Ryan Fontes · Camisa 10 do Backend
   Vanilla JS, sem build. Cada bloco abaixo é uma "posição" do time.
   ═══════════════════════════════════════════════════════════════════ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = { yellow: '#ffdf00', green: '#009c3b', blue: '#1f4fbf', navy: '#002776' };
const GITHUB_USER = 'RFontes13RF';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
};

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ─── Sprites em pixel art (16 × 23) ──────────────────────────────── */

const HEAD = [
  '......hhhh......',
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '...hhhsssssh....',
  '...hhssssesss...',
  '...hsssssssss...',
  '....sssssss.....',
  '.....ssss.......',
];
const BODY = [
  '...gyyyyyyyg....',
  '..yyyyyyyyyyy...',
  '..yyyyyggyyyy...',
  '.syyyyyyyyyyys..',
  '.ssyyyyyyyyyss..',
  '.ss.yyyyyyy.ss..',
  '.s..yyyyyyy..s..',
  '....ggggggg.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbb.bbb.....',
];
const LEGS_IDLE = ['....sss.sss.....', '....www.www.....', '....www.www.....', '...kkkk.kkkk....'];
const LEGS_KICK = ['....sss..ssss...', '....www...wwww..', '....www.....wkkk', '...kkkk.......kk'];
const KEEPER_BODY = BODY.map((r, i) => (i === 5 || i === 6 ? r.replace(/s/g, 'G') : r));
const PAL = { h: '#24160e', s: '#c98a5a', e: '#111', y: C.yellow, g: C.green, b: C.blue, w: '#f2f2f2', k: '#111', G: '#f2f2f2' };
const KPAL = { ...PAL, y: '#ff6b35', g: '#1b1b1b', b: '#1b1b1b', h: '#111' };

function sprite(rows, pal) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((row, j) => [...row.padEnd(16, '.')].forEach((ch, i) => {
    if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); }
  }));
  return c;
}
const SPR = {
  idle: sprite([...HEAD, ...BODY, ...LEGS_IDLE], PAL),
  kick: sprite([...HEAD, ...BODY, ...LEGS_KICK], PAL),
  keeper: sprite([...HEAD, ...KEEPER_BODY, ...LEGS_IDLE], KPAL),
};

/* ─── Som (Web Audio, sintetizado — nenhum arquivo) ───────────────── */

const Sound = (() => {
  let ctx = null;
  let on = store.get('sound', false);
  const btn = $('#sound');

  function ac() {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      ctx = new A();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function render() {
    btn.textContent = on ? '🔊' : '🔇';
    btn.setAttribute('aria-label', on ? 'Desligar som' : 'Ligar som');
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay, len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  }
  function whistle() {
    if (!on) return;
    const a = ac(); if (!a) return;
    [[0, 0.22], [0.32, 0.6]].forEach(([w, d]) => {
      const t = a.currentTime + w;
      const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain();
      o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.setValueAtTime(0.07, t + d - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(a.destination);
      o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
    });
  }

  btn.addEventListener('click', () => {
    on = !on;
    store.set('sound', on);
    render();
    if (on) { whistle(); toast('🔊 Som ligado. A torcida agradece!'); }
  });
  render();

  return {
    whistle,
    kick() { if (on) { tone(150, 0.18, 'sine', 0.5, 50); noise(0.06, 0.2, 2000); } },
    roar() { if (on) { noise(2.8, 0.35, 700); noise(2.2, 0.18, 1500, 0.15); } },
    ooh() { if (on) noise(1.3, 0.2, 450); },
    post() { if (on) { tone(1800, 0.5, 'triangle', 0.12, 1700); tone(2400, 0.4, 'sine', 0.06); } },
    blip() { if (on) tone(880, 0.08, 'square', 0.04); },
  };
})();

/* ─── Confete + tela de GOL ───────────────────────────────────────── */

const FX = (() => {
  const cv = $('#fx'), ctx = cv.getContext('2d');
  const COLORS = [C.yellow, C.yellow, C.green, '#3b82f6', '#ffffff', '#ff6b35'];
  let parts = [], running = false, last = 0;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener('resize', size);

  function add(x, y, vx, vy) {
    parts.push({ x, y, vx, vy, r: rand(0, 6.28), vr: rand(-10, 10), w: rand(6, 11), h: rand(3, 6), c: pick(COLORS), life: rand(2.5, 4.5) });
  }
  function go() {
    if (running) return;
    running = true; last = performance.now();
    requestAnimationFrame(step);
  }
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => (p.life -= dt) > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += 700 * dt; p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.r * 2));
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(step);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  return {
    burst(x, y, n = 120) {
      for (let i = 0; i < (REDUCED ? 20 : n); i++) {
        const a = rand(0, Math.PI * 2), s = rand(250, 900);
        add(x, y, Math.cos(a) * s, Math.sin(a) * s - 400);
      }
      go();
    },
    rain(n = 200) {
      for (let i = 0; i < (REDUCED ? 30 : n); i++) add(rand(0, innerWidth), rand(-innerHeight * 0.7, -10), rand(-80, 80), rand(60, 260));
      go();
    },
  };
})();

function golShow(word = 'GOOOOL!', sub = '') {
  const g = $('#gol');
  g.innerHTML = `<div><div class="word">${[...word].map((c, i) => `<span style="animation-delay:${-i * 0.08}s">${esc(c)}</span>`).join('')}</div>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;
  g.classList.remove('show');
  void g.offsetWidth;
  g.classList.add('show');
  FX.burst(innerWidth / 2, innerHeight * 0.45, 160);
  FX.rain(140);
  Sound.roar();
}

/* ─── Intro: os times entram em campo ─────────────────────────────── */

(function intro() {
  const el = $('#intro');
  let seen = false;
  try { seen = sessionStorage.getItem('intro') === '1'; sessionStorage.setItem('intro', '1'); } catch { /* ok */ }
  if (seen || REDUCED) { el.classList.add('gone'); return; }
  setTimeout(() => { el.classList.add('open'); Sound.whistle(); }, 1300);
  setTimeout(() => el.classList.add('gone'), 2400);
})();

/* ─── Cursor de bola ──────────────────────────────────────────────── */

(function cursor() {
  if (!matchMedia('(pointer: fine)').matches || REDUCED) return;
  const c = $('#cursor');
  document.body.classList.add('has-cursor');
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, rot = 0;
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
    c.classList.toggle('big', !!e.target.closest('a, button, .card-wrap'));
  });
  (function loop() {
    const dx = tx - x;
    x += dx * 0.35; y += (ty - y) * 0.35; rot += dx * 0.9;
    c.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
    requestAnimationFrame(loop);
  })();
})();

/* ─── Placar: relógio da partida = progresso da rolagem ───────────── */

(function scoreboard() {
  const clock = $('#clock'), prog = $('.progress');
  const links = $$('.board nav a');
  const secs = links.map((a) => $(a.getAttribute('href')));
  let halftime = false;

  function update(fromScroll) {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    const m = Math.round(p * 93);
    clock.textContent = p > 0.995 ? "FIM 90+3'"
      : m <= 45 ? `1ºT ${String(m).padStart(2, '0')}'`
      : m <= 90 ? `2ºT ${m}'` : `2ºT 90+${m - 90}'`;
    prog.style.setProperty('--p', `${p * 100}%`);
    prog.style.setProperty('--r', `${p * 1440}deg`);
    if (fromScroll && m >= 45 && !halftime) {
      halftime = true;
      toast('⏸️ Intervalo! Hidrata aí 💧 e bora pro 2º tempo');
    }
    let cur = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * 0.4) cur = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === cur));
  }
  addEventListener('scroll', () => update(true), { passive: true });
  addEventListener('resize', () => update(false));
  update(false);
})();

/* ─── Texto digitando ─────────────────────────────────────────────── */

(function typer() {
  const el = $('#typer');
  const words = ['Backend Developer', 'Python · FastAPI · Django', 'APIs, dados & IA', 'Camisa 10 do backend ⚽'];
  if (REDUCED) { el.textContent = words[0]; return; }
  let w = 0, i = 0, del = false;
  (function tick() {
    const s = [...words[w]];
    i += del ? -1 : 1;
    el.textContent = s.slice(0, i).join('');
    let d = del ? 35 : 75;
    if (!del && i === s.length) { del = true; d = 1700; } else if (del && i === 0) { del = false; w = (w + 1) % words.length; d = 300; }
    setTimeout(tick, d);
  })();
})();

/* ─── Revelar ao rolar ────────────────────────────────────────────── */

const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); }
}), { threshold: 0.12 });
const reveal = (el) => revealer.observe(el);
$$('.reveal').forEach(reveal);

/* ═══ HERO: o estádio ════════════════════════════════════════════════ */

(function stadium() {
  const cv = $('#stadium'), ctx = cv.getContext('2d');
  const G = 1600;
  const SHIRTS = [C.yellow, C.yellow, C.green, C.green, C.blue, '#ffffff', '#ffb703'];
  const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
  const LED = 'RYAN FONTES ★ BACKEND DEVELOPER ★ PYTHON ★ FASTAPI ★ DJANGO ★ POSTGRESQL ★ DOCKER ★ INSPER ★ ';
  const LED_GOL = 'GOOOOOOL ⚽ GOOOOOOL ⚽ GOOOOOOL ⚽ ';

  let W = 0, H = 0, S = 4, mobile = false;
  let standsTop, horizon, boardH, groundY, goal, player, keeper;
  let fans = [], stars = [], visible = true, t = 0, last = 0;
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 8, rot: 0 };
  let state = 'juggle', stateT = 0, kickPose = 0, restT = 0, celebrate = 0, golBoard = 0, bulge = 0;
  const shot = { react: 0, resolved: false, willSave: false };
  let tifo = 0, tifoClicks = 0, tifoReady = false, kicked = false;
  let goals = store.get('goals', 0), saves = store.get('saves', 0);
  $('#goals').textContent = goals;
  $('#saves').textContent = saves;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mobile = W < 760;
    standsTop = H * (mobile ? 0.5 : 0.24);
    horizon = H * (mobile ? 0.66 : 0.68);
    boardH = Math.max(18, Math.round(H * 0.034));
    groundY = H * (mobile ? 0.9 : 0.91);
    S = clamp(Math.round(H / (mobile ? 200 : 180)), 3, 6);
    player = { x: mobile ? W * 0.16 : W * 0.58, w: 16 * S, h: 23 * S };
    player.y = groundY - player.h;
    const gw = Math.max(44, S * 13), gh = Math.round(player.h * 1.45);
    goal = { x: W - gw - (mobile ? 6 : Math.max(24, W * 0.04)), w: gw, h: gh, top: groundY - gh, bar: Math.max(4, S) };
    const ks = Math.max(2, S - 1.5);
    keeper = { s: ks, w: 16 * ks, h: 23 * ks, x: 0, y: 0, base: 0, target: 0 };
    keeper.x = goal.x - keeper.w * 0.55;
    keeper.base = keeper.y = keeper.target = groundY - keeper.h;
    ball.r = Math.max(6, S * 1.7);

    fans = [];
    const step = mobile ? 7 : 8;
    for (let y = standsTop + 12, row = 0; y < horizon - 6; y += step, row++) {
      for (let x = (row % 2) * (step / 2); x < W; x += step) {
        fans.push({ x, y, c: Math.floor(Math.random() * SHIRTS.length), k: Math.floor(Math.random() * SKINS.length), ph: rand(0, 6.28), m: false });
      }
    }
    stars = Array.from({ length: Math.round((W * standsTop) / 7000) }, () => ({ x: rand(0, W), y: rand(0, standsTop * 0.95), p: rand(0, 6.28), s: rand(0.6, 1.7) }));
    tifoReady = false;
    if (state !== 'free' && state !== 'goal') state = 'juggle';
  }

  /* Mosaico da torcida (easter egg): escreve "RYAN 10" com os torcedores */
  function buildTifo() {
    const h = horizon - standsTop, oc = document.createElement('canvas');
    oc.width = Math.ceil(W); oc.height = Math.ceil(h);
    const o = oc.getContext('2d');
    let fs = h * 0.78;
    o.font = `${fs}px Anton, Impact, sans-serif`;
    const tw = o.measureText('RYAN 10').width;
    fs = Math.min(fs, (fs * W * 0.86) / tw);
    o.font = `${fs}px Anton, Impact, sans-serif`;
    o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    o.fillText('RYAN 10', W / 2, h / 2 + fs * 0.04);
    const data = o.getImageData(0, 0, oc.width, oc.height).data;
    for (const f of fans) {
      const px = Math.floor(f.x), py = Math.floor(f.y - standsTop);
      f.m = data[(py * oc.width + px) * 4 + 3] > 120;
    }
    tifoReady = true;
  }

  const foot = () => ({ x: player.x + 14 * S, y: player.y + 21 * S });

  function kick(px, py) {
    if (state === 'goal') return;
    const dx = px - ball.x, dy = py - ball.y, d = Math.hypot(dx, dy) || 1;
    const T = clamp(d / 950, 0.3, 1);
    ball.vx = dx / T;
    ball.vy = dy / T - 0.5 * G * T;
    state = 'free'; stateT = 0; restT = 0; kickPose = 0.25;
    // o goleiro só "lê" ~1 em cada 4 chutes; nos outros ele pula pro lado errado
    shot.resolved = false; shot.react = 0.1; shot.willSave = Math.random() < 0.25;
    Sound.kick();
    if (!kicked) { kicked = true; $('#hint').classList.add('off'); }
  }

  function scored() {
    state = 'goal'; stateT = 0; celebrate = 3.2; golBoard = 3.5; bulge = 1;
    goals++; store.set('goals', goals); $('#goals').textContent = goals;
    golShow('GOOOOL!', goals === 1 ? 'Seu primeiro gol no estádio do Ryan!' : `Já são ${goals} gols seus por aqui`);
  }

  function saved() {
    shot.resolved = true;
    saves++; store.set('saves', saves); $('#saves').textContent = saves;
    ball.vx = -Math.abs(ball.vx) * 0.4 - 120;
    ball.vy = -Math.abs(ball.vy) * 0.3 - 250;
    toast(pick(['🧤 Defendeu! O goleiro do BUGS FC pegou essa.', '🧤 Que defesa! Tenta no ângulo.', '🧤 Espalmou! Mira longe do goleiro.']));
    Sound.ooh();
  }

  function physics(dt) {
    stateT += dt;
    kickPose = Math.max(0, kickPose - dt);
    celebrate = Math.max(0, celebrate - dt);
    golBoard = Math.max(0, golBoard - dt);
    bulge = Math.max(0, bulge - dt * 1.6);
    if (tifo > 0) tifo = Math.max(0, tifo - dt);

    const f = foot();
    if (state === 'juggle') {
      const P = 0.72, n = Math.floor(t / P), ph = (t % P) / P;
      const hgt = (n % 4 === 3 ? player.h * 0.95 : player.h * 0.5) * Math.sin(ph * Math.PI);
      ball.x = f.x + 2; ball.y = f.y - ball.r - hgt;
      ball.rot += dt * 5;
      if (ph < 0.14 || ph > 0.92) kickPose = 0.05;
    } else if (state === 'return') {
      const k = Math.min(1, dt * 5);
      ball.x += (f.x - ball.x) * k; ball.y += (f.y - ball.r - ball.y) * k; ball.rot -= dt * 8;
      if (Math.hypot(f.x - ball.x, f.y - ball.r - ball.y) < 4) state = 'juggle';
    } else {
      const px = ball.x, py = ball.y;
      ball.vy += G * dt;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      ball.rot += (ball.vx * dt) / ball.r;
      const r = ball.r;

      // chão
      if (ball.y + r > groundY) {
        ball.y = groundY - r;
        ball.vy = Math.abs(ball.vy) < 90 ? 0 : -ball.vy * 0.55;
        ball.vx *= 0.82;
      }
      if (ball.y + r >= groundY - 0.5) ball.vx *= 1 - 1.8 * dt;
      // paredes
      if (ball.x - r < 0) { ball.x = r; ball.vx = Math.abs(ball.vx) * 0.6; }
      if (ball.x + r > W) { ball.x = W - r; ball.vx = -Math.abs(ball.vx) * 0.6; }
      if (ball.y - r < 0) { ball.y = r; ball.vy = Math.abs(ball.vy) * 0.5; }

      if (state === 'free') {
        // goleiro
        const kx0 = keeper.x + keeper.s * 4, kx1 = keeper.x + keeper.w - keeper.s * 4;
        if (!shot.resolved && ball.vx > 0 && ball.x + r > kx0 && ball.x - r < kx1 && ball.y + r > keeper.y + keeper.s * 2 && ball.y - r < keeper.y + keeper.h) saved();
        // travessão / gol / teto da rede
        const plane = goal.x + goal.bar;
        if (px + r <= plane && ball.x + r > plane && ball.y > goal.top - r) {
          if (ball.y - r > goal.top + goal.bar) scored();
          else if (Math.abs(ball.y - (goal.top + goal.bar / 2)) < r + goal.bar / 2) {
            ball.x = plane - r; ball.vx = -Math.abs(ball.vx) * 0.55; ball.vy *= -0.6;
            toast('🥅 NA TRAVE! Quaaase…'); Sound.post(); shot.resolved = true;
          }
        }
        if (ball.x > goal.x && ball.x < goal.x + goal.w && py + r <= goal.top && ball.y + r > goal.top) {
          ball.y = goal.top - r; ball.vy = -Math.abs(ball.vy) * 0.3;
        }
        const back = goal.x + goal.w;
        if (px - r >= back && ball.x - r < back && ball.y > goal.top) { ball.x = back + r; ball.vx = Math.abs(ball.vx) * 0.5; }
        // bola parada → volta pro craque
        if (Math.hypot(ball.vx, ball.vy) < 50) restT += dt; else restT = 0;
        if (restT > 1 || stateT > 7) state = 'return';
      } else if (state === 'goal') {
        // dentro da rede
        ball.vx *= 1 - 3 * dt;
        if (ball.x + r > goal.x + goal.w) { ball.x = goal.x + goal.w - r; ball.vx = -Math.abs(ball.vx) * 0.2; }
        if (ball.y - r < goal.top + goal.bar) { ball.y = goal.top + goal.bar + r; ball.vy = Math.abs(ball.vy) * 0.3; }
        if (stateT > 2.2) state = 'return';
      }
    }

    // goleiro: ou voa na bola, ou se compromete com o lado errado
    shot.react -= dt;
    if (state === 'free' && !shot.resolved && ball.vx > 0 && ball.x < keeper.x) {
      if (shot.react <= 0) {
        const tt = (keeper.x - ball.x) / ball.vx;
        const py = ball.y + ball.vy * tt + 0.5 * G * tt * tt;
        const low = py + ball.r > keeper.base - keeper.s * 4; // bateria no goleiro parado
        keeper.target = shot.willSave
          ? clamp(py - keeper.h * 0.4, goal.top - keeper.h * 0.1, keeper.base)
          : low ? goal.top - keeper.h * 0.05 : keeper.base;
      }
    } else if (state !== 'free' || stateT > 1.2) keeper.target = keeper.base;
    const sp = 700 * (S / 4) * dt;
    keeper.y += clamp(keeper.target - keeper.y, -sp, sp * 1.4);
  }

  /* ── Desenho ── */

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#02040a'); g.addColorStop(1, '#0c1834');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.p));
      ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // lua
    const mx = W * (mobile ? 0.86 : 0.78), my = standsTop * (mobile ? 0.2 : 0.32), mr = Math.max(14, H * 0.028);
    const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
    mg.addColorStop(0, 'rgba(255,248,214,.25)'); mg.addColorStop(1, 'rgba(255,248,214,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8dcb0'; ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, 7); ctx.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, 7); ctx.fill();
  }

  function drawLights() {
    const towers = mobile ? [W * 0.06, W * 0.94] : [W * 0.05, W * 0.33, W * 0.95];
    const ly = standsTop - H * (mobile ? 0.1 : 0.09);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    towers.forEach((x, i) => {
      const sway = Math.sin(t * 0.6 + i) * W * 0.02;
      const tx = W / 2 + (x - W / 2) * 0.2 + sway;
      const g = ctx.createLinearGradient(x, ly, tx, groundY);
      g.addColorStop(0, 'rgba(255,250,225,.17)'); g.addColorStop(1, 'rgba(255,250,225,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 10, ly); ctx.lineTo(x + 10, ly);
      ctx.lineTo(tx + W * 0.2, groundY + 30); ctx.lineTo(tx - W * 0.2, groundY + 30); ctx.closePath(); ctx.fill();
      const halo = ctx.createRadialGradient(x, ly, 2, x, ly, 70);
      halo.addColorStop(0, 'rgba(255,252,230,.9)'); halo.addColorStop(1, 'rgba(255,252,230,0)');
      ctx.fillStyle = halo; ctx.fillRect(x - 70, ly - 70, 140, 140);
    });
    ctx.restore();
    towers.forEach((x) => {
      ctx.fillStyle = '#1b2438'; ctx.fillRect(x - 2, ly + 8, 4, standsTop - ly);
      ctx.fillStyle = '#2a3550'; ctx.fillRect(x - 16, ly - 8, 32, 18);
      ctx.fillStyle = '#fffbe6';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ctx.fillRect(x - 13 + i * 7, ly - 5 + j * 7, 5, 5);
    });
  }

  function drawStands() {
    const g = ctx.createLinearGradient(0, standsTop, 0, horizon);
    g.addColorStop(0, '#0d1528'); g.addColorStop(1, '#060a14');
    ctx.fillStyle = g; ctx.fillRect(0, standsTop, W, horizon - standsTop);
    ctx.fillStyle = '#1e2a44'; ctx.fillRect(0, standsTop - 4, W, 4);

    const tifoOn = tifo > 0 && tifoReady, prog = tifoOn ? clamp((7 - tifo) / 0.8, 0, 1) : 0;
    const jump = celebrate > 0 ? Math.min(1, celebrate) : 0;
    const bodies = SHIRTS.map(() => new Path2D()), heads = SKINS.map(() => new Path2D());
    const cards = [new Path2D(), new Path2D()], flashes = new Path2D();
    for (const f of fans) {
      let off = -Math.pow(Math.max(0, Math.sin(t * 2.2 - f.x * 0.011)), 4) * 6;
      if (jump) off -= Math.abs(Math.sin(t * 11 + f.ph)) * 6 * jump;
      if (tifoOn && f.x / W < prog * 1.2) {
        cards[f.m ? 0 : 1].rect(f.x - 3.5, f.y - 6, 7, 8);
        continue;
      }
      bodies[f.c].rect(f.x - 3, f.y - 1 + off, 6, 5);
      heads[f.k].rect(f.x - 1.5, f.y - 4.5 + off, 3, 3);
      if (Math.random() < (celebrate > 0 ? 0.01 : 0.0012)) flashes.rect(f.x - 1, f.y - 9 + off, 2, 2);
    }
    bodies.forEach((p, i) => { ctx.fillStyle = SHIRTS[i]; ctx.globalAlpha = 0.62; ctx.fill(p); });
    ctx.globalAlpha = 0.75;
    heads.forEach((p, i) => { ctx.fillStyle = SKINS[i]; ctx.fill(p); });
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.yellow; ctx.fill(cards[0]);
    ctx.fillStyle = '#0b7a34'; ctx.fill(cards[1]);
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; ctx.fill(flashes); ctx.shadowBlur = 0;
  }

  let ledW = 0, ledFont = '';
  function drawBoard() {
    const y = horizon, h = boardH;
    ctx.fillStyle = '#000'; ctx.fillRect(0, y, W, h);
    const gol = golBoard > 0, txt = gol ? LED_GOL : LED;
    const font = `${Math.round(h * 0.48)}px "Press Start 2P", monospace`;
    ctx.font = font;
    if (font + txt !== ledFont) { ledFont = font + txt; ledW = ctx.measureText(txt).width; }
    ctx.textBaseline = 'middle';
    ctx.fillStyle = gol ? (Math.floor(t * 8) % 2 ? C.yellow : '#ff4d5e') : C.yellow;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    const off = -((t * (gol ? 220 : 70)) % ledW);
    for (let x = off; x < W; x += ledW) ctx.fillText(txt, x, y + h / 2 + 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    for (let x = 0; x < W; x += 3) ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#1e2a44'; ctx.fillRect(0, y + h, W, 2);
  }

  function drawPitch() {
    const top = horizon + boardH + 2;
    const vpx = W / 2, vpy = top - H * 0.9;
    const k = (top - vpy) / (H - vpy);
    const sw = Math.max(70, W / 12);
    for (let i = -4, n = 0; i * sw < W + sw * 4; i++, n++) {
      const xb0 = i * sw, xb1 = xb0 + sw;
      ctx.fillStyle = n % 2 ? '#14632f' : '#177636';
      ctx.beginPath();
      ctx.moveTo(vpx + (xb0 - vpx) * k, top); ctx.lineTo(vpx + (xb1 - vpx) * k, top);
      ctx.lineTo(xb1, H); ctx.lineTo(xb0, H); ctx.closePath(); ctx.fill();
    }
    const sh = ctx.createLinearGradient(0, top, 0, H);
    sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(0.4, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = sh; ctx.fillRect(0, top, W, H - top);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(0, groundY + 2, W, 2);
    ctx.fillRect(0, top + (groundY - top) * 0.35, W, 1.5);
    // escanteio + marca do pênalti
    ctx.beginPath(); ctx.ellipse(goal.x - goal.w * 2.4, groundY - (groundY - top) * 0.2, 4, 2, 0, 0, 7); ctx.fill();
  }

  function drawGoal(front) {
    const { x, w, h, top, bar } = goal;
    if (!front) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, top, w, h); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      const b = bulge * 10;
      for (let i = -h; i < w + h; i += 7) {
        ctx.beginPath(); ctx.moveTo(x + i + b, top); ctx.lineTo(x + i + h + b, groundY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + i + b, groundY); ctx.lineTo(x + i + h + b, top); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(220,220,220,.7)';
      ctx.fillRect(x + w - 2, top + 6, 2, h - 6);
      ctx.fillRect(x, top, w, 2);
      return;
    }
    ctx.fillStyle = '#f5f5f5';
    ctx.shadowColor = 'rgba(255,255,255,.6)'; ctx.shadowBlur = 6;
    ctx.fillRect(x, top, bar, h);
    ctx.fillRect(x, top, w * 0.92, bar);
    ctx.shadowBlur = 0;
  }

  function drawSprite(img, x, y, s, flip, rot = 0) {
    const w = 16 * s, h = img.height * s;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x + w / 2, y + h / 2);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function shadow(x, y, w, alpha = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.22, 0, 0, 7); ctx.fill();
  }

  function drawPeople() {
    // goleiro
    const air = keeper.base - keeper.y;
    shadow(keeper.x + keeper.w / 2, groundY + 2, keeper.w * 0.4 * (1 - Math.min(0.6, air / 200)));
    const sway = air < 2 ? Math.sin(t * 3) * keeper.s : 0;
    drawSprite(SPR.keeper, keeper.x + sway, keeper.y, keeper.s, true, -Math.min(1.1, air / keeper.h) * 0.9);

    // craque
    const hop = celebrate > 0 ? -Math.abs(Math.sin(t * 9)) * player.h * 0.22 : 0;
    shadow(player.x + player.w * 0.5, groundY + 2, player.w * 0.42);
    drawSprite(kickPose > 0 ? SPR.kick : SPR.idle, player.x, player.y + hop, S, false);
    // plaquinha
    const tag = 'RYAN 10', fs = Math.max(7, S * 1.7);
    ctx.font = `${fs}px "Press Start 2P", monospace`;
    const tw = ctx.measureText(tag).width + 10, tx = player.x + player.w / 2 - tw / 2, ty = player.y + hop - fs - 14;
    ctx.fillStyle = C.navy; ctx.fillRect(tx, ty, tw, fs + 8);
    ctx.strokeStyle = C.yellow; ctx.lineWidth = 1.5; ctx.strokeRect(tx, ty, tw, fs + 8);
    ctx.fillStyle = C.yellow; ctx.textBaseline = 'middle'; ctx.fillText(tag, tx + 5, ty + (fs + 8) / 2 + 1);
    ctx.beginPath(); ctx.moveTo(tx + tw / 2 - 4, ty + fs + 8); ctx.lineTo(tx + tw / 2 + 4, ty + fs + 8); ctx.lineTo(tx + tw / 2, ty + fs + 13); ctx.fill();
  }

  function drawBall() {
    const r = ball.r, hgt = groundY - (ball.y + r);
    shadow(ball.x, groundY + 2, r * clamp(1 - hgt / 300, 0.3, 1), 0.4);
    ctx.save();
    ctx.translate(ball.x, ball.y); ctx.rotate(ball.rot);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38); }
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.24, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function frame(now) {
    if (!visible) return;
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now; t += dt;
    physics(dt);
    ctx.clearRect(0, 0, W, H);
    drawSky(); drawLights(); drawStands(); drawBoard(); drawPitch();
    drawGoal(false); drawPeople(); drawBall(); drawGoal(true);
    requestAnimationFrame(frame);
  }

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (py > standsTop && py < horizon && !(py > horizon - 4)) {
      if (tifo > 0) return;
      tifoClicks++;
      if (tifoClicks < 3) { toast(`📣 A torcida tá esquentando… (${tifoClicks}/3)`); return; }
      tifoClicks = 0;
      buildTifo(); tifo = 7;
      toast('📣 MOSAICO DA TORCIDA!'); Sound.roar();
      return;
    }
    kick(px, py);
  });

  addEventListener('resize', resize);
  resize();
  if (mobile) $('#hint').textContent = '👆 Toque no campo pra chutar!';
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(cv);
  document.fonts && document.fonts.ready.then(() => { ledFont = ''; });
})();

/* ═══ FICHA: carta do jogador ════════════════════════════════════════ */

(function card() {
  const wrap = $('#cardWrap'), fut = $('#fut'), cs = $('#cardSprite').getContext('2d');
  cs.imageSmoothingEnabled = false;
  cs.drawImage(SPR.idle, 0, 0, 160, 230);
  wrap.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = fut.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    fut.style.setProperty('--ry', `${(x - 0.5) * 26}deg`);
    fut.style.setProperty('--rx', `${(0.5 - y) * 20}deg`);
    fut.style.setProperty('--mx', `${x * 100}%`);
    fut.style.setProperty('--my', `${y * 100}%`);
  });
  wrap.addEventListener('pointerleave', () => { fut.style.setProperty('--ry', '0deg'); fut.style.setProperty('--rx', '0deg'); });
  wrap.addEventListener('click', () => { fut.classList.toggle('flipped'); Sound.blip(); });
})();

/* ═══ ESCALAÇÃO: o stack em campo ════════════════════════════════════ */

(function lineup() {
  const DEV = 'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/';
  const TECH = {
    python: { n: 'Python', i: 'python/python-original.svg', cap: true, r: 'Camisa 9 e capitão. Faz gol de tudo quanto é jeito: API, script, automação e análise de dados.' },
    fastapi: { n: 'FastAPI', i: 'fastapi/fastapi-original.svg', r: 'Ponta veloz. APIs assíncronas que chegam antes da marcação, com documentação automática.' },
    javascript: { n: 'JavaScript', i: 'javascript/javascript-original.svg', r: 'Ponta-esquerda driblador: leva a jogada até a tela do usuário. Em treino (nível básico).' },
    django: { n: 'Django', i: 'django/django-plain.svg', r: 'Meia armador. Organiza o jogo com ORM, admin e Django REST Framework.' },
    pandas: { n: 'Pandas', i: 'pandas/pandas-original.svg', r: 'Volante que limpa, filtra e organiza tudo no meio-campo dos dataframes.' },
    numpy: { n: 'NumPy', i: 'numpy/numpy-original.svg', r: 'Meia de cálculo rápido: vetoriza a jogada e não perde tempo com laço.' },
    mysql: { n: 'MySQL', i: 'mysql/mysql-original.svg', r: 'Zagueiro clássico. Segura os dados com transações e não deixa nada passar.' },
    flask: { n: 'Flask', i: 'flask/flask-original.svg', r: 'Zagueiro leve que sai jogando: microframework que serve a API do meu projeto em React.' },
    docker: { n: 'Docker', i: 'docker/docker-original.svg', r: 'Lateral que carrega o time inteiro pra qualquer campo, do jeitinho que treinou.' },
    react: { n: 'React', i: 'react/react-original.svg', r: 'Lateral que apoia o ataque montando a interface. Estreando no projeto atual.' },
    git: { n: 'Git', i: 'git/git-original.svg', gk: true, r: 'Goleiro. Já salvou o time de muito commit errado com um bom revert.' },
  };
  const FORMS = {
    '4-3-3': { git: [50, 90], react: [14, 70], mysql: [37, 75], flask: [63, 75], docker: [86, 70], pandas: [25, 50], django: [50, 55], numpy: [75, 50], javascript: [18, 24], python: [50, 17], fastapi: [82, 24] },
    '4-4-2': { git: [50, 90], react: [14, 70], mysql: [37, 75], flask: [63, 75], docker: [86, 70], pandas: [14, 46], django: [38, 51], numpy: [62, 51], javascript: [86, 46], python: [38, 20], fastapi: [62, 20] },
  };
  const PLAY = ['git', 'mysql', 'django', 'fastapi', 'python'];
  const pitch = $('#pitch'), path = $('#playPath'), pball = $('#pball'), btn = $('#formationBtn');
  let form = '4-3-3', started = false;
  const tokens = {};

  Object.entries(TECH).forEach(([id, d]) => {
    const b = document.createElement('button');
    b.className = `token${d.gk ? ' gk' : ''}`;
    b.style.left = '50%'; b.style.top = '106%';
    b.innerHTML = `<span class="face"><img src="${DEV}${d.i}" alt="" loading="lazy">${d.cap ? '<span class="cap">C</span>' : ''}</span><span class="nm">${d.n}</span>`;
    b.setAttribute('aria-label', d.n);
    const show = () => {
      Object.values(tokens).forEach((t) => t.classList.remove('on'));
      b.classList.add('on');
      $('#roleName').textContent = d.n;
      $('#roleText').textContent = d.r;
    };
    b.addEventListener('mouseenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('click', () => { show(); Sound.blip(); });
    pitch.appendChild(b);
    tokens[id] = b;
  });
  tokens.python.classList.add('on');

  function place(stagger) {
    Object.entries(FORMS[form]).forEach(([id, [x, y]], i) => {
      setTimeout(() => { tokens[id].style.left = `${x}%`; tokens[id].style.top = `${y}%`; }, stagger ? i * 90 : 0);
    });
  }
  btn.addEventListener('click', () => {
    form = form === '4-3-3' ? '4-4-2' : '4-3-3';
    btn.textContent = form;
    place(false);
    Sound.blip();
  });

  // jogada desenhada em giz: dado sai do banco e vira gol na API
  let playStart = 0;
  function playLoop(now) {
    if (!playStart) playStart = now;
    const pts = PLAY.map((id) => FORMS[form][id]).concat([[50, 1.5]]);
    const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], (p[1] - pts[i][1]) * 1.4));
    const total = segs.reduce((a, b) => a + b, 0);
    const T = 4.2, cycle = ((now - playStart) / 1000) % (T + 1.6);
    const p = clamp(cycle / T, 0, 1);
    let dist = p * total, d = `M${pts[0][0]} ${pts[0][1] * 1.4}`, cur = pts[0];
    for (let i = 0; i < segs.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (dist >= segs[i]) { d += ` L${b[0]} ${b[1] * 1.4}`; cur = b; dist -= segs[i]; } else {
        const k = dist / segs[i];
        cur = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
        d += ` L${cur[0]} ${cur[1] * 1.4}`;
        break;
      }
    }
    path.setAttribute('d', d);
    pball.style.left = `${cur[0]}%`; pball.style.top = `${cur[1]}%`;
    pball.style.opacity = cycle < T + 1.2 ? 1 : 0;
    requestAnimationFrame(playLoop);
  }

  new IntersectionObserver(([e], obs) => {
    if (!e.isIntersecting || started) return;
    started = true; obs.disconnect();
    place(true);
    setTimeout(() => requestAnimationFrame(playLoop), 1400);
  }, { threshold: 0.3 }).observe(pitch);
})();

/* ═══ JOGADAS: projetos selecionados ═════════════════════════════════ */

(function projects() {
  // EDITAR: lista fixa de projetos (trabalhos simples da faculdade ficam de fora de propósito).
  // links é opcional (cada um vira um botão no rodapé do card). wip: true marca como em andamento.
  const PROJECTS = [
    {
      name: 'Sprint · Origin Health',
      descr: 'Dashboard web com os dados da Origin Health, empresa que analisa produtos voltados ao SUS. Projeto em grupo: fiquei com o backend, construindo a API em Django REST e o tratamento dos dados com Pandas.',
      tags: ['Python', 'Django REST', 'Pandas'],
      links: [],
    },
    {
      name: 'Comércio agêntico',
      descr: 'Você informa o produto e os critérios de busca, e uma IA encontra a melhor opção de compra comparando avaliação, recomendações, preço, frete e prazo de entrega. Projeto em grupo, em desenvolvimento.',
      tags: ['JavaScript', 'React', 'Flask', 'Python', 'IA'],
      links: [
        { label: 'API', url: 'https://github.com/iajuss/agentic-commerce-api' },
        { label: 'Web', url: 'https://github.com/iajuss/agentic-commerce-web' },
      ],
      wip: true,
    },
  ];
  const LANG = { Python: '#3572A5', JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#563d7c', TypeScript: '#3178c6', Java: '#b07219' };
  const chip = (t) => `<span class="chip">${LANG[t] ? `<i style="background:${LANG[t]}"></i>` : ''}${esc(t)}</span>`;

  $('#matches').innerHTML = PROJECTS.map((p, i) => {
    const status = p.wip ? '<span class="px live">● Ao vivo</span>' : '<span class="px">Encerrado ✓</span>';
    const links = p.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' · ');
    return `
      <div class="match${p.wip ? ' wip' : ''} reveal">
        <div class="match-top"><span class="px">Rodada ${String(i + 1).padStart(2, '0')}</span>${status}</div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.descr)}</p>
        <div class="chips">${p.tags.map(chip).join('')}</div>
        ${p.wip ? '<div class="wipbar"><i></i></div>' : ''}
        ${links ? `<div class="match-foot"><span>Repositórios</span><span>${links}</span></div>` : ''}
      </div>`;
  }).join('');
  $$('.reveal', $('#matches')).forEach(reveal);
})();

/* ═══ TEMPORADA: estatísticas de contribuição ════════════════════════ */

(function season() {
  const els = Object.fromEntries($$('[data-count]').map((el) => [el.dataset.count, el]));
  function countUp(el, to) {
    if (REDUCED) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1400;
    (function step(now) {
      const k = clamp((now - t0) / dur, 0, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  fetch(`https://github-contributions-api.jogruber.de/v4/${GITHUB_USER}?y=last`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      const days = data.contributions || [];
      let longest = 0, run = 0, best = 0, active = 0, total = 0;
      for (const d of days) {
        total += d.count;
        if (d.count) { active++; run++; longest = Math.max(longest, run); best = Math.max(best, d.count); } else run = 0;
      }
      const values = { total: data.total?.lastYear ?? total, active, longest, best };
      new IntersectionObserver(([e], obs) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        Object.entries(values).forEach(([k, v]) => els[k] && countUp(els[k], v));
      }, { threshold: 0.4 }).observe($('.stats'));
    })
    .catch(() => {});
})();

/* ═══ CAMPANHA: a bola avança conforme você rola ═════════════════════ */

(function campaign() {
  const list = $('#campaign'), items = $$('li', list);
  const ballEl = document.createElement('div');
  ballEl.id = 'campBall'; ballEl.textContent = '⚽'; ballEl.setAttribute('aria-hidden', 'true');
  list.appendChild(ballEl);
  let reachedFinal = false;
  function update() {
    const r = list.getBoundingClientRect();
    const p = clamp((innerHeight * 0.55 - r.top) / r.height, 0, 1);
    list.style.setProperty('--cp', p.toFixed(4));
    items.forEach((li) => li.classList.toggle('reached', li.offsetTop + 24 <= p * r.height + 12));
    if (p >= 0.97 && !reachedFinal) {
      reachedFinal = true;
      const fr = items[items.length - 1].getBoundingClientRect();
      FX.burst(fr.right - 50, fr.top + fr.height / 2, 70);
    }
  }
  addEventListener('scroll', update, { passive: true });
  update();
})();

/* ═══ PÊNALTIS ═══════════════════════════════════════════════════════ */

(function penalties() {
  const zones = $$('#zones button'), kb = $('#kball'), kc = $('#keeper'), goalEl = $('#goal'), msg = $('#soMsg');
  const kx = kc.getContext('2d');
  kx.imageSmoothingEnabled = false;
  kx.drawImage(SPR.keeper, 0, 0, 96, 138);
  let you = 0, gk = 0, n = 0, busy = false;

  function board() {
    $('#soYou').textContent = you; $('#soKeeper').textContent = gk;
    $('#soRound').textContent = n >= 5 ? 'Fim da disputa' : `Cobrança ${n + 1}/5`;
  }
  function shoot(z) {
    if (busy) return;
    if (n >= 5) { you = gk = n = 0; board(); }
    busy = true;
    zones.forEach((b) => { b.disabled = true; });
    const col = z % 3, row = z < 3 ? 0 : 1;
    const kcol = Math.floor(Math.random() * 3), krow = Math.random() < 0.5 ? 0 : 1;
    const gr = goalEl.getBoundingClientRect(), br = kb.getBoundingClientRect(), zr = zones[z].getBoundingClientRect();
    const tx = zr.left + zr.width / 2 - (br.left + br.width / 2) + rand(-0.15, 0.15) * zr.width;
    const ty = zr.top + zr.height / 2 - (br.top + br.height / 2);
    Sound.kick();
    kb.classList.add('fly');
    kb.style.transform = `translate(${tx}px, ${ty}px) scale(.55) rotate(600deg)`;
    setTimeout(() => {
      const dx = (kcol - 1) * gr.width * 0.3, rot = (kcol - 1) * (krow ? 80 : 55), dy = krow ? 0 : -gr.height * 0.3;
      kc.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    }, 110);
    setTimeout(() => {
      const isSave = kcol === col && (col === 1 || krow === row || Math.random() < 0.35);
      n++;
      if (isSave) {
        gk++;
        msg.textContent = pick(['🧤 DEFENDEU! O goleiro adivinhou o canto.', '🧤 Pegou! Esse goleiro é bom…', '🧤 Que defesa! Muda o canto.']);
        kb.style.transform = `translate(${tx * 0.6}px, ${ty * 0.4}px) scale(.8) rotate(200deg)`;
        Sound.ooh();
      } else {
        you++;
        goalEl.classList.remove('shake'); void goalEl.offsetWidth; goalEl.classList.add('shake');
        msg.textContent = pick(['⚽ GOOOL! No cantinho!', '⚽ Estufou a rede!', '⚽ Sem chance pro goleiro!']);
        FX.burst(gr.left + gr.width / 2, gr.top + gr.height / 2, 90);
        Sound.roar();
      }
      board();
      setTimeout(() => {
        kb.classList.remove('fly'); kb.style.transform = ''; kc.style.transform = '';
        busy = false;
        zones.forEach((b) => { b.disabled = false; });
        if (n < 5) { msg.textContent = `Cobrança ${n + 1}/5: escolha um canto 👆`; return; }
        if (you > gk) { msg.textContent = `🏆 Você venceu por ${you} × ${gk}! Agora me chama pra conversar 👇`; golShow('CAMPEÃO!', `Vitória nos pênaltis: ${you} × ${gk}`); }
        else if (you === gk) msg.textContent = `Empate em ${you} × ${gk}! Vamos decidir isso num papo 👇`;
        else msg.textContent = `O goleiro venceu por ${gk} × ${you}… mas ainda dá pra me mandar um e-mail 👇`;
      }, 1500);
    }, 580);
  }
  zones.forEach((b) => b.addEventListener('click', () => shoot(+b.dataset.z)));

  const copy = $('#copyEmail');
  copy.addEventListener('click', async () => {
    const email = copy.dataset.email;
    try { await navigator.clipboard.writeText(email); toast('📋 E-mail copiado! Pode mandar a proposta 😄'); } catch { location.href = `mailto:${email}`; }
  });
})();

/* ═══ EASTER EGGS ════════════════════════════════════════════════════ */

(function eggs() {
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let keys = [], typed = '';
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys = [...keys, k].slice(-KONAMI.length);
    if (keys.join() === KONAMI.join()) {
      document.body.classList.toggle('hexa');
      golShow('É HEXA!', 'Modo Copa do Mundo ativado 🏆');
      FX.rain(300);
      keys = [];
    }
    if (k.length !== 1) return;
    typed = (typed + k).slice(-12);
    if (typed.endsWith('gol')) { golShow('GOOOOL!', 'Você achou um segredo ⚽'); typed = ''; }
    else if (typed.endsWith('ryan')) { toast('👋 Opa, me chamou? ryanfc@al.insper.edu.br'); typed = ''; }
    else if (typed.endsWith('hexa')) { toast('🤫 Dica: ↑ ↑ ↓ ↓ ← → ← → B A'); typed = ''; }
  });

  console.log('%c⚽ RYAN FONTES · CAMISA 10 DO BACKEND', 'background:#009c3b;color:#ffdf00;font:bold 18px sans-serif;padding:8px 14px;border-radius:6px');
  console.log('%cOlá, dev/recrutador(a)! Se você abriu o console, a gente vai se dar bem.\nSegredos: digite "gol" na página, clique 3× na torcida… e tem um código clássico de videogame escondido.\n📧 ryanfc@al.insper.edu.br', 'color:#8d9bb8;font-size:13px');
})();
