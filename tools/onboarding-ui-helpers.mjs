import assert from 'node:assert/strict';

export const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
// スタート画面（SHELL）を抜けてキャンペーンへ入る。
// 保存があれば「つづきから」、無ければ「はじめから」。実プレイと同じ経路を通る。
export async function enterCampaign(page){
  await page.locator('body[data-shell]').waitFor();
  const shell = page.locator('#shell');
  if(await shell.isHidden()) return;                       // 既に PLAY
  const cont = page.locator('[data-shell-event="CONTINUE"]');
  if(await cont.count()) await cont.click();
  else await page.locator('[data-shell-event="NEW_GAME"]').click();
  await shell.waitFor({ state: 'hidden' });
}

// スタート画面で「はじめから」を選ぶ。保存があれば上書き確認も通す。
export async function startFresh(page){
  await page.locator('body[data-shell]').waitFor();
  await page.locator('[data-shell-event="NEW_GAME"]').click();
  const confirm = page.locator('[data-shell-event="CONFIRM"]');
  if(await confirm.count()) await confirm.click();
  await page.locator('#shell').waitFor({ state: 'hidden' });
}

// 開いて、スタート画面を抜けるところまで。
export async function open(page, url = BASE_URL){
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await enterCampaign(page);
}

// 開き直して、スタート画面を抜けるところまで（保存が残っていれば「つづきから」）。
export async function reopen(page){
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterCampaign(page);
}

export async function boot(page){
  await open(page);
  await page.locator('body.learning-ui').waitFor();
  await page.locator('#monitor .query-token').first().waitFor();
}
// SQL欄を「操作している」状態にする（小さいときは拡大だけが起きる）
export async function focusQuery(page){
  if(await page.evaluate(() => document.body.dataset.focus) !== 'query'){
    await page.locator('#monitorWrap').click({ position:{ x:5, y:5 } });
  }
}
export const token = (page, text) => page.locator('#tokenPad .tok').filter({ hasText: new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') });
export async function tap(page, ...texts){ for(const text of texts) await token(page, text).click(); }
// SQL欄が小さいときは1回目のタップで拡大されるだけ。実プレイと同じく、拡大してから語を選ぶ。
export async function select(page, text){ await focusQuery(page); await page.locator('#monitor').getByRole('button', { name: text, exact: true }).last().click(); }
export async function replace(page, old, value){ await select(page, old); await tap(page, value); }
// 編集ボタンは「SQL欄を操作しているとき」だけ出る。実プレイと同じくSQL欄へ入ってから押す。
export async function append(page, ...texts){ await focusQuery(page); await page.locator('[data-edit="end"]').click(); await tap(page, ...texts); }
// 表が小さいときは1回目のタップで拡大されるだけ。実プレイと同じく、拡大してから選ぶ。
export async function focusSource(page){
  if(await page.evaluate(() => document.body.dataset.focus) !== 'source'){
    await page.locator('.learning-source-title').click();
  }
}
export async function source(page, col){ await focusSource(page); await page.locator(`[data-source-col="${col}"]`).click(); }
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
