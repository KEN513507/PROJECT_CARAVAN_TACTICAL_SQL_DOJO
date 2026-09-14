// tools/overlap-check.js
// Static overlap detector for PROJECT CARAVAN: TACTICAL SQL DOJO.
// Requires the app to be served locally (e.g. `python -m http.server 8000`)
// before running: `npm run overlap`

const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8000/';

const VIEWPORTS = [
  { name: 'iPhone 16e', width: 393, height: 852 },
  { name: 'iPhone SE',  width: 375, height: 667 },
  { name: 'PC',         width: 1280, height: 800 }
];

// MISSION 1 (WHERE + AND) の正解を組み立てるトークン列（順にタップ）
const TOKEN_SEQUENCE = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];

async function runFlow(page) {
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
  for (const token of TOKEN_SEQUENCE) {
    await page.click(`.tok[data-token="${token}"]`, { timeout: 5000 });
  }
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn[data-rows="3"]', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="3"]');
  await page.waitForTimeout(400); // CSSトランジション(フェード)の完了を待つ
}

async function collectOverlaps(page) {
  return page.evaluate(() => {
    function describe(el) {
      const id = el.id ? '#' + el.id : '';
      const cls = (el.className && typeof el.className === 'string' && el.className.trim())
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '';
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls} "${text}"`;
    }

    function hasDirectText(el) {
      for (const node of el.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim().length > 0) return true;
      }
      return false;
    }

    function elementHidden(el) {
      const cs = getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0;
    }

    // getBoundingClientRect() は祖先の overflow:hidden/auto/scroll によるクリッピングや
    // transform で画面外に押し出された要素の位置を考慮しないため、
    // 実際にユーザーへ見えている範囲（クリップ後の可視矩形）を別途計算する。
    function visibleRect(el, vw, vh) {
      let node = el;
      while (node) {
        if (node.nodeType === 1 && elementHidden(node)) return null;
        node = node.parentElement;
      }

      const r = el.getBoundingClientRect();
      let left = r.left, right = r.right, top = r.top, bottom = r.bottom;

      let ancestor = el.parentElement;
      while (ancestor) {
        const cs = getComputedStyle(ancestor);
        const clips = /(auto|hidden|scroll|clip)/.test(cs.overflow) ||
                      /(auto|hidden|scroll|clip)/.test(cs.overflowX) ||
                      /(auto|hidden|scroll|clip)/.test(cs.overflowY);
        if (clips) {
          const ar = ancestor.getBoundingClientRect();
          left = Math.max(left, ar.left);
          right = Math.min(right, ar.right);
          top = Math.max(top, ar.top);
          bottom = Math.min(bottom, ar.bottom);
        }
        ancestor = ancestor.parentElement;
      }

      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, vw);
      bottom = Math.min(bottom, vh);

      const width = right - left;
      const height = bottom - top;
      if (width <= 0.5 || height <= 0.5) return null;
      return { left, top, right, bottom };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const candidates = Array.from(document.querySelectorAll('body *'))
      .filter(hasDirectText)
      .map(el => ({ el, rect: visibleRect(el, vw, vh) }))
      .filter(item => item.rect !== null);

    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // 祖先-子孫関係は除外

        const overlap = a.rect.left < b.rect.right && a.rect.right > b.rect.left &&
                         a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top;
        if (overlap) {
          results.push([describe(a.el), describe(b.el)]);
        }
      }
    }
    return results;
  });
}

async function checkViewport(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await runFlow(page);
    const overlaps = await collectOverlaps(page);
    return overlaps;
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  let totalOverlaps = 0;

  try {
    for (const viewport of VIEWPORTS) {
      const label = `${viewport.name} (${viewport.width}x${viewport.height})`;
      let overlaps;
      try {
        overlaps = await checkViewport(browser, viewport);
      } catch (err) {
        console.error(`[${label}] ERROR: ${err.message}`);
        totalOverlaps++;
        continue;
      }

      if (overlaps.length === 0) {
        console.log(`[${label}] no overlaps`);
      } else {
        for (const [a, b] of overlaps) {
          console.log(`[${label}] OVERLAP: [${a}] x [${b}]`);
        }
        totalOverlaps += overlaps.length;
      }
    }
  } finally {
    await browser.close();
  }

  if (totalOverlaps === 0) {
    console.log('✅ No overlaps');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
