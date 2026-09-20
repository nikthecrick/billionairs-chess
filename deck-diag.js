// Fast single-deck probe: is the chosen deck's portraits loading in-game?
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');

const PORT = 3212;
const DECK = process.argv[2] || 'silicon-valley';
const TIMEOUT = 25000;

(async () => {
  const server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });
  await new Promise(r => setTimeout(r, 700));

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 900 });

  const events = [];
  page.on('pageerror', e => events.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') events.push('CONSOLE: ' + m.text());
  });
  page.on('requestfailed', r => events.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

  const ready = await page.waitForFunction(() => !!window.game && !!window.loadImage, { timeout: 10000 }).then(() => true).catch(() => false);
  if (!ready) {
    console.log('SETUP_FAILED: globals missing');
    console.log('EVENTS:', JSON.stringify(events));
    await browser.close(); server.kill(); process.exit(0);
  }

  await page.evaluate(() => {
    window.__imgResults = [];
    window.__fallbackCalls = [];
    const origLoad = window.loadImage;
    window.loadImage = function (url) {
      return origLoad(url).then(img => {
        window.__imgResults.push({ url: url.split('/').slice(-2).join('/'), ok: !!img, w: img ? img.naturalWidth : 0 });
        return img;
      });
    };
    const origFb = window.createFallbackTexture;
    window.createFallbackTexture = function (color) {
      window.__fallbackCalls.push(color);
      return origFb(color);
    };
  });

  await page.click(`.deck-option[data-deck="${DECK}"]`);
  await page.click('#btn-local');
  await page.waitForFunction(() => window.game?.piecesReady === true, { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 400));

  const state = await page.evaluate(() => ({
    deck: window.game?.selectedDeck,
    currentDeckId: (typeof currentDeckId !== 'undefined') ? currentDeckId : 'unreachable',
    pieces: window.game?.chess3d?.pieces?.length ?? null,
    ready: window.game?.piecesReady ?? null,
    imgResults: window.__imgResults,
    fallbackCalls: window.__fallbackCalls
  }));
  console.log('DECK:', DECK);
  console.log('STATE:', JSON.stringify(state));
  console.log('EVENTS:', JSON.stringify(events));

  await browser.close();
  server.kill();
  process.exit(0);
})().catch(e => { console.error('HARNESS_ERROR:', e.message); process.exit(1); });
