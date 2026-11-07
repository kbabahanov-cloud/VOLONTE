// VOLT ARENA — oyun mantığı (çizimden bağımsız, Node'da test edilebilir).
// Özgün mekanikler: ısınma (mermi yerine), enerji düğümleri, takım "Aşırı Yük" ölçeği.

export const WORLD = { w: 1200, h: 800 };

export const WALLS = [
  { x: 380, y: 170, w: 40, h: 150 },
  { x: 780, y: 170, w: 40, h: 150 },
  { x: 380, y: 480, w: 40, h: 150 },
  { x: 780, y: 480, w: 40, h: 150 },
  { x: 555, y: 285, w: 90, h: 24 },
  { x: 555, y: 491, w: 90, h: 24 },
  { x: 180, y: 360, w: 24, h: 80 },
  { x: 996, y: 360, w: 24, h: 80 },
];

export const BASES = {
  blue: [{ x: 70, y: 300 }, { x: 70, y: 400 }, { x: 70, y: 500 }],
  red: [{ x: 1130, y: 300 }, { x: 1130, y: 400 }, { x: 1130, y: 500 }],
};

export const NODE_RADIUS = 70;
export const NODE_POSITIONS = [
  { x: 600, y: 130 },
  { x: 600, y: 400 },
  { x: 600, y: 670 },
];

export const WEAPONS = {
  kinetic: { name: 'Kinetik Tüfek', dmg: 9, speed: 640, cooldown: 0.12, heat: 7, range: 420, pellets: 1, spread: 0.05 },
  cannon: { name: 'Ray Topu', dmg: 40, speed: 560, cooldown: 0.9, heat: 45, range: 540, pellets: 1, spread: 0 },
  scatter: { name: 'Saçma Top', dmg: 8, speed: 560, cooldown: 0.55, heat: 28, range: 300, pellets: 5, spread: 0.35 },
};

export const ROBOT_RADIUS = 18;
export const BASE_STATS = { hp: 200, speed: 150, cooling: 30, dmgMul: 1 };
export const HEAT_MAX = 100;
export const HEAT_RECOVER = 40; // aşırı ısınınca bu seviyeye kadar ateş edilemez
export const RESPAWN_TIME = 4;
export const WIN_SCORE = 100;
export const MATCH_DURATION = 180;
export const SURGE_TIME = 6;
export const MAX_UPGRADE = 5;

export const UPGRADES = {
  armor: { name: 'Zırh', desc: '+12% can' },
  engine: { name: 'Motor', desc: '+6% hız' },
  cooler: { name: 'Soğutucu', desc: '+15% soğuma' },
  weapon: { name: 'Silah', desc: '+10% hasar' },
};

// ---------- yardımcılar ----------
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Daireyi duvarın ve dünya sınırlarının dışına iter.
export function resolveCircle(pos, radius, walls = WALLS) {
  pos.x = clamp(pos.x, radius, WORLD.w - radius);
  pos.y = clamp(pos.y, radius, WORLD.h - radius);
  for (const r of walls) {
    const cx = clamp(pos.x, r.x, r.x + r.w);
    const cy = clamp(pos.y, r.y, r.y + r.h);
    let dx = pos.x - cx;
    let dy = pos.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= radius) continue;
    if (d === 0) {
      // merkez duvarın içinde: en yakın kenara it
      const opts = [
        [pos.x - r.x, -1, 0], [r.x + r.w - pos.x, 1, 0],
        [pos.y - r.y, 0, -1], [r.y + r.h - pos.y, 0, 1],
      ].sort((a, b) => a[0] - b[0]);
      pos.x += opts[0][1] * (opts[0][0] + radius);
      pos.y += opts[0][2] * (opts[0][0] + radius);
    } else {
      dx /= d; dy /= d;
      pos.x = cx + dx * radius;
      pos.y = cy + dy * radius;
    }
  }
  return pos;
}

// ---------- yükseltmeler / profil ----------
export function robotStats(upg = {}) {
  const l = (k) => clamp(upg[k] || 0, 0, MAX_UPGRADE);
  return {
    hp: Math.round(BASE_STATS.hp * (1 + 0.12 * l('armor'))),
    speed: BASE_STATS.speed * (1 + 0.06 * l('engine')),
    cooling: BASE_STATS.cooling * (1 + 0.15 * l('cooler')),
    dmgMul: BASE_STATS.dmgMul * (1 + 0.1 * l('weapon')),
  };
}

export const upgradeCost = (level) => 40 * (level + 1);

export function defaultProfile() {
  return { scrap: 0, weapon: 'kinetic', upgrades: { armor: 0, engine: 0, cooler: 0, weapon: 0 } };
}

// Başarılıysa yeni profil, değilse null döner (profil değiştirilmez).
export function buyUpgrade(profile, key) {
  if (!(key in UPGRADES)) return null;
  const level = profile.upgrades[key] || 0;
  if (level >= MAX_UPGRADE) return null;
  const cost = upgradeCost(level);
  if (profile.scrap < cost) return null;
  return {
    ...profile,
    scrap: profile.scrap - cost,
    upgrades: { ...profile.upgrades, [key]: level + 1 },
  };
}

export function matchReward(state, team = 'blue') {
  const player = state.robots.find((r) => r.isPlayer);
  const kills = player ? player.kills : 0;
  const bonus = state.winner === team ? 60 : state.winner === 'draw' ? 25 : 0;
  return 20 + kills * 10 + bonus;
}

// ---------- oyun kurulumu ----------
function makeRobot(id, team, slot, weapon, stats, isPlayer) {
  const base = BASES[team][slot % BASES[team].length];
  return {
    id, team, slot, isPlayer, weapon, stats,
    x: base.x, y: base.y,
    angle: team === 'blue' ? 0 : Math.PI,
    aim: team === 'blue' ? 0 : Math.PI,
    hp: stats.hp, heat: 0, overheated: false, cooldown: 0,
    alive: true, respawn: 0, kills: 0, deaths: 0,
    strafe: slot % 2 ? 1 : -1, strafeTimer: 0,
  };
}

export function createGame(opts = {}) {
  const {
    seed = 1, teamSize = 3, playerWeapon = 'kinetic', upgrades = {},
    withPlayer = true, duration = MATCH_DURATION,
  } = opts;
  const rng = makeRng(seed);
  const weaponKeys = Object.keys(WEAPONS);
  const robots = [];
  let id = 0;
  for (const team of ['blue', 'red']) {
    for (let i = 0; i < teamSize; i++) {
      const isPlayer = withPlayer && team === 'blue' && i === 0;
      const weapon = isPlayer ? playerWeapon : weaponKeys[Math.floor(rng() * weaponKeys.length)];
      const stats = isPlayer ? robotStats(upgrades) : robotStats({});
      robots.push(makeRobot(id++, team, i, weapon, stats, isPlayer));
    }
  }
  return {
    time: 0, duration, rng, robots, bullets: [],
    nodes: NODE_POSITIONS.map((p, i) => ({ id: i, x: p.x, y: p.y, progress: 0, owner: null })),
    score: { blue: 0, red: 0 },
    surge: { blue: 0, red: 0 },
    surgeActive: { blue: 0, red: 0 },
    input: { move: { x: 0, y: 0 }, aim: 0, fire: false, surge: false },
    winner: null,
    events: [],
  };
}

function onOwnNode(state, r) {
  return state.nodes.some((n) => n.owner === r.team && dist(n, r) <= NODE_RADIUS);
}

// ---------- yapay zekâ ----------
export function aiControl(state, r, dt = 1 / 60) {
  const w = WEAPONS[r.weapon];
  let target = null;
  let best = Infinity;
  for (const e of state.robots) {
    if (!e.alive || e.team === r.team) continue;
    const d = dist(r, e);
    if (d < best) { best = d; target = e; }
  }
  const engaging = target && best < w.range * 1.1;

  let goal;
  if (engaging) {
    goal = target;
  } else {
    const wanted = state.nodes
      .filter((n) => n.owner !== r.team || n.progress * (r.team === 'blue' ? 1 : -1) < 1)
      .sort((a, b) => dist(a, r) - dist(b, r));
    // takım arkadaşları aynı düğüme yığılmasın diye slot'a göre seç
    goal = wanted.length ? wanted[r.slot % wanted.length] : state.nodes[1];
  }

  let mx = goal.x - r.x;
  let my = goal.y - r.y;
  const d = Math.hypot(mx, my) || 1;
  mx /= d; my /= d;

  r.strafeTimer -= dt;
  if (r.strafeTimer <= 0) {
    r.strafeTimer = 1 + state.rng() * 2;
    r.strafe = state.rng() < 0.5 ? -1 : 1;
  }

  let move;
  if (engaging) {
    const ideal = w.range * 0.65;
    const k = d > ideal ? 1 : d < ideal * 0.6 ? -1 : 0;
    move = { x: mx * k - my * r.strafe * 0.8, y: my * k + mx * r.strafe * 0.8 };
  } else {
    move = d < NODE_RADIUS * 0.5 ? { x: -my * r.strafe * 0.4, y: mx * r.strafe * 0.4 } : { x: mx, y: my };
  }

  const aimErr = (state.rng() - 0.5) * 0.12;
  const aim = target ? Math.atan2(target.y - r.y, target.x - r.x) + aimErr : Math.atan2(my, mx);
  const fire = !!engaging && best < w.range && r.heat < 85;
  const surge = state.surge[r.team] >= 100;
  return { move, aim, fire, surge };
}

// ---------- adım ----------
function fireWeapon(state, r) {
  const w = WEAPONS[r.weapon];
  for (let i = 0; i < w.pellets; i++) {
    const off = w.pellets > 1 ? (i / (w.pellets - 1) - 0.5) * w.spread : (state.rng() - 0.5) * w.spread;
    const a = r.aim + off;
    state.bullets.push({
      x: r.x + Math.cos(a) * (ROBOT_RADIUS + 4),
      y: r.y + Math.sin(a) * (ROBOT_RADIUS + 4),
      vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      life: w.range / w.speed,
      dmg: w.dmg * r.stats.dmgMul * (state.surgeActive[r.team] > 0 ? 1.5 : 1),
      team: r.team, owner: r.id, weapon: r.weapon,
    });
  }
  r.cooldown = w.cooldown;
  r.heat += w.heat;
  if (r.heat >= HEAT_MAX) {
    r.heat = HEAT_MAX;
    r.overheated = true;
    state.events.push({ type: 'overheat', id: r.id });
  }
}

function respawn(r) {
  const b = BASES[r.team][r.slot % BASES[r.team].length];
  r.x = b.x; r.y = b.y;
  r.hp = r.stats.hp; r.heat = 0; r.overheated = false; r.cooldown = 0;
  r.alive = true;
}

export function step(state, dt) {
  if (state.winner) return state;
  state.time += dt;

  for (const team of ['blue', 'red']) {
    if (state.surgeActive[team] > 0) state.surgeActive[team] = Math.max(0, state.surgeActive[team] - dt);
  }

  for (const r of state.robots) {
    if (!r.alive) {
      r.respawn -= dt;
      if (r.respawn <= 0) respawn(r);
      continue;
    }
    const c = r.isPlayer ? state.input : aiControl(state, r, dt);

    if (c.surge && state.surge[r.team] >= 100 && state.surgeActive[r.team] <= 0) {
      state.surge[r.team] = 0;
      state.surgeActive[r.team] = SURGE_TIME;
      state.events.push({ type: 'surge', team: r.team });
    }

    let mx = c.move.x || 0;
    let my = c.move.y || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const spd = r.stats.speed * (state.surgeActive[r.team] > 0 ? 1.25 : 1);
    r.x += mx * spd * dt;
    r.y += my * spd * dt;
    resolveCircle(r, ROBOT_RADIUS);
    if (len > 0.1) r.angle = Math.atan2(my, mx);
    if (Number.isFinite(c.aim)) r.aim = c.aim;

    const cool = r.stats.cooling * (onOwnNode(state, r) ? 2 : 1);
    r.heat = Math.max(0, r.heat - cool * dt);
    if (r.overheated && r.heat <= HEAT_RECOVER) r.overheated = false;

    r.cooldown -= dt;
    if (c.fire && r.cooldown <= 0 && !r.overheated) fireWeapon(state, r);
  }

  // mermiler
  const alive = [];
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) continue;
    if (WALLS.some((w) => pointInRect(b.x, b.y, w))) continue;
    let hit = false;
    for (const r of state.robots) {
      if (!r.alive || r.team === b.team) continue;
      if (Math.hypot(r.x - b.x, r.y - b.y) <= ROBOT_RADIUS) {
        r.hp -= b.dmg;
        hit = true;
        state.events.push({ type: 'hit', id: r.id, x: b.x, y: b.y });
        if (r.hp <= 0) {
          r.hp = 0; r.alive = false; r.respawn = RESPAWN_TIME; r.deaths++;
          const killer = state.robots[b.owner];
          if (killer) killer.kills++;
          state.surge[b.team] = Math.min(100, state.surge[b.team] + 25);
          state.score[b.team] += 3;
          state.events.push({ type: 'kill', id: r.id, by: b.owner, x: r.x, y: r.y });
        }
        break;
      }
    }
    if (!hit) alive.push(b);
  }
  state.bullets = alive;

  // enerji düğümleri
  for (const n of state.nodes) {
    let blue = 0, red = 0;
    for (const r of state.robots) {
      if (!r.alive || dist(r, n) > NODE_RADIUS) continue;
      if (r.team === 'blue') blue++; else red++;
    }
    if (blue && !red) n.progress = Math.min(1, n.progress + 0.3 * Math.min(blue, 2) * dt);
    else if (red && !blue) n.progress = Math.max(-1, n.progress - 0.3 * Math.min(red, 2) * dt);
    if (n.progress >= 1 && n.owner !== 'blue') { n.owner = 'blue'; state.events.push({ type: 'capture', node: n.id, team: 'blue' }); }
    if (n.progress <= -1 && n.owner !== 'red') { n.owner = 'red'; state.events.push({ type: 'capture', node: n.id, team: 'red' }); }
    if (n.owner === 'blue' && n.progress <= 0) n.owner = null;
    if (n.owner === 'red' && n.progress >= 0) n.owner = null;
    if (n.owner) {
      state.score[n.owner] += 1.5 * dt;
      state.surge[n.owner] = Math.min(100, state.surge[n.owner] + 2 * dt);
    }
  }

  // kazanan
  const { blue, red } = state.score;
  if (blue >= WIN_SCORE || red >= WIN_SCORE) {
    state.winner = blue === red ? 'draw' : blue > red ? 'blue' : 'red';
  } else if (state.time >= state.duration) {
    state.winner = Math.abs(blue - red) < 0.5 ? 'draw' : blue > red ? 'blue' : 'red';
  }
  return state;
}
