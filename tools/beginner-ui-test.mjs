import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { MISSIONS, tablesForMission } from '../js/beginner-data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = resolve(root, 'tools/ux-artifacts/beginner');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const path = resolve(root, `.${requestPath === '/' ? '/index.html' : requestPath}`);
  if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.wasm': 'application/wasm' }[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }

async function layout(page) {
  const result = await page.evaluate(() => {
    const button = document.getElementById('nr-primary').getBoundingClientRect();
    const scroll = document.scrollingElement;
    return { overflow: scroll.scrollWidth > innerWidth || scroll.scrollHeight > innerHeight + 1,
      bottom: button.bottom, height: innerHeight, buttonHeight: button.height,
      workspaceOverflow: document.getElementById('nr-workspace').scrollWidth > document.getElementById('nr-workspace').clientWidth + 1 };
  });
  assert.equal(result.overflow, false);
  assert.equal(result.workspaceOverflow, false);
  assert(result.bottom <= result.height && result.buttonHeight >= 44);
}

async function execute(page, sql) {
  await page.locator('[data-tab=query]').click();
  await page.locator('#nr-sql').fill(sql);
  await page.locator('#nr-primary').click();
  await page.waitForFunction(() => !document.getElementById('nr-primary').disabled, { timeout: 20000 });
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('#nr-sql').waitFor();
  await check('iPhone SE first mission, no page overflow, main action visible', () => layout(page));
  await page.screenshot({ path: resolve(artifacts, 'q01-iphone-se.png') });
  await check('SQL errors are explained in Japanese and unfinished drafts survive reload', async () => {
    await execute(page, 'SELECT missing_column FROM RESIDENT_CACHE;');
    assert((await page.locator('.nr-status').textContent()).includes('列が見つかりません'));
    await page.reload();
    assert.equal(await page.locator('#nr-sql').inputValue(), 'SELECT missing_column FROM RESIDENT_CACHE;');
    await page.locator('#nr-sql').fill(MISSIONS[0].starter);
    await page.locator('[data-action=hint]').click();
    assert((await page.locator('.nr-hint').textContent()).includes('SELECT'));
  });
  await check('beginner column token can be inserted into guided SELECT', async () => {
    const sql = page.locator('#nr-sql');
    await sql.focus();
    await sql.evaluate(element => element.setSelectionRange(7, 7));
    await page.locator('[data-token=resident_id]').click();
    assert((await sql.inputValue()).startsWith('SELECT resident_id'));
  });
  for (const [index, mission] of MISSIONS.entries()) {
    await check(`browser completes ${mission.MISSION_ID} with its actual interaction`, async () => {
      assert.equal(await page.locator('h1').textContent(), mission.TITLE);
      if (mission.trace) {
        await page.locator('[data-action=trace]').click();
        const tables = tablesForMission(index + 1);
        for (const trace of mission.trace) {
          const tb = tables[trace.table];
          const rowIndex = tb.rows.findIndex(row => row[tb.cols.indexOf(trace.key)] === trace.value);
          await page.locator(`[data-pick="${rowIndex}"]`).click();
        }
      }
      if (mission.prediction !== undefined) await page.locator('#nr-prediction').fill(String(mission.prediction));
      if (mission.classifications) for (const [i, value] of mission.classifications.entries()) await page.locator(`[data-classification="${i}"]`).selectOption(value);
      if (index === 19) {
        assert(!(await page.locator('body').innerText()).includes('NORTH-LATTICE'));
        await page.locator('#nr-question').fill('公式台帳にいない人は、どの記録を経てどこへ移動したのか。');
        await execute(page, 'SELECT credential_id, destination FROM TRANSIT_SHADOW;');
        assert.equal(await page.locator('#nr-primary').textContent(), '照会を実行');
        await page.screenshot({ path: resolve(artifacts, 'q20-exploration-iphone-se.png') });
      }
      await execute(page, mission.CANONICAL_SQL);
      for (const sql of mission.equivalents || []) await execute(page, sql);
      if (mission.followup) await execute(page, mission.followup.sql);
      assert.equal(await page.locator('#nr-primary').textContent(), '証拠として保全', await page.locator('.nr-status').innerText());
      if (index === 19) await page.locator('#nr-interpretation').fill('公式登録に対応がない53人の最終到着記録はNORTH-LATTICE。現在の生存までは断定できない。');
      await layout(page);
      if ([13, 15, 16, 18, 19].includes(index)) await page.screenshot({ path: resolve(artifacts, `q${index + 1}-result-iphone-se.png`) });
      await page.locator('#nr-primary').click();
      assert.equal(await page.locator('#nr-primary').textContent(), index === 19 ? '調査を続ける' : '次の調査へ');
      if (index < 19) await page.locator('#nr-primary').click();
    });
  }
  await check('all 20 clears persist, free investigation remains available', async () => {
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('neon_relay_beginner_v1')));
    assert.equal(saved.clears.length, 20);
    assert.equal(saved.clears[0].mode, 'ASSISTED');
    assert(saved.history.length >= 24);
    assert(saved.clears[19].question && saved.clears[19].interpretation);
    await page.locator('#nr-primary').click();
    assert.equal(await page.locator('#nr-sql').inputValue(), '');
    await page.reload();
    assert.equal(await page.locator('h1').textContent(), MISSIONS[19].TITLE);
  });
  await check('iPhone 16e records and query layout', async () => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('[data-tab=records]').click();
    await page.locator('#nr-table').selectOption('TRANSIT_SHADOW');
    await layout(page);
    assert.equal(await page.locator('tbody tr').count(), 6);
    await page.screenshot({ path: resolve(artifacts, 'q20-records-iphone-16e.png') });
    await page.locator('[data-tab=query]').click();
    await layout(page);
  });
  await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
  await browser.close(); browser = null;

  // iPhoneのWebKit経路でもWASM Worker実行・保存・再開を確認。
  browser = await webkit.launch({ headless: true });
  const safari = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await safari.goto(base);
  await check('WebKit: SQLite worker, first clear, persistence', async () => {
    await execute(safari, MISSIONS[0].CANONICAL_SQL);
    assert.equal(await safari.locator('#nr-primary').textContent(), '証拠として保全', await safari.locator('.nr-status').innerText());
    await safari.locator('#nr-primary').click();
    await safari.locator('#nr-primary').click();
    await safari.reload();
    assert.equal(await safari.locator('h1').textContent(), MISSIONS[1].TITLE);
    await layout(safari);
  });
  console.log(`\n${checks} browser checks passed.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
