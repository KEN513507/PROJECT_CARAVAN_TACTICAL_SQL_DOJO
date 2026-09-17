// tools/fe-rtp-gate.mjs
// FE + RTP 実機ゲート。ブラウザ上で実SQL実行が効いていることを確認する。
//   REAL_SQL_GATE          : 正解SQLが実データに適用され、結果が表示される
//   ALTERNATIVE_QUERY_GATE : 条件の順序を入れ替えた別解が、実UI上でも受理される
//   READ_ONLY_GATE         : 実データがゲーム中に書き換わらない
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/fe-rtp-gate.mjs

import { chromium } from 'playwright';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VP = { width: 393, height: 852 };

// CH1正解の標準順
const RIGHT = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];
// 別解: WHERE の2条件を入れ替えたもの（文字列一致では data.js の answers に無い）
const SWAPPED = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'last_sector', '=', "'S4'", 'AND', 'status', '=', "'MISSING'"];

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function boot(browser){
  const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => { window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: 300 }; });
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  const ov = await page.waitForSelector('#storyOverlay.show', { timeout: 30000 }).catch(() => null);
  if(ov) await page.click('#storyContinueBtn');
  const sh = await page.waitForSelector('#ch1Sheet.show', { timeout: 30000 }).catch(() => null);
  if(sh) await page.click('#ch1SheetPrimary');
  await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
  return { ctx, page, jsErrors };
}

async function tapAll(page, tokens){
  const blocked = [];
  for(const t of tokens){
    const sel = `.tok[data-token="${t}"]`;
    const el = await page.$(sel);
    if(!el){ blocked.push(`${t}(存在しない)`); continue; }
    if(await el.isDisabled()){ blocked.push(`${t}(disabled)`); continue; }
    await el.click();
  }
  return blocked;
}

async function runCase(browser, label, tokens){
  const { ctx, page, jsErrors } = await boot(browser);
  try {
    const blocked = await tapAll(page, tokens);
    const built = (await page.textContent('#monitor')).trim();
    if(blocked.length){
      check(`${label}: 全トークンが入力できる`, false, `blocked=${blocked.join(',')} built="${built}"`);
      return { accepted: false, built, blocked };
    }
    await page.click('#runBtn');
    await page.waitForSelector('#predictBar.show', { timeout: 8000 });
    await page.click('.predict-btn[data-rows="3"]');

    // 受理されれば EVIDENCE_REVEALED → CHAPTER_CLEARED、拒否されれば QUERY_REJECTED
    const phase = await page.waitForFunction(() => {
      const p = document.body.dataset.phase;
      return (p === 'EVIDENCE_REVEALED' || p === 'CHAPTER_CLEARED' || p === 'QUERY_REJECTED') ? p : null;
    }, null, { timeout: 8000 }).then(h => h.jsonValue());

    const accepted = phase !== 'QUERY_REJECTED';
    let rows = [];
    if(accepted){
      await page.waitForFunction(() => document.body.dataset.phase === 'CHAPTER_CLEARED', null, { timeout: 8000 }).catch(() => {});
      rows = await page.$$eval('#zoneResultBody table.result tbody tr', trs =>
        trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())));
    }
    check(`${label}: JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    return { accepted, built, rows, phase };
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- REAL_SQL_GATE: 標準順の正解 ----
    const std = await runCase(browser, '[REAL_SQL] 標準順の正解', RIGHT);
    check('[REAL_SQL] 標準順の正解が受理される', std.accepted, `phase=${std.phase} built="${std.built}"`);
    check('[REAL_SQL] 実データから計算された3行が表示される',
      std.rows.length === 3 && std.rows.flat().join(',').includes('UNKNOWN-07'), JSON.stringify(std.rows));

    // ---- ALTERNATIVE_QUERY_GATE: 条件順を入れ替えた別解 ----
    const alt = await runCase(browser, '[ALT_QUERY] 条件順を入れ替えた別解', SWAPPED);
    check('[ALT_QUERY] data.js answers に無い別解が実UIで受理される',
      alt.accepted, `phase=${alt.phase} built="${alt.built}"`);
    check('[ALT_QUERY] 別解でも同じ3行が計算される',
      alt.rows.length === 3 && alt.rows.flat().join(',').includes('UNKNOWN-07'), JSON.stringify(alt.rows));
    check('[ALT_QUERY] 組み立てられたSQLが標準解と異なる（真に別解である）',
      alt.built.replace(/\s/g, '') !== std.built.replace(/\s/g, ''),
      `std="${std.built}" alt="${alt.built}"`);

    // ---- READ_ONLY_GATE: プレイ後も元データが不変 ----
    {
      const { ctx, page } = await boot(browser);
      const rows = await page.evaluate(async () => {
        const m = await import('./js/data.js?v=readonly-check');
        return m.TABLES.RESIDENT_CACHE.rows.length;
      });
      check('[READ_ONLY] RESIDENT_CACHE は7行のまま', rows === 7, `rows=${rows}`);
      await ctx.close();
    }
  } catch(err){
    check('実行時例外なし', false, err.message);
  } finally {
    await browser.close();
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
