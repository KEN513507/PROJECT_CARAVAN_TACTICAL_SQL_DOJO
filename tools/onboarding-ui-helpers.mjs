import assert from 'node:assert/strict';

export const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
export async function boot(page){
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('body.learning-ui').waitFor();
  await page.locator('#monitor .query-token').first().waitFor();
}
export const token = (page, text) => page.locator('#tokenPad .tok').filter({ hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') });
export async function tap(page, ...texts){ for(const text of texts) await token(page, text).click(); }
export async function select(page, text){ await page.locator('#monitor').getByRole('button', { name: text, exact: true }).last().click(); }
export async function replace(page, old, value){ await select(page, old); await tap(page, value); }
export async function append(page, ...texts){ await page.locator('[data-edit="end"]').click(); await tap(page, ...texts); }
export const source = (page, col) => page.locator(`[data-source-col="${col}"]`).click();
export async function readSql(page){ return (await page.locator('#monitor .query-token').allTextContents()).join(' '); }
export async function run(page){
  await page.locator('#runBtn').click();
  await page.locator('body[data-workspace="success"]').waitFor();
  assert.equal(await page.locator('#successPanel .zone').count(), 3);
  assert.equal(await page.locator('#successPanel .zone.open').count(), 1);
  return page.locator('#zoneResultBody table.result tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(c => c.textContent)));
}

export async function solveMission(page, number){
  switch(number){
    case 1: await source(page, 0); break;
    case 2:
      await select(page, 'item'); await page.locator('[data-edit="after"]').click();
      await source(page, 1); await source(page, 2); break;
    case 3: await append(page, 'WHERE', 'shelf', '=', "'B'"); break;
    case 4:
      await replace(page, 'shelf', 'quantity'); await replace(page, '=', '<'); await replace(page, "'B'", '6'); break;
    case 5: await append(page, 'AND', 'shelf', '=', "'B'"); break;
    case 6: await append(page, 'ORDER BY', 'quantity'); break;
    case 7: await tap(page, "'受付'"); break;
    case 8: await append(page, 'OR', 'desk', '=', "'倉庫'"); break;
    case 9: await tap(page, 'COUNT(*)'); break;
    case 10: await replace(page, 'COUNT(*)', 'SUM(quantity)'); break;
    case 11:
      await select(page, 'SUM(quantity)'); await page.locator('[data-edit="after"]').click(); await tap(page, 'AS', 'request_total'); break;
    case 12:
      await select(page, 'SELECT'); await page.locator('[data-edit="after"]').click(); await tap(page, 'item');
      for(const text of ["'鉛筆'", '=', 'item', 'WHERE']){ await select(page, text); await page.locator('[data-edit="remove"]').click(); }
      await append(page, 'GROUP BY', 'item'); break;
    default: throw new Error('Unsupported mission');
  }
  return run(page);
}
