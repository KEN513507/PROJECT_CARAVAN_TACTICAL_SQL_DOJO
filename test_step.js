const { chromium } = require('playwright');
const TOKEN_SEQUENCE = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  await page.addInitScript(() => { try{ localStorage.setItem('caravan_intro_seen','true'); localStorage.setItem('caravan_tutorial_seen','true'); }catch(e){} });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
  for (const token of TOKEN_SEQUENCE) await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="3"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="3"]');
  await page.waitForTimeout(1200);
  const feedback = await page.textContent('#feedback');
  console.log('feedback:', feedback);
  const runBtnText = await page.textContent('#runBtn');
  console.log('runBtn:', runBtnText);
  await browser.close();
})();
