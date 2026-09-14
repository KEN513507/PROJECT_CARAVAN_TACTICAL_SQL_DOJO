const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8000/';

async function setup(browser, touch = true) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if(msg.type() === 'warning' && msg.text().startsWith('BGM ')) errors.push(msg.text()); });
  // Expose state only in the test response; audio playback remains native.
  await page.route('**/js/app.js', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace('new App();', 'window.testApp = new App(); window.testBgm = bgm;');
    await route.fulfill({ response, body: source });
  });
  await page.addInitScript(() => {
    window.audioPlays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      window.audioPlays.push({ src: this.src, volume: this.volume, loop: this.loop, at: performance.now() });
      return play.call(this);
    };
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.testApp);
  assert.equal(await page.evaluate(() => window.audioPlays.length), 0, 'No play before first gesture');
  return { page, context, errors };
}

async function playing(page, name, volume = 0.25) {
  await page.waitForFunction(({ name, volume }) => {
    const b = window.testBgm;
    return b.name === name && b.current && !b.current.paused && b.current.currentTime > 0 &&
      b.current.readyState >= 2 && Math.abs(b.current.volume - volume) < 0.001;
  }, { name, volume }, { timeout: 10000 });
}

async function solve(page, stage) {
  const data = await page.evaluate(async stage => {
    const { STAGES } = await import('/js/data.js');
    const st = STAGES[stage];
    let sql = st.answers[0];
    const tokens = [...st.tokens].sort((a, b) => b.t.length - a.t.length);
    const sequence = [];
    while(sql.length) {
      sql = sql.replace(/^[\s,]+/, '');
      if(!sql) break;
      const token = tokens.find(t => sql.startsWith(t.t));
      if(!token) throw new Error('Unmatched answer: ' + sql);
      sequence.push(token.t);
      sql = sql.slice(token.t.length);
    }
    return { sequence, rows: st.resultSet.rows.length };
  }, stage);
  for(const token of data.sequence) {
    await page.locator('.tok').filter({ hasText: new RegExp('^' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).click();
  }
  await page.click('#runBtn');
  await page.locator(`.predict-btn[data-rows="${data.rows}"]`).click();
  await page.waitForSelector('#runBtn.solved');
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { page, context, errors } = await setup(browser);
    await page.locator('#missionLevel').tap();
    await playing(page, 'airy');
    assert.equal(await page.evaluate(() => testBgm.current.loop), true);
    await page.click('#hintBtn');
    await playing(page, 'airy', 0.075);
    await playing(page, 'airy');
    await page.click('#orderBtn');
    await playing(page, 'airy', 0.075);
    await page.click('#drawerClose');
    await playing(page, 'airy');
    console.log('PASS: first touch starts native loop; hint/order duck and restore');

    const tracks = ['airy', 'pulse', 'pulse', 'transmission'];
    for(let stage = 0; stage < 4; stage++) {
      await playing(page, tracks[stage]);
      await page.evaluate(() => { window.previousAudio = testBgm.current; });
      await solve(page, stage);
      await playing(page, 'victory', 0.6);
      assert.equal(await page.evaluate(() => testBgm.current.loop), false);
      await page.waitForFunction(() => previousAudio.paused && previousAudio.volume === 0);
      await playing(page, tracks[stage]);
      const timing = await page.evaluate(() => {
        const logs = audioPlays;
        return logs.at(-1).at - logs.at(-2).at;
      });
      assert.ok(timing >= 1450 && timing < 2200, `Victory resume delay: ${timing}`);
      console.log(`PASS: CH${stage + 1} ${tracks[stage]} -> victory (0.6, once) -> ${tracks[stage]} (${Math.round(timing)}ms); previous audio faded/stopped`);
      await page.click('#runBtn');
    }
    await playing(page, 'title');
    await page.click('#storyContinueBtn');
    await playing(page, 'title');
    await page.click('#restartBtn');
    await playing(page, 'airy');
    console.log('PASS: story/result title and restart airy');

    // Shorten only the countdown; retain the real interval and timeout handlers.
    await page.evaluate(() => { testApp.timeLeft = 11; });
    await playing(page, 'urgent');
    const urgentPlays = await page.evaluate(() => audioPlays.length);
    await page.evaluate(() => { testApp.timeLeft = 1; });
    await page.waitForFunction(() => testApp.timedOut);
    assert.equal(await page.evaluate(() => audioPlays.length), urgentPlays, 'Urgent must not restart on timeout');
    await page.click('#retryBtn');
    await playing(page, 'airy');
    await solve(page, 0);
    await playing(page, 'victory', 0.6);
    await page.click('#runBtn');
    await playing(page, 'pulse');
    await page.waitForTimeout(1800);
    await playing(page, 'pulse');
    assert.equal(await page.evaluate(() => testApp.bgmResumeTimer), null);
    console.log('PASS: urgent at 10 seconds, timeout, retry, and early chapter transition cancel stale victory resume');

    await page.evaluate(() => { testApp.stopTimer(); window.stoppedAudio = testBgm.current; testBgm.stop(); });
    await page.waitForFunction(() => stoppedAudio.paused && stoppedAudio.volume === 0);
    assert.deepEqual(errors, []);
    const files = await page.evaluate(() => [...new Set(audioPlays.map(x => x.src.split('/').at(-1)))]);
    assert.ok(files.every(name => name.endsWith('_loop.m4a') || name === 'victory.m4a'));
    console.log('PASS: stop fades; no playback/browser errors; files: ' + files.join(', '));
    await context.close();

    const desktop = await setup(browser, false);
    await desktop.page.click('#missionLevel');
    await playing(desktop.page, 'airy');
    assert.deepEqual(desktop.errors, []);
    await desktop.context.close();
    console.log('PASS: desktop first click unlocks playback');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
