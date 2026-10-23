import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(path.join(here, 'index.html')).href;
const out = path.resolve(here, '../../tutorial-ficha-salud.mp4');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 24;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(html, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);
const frames = Math.round(duration * FPS);

const ff = spawn('ffmpeg', [
  '-y',
  '-f', 'image2pipe',
  '-vcodec', 'mjpeg',
  '-framerate', String(FPS),
  '-i', '-',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-crf', '17',
  '-preset', 'veryfast',
  '-movflags', '+faststart',
  out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.renderAt(t), i / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 48 === 0) console.log(`frame ${i}/${frames}`);
}
ff.stdin.end();
await new Promise((resolve, reject) => {
  ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg ' + code))));
});
await browser.close();
console.log(out, duration);
