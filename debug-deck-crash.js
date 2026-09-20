// Debug harness: reproduce the deck-switch crash in headless Chrome.
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');

const PORT = 3210;

(async () => {
  const server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });
  await new Promise(r => setTimeout(r, 1000));

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=800,1200']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 1200 });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`CONSOLE[${m.type()}]: ` + m.text());
  });
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

  const log = (...a) => console.log(...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = async () => await page.evaluate(() => ({
    gameScreen: !document.getElementById('game-screen').classList.contains('hidden'),
    pieces: window.game?.chess3d?.pieces?.length ?? null,
    disposed: window.game?.chess3d?.disposed ?? null,
    ready: window.game?.piecesReady ?? null
  }));

  try {
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle2', timeout: 20000 });
    log('loaded menu');

    await page.click('#btn-local');
    await sleep(2500);
    log('game 1:', JSON.stringify(await state()));

    await page.click('#btn-menu');
    await sleep(800);

    await page.click('.deck-option[data-deck="musicians"]');
    await sleep(500);
    log('deck changed to musicians, roster re-rendered');

    await page.click('#btn-local');
    await sleep(3000);
    log('game 2 (musicians):', JSON.stringify(await state()));

    await page.screenshot({ path: '/tmp/chess-after-deck-change.png' });

    // one more cycle for good measure
    await page.click('#btn-menu');
    await sleep(800);
    await page.click('.deck-option[data-deck="politicians"]');
    await sleep(500);
    await page.click('#btn-local');
    await sleep(3000);
    log('game 3 (politicians):', JSON.stringify(await state()));
    await page.screenshot({ path: '/tmp/chess-politicians.png' });
  } catch (e) {
    errors.push('HARNESS: ' + e.message);
  }

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.slice(0, 40).forEach(e => console.log(e));

  await browser.close();
  server.kill();
})().catch(e => { console.error(e); process.exit(1); });
