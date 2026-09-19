import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ONBOARDING_STAGES as stages } from '../js/onboarding.js';
import { boot, readSql, tap, replace, run, solveMission } from './onboarding-ui-helpers.mjs';

const browser = await chromium.launch();
try {
  for(const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 800 }]){
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 700 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await boot(page);
    assert.equal(await page.locator('#storyOverlay').isVisible(), false);
    assert.equal(await page.locator('#timer').isVisible(), false);
    assert.equal(await page.locator('#xp').isVisible(), false);
    assert.ok(!/CIVIS|CASE 53|Aya|アヤ/.test(await page.locator('#hud').innerText()));
    assert.equal(await page.locator('#schemaPanel th').allTextContents().then(x => x.join(',')), '品目,棚,数量');

    // Both valid-but-wrong and malformed SQL keep the draft and can be fixed in place.
    await page.locator('[data-source-col="2"]').click();
    await page.locator('#runBtn').click();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'QUERY_REJECTED');
    assert.equal(await readSql(page), 'SELECT quantity FROM STOCK');
    assert.ok(await page.locator('#resultPanel').isVisible());
    await replace(page, 'quantity', 'FROM');
    await page.locator('#runBtn').click();
    assert.equal(await readSql(page), 'SELECT FROM FROM STOCK');
    await page.locator('#hintBtn').click();
    await page.reload();
    await page.locator('#monitor .query-token').first().waitFor();
    assert.equal(await readSql(page), 'SELECT FROM FROM STOCK');
    await page.locator('#monitor .query-token').nth(1).click();
    await tap(page, 'item');
    await run(page);
    assert.equal(await page.locator('.zone-clear-type').textContent(), '作業完了');
    assert.ok(!/XP|半額|未達|PRACTICE/.test(await page.locator('#zoneResultBody').innerText()));
    await page.reload();
    await page.locator('body[data-workspace="success"]').waitFor();

    let previous = await readSql(page);
    for(let number = 2; number <= 12; number++){
      await page.locator('#runBtn').click();
      assert.equal(await page.locator('body').getAttribute('data-mission'), stages[number - 1].id);
      if(![7, 9].includes(number)) assert.equal(await readSql(page), previous, 'carry the actual previous SQL');
      const sourceRect = await page.locator('#schemaPanel').boundingBox();
      const runRect = await page.locator('#runBtn').boundingBox();
      assert.ok(sourceRect.height >= 100, 'source stays visible while editing');
      assert.ok(runRect.y + runRect.height <= viewport.height + 1, 'run button stays in viewport');
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false);
      const rows = await solveMission(page, number);
      assert.equal(rows.length, stages[number - 1].resultSet.rows.length);
      previous = await readSql(page);
      for(const zone of ['problem', 'comm', 'result']){
        await page.locator(`[data-zone="${zone}"]`).click();
        assert.equal(await page.locator('.zone.open').count(), 1);
      }
    }
    assert.deepEqual(await page.locator('#zoneResultBody th').allTextContents(), ['品目', '依頼合計']);
    // campaign は M01〜M12 のあと本編 CHAPTER 1 へ続く。M12 で終わらない。
    await page.locator('#runBtn').click();
    const opening = page.locator('#storyOverlay.show');
    if(await opening.isVisible().catch(() => false)) await page.locator('#storyContinueBtn').click();
    await page.locator('body.ch1-ui').waitFor();
    assert.ok((await page.locator('#missionLevel').textContent()).includes('CHAPTER 1'),
      'M12 の次は本編 CHAPTER 1');
    assert.ok((await page.locator('#stageLabel').textContent()).includes('CH.1/6'),
      'HUD は本編の章番号を示す');
    await page.locator('#stageLabel').click();
    assert.equal(await page.locator('#stageDrawer .stage-item').count(), 18,
      'ステージ一覧は M01〜M12 + CHAPTER 1〜6');
    await page.locator('#stageDrawerClose').click();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS complete tap campaign / source / retry / persistence / success zones ${viewport.width}x${viewport.height}`);
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('unavailable'); }; });
  await boot(page);
  await solveMission(page, 1);
  await context.close();
  console.log('PASS storage failure does not block learning');
} finally { await browser.close(); }
