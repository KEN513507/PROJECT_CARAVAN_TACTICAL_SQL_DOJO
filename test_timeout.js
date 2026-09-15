const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  await page.addInitScript(() => { try{ localStorage.setItem('caravan_intro_seen','true'); localStorage.setItem('caravan_tutorial_seen','true'); }catch(e){} });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
  await page.click('.tok[data-token="SELECT"]'); // build partial draft, then let it time out
  await page.waitForTimeout(61000); // CH1 time=60s
  console.log('feedback after timeout:', await page.textContent('#feedback'));
  await page.click('#retryBtn');
  await page.waitForTimeout(300);
  console.log('feedback after retry-from-timeout:', await page.textContent('#feedback'));
  await page.click('.tok[data-token="SELECT"]');
  await page.waitForTimeout(150);
  console.log('monitor after tapping SELECT post-timeout-retry:', (await page.textContent('#monitor')).trim().slice(0,40));
  await browser.close();
})();
