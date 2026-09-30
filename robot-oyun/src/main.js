// VOLT ARENA — çizim, kontroller ve menüler.
import {
  WORLD, WALLS, BASES, NODE_RADIUS, WEAPONS, UPGRADES, MAX_UPGRADE, ROBOT_RADIUS,
  HEAT_MAX, WIN_SCORE, createGame, step, buyUpgrade, upgradeCost,
  defaultProfile, matchReward,
} from './engine.js';

const RENK = { blue: '#3fa7ff', red: '#ff5a5f' };
const KAYIT = 'volt-arena-profil';
const $ = (id) => document.getElementById(id);

// ---------- profil (tarayıcıda saklanır) ----------
function yukle() {
  try {
    const p = JSON.parse(localStorage.getItem(KAYIT));
    if (p && p.upgrades) return { ...defaultProfile(), ...p, upgrades: { ...defaultProfile().upgrades, ...p.upgrades } };
  } catch { /* depolama yoksa varsayılan */ }
  return defaultProfile();
}
function kaydet() {
  try { localStorage.setItem(KAYIT, JSON.stringify(profil)); } catch { /* yoksay */ }
}
let profil = yukle();

// ---------- menü ----------
function menuCiz() {
  $('hurda').textContent = profil.scrap;
  $('silahlar').innerHTML = Object.entries(WEAPONS).map(([k, w]) => `
    <button data-silah="${k}" class="${profil.weapon === k ? 'secili' : ''}">${w.name}
      <small>${w.pellets > 1 ? w.pellets + '×' : ''}${w.dmg} hasar · menzil ${w.range}</small></button>`).join('');
  $('yukseltmeler').innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
    const lv = profil.upgrades[k] || 0;
    const max = lv >= MAX_UPGRADE;
    const cost = upgradeCost(lv);
    return `<button data-yuk="${k}" ${max || profil.scrap < cost ? 'disabled' : ''}>
      <b>${u.name}</b> <span class="seviye">${'●'.repeat(lv)}${'○'.repeat(MAX_UPGRADE - lv)}</span><br>
      <small>${u.desc} · ${max ? 'MAKS' : cost + ' hurda'}</small></button>`;
  }).join('');
}
$('silahlar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-silah]');
  if (!b) return;
  profil.weapon = b.dataset.silah; kaydet(); menuCiz();
});
$('yukseltmeler').addEventListener('click', (e) => {
  const b = e.target.closest('[data-yuk]');
  if (!b) return;
  const yeni = buyUpgrade(profil, b.dataset.yuk);
  if (yeni) { profil = yeni; kaydet(); menuCiz(); }
});
$('basla').addEventListener('click', basla);
$('tekrar').addEventListener('click', () => { $('sonuc').hidden = true; $('menu').hidden = false; menuCiz(); });

// ---------- oyun durumu ----------
let oyun = null;
let parcaciklar = [];
let mesaj = { yazi: '', sure: 0 };
window.__volt = { get oyun() { return oyun; } }; // tarayıcı testi için

function basla() {
  oyun = createGame({
    seed: (Date.now() & 0xffff) + 1,
    playerWeapon: profil.weapon,
    upgrades: profil.upgrades,
  });
  parcaciklar = [];
  $('menu').hidden = true;
  $('sonuc').hidden = true;
  $('hud').hidden = false;
  goster('Düğümleri ele geçir!');
}

function bitir() {
  const odul = matchReward(oyun);
  profil.scrap += odul;
  kaydet();
  const ben = oyun.robots.find((r) => r.isPlayer);
  const b = oyun.winner;
  $('sonucBaslik').textContent = b === 'blue' ? 'ZAFER' : b === 'draw' ? 'BERABERE' : 'YENİLGİ';
  $('sonucBaslik').style.color = b === 'blue' ? RENK.blue : b === 'draw' ? '#ffd23f' : RENK.red;
  $('sonucDetay').innerHTML = `Skor ${Math.floor(oyun.score.blue)} – ${Math.floor(oyun.score.red)}<br>
    Yok ettiğin: ${ben.kills} · Yok olma: ${ben.deaths}<br><b style="color:#ffd23f">+${odul} hurda</b>`;
  $('hud').hidden = true;
  $('sonuc').hidden = false;
  oyun = null;
}

function goster(yazi) { mesaj = { yazi, sure: 2 }; }

// ---------- kontroller ----------
const tuslar = new Set();
const cubuk = { hareket: null, nisan: null }; // {id, x0, y0, x, y}
let fare = { x: 0, y: 0, basili: false, aktif: false };

addEventListener('keydown', (e) => {
  tuslar.add(e.code);
  if (e.code === 'Space' && oyun) { oyun.input.surge = true; e.preventDefault(); }
});
addEventListener('keyup', (e) => {
  tuslar.delete(e.code);
  if (e.code === 'Space' && oyun) oyun.input.surge = false;
});

const canvas = $('oyun');
const ctx = canvas.getContext('2d');
let olcek = 1, ox = 0, oy = 0, dpr = 1;

function boyutla() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  olcek = Math.min(innerWidth / WORLD.w, innerHeight / WORLD.h);
  ox = (innerWidth - WORLD.w * olcek) / 2;
  oy = (innerHeight - WORLD.h * olcek) / 2;
}
addEventListener('resize', boyutla);
boyutla();

const dunyaya = (sx, sy) => ({ x: (sx - ox) / olcek, y: (sy - oy) / olcek });

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') {
    fare = { x: e.clientX, y: e.clientY, basili: true, aktif: true };
    return;
  }
  const taraf = e.clientX < innerWidth / 2 ? 'hareket' : 'nisan';
  if (!cubuk[taraf]) cubuk[taraf] = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { fare.x = e.clientX; fare.y = e.clientY; fare.aktif = true; return; }
  for (const c of Object.values(cubuk)) if (c && c.id === e.pointerId) { c.x = e.clientX; c.y = e.clientY; }
});
function birak(e) {
  if (e.pointerType === 'mouse') { fare.basili = false; return; }
  for (const k of Object.keys(cubuk)) if (cubuk[k] && cubuk[k].id === e.pointerId) cubuk[k] = null;
}
canvas.addEventListener('pointerup', birak);
canvas.addEventListener('pointercancel', birak);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const surgeBtn = $('surgeBtn');
surgeBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (oyun) oyun.input.surge = true; });
surgeBtn.addEventListener('pointerup', () => { if (oyun) oyun.input.surge = false; });

const CUBUK_R = 60;
function cubukVektor(c) {
  let dx = c.x - c.x0, dy = c.y - c.y0;
  const d = Math.hypot(dx, dy);
  if (d > CUBUK_R) { dx *= CUBUK_R / d; dy *= CUBUK_R / d; }
  return { x: dx / CUBUK_R, y: dy / CUBUK_R, m: Math.min(1, d / CUBUK_R) };
}

function girdiOku() {
  const inp = oyun.input;
  const ben = oyun.robots.find((r) => r.isPlayer);
  let mx = (tuslar.has('KeyD') || tuslar.has('ArrowRight') ? 1 : 0) - (tuslar.has('KeyA') || tuslar.has('ArrowLeft') ? 1 : 0);
  let my = (tuslar.has('KeyS') || tuslar.has('ArrowDown') ? 1 : 0) - (tuslar.has('KeyW') || tuslar.has('ArrowUp') ? 1 : 0);
  if (cubuk.hareket) { const v = cubukVektor(cubuk.hareket); mx = v.x; my = v.y; }
  inp.move = { x: mx, y: my };
  inp.fire = false;
  if (cubuk.nisan) {
    const v = cubukVektor(cubuk.nisan);
    if (v.m > 0.2) { inp.aim = Math.atan2(v.y, v.x); inp.fire = v.m > 0.45; }
  } else if (fare.aktif) {
    const w = dunyaya(fare.x, fare.y);
    inp.aim = Math.atan2(w.y - ben.y, w.x - ben.x);
    inp.fire = fare.basili;
  }
}

// ---------- olaylar → efekt ----------
function olaylar() {
  for (const ev of oyun.events) {
    if (ev.type === 'hit') parcacik(ev.x, ev.y, '#ffd23f', 4, 80);
    if (ev.type === 'kill') {
      parcacik(ev.x, ev.y, '#ff9f1c', 24, 220);
      const ol = oyun.robots[ev.id], kat = oyun.robots[ev.by];
      if (ol.isPlayer) goster('Robotun düştü! 4 sn sonra üste dönüyorsun');
      else if (kat && kat.isPlayer) goster('Düşman yok edildi! +10 hurda');
    }
    if (ev.type === 'capture') goster(`${ev.team === 'blue' ? 'Mavi' : 'Kırmızı'} takım ${'ABC'[ev.node]} düğümünü aldı`);
    if (ev.type === 'surge') goster(ev.team === 'blue' ? 'AŞIRI YÜK AKTİF!' : 'Düşman Aşırı Yük açtı!');
    if (ev.type === 'overheat' && oyun.robots[ev.id].isPlayer) goster('AŞIRI ISINDI — bekle ya da düğüme gir');
  }
  oyun.events.length = 0;
}
function parcacik(x, y, renk, n, hiz) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = hiz * (0.3 + Math.random());
    parcaciklar.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.4 + Math.random() * 0.3, renk });
  }
}

// ---------- çizim ----------
function ciz() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.setTransform(dpr * olcek, 0, 0, dpr * olcek, dpr * ox, dpr * oy);

  // zemin ve ızgara
  ctx.fillStyle = '#131a22';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.strokeStyle = '#1c2633'; ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
  for (let y = 0; y <= WORLD.h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }

  // üsler
  for (const t of ['blue', 'red']) {
    ctx.fillStyle = RENK[t] + '22';
    const bx = t === 'blue' ? 0 : WORLD.w - 140;
    ctx.fillRect(bx, 250, 140, 300);
  }
  // düğümler
  if (oyun) for (const n of oyun.nodes) {
    ctx.beginPath(); ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = n.owner ? RENK[n.owner] + '33' : '#ffffff10'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff25'; ctx.stroke();
    if (n.progress) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_RADIUS - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(n.progress));
      ctx.strokeStyle = n.progress > 0 ? RENK.blue : RENK.red; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ABC'[n.id], n.x, n.y);
  }
  // duvarlar
  for (const w of WALLS) {
    ctx.fillStyle = '#2d3743'; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#46546a'; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
  if (!oyun) return;

  // mermiler
  for (const b of oyun.bullets) {
    ctx.fillStyle = b.team === 'blue' ? '#9fd3ff' : '#ffb0b3';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.weapon === 'cannon' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  }
  // robotlar
  for (const r of oyun.robots) {
    if (!r.alive) {
      const b = BASES[r.team][r.slot % 3];
      ctx.fillStyle = '#ffffff60'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(r.respawn) + '', b.x, b.y);
      continue;
    }
    robotCiz(r);
  }
  // parçacıklar
  for (const p of parcaciklar) {
    ctx.globalAlpha = Math.max(0, p.t * 2);
    ctx.fillStyle = p.renk; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // sanal çubuklar
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const c of Object.values(cubuk)) {
    if (!c) continue;
    const v = cubukVektor(c);
    ctx.beginPath(); ctx.arc(c.x0, c.y0, CUBUK_R, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x0 + v.x * CUBUK_R, c.y0 + v.y * CUBUK_R, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff50'; ctx.fill();
  }
}

function robotCiz(r) {
  const surge = oyun.surgeActive[r.team] > 0;
  ctx.save();
  ctx.translate(r.x, r.y);
  if (surge) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 18; }
  // gövde (paletli şasi)
  ctx.save(); ctx.rotate(r.angle);
  ctx.fillStyle = '#1f2630';
  ctx.fillRect(-ROBOT_RADIUS, -ROBOT_RADIUS, ROBOT_RADIUS * 2, 7);
  ctx.fillRect(-ROBOT_RADIUS, ROBOT_RADIUS - 7, ROBOT_RADIUS * 2, 7);
  ctx.fillStyle = RENK[r.team];
  ctx.fillRect(-ROBOT_RADIUS + 2, -ROBOT_RADIUS + 6, ROBOT_RADIUS * 2 - 4, ROBOT_RADIUS * 2 - 12);
  ctx.restore();
  // taret
  ctx.save(); ctx.rotate(r.aim);
  ctx.fillStyle = '#dfe6ee';
  const uzun = r.weapon === 'cannon' ? 30 : r.weapon === 'scatter' ? 20 : 26;
  const kalin = r.weapon === 'kinetic' ? 5 : 9;
  ctx.fillRect(4, -kalin / 2, uzun, kalin);
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
  // can ve ısı
  ctx.fillStyle = '#00000080'; ctx.fillRect(-22, -34, 44, 5);
  ctx.fillStyle = r.team === 'blue' ? '#3fb950' : '#ff5a5f';
  ctx.fillRect(-22, -34, 44 * (r.hp / r.stats.hp), 5);
  if (r.heat > 0) {
    ctx.fillStyle = r.overheated ? '#ff3b30' : '#f0883e';
    ctx.fillRect(-22, -28, 44 * (r.heat / HEAT_MAX), 3);
  }
  if (r.isPlayer) {
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, ROBOT_RADIUS + 7, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function hudGuncelle() {
  const { score, surge, surgeActive } = oyun;
  $('skorMavi').textContent = Math.floor(score.blue);
  $('skorKirmizi').textContent = Math.floor(score.red);
  $('barMavi').style.width = Math.min(100, score.blue / WIN_SCORE * 100) + '%';
  $('barKirmizi').style.width = Math.min(100, score.red / WIN_SCORE * 100) + '%';
  const kalan = Math.max(0, oyun.duration - oyun.time);
  $('sure').textContent = `${Math.floor(kalan / 60)}:${String(Math.floor(kalan % 60)).padStart(2, '0')}`;
  const ben = oyun.robots.find((r) => r.isPlayer);
  $('barCan').style.width = (ben.hp / ben.stats.hp * 100) + '%';
  $('barIsi').style.width = (ben.heat / HEAT_MAX * 100) + '%';
  $('barIsi').parentElement.classList.toggle('sicak', ben.overheated);
  surgeBtn.disabled = surge.blue < 100 && !(surgeActive.blue > 0);
  surgeBtn.classList.toggle('aktif', surgeActive.blue > 0);
  $('surgeYuzde').textContent = surgeActive.blue > 0 ? Math.ceil(surgeActive.blue) + 's' : Math.floor(surge.blue) + '%';
  $('mesaj').textContent = mesaj.sure > 0 ? mesaj.yazi : '';
}

// ---------- döngü (sabit adımlı) ----------
const ADIM = 1 / 60;
let onceki = performance.now();
let birikim = 0;
function dongu(simdi) {
  const dt = Math.min(0.1, (simdi - onceki) / 1000);
  onceki = simdi;
  if (oyun) {
    girdiOku();
    birikim += dt;
    while (birikim >= ADIM && oyun && !oyun.winner) { step(oyun, ADIM); birikim -= ADIM; }
    olaylar();
    for (const p of parcaciklar) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
    parcaciklar = parcaciklar.filter((p) => p.t > 0);
    mesaj.sure -= dt;
    hudGuncelle();
    ciz();
    if (oyun.winner) bitir();
  } else {
    ciz();
  }
  requestAnimationFrame(dongu);
}

menuCiz();
requestAnimationFrame(dongu);
