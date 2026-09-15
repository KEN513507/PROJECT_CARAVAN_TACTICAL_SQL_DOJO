const { chromium } = require('playwright');
const WRONG_SEQUENCE = ['SELECT', 'resident_id', 'FROM', 'RESIDENT_CACHE', 'WHERE', 'status', '=', "'MISSING'"];
const RIGHT_SEQUENCE = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  await page.addInitScript(() => { try{ localStorage.setItem('caravan_intro_seen','true'); localStorage.setItem('caravan_tutorial_seen','true'); }catch(e){} });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });

  // wrong answer -> retry -> should still work (draft cleared, tokens re-tappable)
  for (const token of WRONG_SEQUENCE) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="1"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="1"]');
  await page.waitForTimeout(300);
  console.log('after wrong #1 feedback:', await page.textContent('#feedback'));
  await page.click('#retryBtn');
  await page.waitForTimeout(200);
  // check monitor is empty (draft cleared) and token pad usable again
  const monitorAfterRetry = await page.textContent('#monitor');
  console.log('monitor after retry:', monitorAfterRetry.trim().slice(0,60));

  // second wrong attempt -> escalated hint text should show (fail count persists across retry)
  for (const token of WRONG_SEQUENCE) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="1"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="1"]');
  await page.waitForTimeout(300);
  console.log('after wrong #2 feedback:', await page.textContent('#feedback'));
  await page.click('#retryBtn');
  await page.waitForTimeout(200);

  // now solve correctly
  for (const token of RIGHT_SEQUENCE) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="3"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="3"]');
  await page.waitForTimeout(1200);
  console.log('after correct feedback:', await page.textContent('#feedback'));
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('caravan_progress')));
  console.log('progress:', JSON.stringify(progress));

  await browser.close();
})();
