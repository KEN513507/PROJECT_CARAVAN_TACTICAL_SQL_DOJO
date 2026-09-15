const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('response', r => { if (r.status() === 404) console.log('404:', r.url()); });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await browser.close();
})();
