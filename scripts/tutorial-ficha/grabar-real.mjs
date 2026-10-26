/**
 * Graba el portal real (Mi clase) con Lucía Fernández, alumna ficticia.
 * La ficha es la pantalla de verdad: se baja y se completa en la misma página.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../tutorial-ficha-salud.mp4');
const base = process.env.TUTORIAL_URL || 'http://127.0.0.1:5199';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function portalBody(url) {
  const semana = new URL(url, 'http://local').searchParams.get('semana') || '';
  return {
    alumno: {
      id: 'lucia-demo',
      nombre: 'Lucía',
      apellido: 'Fernández',
      fechaVencimientoCuota: '2026-11-06',
      clasesParaRecuperar: 1,
      actividadNombre: '2 veces por semana',
      telefono: '1162348801',
      fechaNacimiento: '1991-03-14',
      fichaSalud: null,
    },
    sucursalId: 'savia-demo',
    sucursalNombre: 'Savia',
    modo: 'recuperar',
    semanaVista: semana,
    horarios: {
      horaInicioManana: '07:00',
      horaFinManana: '13:00',
      horaInicioTarde: '16:00',
      horaFinTarde: '21:00',
      horariosNoDisponiblesPorDia: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
      minutosAntesLiberarClase: 60,
      minutosAntesAnotarseClase: 30,
    },
    clasesFijas: [
      { id: 't-mar', diaSemana: 1, hora: '10:00', titulo: 'Reformer' },
      { id: 't-jue', diaSemana: 3, hora: '18:30', titulo: 'Reformer' },
    ],
    turnos: [
      { id: 't-mar', diaSemana: 1, hora: '10:00', titulo: 'Reformer', cupo: 5, inscriptos: 3, yaInscripto: true, esClaseFija: true, claseLiberada: false },
      { id: 't-jue', diaSemana: 3, hora: '18:30', titulo: 'Reformer', cupo: 5, inscriptos: 4, yaInscripto: true, esClaseFija: true, claseLiberada: false },
      { id: 't-vie', diaSemana: 4, hora: '09:00', titulo: 'Reformer', cupo: 5, inscriptos: 2, yaInscripto: false, esClaseFija: false },
    ],
    historialAsistencias: [
      { id: 'h1', turnoId: 't-mar', semana: '2026-42', diaSemana: 1, hora: '10:00', titulo: 'Reformer', fecha: '2026-10-20', estado: 'asistio', createdAt: '2026-10-20T13:00:00.000Z' },
      { id: 'h2', turnoId: 't-jue', semana: '2026-42', diaSemana: 3, hora: '18:30', titulo: 'Reformer', fecha: '2026-10-15', estado: 'asistio', createdAt: '2026-10-15T21:30:00.000Z' },
      { id: 'h3', turnoId: 't-mar', semana: '2026-41', diaSemana: 1, hora: '10:00', titulo: 'Reformer', fecha: '2026-10-13', estado: 'no_asistio', createdAt: '2026-10-13T13:00:00.000Z' },
    ],
    cierresPorFecha: {},
    recuperacionStats: {
      clasesPorSemana: 2,
      clasesFijasSemana: 2,
      recuperacionesSemana: 0,
      clasesUsadasSemana: 0,
      clasesParaRecuperar: 1,
      clasesDisponiblesSemana: 2,
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickTexto(page, texto) {
  const ok = await page.evaluate((t) => {
    const nodes = [...document.querySelectorAll('button, a, label')];
    const el = nodes.find((n) => (n.innerText || '').replace(/\s+/g, ' ').includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, texto);
  if (!ok) throw new Error('No encontré: ' + texto);
}

async function clickRadio(page, grupo, valor) {
  const ok = await page.evaluate((grupo, valor) => {
    const input = document.querySelector(`input[name="${grupo}"][value="${valor}"], input[name="${grupo}"]`);
    const inputs = [...document.querySelectorAll(`input[name="${grupo}"]`)];
    const wanted = valor === 'si' ? 'Sí' : 'No';
    const label = inputs
      .map((i) => i.closest('label'))
      .find((l) => l && l.textContent.trim() === wanted);
    if (!label) return false;
    label.click();
    return true;
  }, grupo, valor);
  if (!ok) throw new Error(`No encontré ${grupo}=${valor}`);
}

async function scrollHasta(page, texto) {
  await page.evaluate((t) => {
    const nodes = [...document.querySelectorAll('h3, p, label, span, button')];
    const el = nodes.find((n) => (n.innerText || '').includes(t));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, texto);
  await sleep(900);
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setUserAgent(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/alumno-portal/ficha-salud')) {
    let ficha = {};
    try { ficha = JSON.parse(req.postData() || '{}').ficha || {}; } catch { /* ignore */ }
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, fichaSalud: { ...ficha, actualizadaEn: new Date().toISOString() } }),
    });
    return;
  }
  if (u.includes('/api/alumno-portal')) {
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(portalBody(u)),
    });
    return;
  }
  if (u.includes('/api/public/sucursal-brand')) {
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nombreLugar: 'Savia', logoUrl: '/savia.png' }),
    });
    return;
  }
  if (u.includes('/api/')) {
    req.respond({ status: 200, contentType: 'application/json', body: '{}' });
    return;
  }
  req.continue();
});

const client = await page.createCDPSession();
const frames = [];
client.on('Page.screencastFrame', async (ev) => {
  frames.push({
    buf: Buffer.from(ev.data, 'base64'),
    ts: Date.now() / 1000,
  });
  try { await client.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch { /* closed */ }
});
page.on('pageerror', (err) => console.error('pageerror', err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('console', msg.text());
});

await page.goto(`${base}/mi-clase?sucursalId=savia-demo&modo=recuperar`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('input[placeholder="Ej. 12345678"]', { timeout: 20000 });
await page.evaluate(() => {
  document.querySelector('button[aria-label="Cerrar"]')?.click();
});
await sleep(250);
await client.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 86,
  maxWidth: 780,
  maxHeight: 1688,
  everyNthFrame: 1,
});
await sleep(1400);

const dni = await page.$('input[placeholder="Ej. 12345678"]');
if (!dni) throw new Error('No está la pantalla de DNI');
await dni.click();
await dni.type('38451290', { delay: 110 });
await sleep(700);
await clickTexto(page, 'Entrar');
await page.waitForFunction(() => document.body.innerText.includes('Liberar / Recuperar'), { timeout: 8000 });
await sleep(1600);

await clickTexto(page, 'Mi perfil');
await page.waitForFunction(() => document.body.innerText.includes('Para recuperar'), { timeout: 8000 });
await sleep(1400);
await scrollHasta(page, 'Para recuperar');
await sleep(1400);
await scrollHasta(page, 'Historial de clases');
await sleep(1600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await sleep(900);

await clickTexto(page, 'Ficha de salud');
await page.waitForFunction(() => document.body.innerText.includes('Datos personales'), { timeout: 8000 });
await sleep(1200);

const nombre = await page.$('input[placeholder="Nombre"]');
await nombre.click();
await nombre.type('Marcos Fernández', { delay: 55 });
await sleep(400);
const tel = await page.$('input[placeholder="Teléfono"]');
await tel.click();
await tel.type('1151204477', { delay: 55 });
await sleep(600);

await scrollHasta(page, 'Antecedentes de salud');
await sleep(400);
await clickTexto(page, 'Problemas de columna o hernias');
await sleep(400);
const areas = await page.$$('textarea');
await areas[0].click();
await areas[0].type('Hernia lumbar. Cuidado al flexionar.', { delay: 40 });
await sleep(500);

await scrollHasta(page, '¿Tenés dolor o molestias actualmente?');
await sleep(300);
await clickRadio(page, 'dolor', 'si');
await sleep(400);
const dolor = await page.$('textarea');
const texts = await page.$$('textarea');
const dolorArea = texts[1] || texts[0];
await dolorArea.click();
await dolorArea.type('Molestia lumbar al redondear la espalda.', { delay: 35 });
await sleep(400);

await scrollHasta(page, 'indicación médica');
await sleep(300);
await clickRadio(page, 'indicacion', 'no');
await sleep(500);

await scrollHasta(page, '¿Tomás medicación');
await sleep(300);
await clickRadio(page, 'medicacion', 'no');
await sleep(400);
await scrollHasta(page, '¿Realizás otra actividad');
await sleep(300);
await clickRadio(page, 'actividad', 'si');
await sleep(400);
await page.evaluate(() => {
  const label = [...document.querySelectorAll('label')].find((l) => (l.innerText || '').trim().startsWith('¿Cuál'));
  label?.querySelector('input')?.focus();
});
await page.keyboard.type('Caminata, 3 veces por semana', { delay: 35 });
await sleep(400);

await scrollHasta(page, 'Objetivos');
await sleep(300);
await clickTexto(page, 'Postura');
await sleep(250);
await clickTexto(page, 'Bienestar');
await sleep(400);

await scrollHasta(page, 'Acepto la declaración');
await sleep(400);
await clickTexto(page, 'Acepto la declaración');
await sleep(500);
await scrollHasta(page, 'Guardar ficha');
await sleep(500);
const aviso = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Guardar ficha'));
  const nota = document.body.innerText.match(/Completá|Respondé|Marcá|Tenés que|Contá/)?.[0] || '';
  return { disabled: !!btn?.disabled, nota };
});
if (aviso.disabled) throw new Error('Guardar sigue deshabilitado. ' + aviso.nota);
await clickTexto(page, 'Guardar ficha');
await page.waitForFunction(() => document.body.innerText.includes('Ya está completa'), { timeout: 8000 });
await page.waitForFunction(() => !document.body.innerText.includes('Ficha de salud guardada'), { timeout: 8000 });
await sleep(500);
await scrollHasta(page, 'Ya está completa');
await sleep(2200);

const fin = Date.now() / 1000;
await client.send('Page.stopScreencast').catch(() => {});
await sleep(200);
await browser.close();

if (frames.length < 10) throw new Error('Casi no hubo cuadros: ' + frames.length);
const dir = path.join(tmpdir(), 'ficha-real-frames');
mkdirSync(dir, { recursive: true });
const lines = ['ffconcat version 1.0'];
for (let i = 0; i < frames.length; i++) {
  const file = path.join(dir, `f${String(i).padStart(4, '0')}.jpg`);
  writeFileSync(file, frames[i].buf);
  const nextTs = frames[i + 1]?.ts ?? fin;
  const dur = Math.min(3, Math.max(0.04, nextTs - frames[i].ts));
  lines.push(`file '${file}'`);
  lines.push(`duration ${dur.toFixed(3)}`);
}
lines.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(4, '0')}.jpg`)}'`);
const list = path.join(dir, 'list.txt');
writeFileSync(list, lines.join('\n'));

await new Promise((resolve, reject) => {
  const ff = spawn('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=1080:2338:flags=lanczos',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'veryfast',
    '-movflags', '+faststart',
    out,
  ], { stdio: 'inherit' });
  ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg ' + code))));
});
console.log('frames', frames.length, 'out', out);
