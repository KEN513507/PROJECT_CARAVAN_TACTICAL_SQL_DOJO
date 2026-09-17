// tools/ux-test-helpers.mjs
// UX Decoder A/B 共有の契約検査ヘルパー。ChapterSessionには一切依存しない。

export async function measureRect(page, selector){
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.x, y: r.y, width: r.width, height: r.height,
      top: r.top, bottom: r.bottom, left: r.left, right: r.right
    };
  }, selector);
}

export async function checkContract(page, contract){
  const results = [];
  for(const sel of (contract.mustBeVisible || [])){
    const visible = await page.isVisible(sel).catch(() => false);
    results.push({
      check: `visible:${sel}`, pass: visible,
      message: visible ? '' : `${sel} not visible`
    });
  }
  for(const sel of (contract.mustBeHidden || [])){
    const visible = await page.isVisible(sel).catch(() => false);
    results.push({
      check: `hidden:${sel}`, pass: !visible,
      message: !visible ? '' : `${sel} is visible`
    });
  }
  for(const [sel, minH] of Object.entries(contract.minHeight || {})){
    const r = await measureRect(page, sel);
    const h = r?.height ?? 0;
    results.push({
      check: `minHeight:${sel}>=${minH}`, pass: h >= minH,
      message: h >= minH ? '' : `${sel} h=${h}`
    });
  }
  if(contract.minAreaRatio){
    const vp = page.viewportSize();
    const vpArea = vp.width * vp.height;
    for(const [sel, ratio] of Object.entries(contract.minAreaRatio)){
      const r = await measureRect(page, sel);
      const area = (r?.width ?? 0) * (r?.height ?? 0);
      const actual = area / vpArea;
      results.push({
        check: `minAreaRatio:${sel}>=${ratio}`, pass: actual >= ratio,
        message: actual >= ratio ? '' : `${sel} r=${actual.toFixed(2)}`
      });
    }
  }
  if(contract.pageScroll === false){
    const scrollable = await page.evaluate(() => {
      return document.documentElement.scrollHeight > window.innerHeight + 1;
    });
    results.push({
      check: 'pageScroll:false', pass: !scrollable,
      message: scrollable ? 'page scroll detected' : ''
    });
  }
  return results;
}

export function summarize(results){
  const fails = results.filter(r => !r.pass);
  return {
    total: results.length,
    pass: results.length - fails.length,
    fail: fails.length,
    failures: fails
  };
}
