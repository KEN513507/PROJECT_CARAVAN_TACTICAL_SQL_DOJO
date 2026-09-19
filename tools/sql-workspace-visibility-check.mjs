// tools/sql-workspace-visibility-check.mjs
// SQL WORKSPACE VISIBILITY CONTRACT ゲート。
//   §1 SQL入力中もSource Tableへ戻れる / 解答に必要な値を省略しない
//   §2 iPhoneでは2表・3表を横並びにしない（縦積み）
//   §3 各TableはCard（見出し + Accordion）
//   §4 幅不足をフォント縮小・文字切断・ellipsis乱用で解決しない
//   §6 SQL Editor操作中もSource Dataへ即アクセス。切替でSQL draftを失わない
//   §8 実行後も SOURCE ↔ EXECUTED SQL ↔ RESULT を比較できる
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/sql-workspace-visibility-check.mjs

import { chromium } from 'playwright';
import { campaignProgress, learningCompletedPayload, storyStage, CAMPAIGN_LENGTH } from './campaign-index.mjs';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = {
  'iphone-se': { width: 375, height: 667 },
  'iphone-16e': { width: 393, height: 852 }
};
const MIN_FONT = 13;

// 検証するSQL Query章（index, 期待するsource table数）
const QUERY_STAGES = [
  { idx: 0, tables: 1, label: 'CH1' },
  { idx: 1, tables: 1, label: 'CH2' },
  { idx: 2, tables: 1, label: 'CH3' },
  { idx: 3, tables: 2, label: 'CH4' },
  { idx: 5, tables: 2, label: 'CH6' }
];

const CH6_SOLUTION = ['SELECT', 'c.resident_id', 'c.display_name', 'c.last_sector', 'e.sector', 'e.received_at',
  'FROM', 'RESIDENT_CACHE', 'AS', 'c', 'INNER JOIN', 'EVAC_RECEPTION', 'AS', 'e',
  'ON', 'c.resident_id', '=', 'e.resident_id', 'WHERE', 'c.resident_id', '=', "'R005'"];

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && detail !== '' ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function boot(ctx, stageIndex){
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(seed => {
    window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: 300 };
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    localStorage.setItem('neon_relay_campaign_v2', JSON.stringify(seed.learning));
    localStorage.setItem('caravan_progress', JSON.stringify(seed.progress));
  }, { learning: learningCompletedPayload(),
       progress: campaignProgress({ story: stageIndex,
         storyCleared: [true, true, true, true, true, false],
         // CH6 は復元事実を前提にするため、ここでは復元済みとして入る
         reconstructedFacts: { 'EVAC_RECEPTION.E442.resident_id': 'R005' } }) });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const ov = await page.waitForSelector('#storyOverlay.show', { timeout: 3000 }).catch(() => null);
  if(ov) await page.click('#storyContinueBtn');
  const sh = await page.waitForSelector('#ch1Sheet.show', { timeout: 3000 }).catch(() => null);
  if(sh) await page.click('#ch1SheetPrimary');
  await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
  return { page, jsErrors };
}

// すべての Table Card を開く（畳まれている表の中身も検証対象にする）
async function openAllCards(page){
  const n = await page.$$eval('.schema-card', els => els.length);
  for(let i = 0; i < n; i++){
    const open = await page.$$eval('.schema-card', (els, k) => els[k].open, i);
    if(!open) await page.click(`.schema-card:nth-of-type(${i + 1}) > summary`);
  }
  await page.waitForTimeout(150);
}

async function measure(page){
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.schema-card')];
    const r = e => e.getBoundingClientRect();
    // §2: 縦積み = すべてのカードが前のカードの下にある
    let stacked = true;
    for(let i = 1; i < cards.length; i++){
      if(r(cards[i]).top < r(cards[i - 1]).bottom - 1) stacked = false;
    }
    const cells = [...document.querySelectorAll('.schema-card td, .schema-card th')];
    const fontEls = [...document.querySelectorAll('.schema-card td, .schema-card th, .schema-card > summary')];
    return {
      cards: cards.length,
      isDetails: cards.every(c => c.tagName === 'DETAILS' && !!c.querySelector(':scope > summary')),
      summariesVisible: cards.every(c => c.querySelector(':scope > summary').checkVisibility()),
      summaryNames: cards.map(c => c.querySelector('.schema-name').textContent.trim()),
      stacked,
      // §1/§4: 切り詰められているセルが1つも無いこと
      clipped: cells.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()).slice(0, 6),
      ellipsisUsed: cells.filter(e => getComputedStyle(e).textOverflow === 'ellipsis').length,
      minFont: fontEls.length ? Math.min(...fontEls.map(e => parseFloat(getComputedStyle(e).fontSize))) : 0,
      // §6: Source と Editor が同時に存在する
      schemaVisible: document.getElementById('schemaPanel').checkVisibility(),
      editorVisible: document.getElementById('tokenPad').checkVisibility(),
      summaryTap: Math.min(...cards.map(c => r(c.querySelector(':scope > summary')).height)),
      pageScrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

async function auditViewport(browser, vpName){
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], hasTouch: true, isMobile: true });
  try {
    for(const st of QUERY_STAGES){
      const { page, jsErrors } = await boot(ctx, st.idx);
      const tag = `[${vpName}/${st.label}]`;

      // 畳まれた状態でも、すべての Source Table の見出しが見えていること（§1/§9）
      const closed = await measure(page);
      check(`${tag} Source Tableが ${st.tables} 枚ともCardとして見えている`,
        closed.cards === st.tables && closed.summariesVisible,
        `cards=${closed.cards} names=${closed.summaryNames.join(',')}`);
      check(`${tag} 各TableがCard(details/summary)である`, closed.isDetails);
      check(`${tag} Card見出しのタップ領域が44px以上`, closed.summaryTap >= 44, `${closed.summaryTap}px`);

      await openAllCards(page);
      const m = await measure(page);
      check(`${tag} 縦積みである（横並びにしない）`, m.stacked, `cards=${m.cards}`);
      check(`${tag} 省略されたセルが無い`, m.clipped.length === 0, m.clipped.join(' / '));
      check(`${tag} ellipsisを使っていない`, m.ellipsisUsed === 0, `${m.ellipsisUsed}件`);
      check(`${tag} フォントが${MIN_FONT}px以上`, m.minFont >= MIN_FONT, `${m.minFont}px`);
      check(`${tag} SourceとSQL Editorが同時に存在する`, m.schemaVisible && m.editorVisible,
        JSON.stringify({ s: m.schemaVisible, e: m.editorVisible }));
      check(`${tag} page scroll 0 (X/Y)`, m.pageScrollX <= 1 && m.pageScrollY <= 1,
        `x=${m.pageScrollX} y=${m.pageScrollY}`);
      check(`${tag} JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
      await page.close();
    }

    // ---- §6: Accordion操作でSQL draftを失わない ----
    {
      const { page } = await boot(ctx, 5);
      await page.click('.tok[data-token="SELECT"]');
      await page.click('.tok[data-token="c.resident_id"]');
      const before = (await page.textContent('#monitor')).trim();
      await page.click('.schema-card:nth-of-type(1) > summary');
      await page.click('.schema-card:nth-of-type(2) > summary');
      await page.click('.schema-card:nth-of-type(1) > summary');
      const after = (await page.textContent('#monitor')).trim();
      check('[§6] Source Tableを開閉してもSQL draftを失わない', before === after && before.length > 0,
        `before="${before}" after="${after}"`);
      await page.close();
    }

    // ---- §1/§8: 実行後も SOURCE ↔ SQL ↔ RESULT を比較できる ----
    {
      const { page } = await boot(ctx, 5);
      for(const t of CH6_SOLUTION){
        const el = await page.$(`.tok[data-token="${t}"]`);
        if(el && !(await el.isDisabled())) await el.click();
      }
      await page.click('#runBtn');
      const bar = await page.waitForSelector('#predictBar.show', { timeout: 8000 }).catch(() => null);
      if(bar) await page.click('.predict-btn[data-rows="1"]');
      await page.waitForFunction(() => document.body.dataset.workspace === 'success', null, { timeout: 15000 });

      await page.click('.zone-header[data-zone="problem"]');
      await page.waitForTimeout(250);
      const zone1 = await page.evaluate(() => {
        const tables = [...document.querySelectorAll('#zoneProblemBody .zone-table')];
        return {
          count: tables.length,
          visible: tables.every(t => t.checkVisibility()),
          names: tables.map(t => t.querySelector('h5').textContent.trim()),
          clipped: [...document.querySelectorAll('#zoneProblemBody .zone-grid td')]
            .filter(e => e.checkVisibility() && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim())
        };
      });
      check('[§8] 実行後もZONE 1でSource Tableへ戻れる',
        zone1.count === 2 && zone1.visible, JSON.stringify(zone1.names));
      check('[§8] ZONE 1のSource値が省略されていない', zone1.clipped.length === 0, zone1.clipped.join(' / '));

      await page.click('.zone-header[data-zone="result"]');
      await page.waitForTimeout(250);
      const zone2 = await page.evaluate(() => {
        const sql = document.querySelector('#zoneResultBody .zone-sql');
        const res = document.querySelector('#zoneResultBody table.result');
        return {
          sqlVisible: !!sql && sql.checkVisibility(),
          resultVisible: !!res && res.checkVisibility(),
          sql: sql ? sql.textContent.trim().slice(0, 40) : ''
        };
      });
      check('[§8] EXECUTED SQL と RESULT が同じ画面で見える',
        zone2.sqlVisible && zone2.resultVisible, JSON.stringify(zone2));
      await page.close();
    }
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for(const vp of Object.keys(VIEWPORTS)) await auditViewport(browser, vp);
  } catch(err){
    check('実行時例外なし', false, err.stack ? err.stack.split('\n').slice(0, 2).join(' ') : err.message);
  } finally {
    await browser.close();
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
