import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, robotStats, buyUpgrade, upgradeCost, defaultProfile, matchReward,
  resolveCircle, WALLS, WORLD, WEAPONS, HEAT_MAX, HEAT_RECOVER, ROBOT_RADIUS,
  RESPAWN_TIME, NODE_RADIUS, WIN_SCORE, pointInRect, MAX_UPGRADE,
} from '../src/engine.js';

const DT = 1 / 60;

// Sadece oyuncuyu bırakıp diğer robotları uzağa/devre dışı alır.
function soloGame(opts = {}) {
  const s = createGame({ seed: 7, ...opts });
  for (const r of s.robots) {
    if (!r.isPlayer) { r.alive = false; r.respawn = 1e9; }
  }
  return s;
}

test('robot duvarın içinden geçemez', () => {
  const w = WALLS[0];
  const p = resolveCircle({ x: w.x + w.w / 2, y: w.y + w.h / 2 }, ROBOT_RADIUS);
  for (const wall of WALLS) {
    const cx = Math.max(wall.x, Math.min(p.x, wall.x + wall.w));
    const cy = Math.max(wall.y, Math.min(p.y, wall.y + wall.h));
    assert.ok(Math.hypot(p.x - cx, p.y - cy) >= ROBOT_RADIUS - 1e-6);
  }
});

test('robot dünya sınırında kalır', () => {
  const s = soloGame();
  s.input.move = { x: -1, y: -1 };
  for (let i = 0; i < 600; i++) step(s, DT);
  const p = s.robots[0];
  assert.ok(p.x >= ROBOT_RADIUS && p.y >= ROBOT_RADIUS && p.x <= WORLD.w && p.y <= WORLD.h);
});

test('hareket: hız istatistiğine göre ilerler, çapraz hız 1 ile sınırlı', () => {
  const s = soloGame();
  const p = s.robots[0];
  p.x = 250; p.y = 100;
  s.input.move = { x: 1, y: 1 };
  step(s, 0.1);
  const moved = Math.hypot(p.x - 250, p.y - 100);
  assert.ok(Math.abs(moved - p.stats.speed * 0.1) < 1e-6);
});

test('ateş etmek ısıtır, aşırı ısınınca ateş durur ve soğuyunca devam eder', () => {
  const s = soloGame({ playerWeapon: 'cannon' });
  const p = s.robots[0];
  s.input.fire = true;
  let t = 0;
  while (!p.overheated && t < 20) { step(s, DT); t += DT; }
  assert.ok(p.overheated, 'aşırı ısınmalı');
  assert.equal(p.heat, HEAT_MAX);
  const bullets = s.bullets.length;
  step(s, DT);
  assert.ok(s.bullets.length <= bullets, 'aşırı ısınmışken yeni mermi yok');
  s.input.fire = false;
  while (p.overheated && t < 40) { step(s, DT); t += DT; }
  assert.ok(!p.overheated);
  assert.ok(p.heat <= HEAT_RECOVER);
  const n = s.bullets.length;
  s.input.fire = true;
  step(s, DT);
  assert.equal(s.bullets.length, n + 1, 'soğuyunca tekrar ateş edebilmeli');
});

test('mermi düşmana hasar verir, yok eder, skor ve aşırı yük kazandırır', () => {
  const s = createGame({ seed: 3 });
  const p = s.robots[0];
  const enemy = s.robots.find((r) => r.team === 'red');
  for (const r of s.robots) if (r !== p && r !== enemy) { r.alive = false; r.respawn = 1e9; }
  p.x = 250; p.y = 400; enemy.x = 330; enemy.y = 400;
  enemy.weapon = 'kinetic';
  // düşmanı dondur: her adımda yerine koy, ateş etmesin
  s.input.aim = 0; s.input.fire = true;
  let t = 0;
  while (enemy.alive && t < 10) {
    enemy.x = 330; enemy.y = 400; enemy.cooldown = 99;
    step(s, DT); t += DT;
  }
  assert.equal(enemy.alive, false);
  assert.equal(p.kills, 1);
  assert.equal(enemy.deaths, 1);
  assert.equal(s.surge.blue, 25);
  assert.equal(s.score.blue, 3);
});

test('ölen robot bekleme süresinden sonra üste döner', () => {
  const s = soloGame();
  const p = s.robots[0];
  p.alive = false; p.respawn = RESPAWN_TIME; p.hp = 0; p.x = 600; p.y = 400;
  for (let i = 0; i < Math.ceil(RESPAWN_TIME / DT) + 2; i++) step(s, DT);
  assert.ok(p.alive);
  assert.equal(p.hp, p.stats.hp);
  assert.ok(p.x < 200, 'mavi üste dönmeli');
});

test('duvar mermiyi durdurur', () => {
  const s = soloGame();
  const w = WALLS[0];
  s.bullets.push({ x: w.x - 5, y: w.y + 10, vx: 600, vy: 0, life: 5, dmg: 10, team: 'blue', owner: 0 });
  step(s, DT);
  assert.equal(s.bullets.length, 0);
  assert.ok(!pointInRect(w.x - 5, w.y + 10, w));
});

test('düğüm ele geçirme, puan kazanma ve kendi düğümünde hızlı soğuma', () => {
  const s = soloGame();
  const p = s.robots[0];
  const n = s.nodes[1];
  p.x = n.x - 20; p.y = n.y - 90 + 90; // düğüm yarıçapı içinde
  assert.ok(Math.hypot(p.x - n.x, p.y - n.y) <= NODE_RADIUS);
  for (let i = 0; i < 4 / DT; i++) step(s, DT);
  assert.equal(n.owner, 'blue');
  assert.ok(s.score.blue > 0);
  p.heat = 60;
  step(s, 1);
  assert.ok(Math.abs(p.heat - (60 - p.stats.cooling * 2)) < 1e-6);
});

test('100 puana ulaşan takım kazanır', () => {
  const s = soloGame();
  s.score.blue = WIN_SCORE;
  step(s, DT);
  assert.equal(s.winner, 'blue');
});

test('süre bitince önde olan kazanır, eşitlikte berabere', () => {
  const s = soloGame({ duration: 1 });
  s.score.red = 10;
  for (let i = 0; i < 70; i++) step(s, DT);
  assert.equal(s.winner, 'red');
  const s2 = soloGame({ duration: 1 });
  for (let i = 0; i < 70; i++) step(s2, DT);
  assert.equal(s2.winner, 'draw');
});

test('aşırı yük dolunca oyuncu etkinleştirir: hasar ve hız artar', () => {
  const s = soloGame();
  s.surge.blue = 100;
  s.input.surge = true;
  step(s, DT);
  assert.ok(s.surgeActive.blue > 0);
  assert.equal(s.surge.blue, 0);
  s.input.surge = false; s.input.fire = true; s.input.aim = 0;
  s.robots[0].cooldown = 0;
  step(s, DT);
  const b = s.bullets.at(-1);
  assert.ok(Math.abs(b.dmg - WEAPONS.kinetic.dmg * 1.5) < 1e-6);
});

test('yükseltme: maliyet, istatistik, yetersiz hurda ve üst sınır', () => {
  let p = { ...defaultProfile(), scrap: 1000 };
  const before = robotStats(p.upgrades);
  p = buyUpgrade(p, 'armor');
  assert.equal(p.scrap, 1000 - upgradeCost(0));
  assert.equal(p.upgrades.armor, 1);
  assert.ok(robotStats(p.upgrades).hp > before.hp);
  assert.equal(buyUpgrade({ ...defaultProfile(), scrap: 0 }, 'armor'), null);
  assert.equal(buyUpgrade(p, 'yok'), null);
  const maxed = { ...p, upgrades: { ...p.upgrades, cooler: MAX_UPGRADE } };
  assert.equal(buyUpgrade(maxed, 'cooler'), null);
});

test('maç ödülü: katılım + öldürme + galibiyet', () => {
  const s = soloGame();
  s.robots[0].kills = 2;
  s.winner = 'blue';
  assert.equal(matchReward(s), 20 + 20 + 60);
});

test('yapay zekâ maçı: hata yok, sonuç var, sayılar geçerli (birkaç tohum)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createGame({ seed, withPlayer: false });
    let steps = 0;
    while (!s.winner && steps < (s.duration + 1) / DT) { step(s, DT); steps++; }
    assert.ok(s.winner, `tohum ${seed}: kazanan olmalı`);
    for (const r of s.robots) {
      assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.heat));
      for (const w of WALLS) {
        const cx = Math.max(w.x, Math.min(r.x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(r.y, w.y + w.h));
        assert.ok(Math.hypot(r.x - cx, r.y - cy) >= ROBOT_RADIUS - 0.5, 'robot duvarda sıkışmamalı');
      }
    }
    const kills = s.robots.reduce((a, r) => a + r.kills, 0);
    assert.ok(kills > 0, `tohum ${seed}: çatışma olmalı`);
    assert.ok(s.nodes.some((n) => n.owner), `tohum ${seed}: düğüm alınmalı`);
  }
});
