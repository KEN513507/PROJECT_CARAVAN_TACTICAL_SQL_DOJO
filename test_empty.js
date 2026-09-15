const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  await page.addInitScript(() => { try{ localStorage.setItem('caravan_intro_seen','true'); localStorage.setItem('caravan_tutorial_seen','true'); }catch(e){} });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });

  // build a draft consisting only of a newline (whitespace-only) via the util bar
  await page.click('.util[data-util="br"]');
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="1"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="1"]');
  await page.waitForTimeout(300);
  console.log('feedback after empty submit:', await page.textContent('#feedback'));

  // session should now be back in a state that accepts new tokens (not softlocked)
  await page.click('.tok[data-token="SELECT"]');
  await page.waitForTimeout(150);
  const monitor = await page.textContent('#monitor');
  console.log('monitor after tapping SELECT post-empty-reject:', monitor.trim().slice(0, 60));
  const selectDisabled = await page.$eval('.tok[data-token="SELECT"]', el => el.disabled);
  console.log('SELECT still tappable (was just tapped, so should now be disabled correctly by FSM, not stuck):', selectDisabled);
  await browser.close();
})();
