// Existing FE/RTP gate, now exercising the canonical M01–M12 campaign.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { boot, append, replace, run, solveMission } from './onboarding-ui-helpers.mjs';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  const before = await page.evaluate(async () => JSON.stringify((await import('./js/onboarding.js')).ONBOARDING_TABLES));
  for(let number = 1; number <= 4; number++){
    await solveMission(page, number);
    await page.locator('#runBtn').click();
  }
  const rows = await solveMission(page, 5);
  assert.deepEqual(rows, [['鉛筆', 'B', '4'], ['定規', 'B', '2']]);
  console.log('PASS REAL_SQL_GATE: canonical engine returns actual source rows');

  // Revisit M05 and exchange the two predicates using only player-facing controls.
  await page.locator('#stageLabel').click();
  await page.locator('[data-stage="4"]').click();
  // A completed draft is restored as evidence; M04 remains editable after selecting it.
  await page.locator('#stageLabel').click();
  await page.locator('[data-stage="3"]').click();
  await page.locator('#stageLabel').click();
  // A fresh browser starts the alternate path, without replacing runtime methods.
  const alt = await browser.newPage({ viewport: { width: 393, height: 852 } });
  alt.on('pageerror', error => errors.push(error.message));
  await boot(alt);
  for(let number = 1; number <= 3; number++){
    await solveMission(alt, number);
    await alt.locator('#runBtn').click();
  }
  await solveMission(alt, 4); await alt.locator('#runBtn').click();
  // M05 starts with the M04 draft. Swap its first predicate, then append the numeric one.
  await replace(alt, 'quantity', 'shelf');
  await replace(alt, '<', '=');
  await replace(alt, '6', "'B'");
  await append(alt, 'AND', 'quantity', '<', '6');
  assert.deepEqual(await run(alt), rows);
  console.log('PASS ALTERNATIVE_QUERY_GATE: a predicate order absent from answers is accepted');

  const contract = await page.evaluate(async () => {
    const { ONBOARDING_TABLES: tables } = await import('./js/onboarding.js');
    const { executeSelect } = await import('./js/sql-engine.js');
    let rejected = false;
    try { executeSelect('DELETE FROM STOCK', tables); } catch { rejected = true; }
    return { tables: JSON.stringify(tables), rejected };
  });
  assert.equal(contract.tables, before); assert.ok(contract.rejected);
  assert.deepEqual(errors, []);
  console.log('PASS READ_ONLY_GATE: source data unchanged and writes rejected');
  console.log('FAIL_COUNT: 0');
} finally { await browser.close(); }
