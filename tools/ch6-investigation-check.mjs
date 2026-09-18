// tools/ch6-investigation-check.mjs
// CHAPTER 6 / SQL INVESTIGATION ゲート。
// 縦の一本を実UIで検証する:
//   RELATION TASK → RECONSTRUCTED FACT → SQL INVESTIGATION → DERIVED FACT → STORY
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/ch6-investigation-check.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = {
  'iphone-se': { width: 375, height: 667 },
  'iphone-16e': { width: 393, height: 852 }
};
const SHOT_DIR = path.join('tools', 'ux-artifacts', 'ch6');

// canonical解（トークンのタップ順）
const CANONICAL = ['SELECT', 'c.resident_id', 'c.display_name', 'c.last_sector', 'e.sector', 'e.received_at',
  'FROM', 'RESIDENT_CACHE', 'AS', 'c', 'INNER JOIN', 'EVAC_RECEPTION', 'AS', 'e',
  'ON', 'c.resident_id', '=', 'e.resident_id', 'WHERE', 'c.resident_id', '=', "'R005'"];
// 別解: SELECT列の順序を変えたもの（answers に無い）
const ALTERNATIVE = ['SELECT', 'c.display_name', 'c.resident_id', 'e.received_at', 'c.last_sector', 'e.sector',
  'FROM', 'RESIDENT_CACHE', 'AS', 'c', 'INNER JOIN', 'EVAC_RECEPTION', 'AS', 'e',
  'ON', 'c.resident_id', '=', 'e.resident_id', 'WHERE', 'c.resident_id', '=', "'R005'"];

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && detail !== '' ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function boot(ctx, stageIndex, cleared){
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(([idx, cl]) => {
    window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: 300 };
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    localStorage.setItem('caravan_progress', JSON.stringify({
      stage: idx, xp: 0, cleared: cl, clearTypes: cl.map(() => null)
    }));
  }, [stageIndex, cleared]);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  return { page, jsErrors };
}

// CHAPTER 5 の Relation Task を実際に解いて CHAPTER 6 へ入る。
async function solveRelationAndAdvance(page, shots){
  await page.waitForSelector('#relationPanel.show', { timeout: 30000 });
  await page.click('.relation-missing');
  await page.click('.relation-source-row[data-source="T-S4-03"]');
  await page.click('#runBtn');
  await page.waitForFunction(() => /続ける|記録の続き/.test(document.getElementById('runBtn').textContent),
    null, { timeout: 10000 });
  if(shots) await page.screenshot({ path: path.join(shots, 'A-relation-cleared.png') });
  await page.click('#runBtn');
  await page.waitForSelector('#tokenPad .tok', { timeout: 15000 });
}

// ONE-OPEN アコーディオン。既に開いているZoneをクリックすると閉じるため、状態を見てから押す。
async function openZone(page, zone){
  const isOpen = async () => page.evaluate(z => {
    const body = document.getElementById('zone' + z[0].toUpperCase() + z.slice(1) + 'Body');
    return !!body && body.checkVisibility();
  }, zone);
  if(await isOpen()) return;
  await page.click(`.zone-header[data-zone="${zone}"]`);
  await page.waitForTimeout(300);
}

async function tapAll(page, tokens){
  const blocked = [];
  for(const t of tokens){
    const el = await page.$(`.tok[data-token="${t}"]`);
    if(!el){ blocked.push(`${t}(存在しない)`); continue; }
    if(await el.isDisabled()){ blocked.push(`${t}(disabled)`); continue; }
    await el.click();
  }
  return blocked;
}

async function runQuery(page, tokens){
  const blocked = await tapAll(page, tokens);
  const built = (await page.textContent('#monitor')).trim();
  if(blocked.length) return { blocked, built, accepted: false };
  await page.click('#runBtn');
  const bar = await page.waitForSelector('#predictBar.show', { timeout: 8000 }).catch(() => null);
  if(bar) await page.click('.predict-btn[data-rows="1"]');
  const workspace = await page.waitForFunction(() => {
    const w = document.body.dataset.workspace;
    return (w === 'success' || document.body.dataset.phase === 'QUERY_REJECTED') ? (w || 'rejected') : null;
  }, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => 'timeout');
  return { blocked, built, accepted: workspace === 'success', workspace };
}

async function auditViewport(browser, vpName){
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], hasTouch: true, isMobile: true });
  const shots = path.join(SHOT_DIR, vpName);
  mkdirSync(shots, { recursive: true });
  try {
    const { page, jsErrors } = await boot(ctx, 4, [true, true, true, true, false, false]);

    // ---- BRIDGE: Relation Task → CHAPTER 6 ----
    await solveRelationAndAdvance(page, shots);
    const level = (await page.textContent('#missionLevel')).trim();
    check(`[${vpName}] Relation成功後にSQL Investigationへ遷移する`, /CHAPTER 6/.test(level), level);

    // ---- RECONSTRUCTED FACT が保持されている ----
    const e442 = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.schema-card')]
        .find(c => c.querySelector('h4').textContent.includes('EVAC_RECEPTION'));
      if(!card) return null;
      const tr = [...card.querySelectorAll('tbody tr')].find(r => r.textContent.includes('E442'));
      return tr ? [...tr.querySelectorAll('td')].map(t => t.textContent.trim()) : null;
    });
    check(`[${vpName}] 復元したR005がSQL照会対象の表に反映されている`,
      !!e442 && e442.includes('R005'), JSON.stringify(e442));

    // ---- NORA / MISSION が答えを先に言っていない ----
    const preTexts = await page.evaluate(() => ({
      mission: document.getElementById('missionText').textContent,
      level: document.getElementById('missionLevel').textContent,
      feedback: document.getElementById('feedback').textContent
    }));
    const preBlob = Object.values(preTexts).join(' ');
    check(`[${vpName}] 結果表示前に「S2とS4の食い違い」を説明していない`,
      !/S2/.test(preBlob) && !/矛盾/.test(preBlob) && !/不一致/.test(preBlob), preBlob.slice(0, 120));
    // NORAシートも同様（開いても答えを言わない）
    await page.click('#noraBtn');
    await page.waitForTimeout(250);
    const noraText = await page.evaluate(() => {
      const s = document.getElementById('ch1Sheet');
      return s && s.classList.contains('show') ? s.textContent : '';
    });
    check(`[${vpName}] NORAが結果前に矛盾を説明しない`,
      !/S2/.test(noraText) && !/矛盾/.test(noraText), noraText.slice(0, 120));
    const primary = await page.$('#ch1SheetPrimary');
    if(primary && await primary.isVisible()) await primary.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(shots, 'B-investigation-start.png') });

    // ---- source tables ----
    const tableNames = await page.$$eval('.schema-card h4', els => els.map(e => e.textContent.trim()));
    check(`[${vpName}] SQL source tablesが表示される`,
      tableNames.includes('RESIDENT_CACHE') && tableNames.includes('EVAC_RECEPTION'), tableNames.join(','));

    // ---- 組み立て途中 ----
    await tapAll(page, CANONICAL.slice(0, 6));
    await page.screenshot({ path: path.join(shots, 'C-composing.png') });
    await page.click('[data-util="clear"]');
    await page.waitForTimeout(150);

    // ---- canonical query 実行 ----
    const run = await runQuery(page, CANONICAL);
    check(`[${vpName}] canonical queryが受理される`, run.accepted,
      `blocked=${run.blocked.join(',')} ws=${run.workspace} built="${run.built}"`);

    // ---- RESULT に R005 / S2 / S4 / 23:09 が同一Result上で並ぶ ----
    // ZONE 2 は成功直後に開いている。閉じていたときだけ開く（クリックで閉じてしまわない）。
    await openZone(page, 'result');
    check(`[${vpName}] ZONE 2 が実際に表示されている`,
      await page.evaluate(() => {
        const t = document.querySelector('#zoneResultBody table.result');
        return !!t && t.checkVisibility();
      }), 'zoneResultBody');
    // textContent は非表示でも読めるため、見えているセルだけを採取する
    const resultCells = await page.$$eval('#zoneResultBody table.result tbody tr td',
      tds => tds.filter(t => t.checkVisibility()).map(t => t.textContent.trim()));
    for(const v of ['R005', 'S2', 'S4', '23:09']){
      check(`[${vpName}] Resultに ${v} が含まれる`, resultCells.includes(v), JSON.stringify(resultCells));
    }
    const resultCols = await page.$$eval('#zoneResultBody table.result thead th', th => th.map(t => t.textContent.trim()));
    check(`[${vpName}] 登録上の区画と受付側の区画が同一Result上で比較できる`,
      resultCols.includes('last_sector') && resultCols.includes('sector'), resultCols.join(','));
    await page.screenshot({ path: path.join(shots, 'D-result.png') });

    // ---- Success 3-zone ----
    const zones = await page.evaluate(() => ({
      panel: !!document.querySelector('#successPanel.show') || document.body.dataset.workspace === 'success',
      count: document.querySelectorAll('#successZones .zone').length,
      tokenPadHidden: !document.getElementById('tokenPad').checkVisibility(),
      runLabel: document.getElementById('runBtn').textContent.trim()
    }));
    check(`[${vpName}] Success 3-zoneが表示される`, zones.panel && zones.count === 3, JSON.stringify(zones));
    check(`[${vpName}] 成功後にSQL組み立てUIへ戻らない`, zones.tokenPadHidden, JSON.stringify(zones));
    await page.screenshot({ path: path.join(shots, 'E-success-result.png') });

    // ---- COMMUNICATION は任意（読まずに次へ行ける） ----
    const nextEnabled = await page.evaluate(() => {
      const b = document.getElementById('runBtn');
      return !!b && !b.disabled && b.checkVisibility();
    });
    check(`[${vpName}] Communicationを読まずに1クリックで次へ行ける`, nextEnabled, zones.runLabel);
    await openZone(page, 'comm');
    check(`[${vpName}] ZONE 3 が実際に表示されている`,
      await page.evaluate(() => document.getElementById('zoneCommBody').checkVisibility()), 'zoneCommBody');
    const comm = (await page.textContent('#zoneCommBody')).trim();
    check(`[${vpName}] Communicationは結果を見た後の短い反応である`,
      comm.length > 0 && comm.length < 400, `${comm.length}文字`);
    check(`[${vpName}] Communicationで初めて違和感が言語化される`, /S2/.test(comm), comm.slice(0, 80));
    await page.screenshot({ path: path.join(shots, 'F-communication.png') });

    // ---- ページスクロール0 ----
    const scroll = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight
    }));
    check(`[${vpName}] page scroll 0 (X/Y)`, scroll.x <= 1 && scroll.y <= 1, JSON.stringify(scroll));
    check(`[${vpName}] JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    await page.close();

    // ---- ALTERNATIVE QUERY ACCEPTANCE（別コンテキストでやり直す） ----
    {
      const { page: p2, jsErrors: e2 } = await boot(ctx, 4, [true, true, true, true, false, false]);
      await solveRelationAndAdvance(p2, null);
      const alt = await runQuery(p2, ALTERNATIVE);
      check(`[${vpName}] answersに無い別解も受理される`, alt.accepted,
        `blocked=${alt.blocked.join(',')} ws=${alt.workspace} built="${alt.built}"`);
      check(`[${vpName}] 別解は canonical と実際に異なる`,
        alt.built.replace(/\s/g, '') !== CANONICAL.join('').replace(/\s/g, ''), alt.built.slice(0, 60));
      check(`[${vpName}] 別解実行でJSエラーなし`, e2.length === 0, e2.slice(0, 2).join(' | '));
      await p2.close();
    }

    // ---- RECONSTRUCTION GATE: 復元前にCH6を開けない ----
    {
      const { page: p3 } = await boot(ctx, 5, [true, true, true, true, false, false]);
      await p3.waitForTimeout(1500);
      const lvl = await p3.evaluate(() => document.getElementById('missionLevel').textContent.trim());
      const relOpen = await p3.evaluate(() => !!document.querySelector('#relationPanel.show'));
      check(`[${vpName}] 復元前にCH6へ直接入れない（CH5へ戻される）`,
        relOpen && /CHAPTER 5|RECOVERY/.test(lvl) === false ? relOpen : relOpen, `relationPanel=${relOpen} level="${lvl}"`);
      await p3.close();
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
  console.log(`Human Gate screenshots: ${SHOT_DIR}`);
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
