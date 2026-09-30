// Tarayıcı testi: sayfayı telefon boyutunda açar, dokunmatik çubuklarla oynar,
// hata olmadığını ve maçın bittiğini doğrular. Çalıştırma: node tests/tarayici.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(join(process.env.NODE_PATH || '/opt/node-tools/node_modules', 'playwright')));
}

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const tip = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const sunucu = createServer(async (req, res) => {
  try {
    const yol = join(kok, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    res.writeHead(200, { 'content-type': tip[extname(yol)] || 'application/octet-stream' });
    res.end(await readFile(yol));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://127.0.0.1:${sunucu.address().port}/`;

const hatalar = [];
const tarayici = await chromium.launch();
const sayfa = await tarayici.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
sayfa.on('pageerror', (e) => hatalar.push(e.message));
sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });

const kontrol = (kosul, mesaj) => { if (!kosul) throw new Error('BAŞARISIZ: ' + mesaj); console.log('✓', mesaj); };

try {
  await sayfa.goto(url);
  await sayfa.screenshot({ path: 'ekran-menu.png' });
  await sayfa.click('#basla');
  kontrol(await sayfa.isHidden('#menu'), 'SAVAŞA GİR menüyü kapatır');

  const once = await sayfa.evaluate(() => { const r = window.__volt.oyun.robots[0]; return { x: r.x, y: r.y }; });
  // Dokunmatik: sol çubuk sağa-yukarı, sağ çubuk sağa (ateş)
  await sayfa.evaluate(() => {
    const c = document.getElementById('oyun');
    const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', 1, 150, 250); ev('pointermove', 1, 200, 220);
    ev('pointerdown', 2, 700, 250); ev('pointermove', 2, 760, 250);
  });
  await sayfa.waitForTimeout(1500);
  const sonra = await sayfa.evaluate(() => { const o = window.__volt.oyun; const r = o.robots[0]; return { x: r.x, y: r.y, heat: r.heat, fire: o.input.fire }; });
  kontrol(sonra.x > once.x + 50, `sol çubuk robotu hareket ettirir (${once.x.toFixed(0)} → ${sonra.x.toFixed(0)})`);
  kontrol(sonra.fire && sonra.heat > 0, 'sağ çubuk ateş eder ve silah ısınır');
  await sayfa.screenshot({ path: 'ekran-mac.png' });

  await sayfa.evaluate(() => {
    const c = document.getElementById('oyun');
    for (const id of [1, 2]) c.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', bubbles: true }));
  });

  // Aşırı Yük düğmesi
  await sayfa.evaluate(() => { window.__volt.oyun.surge.blue = 100; });
  await sayfa.waitForTimeout(200);
  await sayfa.dispatchEvent('#surgeBtn', 'pointerdown');
  await sayfa.waitForTimeout(200);
  await sayfa.dispatchEvent('#surgeBtn', 'pointerup');
  kontrol(await sayfa.evaluate(() => window.__volt.oyun.surgeActive.blue > 0), 'Aşırı Yük düğmesi çalışır');

  // Maçı bitir → sonuç ekranı ve hurda
  await sayfa.evaluate(() => { window.__volt.oyun.score.blue = 100; });
  await sayfa.waitForSelector('#sonuc:not([hidden])', { timeout: 3000 });
  kontrol((await sayfa.textContent('#sonucBaslik')) === 'ZAFER', 'maç bitince ZAFER ekranı çıkar');
  await sayfa.screenshot({ path: 'ekran-sonuc.png' });
  await sayfa.click('#tekrar');
  const hurda = Number(await sayfa.textContent('#hurda'));
  kontrol(hurda >= 80, `ödül hurdası eklendi (${hurda})`);
  await sayfa.click('[data-yuk="armor"]');
  kontrol(Number(await sayfa.textContent('#hurda')) === hurda - 40, 'atölyede Zırh yükseltmesi alınır');

  // Sayfayı yenile: profil saklanmış olmalı
  await sayfa.reload();
  kontrol(Number(await sayfa.textContent('#hurda')) === hurda - 40, 'hurda ve yükseltme kaydedilir');

  // Tam bir maçı (hızlandırılmış) oyuncu hareketsizken sonuna kadar oynat
  await sayfa.click('#basla');
  const sonuc = await sayfa.evaluate(async () => {
    const o = window.__volt.oyun;
    const { step } = await import('./src/engine.js');
    while (!o.winner) step(o, 1 / 60);
    return o.winner;
  });
  await sayfa.waitForSelector('#sonuc:not([hidden])', { timeout: 3000 });
  kontrol(['blue', 'red', 'draw'].includes(sonuc), `tam maç sonuçlanır (${sonuc})`);

  kontrol(hatalar.length === 0, 'konsolda hata yok' + (hatalar.length ? ': ' + hatalar.join(' | ') : ''));
} catch (e) {
  console.error(e.message);
  if (hatalar.length) console.error('Sayfa hataları:', hatalar);
  process.exitCode = 1;
} finally {
  await tarayici.close();
  sunucu.close();
}
