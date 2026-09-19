// tools/display-terminology-check.mjs
// DISPLAY TERMINOLOGY CONTRACT ゲート（2 namespace 版）。
//
// 旧版は「display label = internal identifier」を要求していたが、これは誤仕様だった。
// 正しくは 2 つの namespace が 1対1 で対応する:
//   INTERNAL SQL IDENTIFIER : SQL Editor / monitor / token pad
//   CANONICAL DISPLAY LABEL : Table / Result / Evidence / Relation Task / Schema Viewer
//
// 検証すること:
//   A identifier → display label が 1対1（両方向で衝突しない）
//   B 同一fieldの display label が全UIで同じ（画面ごとに揺れない）
//   C SQL Editor では identifier を使う
//   D Data UI では display label を使う（identifier の生表示をしない）
//   E Result でも同じ display label
//   F 端末差で表示名が変わらない
//   G 省略表示（credenti...）を通常状態にしない
//
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/display-terminology-check.mjs

import { chromium } from 'playwright';
import { campaignProgress, learningCompletedPayload, storyStage, CAMPAIGN_LENGTH } from './campaign-index.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = {
  'iphone-se': { width: 375, height: 667 },
  'iphone-16e': { width: 393, height: 852 }
};

const CH4_SOLUTION = ['SELECT', 'p.legal_name', 'a.gate', 'a.time', 'FROM', 'PERSON_INDEX',
  'AS', 'p', 'INNER JOIN', 'ACCESS_LOG', 'AS', 'a', 'ON', 'p.credential_id', '=',
  'a.credential_id', 'WHERE', 'a.gate', '=', "'S4-P6'"];

// Data UI に internal identifier が生で出ていないかを見るためのパターン
const LOOKS_LIKE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

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
         storyCleared: [true, true, true, true, false, false] }) });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const ov = await page.waitForSelector('#storyOverlay.show', { timeout: 4000 }).catch(() => null);
  if(ov) await page.click('#storyContinueBtn');
  const sh = await page.waitForSelector('#ch1Sheet.show', { timeout: 4000 }).catch(() => null);
  if(sh) await page.click('#ch1SheetPrimary');
  return { page, jsErrors };
}

async function collect(page, screen, selector, kind){
  return page.$$eval(selector, (els, meta) => els
    .filter(e => e.checkVisibility ? e.checkVisibility() : true)
    .map(e => ({
      screen: meta.screen,
      kind: meta.kind,
      selector: meta.selector,
      text: e.textContent.trim(),
      clipped: e.scrollWidth > e.clientWidth + 1
    })), { screen, kind, selector });
}

async function auditViewport(browser, vpName){
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], hasTouch: true, isMobile: true });
  const labels = [];
  const errors = [];
  let editorTokens = [];
  try {
    // ---- CH4: Query 画面 → Success 画面 ----
    {
      const { page, jsErrors } = await boot(ctx, 3);
      await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
      labels.push(...await collect(page, 'QUERY', '.schema-card .schema-name', 'table'));
      // Table Card はデフォルトで畳まれることがあるので開いてから採取する
      const cards = await page.$$('.schema-card > summary');
      for(const c of cards){
        const open = await c.evaluate(e => e.parentElement.open);
        if(!open) await c.click();
      }
      await page.waitForTimeout(200);
      labels.push(...await collect(page, 'QUERY', '.schema-card table.mini th', 'field'));
      // C: SQL Editor 側は internal identifier
      editorTokens = await page.$$eval('#tokenPad .tok', els => els.map(e => e.textContent.trim()));
      // §5 の対応表（identifier を見せてよい唯一の場所）
      const maps = await page.$$('.schema-map > summary');
      for(const m of maps) await m.click();
      await page.waitForTimeout(200);
      labels.push(...await collect(page, 'SCHEMA_MAP', '.schema-map-l', 'field'));

      for(const t of CH4_SOLUTION){
        const el = await page.$(`.tok[data-token="${t}"]`);
        if(el && !(await el.isDisabled())) await el.click();
      }
      await page.click('#runBtn');
      const bar = await page.waitForSelector('#predictBar.show', { timeout: 8000 }).catch(() => null);
      if(bar) await page.click('.predict-btn[data-rows="1"]').catch(async () => {
        const btns = await page.$$('.predict-btn'); if(btns[1]) await btns[1].click();
      });
      await page.waitForFunction(() => document.body.dataset.workspace === 'success',
        null, { timeout: 15000 });

      await page.click('.zone-header[data-zone="problem"]');
      await page.waitForTimeout(250);
      labels.push(...await collect(page, 'SUCCESS_ZONE1', '#zoneProblemBody .zone-table h5', 'table'));
      labels.push(...await collect(page, 'SUCCESS_ZONE1', '#zoneProblemBody .zone-grid th', 'field'));
      await page.click('.zone-header[data-zone="result"]');
      await page.waitForTimeout(250);
      labels.push(...await collect(page, 'SUCCESS_ZONE2', '#zoneResultBody .zone-grid th', 'field'));
      errors.push(...jsErrors);
      await page.close();
    }
    // ---- CH5: Relation Task ----
    {
      const { page, jsErrors } = await boot(ctx, 4);
      await page.waitForSelector('#relationPanel.show', { timeout: 30000 });
      labels.push(...await collect(page, 'RELATION', '.rq-card-name', 'table'));
      labels.push(...await collect(page, 'RELATION', '.rq-k', 'field'));
      await page.click('.relation-missing');
      labels.push(...await collect(page, 'RELATION', '.rq-key-l', 'field'));
      labels.push(...await collect(page, 'RELATION', '.rq-table th', 'field'));
      await page.click('.relation-source-row[data-source="T-S4-03"]');
      labels.push(...await collect(page, 'RELATION_MATCH', '.rq-cmp-l', 'field'));
      errors.push(...jsErrors);
      await page.close();
    }
  } finally {
    await ctx.close();
  }
  return { labels, errors, editorTokens };
}

(async () => {
  const reg = await import(pathToFileURL(path.resolve('js/display-labels.js')).href);
  const { FIELD_LABELS, LABEL_TO_FIELD } = reg;
  const data = await import(pathToFileURL(path.resolve('js/data.js')).href);

  // ================= A: 1対1 対応（ブラウザ不要の静的検証） =================
  {
    const ids = Object.keys(FIELD_LABELS);
    const vals = ids.map(i => FIELD_LABELS[i]);
    check('[A] identifier → display label が重複しない',
      new Set(vals).size === vals.length,
      vals.filter((v, i) => vals.indexOf(v) !== i).join(','));
    check('[A] display label → identifier の逆引きが成立する',
      Object.keys(LABEL_TO_FIELD).length === ids.length);
    check('[A] identifier と display label が別namespaceである（同一文字列でない）',
      ids.every(i => FIELD_LABELS[i] !== i),
      ids.filter(i => FIELD_LABELS[i] === i).join(','));

    const missing = new Set();
    Object.values(data.TABLES).forEach(t => t.cols.forEach(c => { if(!FIELD_LABELS[c]) missing.add(c); }));
    data.STAGES.forEach(s => { if(s.resultSet) s.resultSet.cols.forEach(c => { if(!FIELD_LABELS[c]) missing.add(c); }); });
    check('[A] 全ての実列・結果列に display label がある', missing.size === 0, [...missing].join(','));
  }

  const browser = await chromium.launch();
  const perVp = {};
  try {
    for(const vp of Object.keys(VIEWPORTS)){
      const r = await auditViewport(browser, vp);
      perVp[vp] = r;
      check(`[${vp}] JSエラーなし`, r.errors.length === 0, r.errors.slice(0, 2).join(' | '));
      check(`[${vp}] 表示ラベルを採取できた`, r.labels.length > 0, `count=${r.labels.length}`);
    }
  } catch(err){
    check('実行時例外なし', false, err.stack ? err.stack.split('\n')[0] : err.message);
  } finally {
    await browser.close();
  }

  if(failCount === 0){
    const A = perVp['iphone-se'].labels, B = perVp['iphone-16e'].labels;
    const sig = ls => ls.map(l => `${l.screen}|${l.kind}|${l.text}`).sort().join('\n');

    // ---- F: 端末差で表示名が変わらない ----
    const sa = sig(A).split('\n'), sb = sig(B).split('\n');
    const onlyA = sa.filter(x => !sb.includes(x));
    const onlyB = sb.filter(x => !sa.includes(x));
    check('[F] SE と 16e で表示ラベルが一致する',
      onlyA.length === 0 && onlyB.length === 0, onlyA.concat(onlyB).slice(0, 4).join(' / '));

    // ---- G: 省略表示を通常状態にしない ----
    const clipped = A.concat(B).filter(l => l.clipped);
    check('[G] 省略された表示ラベルが無い', clipped.length === 0,
      clipped.slice(0, 6).map(l => `${l.screen}:${l.selector}"${l.text}"`).join(' / '));

    // ---- D: Data UI に internal identifier が生で出ていない ----
    // 例外は SCHEMA_MAP（対応を学ぶための場所）と table 名（SQLトークンと一致させる）。
    const rawIds = A.filter(l => l.kind === 'field' && l.screen !== 'SCHEMA_MAP'
      && LOOKS_LIKE_IDENTIFIER.test(l.text) && FIELD_LABELS[l.text]);
    check('[D] Data UI の列見出しが internal identifier になっていない',
      rawIds.length === 0, rawIds.slice(0, 6).map(l => `${l.screen}:"${l.text}"`).join(' / '));

    const unknown = A.filter(l => l.kind === 'field' && l.screen !== 'SCHEMA_MAP'
      && !LABEL_TO_FIELD[l.text]);
    check('[D] Data UI の列見出しが全て登録済み display label である',
      unknown.length === 0, unknown.slice(0, 6).map(l => `${l.screen}:"${l.text}"`).join(' / '));

    // ---- C: SQL Editor は internal identifier ----
    const editor = perVp['iphone-se'].editorTokens;
    const colTokens = editor.filter(t => /^[a-z]/.test(t) && !/[ぁ-んァ-ヶ一-龠]/.test(t));
    check('[C] SQL Editor のトークンに display label が混入していない',
      editor.every(t => !LABEL_TO_FIELD[t]),
      editor.filter(t => LABEL_TO_FIELD[t]).join(','));
    check('[C] SQL Editor が internal identifier を出している',
      colTokens.length > 0, colTokens.slice(0, 4).join(','));

    // ---- B / E: 同一fieldの display label が画面をまたいで同じ ----
    const byField = {};
    for(const l of A.filter(l => l.kind === 'field' && l.screen !== 'SCHEMA_MAP')){
      const id = LABEL_TO_FIELD[l.text];
      if(!id) continue;
      (byField[id] ||= new Set()).add(l.text);
    }
    const wobbling = Object.entries(byField).filter(([, s]) => s.size > 1);
    check('[B] 同一fieldが画面ごとに別表記になっていない',
      wobbling.length === 0, wobbling.map(([id, s]) => `${id}: ${[...s].join(' / ')}`).join(' | '));

    const multi = Object.keys(byField).filter(id =>
      A.filter(l => l.kind === 'field' && LABEL_TO_FIELD[l.text] === id).length > 1);
    check('[E] 複数画面に出る field を照合できた', multi.length > 0, `${multi.length} fields`);

    // ---- §5: 対応表で identifier を確認できる ----
    const mapRows = A.filter(l => l.screen === 'SCHEMA_MAP');
    check('[§5] display label ↔ identifier の対応表が開ける', mapRows.length > 0, `${mapRows.length} rows`);
    check('[§5] 対応表は display label 側も登録済みである',
      mapRows.every(l => !!LABEL_TO_FIELD[l.text]),
      mapRows.filter(l => !LABEL_TO_FIELD[l.text]).map(l => l.text).join(','));
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
