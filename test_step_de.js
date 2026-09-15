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

  // fail 5 times (escalation should now be driven by session.rejectionCount)
  for (let n = 1; n <= 5; n++) {
    for (const token of WRONG_SEQUENCE) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
    await page.click('#runBtn');
    await page.waitForSelector('.predict-btn[data-rows="1"]', { timeout: 5000 });
    await page.click('.predict-btn[data-rows="1"]');
    await page.waitForTimeout(250);
    const feedback = await page.textContent('#feedback');
    const hint = await page.textContent('#hintLine');
    console.log(`fail#${n} feedback="${feedback}" hint="${hint}"`);
    await page.click('#retryBtn');
    await page.waitForTimeout(150);
  }

  // now solve correctly -> should be PRACTICE-ish clear type via session (assistanceLevel by then = 2: hint at n=4, n=5)
  for (const token of RIGHT_SEQUENCE) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="3"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="3"]');
  await page.waitForTimeout(1200);
  console.log('correct feedback:', await page.textContent('#feedback'));
  const progress1 = await page.evaluate(() => JSON.parse(localStorage.getItem('caravan_progress')));
  console.log('progress after CH1 clear:', JSON.stringify(progress1));
  const workspace1 = await page.evaluate(() => document.body.dataset.workspace);
  console.log('workspace right after clear (should be story):', workspace1);

  // proceed to CH2 via next()
  await page.click('#runBtn');
  await page.waitForTimeout(300);
  const auditVisible = await page.evaluate(() => document.getElementById('auditLog').classList.contains('show'));
  console.log('auditLog visible during CH1->CH2 transition:', auditVisible);
  await page.waitForTimeout(1800);
  const stageLabel = await page.evaluate(() => document.getElementById('stageLabel').textContent);
  console.log('stage label after transition:', stageLabel);

  // CH2 should behave completely normally (uses a fresh session under the hood)
  const ch2Tokens = ['SELECT', 'destination', 'SUM(quantity)', 'AS', 'total_quantity', 'FROM', 'SUPPLY_TRANSFER_0911', 'GROUP BY', 'destination'];
  for (const token of ch2Tokens) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="4"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="4"]');
  await page.waitForTimeout(500);
  console.log('CH2 correct feedback:', await page.textContent('#feedback'));
  const workspace2 = await page.evaluate(() => document.body.dataset.workspace);
  console.log('workspace during CH2 (should stay undefined/unchanged, CH1-only feature):', workspace2);

  await browser.close();
})();
